@echo off
title Sky Store - Tunnel Cloudflare
echo.
echo ======================================
echo   Demarrage du tunnel Cloudflare
echo ======================================
echo.
echo URL : essayer le lien dans la console une fois connecte
echo.
echo NOTE: L'URL change a chaque demarrage.
echo Pour une URL fixe, il faut creer un tunnel nomme.
echo.
echo --- Connexion ---
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000
