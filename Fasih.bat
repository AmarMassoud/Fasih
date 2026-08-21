@echo off
rem Fasih one-click launcher for Windows.
rem First run: installs Node.js (if needed) and prepares the app.
rem Every run after that: starts the app and opens the browser.
title Fasih
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js is not installed. Trying automatic install...
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
        echo.
        echo Automatic install failed. A download page will open -
        echo install Node.js from there, then double-click this file again.
        start https://nodejs.org/en/download
        pause
        exit /b 1
    )
    echo.
    echo Node.js installed. Please close this window and
    echo double-click Fasih.bat again.
    pause
    exit /b 0
)

if not exist node_modules (
    echo First-time setup, this takes a minute or two...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo Setup failed. Check your internet connection and try again.
        pause
        exit /b 1
    )
)

if not exist .next\BUILD_ID (
    echo Preparing the app, one time only...
    call npm run build
    if errorlevel 1 (
        echo Preparation failed. Try again.
        pause
        exit /b 1
    )
)

echo Starting Fasih...
start "Fasih Server" /min cmd /c "npm start"

rem Wait until the server answers, then open the browser.
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){try{Invoke-WebRequest -UseBasicParsing http://localhost:3000 -TimeoutSec 2 | Out-Null; exit 0}catch{Start-Sleep 1}}; exit 1"
start "" http://localhost:3000

echo.
echo Fasih is running. Keep the small server window open while using it.
echo You can close THIS window now.
timeout /t 10 >nul
exit /b 0
