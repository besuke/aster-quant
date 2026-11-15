<#
QuantLet.ps1 — QuantLet Server（R API、計算は RiemannFinMath）と画面を起動し、ブラウザーで開く。

  .\QuantLet.ps1              メニュー（番号で選ぶ）
  .\QuantLet.ps1 -Mode dev    この PC で起動（開発用）。R API 127.0.0.1:8790（npm run api）と画面 http://127.0.0.1:8091/（npm run dev）
  .\QuantLet.ps1 -Mode lan    社内LANで起動（配備）。画面をビルドし、画面と API を 8091 でまとめて公開する（npm run lan）
  .\QuantLet.ps1 -Mode resume Claude Code を QuantLet のフォルダーで開く（このフォルダーのセッションがあれば claude --resume）

社内LANで配るときの URL は http://<ホスト>:8091/。<ホスト> は deploy.local.env の QUANTLET_PUBLIC_HOST（DNS で解決できる
名前か LAN の IP アドレス）、空ならこの PC の LAN の IPv4。127.0.0.1 は利用者に案内しない（この PC の中でしか届かない）。
使用中のポートは、QuantLet が答えているときだけそのまま使い、別のプロセスなら番号を示して止まる。
ダブルクリックで起動するには、デスクトップのショートカット（powershell.exe -ExecutionPolicy Bypass -File ...）を使う。
#>
param([ValidateSet("menu", "dev", "lan", "resume")] [string] $Mode = "menu")

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "QuantLet"

$Root = $PSScriptRoot
$UI = Join-Path $Root "ui"
$Page = "http://127.0.0.1:8091/"
$Api = "http://127.0.0.1:8790/api/health"
$PageApi = "http://127.0.0.1:8091/api/health"
$Npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
$Claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $Claude) { $Claude = Join-Path $env:USERPROFILE ".local\bin\claude.exe" }

function Say([string] $text, [string] $color = "Gray") { Write-Host $text -ForegroundColor $color }

