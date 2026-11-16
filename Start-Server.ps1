<#
Start-Server.ps1 — AsterQuant Server（R API、127.0.0.1:8790）を現在のターミナル（またはダブルクリック時はこのウィンドウ）で起動する。
#>
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "AsterQuant Server (8790)"

$Root = $PSScriptRoot
$UI = Join-Path $Root "ui"
$Npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $Npm) { $Npm = "C:\Program Files\nodejs\npm.cmd" }

Set-Location $UI
Write-Host "AsterQuant Server（R API、127.0.0.1:8790）を起動します..." -ForegroundColor Cyan
& $Npm run api
