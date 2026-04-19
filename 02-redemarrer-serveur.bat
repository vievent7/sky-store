@echo off
title SkyStore - Redemarrer Serveur
cd /d "%~dp0"
echo.
echo ======================================
echo   REDEMARRAGE DU SERVEUR
echo ======================================
echo.
echo Arret du serveur...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo.
echo Redemarrage...
node server.js
