[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,

  [Parameter(Mandatory = $true)]
  [string]$ExpectedSha256
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

$toc = & $pgRestore --list $resolvedBackup
if ($LASTEXITCODE -ne 0) {
  throw "The backup archive failed its table-of-contents check."
}

foreach ($requiredScope in @("SCHEMA - public", "SCHEMA - app_private", "SCHEMA - supabase_migrations")) {
  if ("$toc" -notlike "*$requiredScope*") {
    throw "Archive TOC does not contain required scope marker: $requiredScope"
  }
}

Write-Output "Archive SHA-256: $archiveHash"
Write-Output "Required TOC scopes are present: public, app_private, supabase_migrations."
Write-Output "No database connection was opened and no restore was executed."
Write-Output "Generate a fail-closed --use-list file with New-ReviewedAffectedScopeRestoreList.ps1 before any full affected-scope restore."
Write-Output "Use the reviewed restore templates in README.md only after inspecting this TOC and selecting in-place affected-scope or table-level recovery."
Write-Output "The archive is not a full-project clone: Auth, Storage, project settings, secrets, object payloads, and custom role passwords are outside its scope."
