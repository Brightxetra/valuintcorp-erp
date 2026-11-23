[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "Common.ps1")

$expectedProjectRef = $script:ValuintcorpExpectedMainProjectRef
Assert-PostgresEnvironment `
  -ExpectedProjectRef $expectedProjectRef `
  -RequireValuintcorpMain

if ((Get-RequiredEnvironmentValue "DIRECT_MAIN_FREEZE_ACK") -ne "WRITERS_FROZEN_AND_VERIFIED") {
  throw "The writer freeze is not acknowledged."
}

$psql = Assert-CommandAvailable "psql"
if ((Get-PostgresToolMajorVersion $psql) -lt 17) {
  throw "psql 17 or newer is required."
}

$resolvedOutputDirectory = Assert-OutputDirectoryOutsideRepository $OutputDirectory
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$runDirectory = Join-Path $resolvedOutputDirectory "concurrency-$expectedProjectRef-$timestamp"
New-Item -ItemType Directory -Path $runDirectory -ErrorAction Stop | Out-Null

$sqlDirectory = Join-Path $PSScriptRoot "..\sql\concurrency"
$startedProcesses = New-Object System.Collections.Generic.List[System.Diagnostics.Process]
$previousAppName = [Environment]::GetEnvironmentVariable("PGAPPNAME", "Process")

function Start-PsqlSession {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$SqlFile
  )

  $stdoutPath = Join-Path $runDirectory "$Name.stdout.txt"
  $stderrPath = Join-Path $runDirectory "$Name.stderr.txt"
  $markerPath = Join-Path $runDirectory "$Name.ready.txt"
  $psqlMarkerPath = $markerPath.Replace(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $argumentValues = @(
    "-X",
    "-w",
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "VERBOSITY=terse",
    "-v",
    "expected_project_ref=$expectedProjectRef",
    "-v",
    "marker_file=$psqlMarkerPath",
    "-f",
    $SqlFile
  )
  $argumentString = (
    $argumentValues |
      ForEach-Object { ConvertTo-StartProcessArgument "$_" }
  ) -join " "

  $process = Start-Process `
    -FilePath $psql `
    -ArgumentList $argumentString `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -NoNewWindow `
    -PassThru

  $startedProcesses.Add($process)
  return @{
    Process = $process
    Stdout = $stdoutPath
    Stderr = $stderrPath
    Marker = $markerPath
  }
}

function Wait-ForOutputMarker {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Session,

    [Parameter(Mandatory = $true)]
    [string]$Marker,

    [int]$TimeoutSeconds = 10
  )

  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    if ($Session.Process.HasExited) {
      throw "Session exited before marker $Marker. Inspect $($Session.Stderr)."
    }

    if (Test-Path -LiteralPath $Session.Marker -PathType Leaf) {
      $output = Get-Content -Raw -LiteralPath $Session.Marker -ErrorAction SilentlyContinue
      if ($output -like "*$Marker*") {
        return
      }
    }

    Start-Sleep -Milliseconds 100
  }

  throw "Timed out waiting for marker $Marker."
}

function Wait-ForSuccessfulSession {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Session,

    [int]$TimeoutSeconds = 15
  )

  if (-not $Session.Process.WaitForExit($TimeoutSeconds * 1000)) {
    $Session.Process.Kill()
    throw "Session timed out. Inspect $($Session.Stderr)."
  }

  if ($Session.Process.ExitCode -ne 0) {
    throw "Session failed with exit code $($Session.Process.ExitCode). Inspect $($Session.Stderr)."
  }
}

function Invoke-ForegroundPsql {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$SqlFile
  )

  $stdoutPath = Join-Path $runDirectory "$Name.stdout.txt"
  $stderrPath = Join-Path $runDirectory "$Name.stderr.txt"

  & $psql `
    -X `
    -w `
    -v "ON_ERROR_STOP=1" `
    -v "VERBOSITY=terse" `
    -v "expected_project_ref=$expectedProjectRef" `
    -v "marker_file=$((Join-Path $runDirectory "$Name.ready.txt").Replace([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar))" `
    -f $SqlFile `
    1> $stdoutPath `
    2> $stderrPath

  if ($LASTEXITCODE -ne 0) {
    throw "Session $Name failed. Inspect $stderrPath."
  }
}

try {
  $env:PGAPPNAME = "valuintcorp-direct-main:${expectedProjectRef}:concurrency"

  $identityA = Start-PsqlSession `
    -Name "identity-a" `
    -SqlFile (Join-Path $sqlDirectory "identity-a.sql")
  Wait-ForOutputMarker $identityA "IDENTITY_A_ACQUIRED"

  $identityB = Start-PsqlSession `
    -Name "identity-b" `
    -SqlFile (Join-Path $sqlDirectory "identity-b.sql")

  Wait-ForSuccessfulSession $identityA
  Wait-ForSuccessfulSession $identityB

  $inventoryA = Start-PsqlSession `
    -Name "inventory-a" `
    -SqlFile (Join-Path $sqlDirectory "inventory-a.sql")
  Wait-ForOutputMarker $inventoryA "INVENTORY_A_ALL_KEYS_ACQUIRED"

  $inventoryB = Start-PsqlSession `
    -Name "inventory-b" `
    -SqlFile (Join-Path $sqlDirectory "inventory-b.sql")

  Wait-ForSuccessfulSession $inventoryA
  Wait-ForSuccessfulSession $inventoryB

  $gateA = Start-PsqlSession `
    -Name "gate-a" `
    -SqlFile (Join-Path $sqlDirectory "gate-a.sql")
  Wait-ForOutputMarker $gateA "GATE_A_ITEM_ACQUIRED"

  $gateB = Start-PsqlSession `
    -Name "gate-b" `
    -SqlFile (Join-Path $sqlDirectory "gate-b.sql")
  Wait-ForOutputMarker $gateB "GATE_B_SHARED_ACQUIRED"

  Invoke-ForegroundPsql `
    -Name "gate-c" `
    -SqlFile (Join-Path $sqlDirectory "gate-c.sql")

  Wait-ForSuccessfulSession $gateA
  Wait-ForSuccessfulSession $gateB

  Invoke-ForegroundPsql `
    -Name "gate-after" `
    -SqlFile (Join-Path $sqlDirectory "gate-after.sql")
}
finally {
  foreach ($process in $startedProcesses) {
    if (-not $process.HasExited) {
      $process.Kill()
    }
  }

  [Environment]::SetEnvironmentVariable("PGAPPNAME", $previousAppName, "Process")
}

$evidenceFiles = Get-ChildItem -LiteralPath $runDirectory -File | Sort-Object Name
foreach ($evidenceFile in $evidenceFiles) {
  Write-Output "$($evidenceFile.Name) SHA-256 $(Get-Sha256 $evidenceFile.FullName)"
}

Write-Output "Non-destructive multi-session advisory-lock harness passed."
Write-Output "Evidence directory: $runDirectory"
Write-Output "No application row was inserted, updated, or deleted by this harness."
