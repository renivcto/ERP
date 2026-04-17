# Coupang Wing Open API Connection Test

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================="
Write-Host "  Coupang Wing Open API Test"
Write-Host "========================================="
Write-Host ""

# ---- Load credentials ----
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$credPath = Join-Path $scriptDir "coupang-credentials.txt"

if (-not (Test-Path $credPath)) {
    Write-Host "[ERROR] coupang-credentials.txt not found at: $credPath"
    Read-Host "`nPress Enter to exit"
    exit 1
}

$creds = @{}
Get-Content $credPath | ForEach-Object {
    if ($_ -match "^([A-Z_]+)=(.+)$") {
        $creds[$Matches[1]] = $Matches[2].Trim()
    }
}
$ACCESS_KEY = $creds["ACCESS_KEY"]
$SECRET_KEY = $creds["SECRET_KEY"]
$VENDOR_ID  = $creds["VENDOR_ID"]

Write-Host "[Credentials loaded]"
Write-Host "  Vendor ID  : $VENDOR_ID"
Write-Host "  Access Key : $($ACCESS_KEY.Substring(0,13))... (hidden)"
Write-Host ""

# ---- Query range: today (yyyy-MM-dd format) ----
$today = Get-Date -Format "yyyy-MM-dd"
$createdAtFrom = $today
$createdAtTo   = $today

Write-Host "[Query Range]"
Write-Host "  $createdAtFrom ~ $createdAtTo"
Write-Host "  Status: ACCEPT (paid, not yet shipped)"
Write-Host ""

# ---- Build HMAC-SHA256 signature ----
$method = "GET"
$path   = "/v2/providers/openapi/apis/api/v4/vendors/$VENDOR_ID/ordersheets"
$query  = "createdAtFrom=$createdAtFrom&createdAtTo=$createdAtTo&status=ACCEPT&maxPerPage=50"

$datetime = (Get-Date).ToUniversalTime().ToString("yyMMddTHHmmssZ")
$message  = "$datetime$method$path$query"

$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($SECRET_KEY)
$hashBytes = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))
$signature = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })

$auth = "CEA algorithm=HmacSHA256, access-key=$ACCESS_KEY, signed-date=$datetime, signature=$signature"

# ---- Call API ----
$url = "https://api-gateway.coupang.com$path`?$query"
$headers = @{
    "Authorization"      = $auth
    "Content-Type"       = "application/json;charset=UTF-8"
    "X-EXTENDED-Timeout" = "90000"
}

Write-Host "[Calling API...]"
Write-Host "  $url"
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ErrorAction Stop

    Write-Host "[SUCCESS] API keys are working!" -ForegroundColor Green
    Write-Host ""
    Write-Host "[Response]"
    Write-Host "  code    : $($response.code)"
    Write-Host "  message : $($response.message)"

    $count = 0
    if ($response.data) {
        $count = ($response.data | Measure-Object).Count
    }
    Write-Host "  orders  : $count"

    if ($count -gt 0) {
        Write-Host ""
        Write-Host "[First order sample]"
        $response.data[0] | ConvertTo-Json -Depth 3
    } else {
        Write-Host ""
        Write-Host "  (No orders paid today yet. Keys are valid.)"
    }

    $outputPath = Join-Path $scriptDir "coupang-test-response.json"
    $response | ConvertTo-Json -Depth 10 | Out-File -FilePath $outputPath -Encoding UTF8
    Write-Host ""
    Write-Host "Full response saved to: coupang-test-response.json"

} catch {
    Write-Host "[FAILED]" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error: $($_.Exception.Message)"

    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "HTTP Status: $statusCode"

        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errorBody = $reader.ReadToEnd()
            Write-Host ""
            Write-Host "Response body:"
            Write-Host $errorBody
        } catch {}
    }

    if ($_.ErrorDetails) {
        Write-Host ""
        Write-Host "ErrorDetails: $($_.ErrorDetails.Message)"
    }

    Write-Host ""
    Write-Host "[Checklist]"
    Write-Host "  1. Is coupang-credentials.txt correct?"
    Write-Host "  2. Is your current PC IP in Wing whitelist?"
    Write-Host "  3. Did 5-10 min pass since API key was issued?"
}

Write-Host ""
Write-Host "========================================="
Read-Host "Press Enter to exit"
