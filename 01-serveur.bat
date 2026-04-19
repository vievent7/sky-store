@echo off
title SkyStore - Serveur Node
cd /d "%~dp0"
echo.
echo ======================================
echo   SKY STORE - SERVEUR
echo ======================================
echo.
echo Tentative de kill du port 3000...
netstat -ano | findstr :3000 | findstr LISTENING > tempkill.txt
for /f "tokens=5" %%a in (tempkill.txt) do taskkill /F /PID %%a >nul 2>&1
del tempkill.txt >nul 2>&1
echo.
echo Demarrage du serveur...
echo.
node server.js
