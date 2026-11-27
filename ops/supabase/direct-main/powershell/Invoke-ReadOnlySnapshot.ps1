[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Preflight", "Postflight")]
  [string]$Phase,

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

$psql = Assert-CommandAvailable "psql"
$psqlMajor = Get-PostgresToolMajorVersion $psql
if ($psqlMajor -lt 17) {
  throw "psql 17 or newer is required for the PostgreSQL 17 target."
}

$resolvedOutputDirectory = Assert-OutputDirectoryOutsideRepository $OutputDirectory
$phaseSlug = $Phase.ToLowerInvariant()
$sqlPath = Join-Path $PSScriptRoot "..\sql\$phaseSlug.sql"
if (-not (Test-Path -LiteralPath $sqlPath -PathType Leaf)) {
  throw "Snapshot SQL was not found: $sqlPath"
}

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$outputPath = Join-Path $resolvedOutputDirectory "$phaseSlug-$expectedProjectRef-$timestamp.txt"
$previousAppName = [Environment]::GetEnvironmentVariable("PGAPPNAME", "Process")

try {
  $env:PGAPPNAME = "valuintcorp-direct-main:${expectedProjectRef}:$phaseSlug"

  & $psql `
    -X `
    -w `
    -v "ON_ERROR_STOP=1" `
    -v "VERBOSITY=terse" `
    -v "expected_project_ref=$expectedProjectRef" `
    -f $sqlPath `
    -o $outputPath

  if ($LASTEXITCODE -ne 0) {
    throw "$Phase snapshot failed. Treat the cutover as NO-GO."
  }
}
finally {
  [Environment]::SetEnvironmentVariable("PGAPPNAME", $previousAppName, "Process")
}

$hash = Get-Sha256 $outputPath
Write-Output "$Phase metadata snapshot completed."
Write-Output "Evidence file: $outputPath"
Write-Output "SHA-256: $hash"
