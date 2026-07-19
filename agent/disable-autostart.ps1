$ErrorActionPreference = 'Stop'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'My Remote PC.lnk'
if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath
    Write-Host 'Automatic startup disabled.'
} else {
    Write-Host 'Automatic startup was not enabled.'
}
