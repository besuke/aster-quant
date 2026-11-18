<#
InfragoQuant.ps1 — Infrago Quant Server（R API、計算は RiemannFinMath）と画面（クライアント）を起動し、ブラウザーで開く。

  .\InfragoQuant.ps1               メニュー（番号で選ぶ）
  .\InfragoQuant.ps1 -Mode dev     この PC で起動（開発用）。R API 127.0.0.1:8790（npm run api）と画面 http://127.0.0.1:8091/（npm run dev）
  .\InfragoQuant.ps1 -Mode lan     社内LANで起動（配備）。画面をビルドし、画面と API を 8091 でまとめて公開する（npm run lan）
  .\InfragoQuant.ps1 -Mode server  サーバー（R API、127.0.0.1:8790）だけを起動する
  .\InfragoQuant.ps1 -Mode client  クライアント（Web 画面、http://127.0.0.1:8091/）だけを起動してブラウザーで開く
  .\InfragoQuant.ps1 -Mode resume  Claude Code をこのフォルダーで開く（セッションがあれば claude --resume）

フォルダー名を InfragoQuant に変更したあとも、そのまま動く（パスはすべて $PSScriptRoot からの相対）。
#>
param([ValidateSet("menu", "dev", "lan", "server", "client", "resume")] [string] $Mode = "menu")

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Infrago Quant"

$Root = $PSScriptRoot
$UI = Join-Path $Root "ui"
$Page = "http://127.0.0.1:8091/"
$Api = "http://127.0.0.1:8790/api/health"
$PageApi = "http://127.0.0.1:8091/api/health"
$Npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $Npm) { $Npm = "C:\Program Files\nodejs\npm.cmd" }
$Claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $Claude) { $Claude = Join-Path $env:USERPROFILE ".local\bin\claude.exe" }

function Say([string] $text, [string] $color = "Gray") { Write-Host $text -ForegroundColor $color }

# 利用者に案内するホスト：deploy.local.env の INFRAGO_QUANT_PUBLIC_HOST または QUANTLET_PUBLIC_HOST、なければこの PC の LAN の IPv4
function Get-PublicHost {
  $file = Join-Path $Root "deploy.local.env"
  if (Test-Path $file) {
    foreach ($line in Get-Content $file -Encoding UTF8) {
      if ($line -match '^\s*(?:INFRAGO_QUANT_PUBLIC_HOST|QUANTLET_PUBLIC_HOST)\s*=\s*(\S*)\s*$' -and $Matches[1]) {
        return [pscustomobject]@{ Host = $Matches[1]; Source = "deploy.local.env の設定" }
      }
    }
  }
  $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1 -ExpandProperty IPAddress
  [pscustomobject]@{ Host = $ip; Source = "この PC の LAN の IP アドレス（自動検出）" }
}

function Get-Text([string] $url) {
  try { (Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 3).Content } catch { $null }
}
# Infrago Quant Server は /api/health に {"status":"ok","name":"Infrago Quant Server",...} と答える（旧名 AsterQuant Server・QuantLet Server も受け付ける）
function Test-InfragoQuantApi([string] $url) {
  $t = Get-Text $url
  [bool]($t -and ($t -match '"name"\s*:\s*"(Infrago Quant|AsterQuant|QuantLet) Server"'))
}
function Test-InfragoQuantPage([string] $url) {
  $t = Get-Text $url
  [bool]($t -and ($t -match "<title>(Infrago Quantlet|AsterQuant|QuantLet)</title>"))
}

# ポートが空いているか。使われていれば、番号と使っているプロセスを示す
function Assert-PortFree([int] $port, [string] $bind, [string] $name) {
  $listener = $null
  try {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse($bind), $port)
    $listener.Start()
    return $true
  } catch {
    $owner = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    $proc = if ($owner) { (Get-Process -Id $owner.OwningProcess -ErrorAction SilentlyContinue).ProcessName } else { "不明" }
    Say "ポート $port は Infrago Quant 以外のプロセス（$proc、PID $($owner.OwningProcess)）が使っています。$name を起動できません。別のポートには切り替えません。" "Red"
    return $false
  } finally { if ($listener) { $listener.Stop() } }
}

function Wait-Url([string] $url, [int] $seconds, [string] $name) {
  Say "      $name の応答を待っています（最大 $seconds 秒）..."
  for ($i = 0; $i -lt $seconds; $i++) {
    try { Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2 | Out-Null; Say "      $name が応答しました。" "Green"; return $true } catch { Start-Sleep -Seconds 1 }
  }
  Say "$name が $seconds 秒以内に応答しませんでした。起動したウィンドウのメッセージを確認してください。" "Red"
  return $false
}

