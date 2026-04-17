@echo off
cd /d "%~dp0"

echo.
echo =========================================
echo   Fetch Recent Coupang Orders
echo =========================================
echo.

if not exist "%~dp0fetch-recent-orders.ps1" (
    echo [ERROR] fetch-recent-orders.ps1 not found!
    pause
    exit /b 1
)

if not exist "%~dp0coupang-credentials.txt" (
    echo [ERROR] coupang-credentials.txt not found!
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fetch-recent-orders.ps1"

echo.
pause
