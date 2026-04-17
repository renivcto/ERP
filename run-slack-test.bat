@echo off
cd /d "%~dp0"

echo.
echo =========================================
echo   Slack Webhook Test
echo =========================================
echo.

if not exist "%~dp0test-slack.ps1" (
    echo [ERROR] test-slack.ps1 not found!
    pause
    exit /b 1
)

if not exist "%~dp0slack-webhook.txt" (
    echo [ERROR] slack-webhook.txt not found!
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0test-slack.ps1"

echo.
pause
