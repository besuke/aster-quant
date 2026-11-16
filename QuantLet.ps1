<#
QuantLet.ps1 — AsterQuant.ps1 への転送ラッパー（従来のショートカット・呼び出しとの互換用）。
#>
param([ValidateSet("menu", "dev", "lan", "server", "client", "resume")] [string] $Mode = "menu")
& (Join-Path $PSScriptRoot "AsterQuant.ps1") -Mode $Mode
