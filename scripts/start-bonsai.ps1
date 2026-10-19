# Starts Ternary Bonsai 2 27B on 127.0.0.1:8891 for Eliza.
# This machine's GPU is 4 GB, so the 6 GB model stays on CPU.
# Reasoning is off: short and medium Eliza calls should not spend a long think.

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Server = Join-Path $RepoRoot "models\runtime\cpu\llama-server.exe"
$Model = Join-Path $RepoRoot "models\Ternary-Bonsai-2-27B-PTQ1_0.gguf"
$Port = 8891

if (-not (Test-Path $Server)) {
    throw "llama-server not found at $Server"
}
if (-not (Test-Path $Model)) {
    throw "Model weights not found at $Model"
}

$listening = netstat -ano | Select-String ":$Port\s"
if ($listening) {
    throw "Port $Port is already in use. Leave the existing Bonsai server running, or free the port first."
}

$threads = [Math]::Max(4, [int]$env:NUMBER_OF_PROCESSORS - 2)

Write-Host "Bonsai 2 27B on http://127.0.0.1:$Port/v1 ($threads threads, context 8192, CPU)"

& $Server `
    -m $Model `
    -a bonsai-2-27b `
    --host 127.0.0.1 `
    --port $Port `
    -c 8192 `
    -ngl 0 `
    -t $threads `
    --reasoning off `
    --temp 0.7 `
    --top-p 0.8 `
    --top-k 20 `
    --presence-penalty 1.5
