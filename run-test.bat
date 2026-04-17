@echo off
cd /d "%~dp0"

echo.
echo =========================================
echo   Coupang API Test Launcher
echo =========================================
echo.
echo Current folder: %CD%
echo.

if not exist "%~dp0test-coupang-api.ps1" (
    echo [ERROR] test-coupang-api.ps1 not found!
    echo Expected at: %~dp0test-coupang-api.ps1
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0coupang-credentials.txt" (
    echo [ERROR] coupang-credentials.txt not found!
    echo.
    pause
    exit /b 1
)

echo Files OK. Starting PowerShell script...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0test-coupang-api.ps1"

echo.
echo =========================================
echo   Script finished
echo =========================================
pause
