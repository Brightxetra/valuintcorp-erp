Set-StrictMode -Version Latest

$script:ValuintcorpExpectedMainProjectRef = "sxhbjwuurkwrnjmnpnix"

function Get-ValuintcorpRepositoryRoot {
  return [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot "..\..\..\..")
  ).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
}

function Get-RequiredEnvironmentValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Required process environment variable $Name is missing."
  }

  return $value.Trim()
}

function Assert-CommandAvailable {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    throw "$Name was not found on PATH."
  }

  return $command.Source
}

function Assert-PostgresEnvironment {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ExpectedProjectRef,

    [switch]$RequireValuintcorpMain,

    [switch]$RejectValuintcorpMain
  )

  if ($ExpectedProjectRef -notmatch "^[a-z0-9]{20}$") {
    throw "ExpectedProjectRef must be a 20-character lowercase Supabase project ref."
  }

  $configuredProjectRef = Get-RequiredEnvironmentValue "SUPABASE_PROJECT_REF"
  if ($configuredProjectRef -ne $ExpectedProjectRef) {
    throw "SUPABASE_PROJECT_REF does not match the explicitly selected target."
  }

  if ($RequireValuintcorpMain -and $configuredProjectRef -ne $script:ValuintcorpExpectedMainProjectRef) {
    throw "This operation is pinned to the Valuintcorp pre-launch main project."
  }

  if ($RejectValuintcorpMain -and $configuredProjectRef -eq $script:ValuintcorpExpectedMainProjectRef) {
    throw "This restore operation refuses to target the Valuintcorp main project."
  }

  $hostName = (Get-RequiredEnvironmentValue "PGHOST").ToLowerInvariant()
  $port = Get-RequiredEnvironmentValue "PGPORT"
  $database = Get-RequiredEnvironmentValue "PGDATABASE"
  $userName = Get-RequiredEnvironmentValue "PGUSER"
  [void](Get-RequiredEnvironmentValue "PGPASSWORD")
  $sslMode = (Get-RequiredEnvironmentValue "PGSSLMODE").ToLowerInvariant()

  if ($port -ne "5432") {
    throw "PGPORT must be 5432. Transaction-pooler connections are not allowed for this operator pack."
  }

  if ($database -ne "postgres") {
    throw "PGDATABASE must be postgres."
  }

  if ($sslMode -notin @("require", "verify-full")) {
    throw "PGSSLMODE must be require or verify-full."
  }

  $directHost = "db.$ExpectedProjectRef.supabase.co"
  $isDirectConnection = $hostName -eq $directHost -and $userName -eq "postgres"
  $isSessionPoolerConnection =
    $hostName.EndsWith(".pooler.supabase.com") -and
    $userName -eq "postgres.$ExpectedProjectRef"

  if (-not ($isDirectConnection -or $isSessionPoolerConnection)) {
    throw "PGHOST/PGUSER do not prove a direct or session-pooler connection to the selected project ref."
  }

  foreach ($unexpectedVariable in @("PGSERVICE", "PGSERVICEFILE", "PGOPTIONS")) {
    $unexpectedValue = [Environment]::GetEnvironmentVariable($unexpectedVariable, "Process")
    if (-not [string]::IsNullOrWhiteSpace($unexpectedValue)) {
      throw "$unexpectedVariable must be unset so it cannot override the reviewed connection."
    }
  }

  $connectTimeout = [Environment]::GetEnvironmentVariable(
    "PGCONNECT_TIMEOUT",
    "Process"
  )
  if ([string]::IsNullOrWhiteSpace($connectTimeout)) {
    $env:PGCONNECT_TIMEOUT = "10"
  }
  elseif ($connectTimeout -notmatch "^\d+$" -or [int]$connectTimeout -notin 1..30) {
    throw "PGCONNECT_TIMEOUT must be between 1 and 30 seconds."
  }
}

function Assert-OutputDirectoryOutsideRepository {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not [System.IO.Path]::IsPathRooted($Path)) {
    throw "Output directory must be an absolute path outside the repository."
  }

  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    throw "Output directory must already exist. The operator pack will not create it implicitly."
  }

  $resolvedOutput = (Resolve-Path -LiteralPath $Path).Path.TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $repositoryRoot = Get-ValuintcorpRepositoryRoot
  $separator = [System.IO.Path]::DirectorySeparatorChar

  if (
    $resolvedOutput.Equals($repositoryRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    $resolvedOutput.StartsWith(
      "$repositoryRoot$separator",
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw "Evidence and backup artifacts must not be written inside the repository."
  }

  return $resolvedOutput
}

function Get-PostgresToolMajorVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CommandPath
  )

  $versionOutput = & $CommandPath --version 2>&1
  if ($LASTEXITCODE -ne 0 -or "$versionOutput" -notmatch "(\d+)(?:\.\d+)?") {
    throw "Could not determine the PostgreSQL client major version."
  }

  return [int]$Matches[1]
}

function Get-Sha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function ConvertTo-StartProcessArgument {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  if ($Value -notmatch '[\s"]') {
    return $Value
  }

  return '"' + $Value.Replace('"', '\"') + '"'
}
