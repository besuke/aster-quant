<#
start_infrago_server.ps1 — Infrago Quant Server（R API）だけを起動する。別の PC のクライアントから使えるよう 0.0.0.0:8790 で待ち受ける。
この PC に必要なもの：R・rmql・server/。クライアントの PC には、表示されるアドレス（http://<この PC>:8790）を渡す。
止めるときは「Infrago Quant Server (8790)」のウィンドウを閉じる。
パスはすべてこのファイルの場所からの相対。初めて使う PC では、先に docs/HANDOVER.md の「新しい PC で動かす」の手順を済ませる。
#>
$ErrorActionPreference = "Stop"
$launcher = Join-Path $PSScriptRoot "InfragoQuant.ps1"
if (-not (Test-Path $launcher)) { Write-Host "InfragoQuant.ps1 が見つかりません: $launcher" -ForegroundColor Red; exit 1 }
& $launcher -Mode server -Remote
exit $LASTEXITCODE
