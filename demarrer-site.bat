@echo off
title Demarrage Sky Store
cd /d "%~dp0"

echo ======================================
echo   Installation des dependances...
echo ======================================
call npm install
if errorlevel 1 (
    echo.
    echo Erreur pendant npm install.
    pause
    exit /b 1
)

echo.
echo ======================================
echo   Demarrage du serveur...
echo ======================================
call npm start
if errorlevel 1 (
    echo.
    echo Erreur pendant npm start.
    pause
    exit /b 1
)

pause