# R の確認（settings.local.env の RSCRIPT → PATH の順に選んだ R の版と、RiemannFinMath などの必須パッケージ）。
# 読み込めなければ、選ばれた R と不足しているパッケージを表示して false を返す
function Test-REnvironment {
  Say "      R を確かめています（npm run check:r）..."
  Push-Location $UI
  try { & $Npm run --silent check:r | Out-Host; $ok = ($LASTEXITCODE -eq 0) } finally { Pop-Location }
  if (-not $ok) { Say "R の確認で止めました。上の表示を見て、パッケージを入れるか $Root\settings.local.env の RSCRIPT を直してください。" "Red" }
  return $ok
}

# 新しいウィンドウで npm のスクリプトを動かす（ウィンドウを閉じると止まる）
function Start-NpmWindow([string] $title, [string] $script) {
  Start-Process powershell.exe -WorkingDirectory $UI -ArgumentList @(
    "-NoExit", "-NoProfile", "-Command", "`$Host.UI.RawUI.WindowTitle = '$title'; & '$Npm' run $script")
}

function Start-ServerOnly {
  Say ""
  if (Test-InfragoQuantApi $Api) {
    Say "Infrago Quant Server（R API）はすでに起動しています（127.0.0.1:8790）。" "Green"
    return $true
  }
  if (-not (Assert-PortFree 8790 "127.0.0.1" "R API")) { return $false }
  if (-not (Test-REnvironment)) { return $false }
  Say "Infrago Quant Server（R API）を別のウィンドウで起動します（127.0.0.1:8790、npm run api）..."
  Start-NpmWindow "Infrago Quant Server (8790)" "api"
  return (Wait-Url $Api 120 "Infrago Quant Server")
}

function Start-ClientOnly {
  Say ""
  if (Test-InfragoQuantPage $Page) {
    Say "Infrago Quant の画面（クライアント）はすでに起動しています（$Page）。ブラウザで開きます。" "Green"
    Start-Process $Page
    return $true
  }
  if (-not (Assert-PortFree 8091 "127.0.0.1" "画面")) { return $false }
  Say "クライアント（Web 画面）を別のウィンドウで起動します（$Page、npm run dev）..."
  Start-NpmWindow "Infrago Quant Client (8091)" "dev"
  if (-not (Wait-Url $Page 60 "画面")) { return $false }
  Say "ブラウザで $Page を開きます。"
  Start-Process $Page
  return $true
}

function Start-Dev {
  Say ""
  if (Test-InfragoQuantApi $Api) {
    Say "[1/3] Infrago Quant Server の R API はすでに起動しています（127.0.0.1:8790）。そのまま使います。"
  } else {
    if (-not (Assert-PortFree 8790 "127.0.0.1" "R API")) { return $false }
    if (-not (Test-REnvironment)) { return $false }
    Say "[1/3] R API を別のウィンドウで起動します（127.0.0.1:8790、npm run api）..."
    Start-NpmWindow "Infrago Quant Server (8790)" "api"
    if (-not (Wait-Url $Api 120 "R API")) { return $false }
  }
  if (Test-InfragoQuantPage $Page) {
    Say "[2/3] Infrago Quant の画面はすでに起動しています（$Page）。そのまま使います。"
  } else {
    if (-not (Assert-PortFree 8091 "127.0.0.1" "画面")) { return $false }
    Say "[2/3] 画面を別のウィンドウで起動します（$Page、npm run dev）..."
    Start-NpmWindow "Infrago Quant Client (8091)" "dev"
    if (-not (Wait-Url $Page 60 "画面")) { return $false }
  }
  if (-not (Wait-Url $PageApi 30 "画面から R API への接続")) { return $false }
  Say "[3/3] ブラウザで $Page を開きます（この PC の中だけで開けるアドレス）。"
  Start-Process $Page
  Say ""
  Say "起動しました（開発用）。社内のほかの端末に配るときは 2 を使ってください。" "Green"
  Say "止めるときは「Infrago Quant Server (8790)」と「Infrago Quant Client (8091)」のウィンドウを閉じてください。"
  return $true
}

