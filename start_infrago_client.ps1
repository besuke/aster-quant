<#
start_infrago_client.ps1 — Infrago Quant クライアント（Web 画面、http://127.0.0.1:8091/）だけを起動し、別の PC で動く R API につなぐ。
  .\start_infrago_client.ps1 -ApiUrl http://<サーバーのPC>:8790
-ApiUrl を省くときは、deploy.local.env の INFRAGO_QUANT_API_URL を使う（Git に入れない）。どちらもなければ、この PC の 127.0.0.1:8790 につなぐ。
この PC に必要なもの：Node.js と ui/（npm install 済み）。R は要らない。
止めるときは「Infrago Quant Client (8091)」のウィンドウを閉じる。
パスはすべてこのファイルの場所からの相対。初めて使う PC では、先に HANDOVER.md の「新しい PC で動かす」の手順を済ませる。
#>
param([string] $ApiUrl = "")

$ErrorActionPreference = "Stop"
$launcher = Join-Path $PSScriptRoot "InfragoQuant.ps1"
if (-not (Test-Path $launcher)) { Write-Host "InfragoQuant.ps1 が見つかりません: $launcher" -ForegroundColor Red; exit 1 }

if (-not $ApiUrl) {
  $file = Join-Path $PSScriptRoot "deploy.local.env"
  if (Test-Path $file) {
    foreach ($line in Get-Content $file -Encoding UTF8) {
      if ($line -match '^\s*INFRAGO_QUANT_API_URL\s*=\s*(\S*)\s*$' -and $Matches[1]) { $ApiUrl = $Matches[1]; break }
    }
  }
}
if ($ApiUrl) { & $launcher -Mode client -ApiUrl $ApiUrl } else { & $launcher -Mode client }
exit $LASTEXITCODE
