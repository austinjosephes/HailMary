@echo off
title Ammayodoppam Server - CLC Velappaya
color 1F
echo.
echo  =====================================================
echo   Ammayodoppam ^| CLC Velappaya - 100k Prayer Counter
echo  =====================================================
echo.

:: Check Node.js is available
node -v >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js is not installed or not in PATH.
    echo  Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: Install dependencies if node_modules is missing
if not exist "node_modules\" (
    echo  Installing dependencies...
    call npm install
)

:: Kill any previously running instance on port 8000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo  Stopping previous process on port 8000 (PID %%a)...
    taskkill /PID %%a /F >nul 2>&1
)

echo  Starting Ammayodoppam Local Server...
echo.
echo  User site  : http://localhost:8000/
echo  Admin panel: http://localhost:8000/admin.html
echo.
echo  Press Ctrl+C to stop the server.
echo  =====================================================
echo.

:: Change to project directory and start server
cd /d "%~dp0"
npm start

pause
