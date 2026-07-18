$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command py -ErrorAction SilentlyContinue)) { throw 'Install Python 3.11 or 3.12 first.' }
py -3.11 -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'Failed to upgrade pip.' }
& .\.venv\Scripts\pip.exe install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Failed to install agent dependencies.' }
if (-not (Test-Path config.json)) { Copy-Item config.example.json config.json; Write-Host 'Edit config.json, then run start.ps1.' }
