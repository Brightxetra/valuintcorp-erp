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

if ((Get-RequiredEnvironmentValue "DIRECT_MAIN_INDEX_RECOVERY_ACK") -ne "DROP_ONLY_EXACT_INVALID_UNRECORDED_INDEX") {
  throw "The invalid-index recovery acknowledgement is missing."
}

$backupEvidenceHash = Get-RequiredEnvironmentValue "DIRECT_MAIN_BACKUP_EVIDENCE_SHA256"
if ($backupEvidenceHash -notmatch "^[a-fA-F0-9]{64}$") {
  throw "DIRECT_MAIN_BACKUP_EVIDENCE_SHA256 must be a recorded 64-character SHA-256 value."
}

$psql = Assert-CommandAvailable "psql"
if ((Get-PostgresToolMajorVersion $psql) -lt 17) {
  throw "psql 17 or newer is required."
}

$resolvedOutputDirectory = Assert-OutputDirectoryOutsideRepository $OutputDirectory
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$outputPath = Join-Path $resolvedOutputDirectory "invalid-index-recovery-$expectedProjectRef-$timestamp.txt"
$sqlPath = Join-Path $PSScriptRoot "..\sql\drop-exact-invalid-operation-index.sql"
$previousAppName = [Environment]::GetEnvironmentVariable("PGAPPNAME", "Process")

try {
  $env:PGAPPNAME = "valuintcorp-direct-main:${expectedProjectRef}:index-recovery"

  & $psql `
    -X `
    -w `
    -v "ON_ERROR_STOP=1" `
    -v "VERBOSITY=terse" `
    -v "expected_project_ref=$expectedProjectRef" `
    -f $sqlPath `
    -o $outputPath

  if ($LASTEXITCODE -ne 0) {
    throw "Index recovery refused or failed. Do not run activation."
  }
}
finally {
  [Environment]::SetEnvironmentVariable("PGAPPNAME", $previousAppName, "Process")
}

Write-Output "The exact invalid, unrecorded operation-key index was removed concurrently."
Write-Output "Evidence file: $outputPath"
Write-Output "SHA-256: $(Get-Sha256 $outputPath)"
Write-Output "Re-run the standalone index migration only after a fresh read-only index-state check."
