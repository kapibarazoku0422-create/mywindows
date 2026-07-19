$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$createdNew = $false
$agentMutex = New-Object System.Threading.Mutex($true, 'Local\MyRemotePcAgent', [ref]$createdNew)
if (-not $createdNew) {
    Write-Host 'My Remote PC is already running.'
    exit 0
}
try {
    & .\.venv\Scripts\python.exe agent.py --config config.json
} finally {
    $agentMutex.ReleaseMutex()
    $agentMutex.Dispose()
}