# 利用者に案内するホスト：deploy.local.env の QUANTLET_PUBLIC_HOST、なければこの PC の LAN の IPv4
function Get-PublicHost {
  $file = Join-Path $Root "deploy.local.env"
  if (Test-Path $file) {
    foreach ($line in Get-Content $file -Encoding UTF8) {
      if ($line -match '^\s*QUANTLET_PUBLIC_HOST\s*=\s*(\S*)\s*$' -and $Matches[1]) {
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
# QuantLet Server は /api/health に {"status":"ok","name":"QuantLet Server",...} と答える
function Test-QuantLetApi([string] $url) { $t = Get-Text $url; [bool]($t -and $t -match '"name":"QuantLet Server"') }
function Test-QuantLetPage([string] $url) { $t = Get-Text $url; [bool]($t -and $t -match "<title>QuantLet</title>") }

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
    Say "ポート $port は QuantLet 以外のプロセス（$proc、PID $($owner.OwningProcess)）が使っています。$name を起動できません。別のポートには切り替えません。" "Red"
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

# 新しいウィンドウで npm のスクリプトを動かす（ウィンドウを閉じると止まる）
function Start-NpmWindow([string] $title, [string] $script) {
  Start-Process powershell.exe -WorkingDirectory $UI -ArgumentList @(
    "-NoExit", "-NoProfile", "-Command", "`$Host.UI.RawUI.WindowTitle = '$title'; & '$Npm' run $script")
}

function Start-Dev {
  Say ""
  if (Test-QuantLetApi $Api) {
    Say "[1/3] QuantLet Server の R API はすでに起動しています（127.0.0.1:8790）。そのまま使います。"
  } else {
    if (-not (Assert-PortFree 8790 "127.0.0.1" "R API")) { return $false }
    Say "[1/3] R API を別のウィンドウで起動します（127.0.0.1:8790、npm run api）..."
    Start-NpmWindow "QuantLet R API (8790)" "api"
    if (-not (Wait-Url $Api 120 "R API")) { return $false }
  }
  if (Test-QuantLetPage $Page) {
    Say "[2/3] QuantLet の画面はすでに起動しています（$Page）。そのまま使います。"
  } else {
    if (-not (Assert-PortFree 8091 "127.0.0.1" "画面")) { return $false }
    Say "[2/3] 画面を別のウィンドウで起動します（$Page、npm run dev）..."
    Start-NpmWindow "QuantLet page (8091)" "dev"
    if (-not (Wait-Url $Page 60 "画面")) { return $false }
  }
  if (-not (Wait-Url $PageApi 30 "画面から R API への接続")) { return $false }
  Say "[3/3] ブラウザで $Page を開きます（この PC の中だけで開けるアドレス）。"
  Start-Process $Page
  Say ""
  Say "起動しました（開発用）。社内のほかの端末に配るときは 2 を使ってください。" "Green"
  Say "止めるときは「QuantLet R API (8790)」と「QuantLet page (8091)」のウィンドウを閉じてください。"
  return $true
}

function Start-Lan {
  Say ""
  $pub = Get-PublicHost
  if (-not $pub.Host) { Say "社内に案内するホスト名・IP アドレスが決まりません。$Root\deploy.local.env の QUANTLET_PUBLIC_HOST に書いてください。" "Red"; return $false }
  $publicUrl = "http://$($pub.Host):8091/"
  if (Test-QuantLetPage $Page) { Say "QuantLet の画面がすでに 8091 で起動しています。社内LANで公開するときは、先にそのウィンドウを閉じてください。" "Red"; return $false }
  if (-not (Assert-PortFree 8091 "0.0.0.0" "社内LAN用のサーバー")) { return $false }
  Say "[1/3] 画面をビルドし、画面と API を 8091 でまとめて公開します（別のウィンドウ、npm run lan）..."
  Say "      案内するアドレス：$publicUrl（$($pub.Source)）"
  $env:QUANTLET_PUBLIC_HOST = $pub.Host
  $env:QUANTLET_PUBLIC_HOST_SOURCE = $pub.Source
  Start-NpmWindow "QuantLet LAN (8091)" "lan"
  if (-not (Wait-Url $PageApi 300 "社内LAN用のサーバー")) { return $false }
  Say "[2/3] 案内するアドレスで応答を確かめます（$($publicUrl)api/health）..."
  if (-not (Wait-Url "$($publicUrl)api/health" 20 $publicUrl)) { return $false }
  Say "[3/3] ブラウザで $publicUrl を開きます。"
  Start-Process $publicUrl
  Say ""
  Say "利用者には次のアドレスを案内してください：" "Green"
  Say "  $publicUrl" "Green"
  Say "社内のほかの端末から開けないときは、Windows ファイアウォールで 8091 の受信を許可してください（この PC の設定）。"
  Say "止めるときは「QuantLet LAN (8091)」のウィンドウを閉じてください。"
  return $true
}

function Open-Page {
  $pub = Get-PublicHost
  $publicUrl = if ($pub.Host) { "http://$($pub.Host):8091/" } else { $null }
  if ($publicUrl -and (Test-QuantLetPage $publicUrl)) { Start-Process $publicUrl; return }
  if (Test-QuantLetPage $Page) { Start-Process $Page; return }
  Say "QuantLet の画面がまだ起動していません。先に 1 か 2 を実行してください。" "Yellow"
}

# Claude Code を QuantLet のフォルダーで開く。このフォルダーのセッションがあれば一覧から選んで続ける
function Start-Claude {
  if (-not (Test-Path $Claude)) { Say "Claude Code が見つかりません: $Claude" "Red"; return }
  $sessions = Join-Path $env:USERPROFILE ".claude\projects\$(($Root -replace '[^A-Za-z0-9]', '-'))"
  Push-Location $Root
  try {
    if (Get-ChildItem $sessions -Filter *.jsonl -ErrorAction SilentlyContinue) { & $Claude --resume }
    else { Say "このフォルダーの QuantLet のセッションはまだありません。新しく始めます。"; & $Claude }
  } finally { Pop-Location }
}

if (-not (Test-Path (Join-Path $UI "package.json"))) { Say "プロジェクトが見つかりません: $UI" "Red"; exit 1 }
if (-not $Npm) { Say "npm（Node.js）が見つかりません。" "Red"; exit 1 }

switch ($Mode) {
  "dev" { if (Start-Dev) { exit 0 } else { exit 1 } }
  "lan" { if (Start-Lan) { exit 0 } else { exit 1 } }
  "resume" { Start-Claude; exit 0 }
}

while ($true) {
  $pub = Get-PublicHost
  Say ""
  Say "==============================================================" "Cyan"
  Say " QuantLet 運用分析・業務支援（QuantLet Server、計算は RiemannFinMath）" "Cyan"
  Say "==============================================================" "Cyan"
  Say " 1  この PC で起動する：R API（8790）と画面（8091）を開いて表示（開発用、127.0.0.1）"
  Say " 2  社内LANで起動する：画面と API を 8091 でまとめて公開し、http://$($pub.Host):8091/ を開く"
  Say " 3  ブラウザで画面を開く（起動済みのとき）"
  Say " 4  Claude Code で QuantLet の作業の続きを開く"
  Say " 0  終了"
  $choice = Read-Host "番号を選んでください [1-4, 0]"
  switch ($choice) {
    "1" { [void](Start-Dev); Read-Host "Enter でメニューに戻る" | Out-Null }
    "2" { [void](Start-Lan); Read-Host "Enter でメニューに戻る" | Out-Null }
    "3" { Open-Page }
    "4" { Start-Claude }
    "0" { exit 0 }
    default { Say "1〜4 か 0 を入力してください。" "Yellow" }
  }
}
