@echo off
title Ammayodoppam Server - CLC Velappaya
color 1F
echo.
echo  =====================================================
echo   Ammayodoppam ^| CLC Velappaya - Prayer Counter
echo  =====================================================
echo.

:: Check Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python is not installed or not in PATH.
    echo  Please install Python from https://python.org
    pause
    exit /b 1
)

:: Kill any previously running instance on port 8000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo  Stopping previous server on port 8000 (PID %%a)...
    taskkill /PID %%a /F >nul 2>&1
)

echo  Starting server...
echo.
echo  User site  : http://localhost:8000/
echo  Admin panel: http://localhost:8000/admin.html
echo.
echo  Press Ctrl+C to stop the server.
echo  =====================================================
echo.

:: Change to project directory and start server
cd /d "%~dp0"
python server.py 8000

pause
