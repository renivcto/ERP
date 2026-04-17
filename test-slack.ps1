# Slack Webhook Test (ASCII-only source for Korean Windows PowerShell 5.1 compatibility)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================="
Write-Host "  Slack Webhook Connection Test"
Write-Host "========================================="
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$webhookPath = Join-Path $scriptDir "slack-webhook.txt"

if (-not (Test-Path $webhookPath)) {
    Write-Host "[ERROR] slack-webhook.txt not found."
    Read-Host "Press Enter to exit"
    exit 1
}

$webhookUrl = $null
Get-Content $webhookPath | ForEach-Object {
    if ($_ -match "^ORDERS_WEBHOOK=(.+)$") {
        $webhookUrl = $Matches[1].Trim()
    }
}

if (-not $webhookUrl) {
    Write-Host "[ERROR] ORDERS_WEBHOOK not found in slack-webhook.txt"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[Webhook URL loaded]"
Write-Host "  $($webhookUrl.Substring(0, 50))... (hidden)"
Write-Host ""

# Build payload as raw JSON string (avoids PS 5.1 Unicode parsing issues)
# Korean text is sent as UTF-8 bytes inside the JSON body
$jsonBody = '{"text":"[RENIV BOT] Slack connection OK! | 르니브 주문자동화 봇 연결 성공 - 월요일부터 주문/재고/송장 알림이 여기로 발송됩니다."}'

# Convert to UTF-8 bytes to preserve Korean characters
$bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonBody)

Write-Host "[Sending test message to #order...]"
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $webhookUrl -Method Post -Body $bytes -ContentType "application/json; charset=utf-8"

    if ($response -eq "ok") {
        Write-Host "[SUCCESS] Message sent to #order channel!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Open Slack and check the #order channel."
        Write-Host "You should see a message starting with [RENIV BOT]"
    } else {
        Write-Host "[UNEXPECTED RESPONSE] Slack returned: $response" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[FAILED]" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error: $($_.Exception.Message)"

    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "HTTP Status: $statusCode"
    }

    if ($_.ErrorDetails) {
        Write-Host ""
        Write-Host "ErrorDetails: $($_.ErrorDetails.Message)"
    }

    Write-Host ""
    Write-Host "[Checklist]"
    Write-Host "  1. Is the webhook URL correct in slack-webhook.txt?"
    Write-Host "  2. Does the #order channel still exist?"
    Write-Host "  3. Was the webhook revoked in Slack settings?"
}

Write-Host ""
Write-Host "========================================="
Read-Host "Press Enter to exit"
