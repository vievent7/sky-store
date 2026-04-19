@echo off
title Sky Store - Demarrage complet
cd /d "%~dp0"

echo.
echo ======================================
echo   Sky Store - Demarrage complet
echo ======================================
echo.

REM KILL anciens processus
echo Killage des anciens processus...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1

echo.
echo ======================================
echo   1. Serveur Node (sky-store)
echo ======================================
start "SkyStore-Serveur" cmd /k "cd /d "%~dp0" ^&^& node server.js"

timeout /t 3 /nobreak >nul

echo.
echo ======================================
echo   2. Tunnel Cloudflare
echo ======================================
start "SkyStore-Tunnel" cmd /k ""C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000"

timeout /t 5 /nobreak >nul

echo.
echo ======================================
echo   3. Stripe CLI (webhook listener)
echo ======================================
echo Copie la nouvelle URL trycloudflare.com et mets-la dans .env (BASE_URL=...)
echo Puis mets a jour le webhook dans Stripe Dashboard.
echo.
echo Appuie sur une touche pour ouvrir le dashboard Stripe...
pause >nul

start "" "https://dashboard.stripe.com/test/webhooks"

echo.
echo ======================================
echo   Pret!
echo ======================================
echo.
echo Prochaine etape apres avoir recupere la nouvelle URL:
echo   1. Mettre a jour BASE_URL dans .env
echo   2. Ouvrir %~dp0.env
echo   3. Redemarrer le serveur (Ctrl+C dans SkyStore-Serveur, puis relancer ce script)
echo.
pause
