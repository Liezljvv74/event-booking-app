@echo off
rem Double-click this to start the app and open it in your browser.
rem
rem The app needs a web server even though it is only ever talking to your own
rem browser: its pages ask for files by absolute path, which opening the HTML
rem straight off the disk cannot satisfy. So this starts the local server the
rem README describes and waits for it to answer before opening the page.
rem
rem Leave this window open while you use the app. Closing it stops the server.

setlocal
cd /d "%~dp0"
title Event Booking and Table Manager

set "URL=http://localhost:3002"

rem Already running from an earlier double-click? Just bring it to the front.
powershell -NoProfile -Command "try { $null = Invoke-WebRequest '%URL%' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo The app is already running. Opening it in your browser...
  start "" "%URL%"
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed, or Windows cannot find it.
  echo The app is built with Next.js, so it needs Node to run.
  echo Install it from https://nodejs.org and then try this again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo Installing what the app needs. This happens once and takes a few minutes.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo That install did not finish. The message above says why.
    echo.
    pause
    exit /b 1
  )
)

rem Open the browser from a second window, once the server actually answers,
rem rather than after a guessed delay: a cold start compiles the first page
rem and can take a while.
start "" /min powershell -NoProfile -Command "for ($i = 0; $i -lt 120; $i++) { try { $null = Invoke-WebRequest '%URL%' -UseBasicParsing -TimeoutSec 2; Start-Process '%URL%'; exit } catch { Start-Sleep -Milliseconds 500 } }"

echo.
echo Starting the app. Your browser will open at %URL% in a moment.
echo Keep this window open while you use it, and close it to stop.
echo.

call npm run dev

rem If the server stops on its own, say so rather than vanishing.
echo.
echo The app has stopped.
echo.
pause
