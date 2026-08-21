@echo off
rem Fasih one-click launcher. Arabic console output needs the UTF-8 codepage.
chcp 65001 >nul
title فصيح
cd /d "%~dp0"

where node >nul 2>nul
if not errorlevel 1 goto have_node

echo لم يتم العثور على Node.js. جارٍ التثبيت التلقائي، انتظري قليلاً...
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements

rem winget doesn't refresh this window's PATH - add the default install
rem location manually so we can continue without reopening the file.
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
where node >nul 2>nul
if not errorlevel 1 goto have_node

echo جارٍ تنزيل Node.js مباشرة...
powershell -NoProfile -Command "try{ $i=Invoke-RestMethod 'https://nodejs.org/dist/index.json'; $v=($i | Where-Object { $_.lts } | Select-Object -First 1).version; Invoke-WebRequest ('https://nodejs.org/dist/'+$v+'/node-'+$v+'-x64.msi') -OutFile \"$env:TEMP\node-setup.msi\" }catch{ exit 1 }"
if errorlevel 1 goto node_fail

echo جارٍ تثبيت Node.js. إذا ظهرت نافذة تطلب الإذن اضغطي «نعم»...
msiexec /i "%TEMP%\node-setup.msi" /passive
if errorlevel 1 goto node_fail

set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto node_fail
goto have_node

:node_fail
echo تعذر التثبيت التلقائي. ستُفتح صفحة التنزيل. ثبّتي Node.js منها ثم افتحي هذا الملف من جديد.
start https://nodejs.org/en/download
pause
exit /b 1

:have_node
if not exist node_modules (
    echo الإعداد لأول مرة، قد يستغرق دقيقة أو دقيقتين...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo فشل الإعداد. تأكدي من اتصال الإنترنت ثم افتحي الملف مرة أخرى.
        pause
        exit /b 1
    )
)

if not exist .next\BUILD_ID (
    echo جارٍ تجهيز التطبيق، مرة واحدة فقط...
    call npm run build
    if errorlevel 1 (
        echo فشل التجهيز. حاولي مرة أخرى.
        pause
        exit /b 1
    )
)

echo جارٍ تشغيل فصيح...
start "Fasih Server" /min cmd /c "npm start"

rem Wait until the server answers, then open the default browser.
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){try{Invoke-WebRequest -UseBasicParsing http://localhost:3000 -TimeoutSec 2 | Out-Null; exit 0}catch{Start-Sleep 1}}; exit 1"
start "" http://localhost:3000

echo.
echo فصيح يعمل الآن! اتركي نافذة الخادم الصغيرة مفتوحة أثناء الاستخدام.
echo يمكنك إغلاق هذه النافذة.
timeout /t 15 >nul
exit /b 0
