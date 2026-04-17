@echo off
cd /d "%~dp0"

echo.
echo =========================================
echo   Coupang -^> ERP CSV Converter
echo =========================================
echo.

if not exist "%~dp0map-to-erp-csv.ps1" (
    echo [ERROR] map-to-erp-csv.ps1 not found!
    pause
    exit /b 1
)

if not exist "%~dp0coupang-credentials.txt" (
    echo [ERROR] coupang-credentials.txt not found!
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0map-to-erp-csv.ps1"

echo.
pause
