[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,

  [Parameter(Mandatory = $true)]
  [string]$ExpectedSha256,

  [Parameter(Mandatory = $true)]
  [string]$OutputFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "Common.ps1")

if (-not [System.IO.Path]::IsPathRooted($BackupFile)) {
  throw "BackupFile must be an absolute path outside the repository."
}

if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) {
  throw "Backup archive does not exist."
}

$repositoryRoot = Get-ValuintcorpRepositoryRoot
$resolvedBackup = (Resolve-Path -LiteralPath $BackupFile).Path
$separator = [System.IO.Path]::DirectorySeparatorChar
if (
  $resolvedBackup.Equals($repositoryRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
  $resolvedBackup.StartsWith(
    "$repositoryRoot$separator",
    [System.StringComparison]::OrdinalIgnoreCase
  )
) {
  throw "Backup archives inside the repository are not accepted."
}

if (-not [System.IO.Path]::IsPathRooted($OutputFile)) {
  throw "OutputFile must be an absolute path outside the repository."
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputFile)
$outputDirectory = [System.IO.Path]::GetDirectoryName($resolvedOutput)
[void](Assert-OutputDirectoryOutsideRepository $outputDirectory)

if (Test-Path -LiteralPath $resolvedOutput) {
  throw "OutputFile already exists. Refusing to overwrite reviewed restore evidence."
}

if ($resolvedOutput.Equals($resolvedBackup, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputFile must not replace the backup archive."
}

$pgRestore = Assert-CommandAvailable "pg_restore"
if ((Get-PostgresToolMajorVersion $pgRestore) -lt 17) {
  throw "pg_restore 17 or newer is required."
}

$normalizedExpectedHash = $ExpectedSha256.Trim().ToLowerInvariant()
if ($normalizedExpectedHash -notmatch "^[a-f0-9]{64}$") {
  throw "ExpectedSha256 must be a 64-character SHA-256 value."
}

$archiveHash = Get-Sha256 $resolvedBackup
if ($archiveHash -ne $normalizedExpectedHash) {
  throw "The archive checksum does not match the independently recorded value."
}

$toc = @(& $pgRestore --list $resolvedBackup)
if ($LASTEXITCODE -ne 0) {
  throw "The backup archive failed its table-of-contents check."
}

foreach ($requiredScope in @("SCHEMA - public", "SCHEMA - app_private", "SCHEMA - supabase_migrations")) {
  if ("$toc" -notlike "*$requiredScope*") {
    throw "Archive TOC does not contain required scope marker: $requiredScope"
  }
}

$expectedSupabaseAdminDefaultAclKinds = @(
  "FUNCTIONS",
  "SEQUENCES",
  "TABLES"
)
$suppressedKinds = [System.Collections.Generic.List[string]]::new()
$reviewedToc = foreach ($line in $toc) {
  if (
    $line -match
      '^\d+;\s+\d+\s+\d+\s+DEFAULT ACL\s+public\s+DEFAULT PRIVILEGES FOR (FUNCTIONS|SEQUENCES|TABLES)\s+supabase_admin\s*$'
  ) {
    $suppressedKinds.Add($Matches[1])
    "; DIRECT-MAIN OMITTED NON-RESTORABLE ENTRY: $line"
    continue
  }

  if (
    $line -match '^\d+;\s+\d+\s+\d+\s+DEFAULT ACL\s+\S+\s+.+\s+(\S+)\s*$' -and
    $Matches[1] -ne "postgres"
  ) {
    throw "Archive contains an unexpected non-postgres DEFAULT ACL owner: $($Matches[1])."
  }

  $line
}

$actualSuppressedKinds = @($suppressedKinds | Sort-Object -Unique)
if (
  $suppressedKinds.Count -ne 3 -or
  $actualSuppressedKinds.Count -ne 3 -or
  @(Compare-Object $expectedSupabaseAdminDefaultAclKinds $actualSuppressedKinds).Count -ne 0
) {
  throw "Expected exactly one public supabase_admin DEFAULT ACL for FUNCTIONS, SEQUENCES, and TABLES."
}

[System.IO.File]::WriteAllLines(
  $resolvedOutput,
  [string[]]$reviewedToc,
  [System.Text.UTF8Encoding]::new($false)
)

$activeEntryCount = @($reviewedToc | Where-Object { $_ -match '^\d+;' }).Count

Write-Output "Reviewed restore TOC created without opening a database connection."
Write-Output "Archive SHA-256: $archiveHash"
Write-Output "Restore TOC: $resolvedOutput"
Write-Output "Restore TOC SHA-256: $(Get-Sha256 $resolvedOutput)"
Write-Output "Active TOC entries: $activeEntryCount"
Write-Output "Suppressed entries: 3 public supabase_admin DEFAULT ACL records (FUNCTIONS, SEQUENCES, TABLES)."
Write-Output "Reason: the hosted postgres login cannot alter default privileges owned by supabase_admin."
Write-Output "All other schema, data, policy, trigger, ACL, and default-ACL entries remain active."
