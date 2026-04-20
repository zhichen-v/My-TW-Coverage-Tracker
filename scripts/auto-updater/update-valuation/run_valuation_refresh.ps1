param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot "valuation_refresh_config.json")
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$pythonExe = Join-Path $projectRoot ".venv\Scripts\python.exe"
$runner = Join-Path $PSScriptRoot "run_valuation_refresh.py"

if (-not (Test-Path $pythonExe)) {
    throw "Python interpreter not found: $pythonExe"
}

if (-not (Test-Path $runner)) {
    throw "Runner script not found: $runner"
}

& $pythonExe $runner --config $ConfigPath
exit $LASTEXITCODE
