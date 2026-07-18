$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
& .\.venv\Scripts\python.exe agent.py --config config.json
