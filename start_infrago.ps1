<#
start_infrago.ps1 — Infrago Quant の起動の入口（これ1つで足りる）。サーバー（R API、127.0.0.1:8790）とクライアント（Web 画面、
http://127.0.0.1:8091/）を立ち上げて、ブラウザーで開く。

  .\start_infrago.ps1                 この PC で起動（開発用）。サーバーとクライアントを別のウィンドウで起動して、ブラウザーで開く
  .\start_infrago.ps1 -Mode lan       社内LANで起動（画面をビルドし、画面と API を 8091 でまとめて公開する）
  .\start_infrago.ps1 -Mode server    サーバー（R API）だけを起動する
  .\start_infrago.ps1 -Mode client    クライアント（Web 画面）だけを起動してブラウザーで開く
  .\start_infrago.ps1 -Mode check     R の確認だけ（使う R の版と、RiemannFinMath などの必須パッケージを読み込めるか）
  .\start_infrago.ps1 -Mode menu      番号で選ぶメニュー
  .\start_infrago.ps1 -Mode resume    Claude Code をこのフォルダーで開く（セッションがあれば続きから）

起動の処理は InfragoQuant.ps1 にある（このファイルは入口）。起動前に、次の確認をする。
  - 使う R と必須パッケージを読み込めるか（読み込めなければ、選ばれた R と不足を表示して止まる）
  - ポート 8790・8091 が空いているか（使われていれば、使っているプロセスを示して止まる。別のポートには切り替えない）
  - サーバーと画面が応答するまで待つ
止めるときは、開いた「Infrago Quant Server (8790)」「Infrago Quant Client (8091)」のウィンドウを閉じる。
パスはすべてこのファイルの場所（$PSScriptRoot）からの相対なので、フォルダー名が違っても、別の PC でも、そのまま動く。
初めて使う PC では、先に HANDOVER.md の「新しい PC で動かす」の手順（npm install と R のパッケージ）を済ませる。
#>
param([ValidateSet("dev", "lan", "server", "client", "check", "menu", "resume")] [string] $Mode = "dev")

$ErrorActionPreference = "Stop"
$launcher = Join-Path $PSScriptRoot "InfragoQuant.ps1"
if (-not (Test-Path $launcher)) {
  Write-Host "InfragoQuant.ps1 が見つかりません: $launcher" -ForegroundColor Red
  exit 1
}

if ($Mode -eq "check") {
  $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
  if (-not $npm) { Write-Host "npm（Node.js）が見つかりません。Node.js 23.6 以上を入れてください。" -ForegroundColor Red; exit 1 }
  Push-Location (Join-Path $PSScriptRoot "ui")
  try {
    if (-not (Test-Path "node_modules")) { Write-Host "ui/node_modules がありません。先に ui で npm install を実行してください。" -ForegroundColor Yellow }
    & $npm run --silent check:r
    exit $LASTEXITCODE
  } finally { Pop-Location }
}

& $launcher -Mode $Mode
exit $LASTEXITCODE