function Start-Lan {
  Say ""
  $pub = Get-PublicHost
  if (-not $pub.Host) { Say "社内に案内するホスト名・IP アドレスが決まりません。$Root\deploy.local.env の INFRAGO_QUANT_PUBLIC_HOST に書いてください。" "Red"; return $false }
  $publicUrl = "http://$($pub.Host):8091/"
  if (Test-InfragoQuantPage $Page) { Say "Infrago Quant の画面がすでに 8091 で起動しています。社内LANで公開するときは、先にそのウィンドウを閉じてください。" "Red"; return $false }
  if (-not (Assert-PortFree 8091 "0.0.0.0" "社内LAN用のサーバー")) { return $false }
  if (-not (Test-REnvironment)) { return $false }
  Say "[1/3] 画面をビルドし、画面と API を 8091 でまとめて公開します（別のウィンドウ、npm run lan）..."
  Say "      案内するアドレス：$publicUrl（$($pub.Source)）"
  $env:QUANTLET_PUBLIC_HOST = $pub.Host
  $env:QUANTLET_PUBLIC_HOST_SOURCE = $pub.Source
  Start-NpmWindow "Infrago Quant LAN (8091)" "lan"
  if (-not (Wait-Url $PageApi 300 "社内LAN用のサーバー")) { return $false }
  Say "[2/3] 案内するアドレスで応答を確かめます（$($publicUrl)api/health）..."
  if (-not (Wait-Url "$($publicUrl)api/health" 20 $publicUrl)) { return $false }
  Say "[3/3] ブラウザで $publicUrl を開きます。"
  Start-Process $publicUrl
  Say ""
  Say "利用者には次のアドレスを案内してください：" "Green"
  Say "  $publicUrl" "Green"
  Say "社内のほかの端末から開けないときは、Windows ファイアウォールで 8091 の受信を許可してください（この PC の設定）。"
  Say "止めるときは「Infrago Quant LAN (8091)」のウィンドウを閉じてください。"
  return $true
}

function Open-Page {
  $pub = Get-PublicHost
  $publicUrl = if ($pub.Host) { "http://$($pub.Host):8091/" } else { $null }
  if ($publicUrl -and (Test-InfragoQuantPage $publicUrl)) { Start-Process $publicUrl; return }
  if (Test-InfragoQuantPage $Page) { Start-Process $Page; return }
  Say "Infrago Quant の画面がまだ起動していません。先に 1 か 2 を実行してください。" "Yellow"
}

function Start-Claude {
  if (-not (Test-Path $Claude)) { Say "Claude Code が見つかりません: $Claude" "Red"; return }
  $sessions = Join-Path $env:USERPROFILE ".claude\projects\$(($Root -replace '[^A-Za-z0-9]', '-'))"
  Push-Location $Root
  try {
    if (Get-ChildItem $sessions -Filter *.jsonl -ErrorAction SilentlyContinue) { & $Claude --resume }
    else { Say "このフォルダーのセッションはまだありません。新しく始めます。"; & $Claude }
  } finally { Pop-Location }
}

if (-not (Test-Path (Join-Path $UI "package.json"))) { Say "プロジェクトが見つかりません: $UI" "Red"; exit 1 }
if (-not $Npm) { Say "npm（Node.js）が見つかりません。" "Red"; exit 1 }

switch ($Mode) {
  "dev"    { if (Start-Dev) { exit 0 } else { exit 1 } }
  "lan"    { if (Start-Lan) { exit 0 } else { exit 1 } }
  "server" { if (Start-ServerOnly) { exit 0 } else { exit 1 } }
  "client" { if (Start-ClientOnly) { exit 0 } else { exit 1 } }
  "resume" { Start-Claude; exit 0 }
}

while ($true) {
  $pub = Get-PublicHost
  Say ""
  Say "==============================================================" "Cyan"
  Say " Infrago Quant 運用分析・業務支援（Infrago Quant Server、計算は RiemannFinMath）" "Cyan"
  Say "==============================================================" "Cyan"
  Say " 1  この PC で起動する：サーバー（8790）とクライアント画面（8091）を開いて表示（開発用、127.0.0.1）"
  Say " 2  社内LANで起動する：画面と API を 8091 でまとめて公開し、http://$($pub.Host):8091/ を開く"
  Say " 3  ブラウザで画面を開く（起動済みのとき）"
  Say " 4  サーバー（R API、8790）だけを起動する"
  Say " 5  クライアント（Web 画面、8091）だけを起動する"
  Say " 6  Claude Code で作業の続きを開く"
  Say " 0  終了"
  $choice = Read-Host "番号を選んでください [1-6, 0]"
  switch ($choice) {
    "1" { [void](Start-Dev); Read-Host "Enter でメニューに戻る" | Out-Null }
    "2" { [void](Start-Lan); Read-Host "Enter でメニューに戻る" | Out-Null }
    "3" { Open-Page }
    "4" { [void](Start-ServerOnly); Read-Host "Enter でメニューに戻る" | Out-Null }
    "5" { [void](Start-ClientOnly); Read-Host "Enter でメニューに戻る" | Out-Null }
    "6" { Start-Claude }
    "0" { exit 0 }
    default { Say "1〜6 か 0 を入力してください。" "Yellow" }
  }
}
