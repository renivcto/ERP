# Fetch Recent Coupang Orders (Last 14 Days)
# Scans multiple statuses to find sample order data for mapper development

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================="
Write-Host "  Fetch Recent Coupang Orders"
Write-Host "========================================="
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$credPath = Join-Path $scriptDir "coupang-credentials.txt"

if (-not (Test-Path $credPath)) {
    Write-Host "[ERROR] coupang-credentials.txt not found."
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

$createdAtFrom = (Get-Date).AddDays(-14).ToString("yyyy-MM-dd")
$createdAtTo   = Get-Date -Format "yyyy-MM-dd"

Write-Host "[Query Range] $createdAtFrom ~ $createdAtTo (last 14 days)"
Write-Host "[Vendor ID] $VENDOR_ID"
Write-Host ""
Write-Host "Scanning statuses..."
Write-Host ""

# Try each status to find any order
$statuses = @("ACCEPT", "INSTRUCT", "DEPARTURE", "DELIVERING", "FINAL_DELIVERY")
$foundOrder = $null
$foundStatus = ""
$summary = @{}

foreach ($status in $statuses) {
    $method = "GET"
    $path   = "/v2/providers/openapi/apis/api/v4/vendors/$VENDOR_ID/ordersheets"
    $query  = "createdAtFrom=$createdAtFrom&createdAtTo=$createdAtTo&status=$status&maxPerPage=50"

    $datetime = (Get-Date).ToUniversalTime().ToString("yyMMddTHHmmssZ")
    $message  = "$datetime$method$path$query"

    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = [Text.Encoding]::UTF8.GetBytes($SECRET_KEY)
    $hashBytes = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))
    $signature = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })

    $auth = "CEA algorithm=HmacSHA256, access-key=$ACCESS_KEY, signed-date=$datetime, signature=$signature"

    $url = "https://api-gateway.coupang.com$path`?$query"
    $headers = @{
        "Authorization" = $auth
        "Content-Type"  = "application/json;charset=UTF-8"
    }

    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ErrorAction Stop
        $count = 0
        if ($response.data) { $count = ($response.data | Measure-Object).Count }
        $summary[$status] = $count
        Write-Host ("  {0,-18} : {1} orders" -f $status, $count)

        if ($count -gt 0 -and $null -eq $foundOrder) {
            $foundOrder = $response.data[0]
            $foundStatus = $status
        }
    } catch {
        $summary[$status] = "ERROR"
        Write-Host ("  {0,-18} : ERROR ({1})" -f $status, $_.Exception.Message)
    }
}

Write-Host ""

if ($null -ne $foundOrder) {
    Write-Host "========================================="
    Write-Host "[SAMPLE ORDER FOUND] status = $foundStatus" -ForegroundColor Green
    Write-Host "========================================="
    Write-Host ""

    # Print condensed summary
    Write-Host "Order ID          : $($foundOrder.orderId)"
    Write-Host "Ordered At        : $($foundOrder.orderedAt)"
    Write-Host "Paid At           : $($foundOrder.paidAt)"
    Write-Host "Status            : $($foundOrder.status)"
    Write-Host "Orderer Name      : $($foundOrder.orderer.name)"
    if ($foundOrder.orderItems -and $foundOrder.orderItems.Count -gt 0) {
        Write-Host "First Item Name   : $($foundOrder.orderItems[0].vendorItemName)"
        Write-Host "First Item Qty    : $($foundOrder.orderItems[0].shippingCount)"
        Write-Host "First Item Price  : $($foundOrder.orderItems[0].orderPrice)"
    }
    if ($foundOrder.receiver) {
        Write-Host "Receiver Name     : $($foundOrder.receiver.name)"
        Write-Host "Receiver Address  : $($foundOrder.receiver.addr1) $($foundOrder.receiver.addr2)"
    }
    Write-Host "Invoice Number    : $($foundOrder.invoiceNumber)"
    Write-Host ""

    # Save full JSON for mapper development
    $outputPath = Join-Path $scriptDir "coupang-sample-order.json"
    $foundOrder | ConvertTo-Json -Depth 10 | Out-File -FilePath $outputPath -Encoding UTF8
    Write-Host "Full order JSON saved to: coupang-sample-order.json"

} else {
    Write-Host "No orders found across all statuses in last 14 days." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Summary:"
    $summary.GetEnumerator() | ForEach-Object {
        Write-Host "  $($_.Key): $($_.Value)"
    }
}

Write-Host ""
Write-Host "========================================="
Read-Host "Press Enter to exit"
