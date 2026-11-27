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

$freezeAck = Get-RequiredEnvironmentValue "DIRECT_MAIN_FREEZE_ACK"
if ($freezeAck -ne "WRITERS_FROZEN_AND_VERIFIED") {
  throw "DIRECT_MAIN_FREEZE_ACK must confirm that all application, preview, cron, and operator writers are frozen."
}

$pgDump = Assert-CommandAvailable "pg_dump"
$pgRestore = Assert-CommandAvailable "pg_restore"
$pgDumpMajor = Get-PostgresToolMajorVersion $pgDump
$pgRestoreMajor = Get-PostgresToolMajorVersion $pgRestore
if ($pgDumpMajor -lt 17 -or $pgRestoreMajor -lt 17) {
  throw "pg_dump and pg_restore 17 or newer are required for the PostgreSQL 17 target."
}

$resolvedOutputDirectory = Assert-OutputDirectoryOutsideRepository $OutputDirectory
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$artifactStem = "valuintcorp-affected-scope-$expectedProjectRef-$timestamp"
$archivePath = Join-Path $resolvedOutputDirectory "$artifactStem.dump"
$tocPath = Join-Path $resolvedOutputDirectory "$artifactStem.toc.txt"
$checksumPath = Join-Path $resolvedOutputDirectory "$artifactStem.sha256.txt"
$previousAppName = [Environment]::GetEnvironmentVariable("PGAPPNAME", "Process")

try {
  $env:PGAPPNAME = "valuintcorp-direct-main:${expectedProjectRef}:logical-backup"

  & $pgDump `
    --format=custom `
    --compress=6 `
    --no-owner `
    --serializable-deferrable `
    --lock-wait-timeout=5000 `
    --schema=public `
    --schema=app_private `
    --schema=supabase_migrations `
    --file=$archivePath

  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed. Treat the cutover as NO-GO."
  }

  $toc = & $pgRestore --list $archivePath
  if ($LASTEXITCODE -ne 0) {
    throw "pg_restore could not read the new archive. Treat the cutover as NO-GO."
  }

  foreach ($requiredScope in @("SCHEMA - public", "SCHEMA - app_private", "SCHEMA - supabase_migrations")) {
    if ("$toc" -notlike "*$requiredScope*") {
      throw "Archive TOC is missing required scope marker: $requiredScope"
    }
  }

  $toc | Out-File -LiteralPath $tocPath -Encoding utf8
}
finally {
  [Environment]::SetEnvironmentVariable("PGAPPNAME", $previousAppName, "Process")
}

$archiveHash = Get-Sha256 $archivePath
$archiveSize = (Get-Item -LiteralPath $archivePath).Length
[System.IO.File]::WriteAllText(
  $checksumPath,
  "$archiveHash  $([System.IO.Path]::GetFileName($archivePath))`r`n",
  [System.Text.Encoding]::ASCII
)

Write-Output "Affected-scope logical backup completed and archive TOC was validated."
Write-Output "Archive: $archivePath"
Write-Output "TOC: $tocPath"
Write-Output "TOC SHA-256: $(Get-Sha256 $tocPath)"
Write-Output "Checksum file: $checksumPath"
Write-Output "Bytes: $archiveSize"
Write-Output "SHA-256: $archiveHash"
Write-Output "Scope: public, app_private, and supabase_migrations (schema, data, and ACLs; owners excluded)."
Write-Output "Auth and Storage are intentionally outside this migration-recovery archive and must remain unchanged during cutover."
