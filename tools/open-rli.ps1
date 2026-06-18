param(
  [ValidateSet("display", "manage")]
  [string] $Mode = "manage",
  [switch] $NoOpen
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DisplayPort = 14785
$ManagePort = 14786
$TargetPort = if ($Mode -eq "display") { $DisplayPort } else { $ManagePort }
$Url = "http://127.0.0.1:$TargetPort/"

function Test-ListenPort {
  param([int] $Port)
  try {
    return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  } catch {
    return $false
  }
}

function Start-RliServer {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($null -eq $node) {
    throw "Node.js is required. Please install Node.js 18 or newer."
  }

  Start-Process `
    -FilePath $node.Source `
    -ArgumentList "src/server.js" `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $ProjectRoot "server.log") `
    -RedirectStandardError (Join-Path $ProjectRoot "server.err.log")
}

if (-not (Test-ListenPort $DisplayPort) -or -not (Test-ListenPort $ManagePort)) {
  Start-RliServer
  for ($index = 0; $index -lt 30; $index += 1) {
    if ((Test-ListenPort $DisplayPort) -and (Test-ListenPort $ManagePort)) {
      break
    }
    Start-Sleep -Milliseconds 300
  }
}

if ($NoOpen) {
  Write-Output "Rli ready: $Url"
  exit 0
}

$browser = Get-Command msedge.exe -ErrorAction SilentlyContinue
if ($null -eq $browser) {
  $browser = Get-Command chrome.exe -ErrorAction SilentlyContinue
}

if ($null -ne $browser) {
  Start-Process -FilePath $browser.Source -ArgumentList "--app=$Url"
} else {
  Start-Process $Url
}
