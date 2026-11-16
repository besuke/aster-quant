<#
Start-Client.ps1 — AsterQuant クライアント（Web 画面、http://127.0.0.1:8091/）を起動する。
#>
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "AsterQuant Client (8091)"

$Root = $PSScriptRoot
$UI = Join-Path $Root "ui"
$Npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $Npm) { $Npm = "C:\Program Files\nodejs\npm.cmd" }

Set-Location $UI
Write-Host "AsterQuant クライアント（http://127.0.0.1:8091/）を起動します..." -ForegroundColor Cyan
& $Npm run dev
