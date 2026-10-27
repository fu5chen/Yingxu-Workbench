param()
$ErrorActionPreference = "Stop"
$appRoot = Split-Path -Parent $PSScriptRoot
$runtimePath = Join-Path $appRoot ".sites-runtime/external-access"
Set-Location -LiteralPath $appRoot
function Quote-Arg([string]$Value) { return '"' + $Value + '"' }
function Start-HiddenNode([string]$Name, [string[]]$Arguments) {
  $process = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList $Arguments -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimePath "$Name.stdout.log") -RedirectStandardError (Join-Path $runtimePath "$Name.stderr.log")
  $process.Id | Set-Content -LiteralPath (Join-Path $runtimePath "$Name.pid")
}
function Test-PublicLogin([string]$Address) {
  if ($Address -notmatch '^https://[a-z0-9-]+\.trycloudflare\.com$') { return $false }
  try {
    $result=Invoke-WebRequest -Uri "$Address/login" -UseBasicParsing -TimeoutSec 8
    return ($result.StatusCode -eq 200 -and $result.Content.Contains("登录工作台"))
  } catch { return $false }
}
$launchMutex=New-Object System.Threading.Mutex($false,"Local\YingxuExternalLauncher")
$lockTaken=$false
try {
  try { $lockTaken=$launchMutex.WaitOne(30000) } catch [System.Threading.AbandonedMutexException] { $lockTaken=$true }
  if (-not $lockTaken) { throw "另一个启动程序仍在运行，请稍候。" }
  if (-not (Get-NetTCPConnection -State Listen -LocalPort 5181 -ErrorAction SilentlyContinue)) {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "构建失败。" }
    & node scripts/prepare-external.mjs
    if ($LASTEXITCODE -ne 0) { throw "外网配置准备失败。" }
    Start-HiddenNode "worker" @("--import","./scripts/sites-env.mjs",(Quote-Arg (Join-Path $appRoot "node_modules/wrangler/bin/wrangler.js")),"dev","--config",(Quote-Arg (Join-Path $runtimePath "wrangler.json")),"--local","--persist-to",(Quote-Arg (Join-Path $appRoot ".wrangler/state")),"--ip","127.0.0.1","--port","5181","--inspector-port","0","--show-interactive-dev-session=false")
  }
  if (-not (Get-NetTCPConnection -State Listen -LocalPort 5191 -ErrorAction SilentlyContinue)) {
    Start-HiddenNode "gateway" @((Quote-Arg (Join-Path $appRoot "scripts/external-gateway.mjs")))
  }
  $ready = $false
  for ($attempt=0; $attempt -lt 30; $attempt++) {
    try {
      $login=Invoke-WebRequest -Uri "http://127.0.0.1:5191/login" -UseBasicParsing -TimeoutSec 2
      $worker=Invoke-WebRequest -Uri "http://127.0.0.1:5181/" -UseBasicParsing -TimeoutSec 2
      if ($login.StatusCode -eq 200 -and $worker.StatusCode -eq 200 -and $login.Content.Contains("登录工作台")) { $ready=$true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "本地外网服务未就绪，请查看 .sites-runtime/external-access 日志。" }
  $runner = $null
  $runnerPidFile = Join-Path $runtimePath "runner.pid"
  if (Test-Path -LiteralPath $runnerPidFile) {
    $runnerProcessId=[int](Get-Content -LiteralPath $runnerPidFile)
    $candidate=Get-CimInstance Win32_Process -Filter "ProcessId=$runnerProcessId" -ErrorAction SilentlyContinue
    if ($candidate.Name -eq "node.exe" -and $candidate.CommandLine -match "background-runner\.mjs") { $runner=$candidate }
  }
  if (-not $runner) { Start-HiddenNode "runner" @((Quote-Arg (Join-Path $appRoot "scripts/background-runner.mjs"))) }
  $tunnel = $null
  $pidFile = Join-Path $runtimePath "tunnel.pid"
  if (Test-Path -LiteralPath $pidFile) {
    $savedPid=[int](Get-Content -LiteralPath $pidFile)
    $candidate=Get-CimInstance Win32_Process -Filter "ProcessId=$savedPid" -ErrorAction SilentlyContinue
    if ($candidate.Name -eq "cloudflared.exe" -and $candidate.CommandLine.Contains((Join-Path $runtimePath "quick-tunnel.yml"))) { $tunnel=$candidate }
  }
  if ($tunnel) {
    $oldLog=Get-Content -LiteralPath (Join-Path $runtimePath "tunnel.stderr.log") -Raw -ErrorAction SilentlyContinue
    $oldAddress=$null
    if ($oldLog -match "https://[a-z0-9-]+\.trycloudflare\.com") { $oldAddress=$Matches[0] }
    $expired=$oldLog -and $oldLog.LastIndexOf("Unauthorized: Tunnel not found") -gt $oldLog.LastIndexOf("Registered tunnel connection")
    $healthy=$false
    if (-not $expired -and $oldAddress) {
      [IO.File]::WriteAllText((Join-Path $runtimePath "origin.txt"),$oldAddress)
      $healthy=Test-PublicLogin $oldAddress
      if (-not $healthy) { Start-Sleep -Seconds 2; $healthy=Test-PublicLogin $oldAddress }
    }
    if (-not $healthy) {
      Write-Host "原外网隧道已失效或不可达，正在重新建立连接…"
      # The candidate above was verified by executable and this project's config path.
      Stop-Process -Id $tunnel.ProcessId -ErrorAction SilentlyContinue
      Wait-Process -Id $tunnel.ProcessId -Timeout 10 -ErrorAction SilentlyContinue
      $tunnel=$null
    }
  }
  if (-not $tunnel) {
    $binary=Join-Path $appRoot "tools/cloudflared.exe"
    $process=Start-Process -FilePath $binary -ArgumentList @("tunnel","--config",(Quote-Arg (Join-Path $runtimePath "quick-tunnel.yml")),"--no-autoupdate","--url","http://127.0.0.1:5191","--protocol","http2","--metrics","127.0.0.1:0") -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimePath "tunnel.stdout.log") -RedirectStandardError (Join-Path $runtimePath "tunnel.stderr.log")
    $process.Id | Set-Content -LiteralPath $pidFile
  }
  $address=$null
  for ($attempt=0; $attempt -lt 60; $attempt++) {
    $log=Get-Content -LiteralPath (Join-Path $runtimePath "tunnel.stderr.log") -Raw -ErrorAction SilentlyContinue
    if ($log -match "https://[a-z0-9-]+\.trycloudflare\.com" -and $log.Contains("Registered tunnel connection")) { $address=$Matches[0]; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $address) { throw "外网隧道尚未连接。请确认网络恢复后再次运行启动脚本。" }
  # The gateway reads this allowlisted hostname on every request.
  [IO.File]::WriteAllText((Join-Path $runtimePath "origin.txt"),$address)
  $publicReady=$false
  for ($probe=0; $probe -lt 3; $probe++) {
    if (Test-PublicLogin $address) { $publicReady=$true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $publicReady) { throw "本地服务已启动，但外网尚不可达。请联网后重新运行启动脚本，程序会检测并重建失效隧道。" }
  [IO.File]::WriteAllText((Join-Path $runtimePath "origin.txt"),$address)
  [IO.File]::WriteAllText((Join-Path $appRoot "外网地址.txt"),"$address/login`r`n`r`n登录信息：.sites-runtime/external-access/登录信息.json`r`n电脑需保持运行，重启隧道后地址会改变。`r`n")
  Write-Host "外网工作台：$address/login"
  Write-Host "登录账号和密码保存在 .sites-runtime/external-access/登录信息.json"
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 } finally { if ($lockTaken) { $launchMutex.ReleaseMutex() }; $launchMutex.Dispose() }
