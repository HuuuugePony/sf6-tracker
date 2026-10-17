param([int]$Port = 18766, [switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$site = Join-Path $repo 'site'
$server = Join-Path $repo '宣传片\SF6 Tracker宣传片\工程\node_modules\http-server\bin\http-server'
$url = "http://127.0.0.1:${Port}/"
if (-not (Test-Path -LiteralPath $server)) {
  throw '未找到本机宣传片工程的 http-server。可在仓库根目录用 npx http-server site -p 18766 -a 127.0.0.1 -c-1 启动。'
}
if (-not (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)) {
  $nodeExe = (Get-Command node.exe).Source
  $nodeArgs = @(('"' + $server + '"'), ('"' + $site + '"'), '-p', "$Port", '-a', '127.0.0.1', '-c-1')
  Start-Process -FilePath $nodeExe -ArgumentList $nodeArgs -WorkingDirectory $repo -WindowStyle Hidden | Out-Null
}
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
  Start-Sleep -Seconds 1
}
if (-not $ready) { throw '本地官网服务未就绪。' }
Write-Host "SF6 Tracker 官网预览：$url"
if (-not $NoOpen) { Start-Process $url }
