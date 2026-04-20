# Sky Store - Demarrage local stable
# Objectif: eviter la dependance trycloudflare pour les tests webhook.

$ErrorActionPreference = "Continue"

$SKYSTORE = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $SKYSTORE

Write-Host ""
Write-Host "======================================"
Write-Host "  Sky Store - Demarrage local stable"
Write-Host "======================================"
Write-Host ""

Write-Host "[1/2] Arret des anciens processus Node..."
taskkill /F /IM node.exe >$null 2>&1
Start-Sleep -Seconds 1

Write-Host "[2/2] Demarrage du serveur Node..."
$nodeJob = Start-Job -ScriptBlock {
    Set-Location $using:SKYSTORE
    node server.js
}
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "Serveur demarre."
Write-Host ""
Write-Host "Webhook Stripe (mode test local stable):"
Write-Host "1. Ouvrir un nouveau terminal"
Write-Host "2. Lancer:"
Write-Host "   stripe listen --forward-to http://localhost:3000/api/webhook/stripe"
Write-Host ""
Write-Host "Option recommandee (.env) pour les checks locaux:"
Write-Host "  STRIPE_LOCAL_WEBHOOK_MODE=true"
Write-Host ""
Write-Host "Pour arreter plus tard:"
Write-Host "  taskkill /F /IM node.exe"
Write-Host ""
Write-Host "Le script ne modifie plus .env automatiquement."
