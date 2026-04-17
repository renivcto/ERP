# Coupang Orders -> ERP 18-column CSV
# Fetches ACCEPT status orders from last N days, outputs ERP-compatible CSV
# Adds 쇼핑몰=쿠팡 column for channel classification in ERP

param(
    [int]$DaysBack = 14
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================="
Write-Host "  Coupang -> ERP CSV Converter"
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

$createdAtFrom = (Get-Date).AddDays(-$DaysBack).ToString("yyyy-MM-dd")
$createdAtTo   = Get-Date -Format "yyyy-MM-dd"

Write-Host "[Query] $createdAtFrom ~ $createdAtTo, status=ACCEPT"
Write-Host ""

# ---- API call ----
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

$url = "https://api-gateway.coupang.com$path`?$query"
$headers = @{
    "Authorization" = $auth
    "Content-Type"  = "application/json;charset=UTF-8"
}

try {
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ErrorAction Stop
} catch {
    Write-Host "[ERROR] API call failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host $_.ErrorDetails.Message
    }
    Read-Host "Press Enter to exit"
    exit 1
}

$orders = $response.data
if (-not $orders -or $orders.Count -eq 0) {
    Write-Host "No ACCEPT orders found in this period."
    Read-Host "Press Enter to exit"
    exit 0
}

Write-Host "[Found] $($orders.Count) ACCEPT orders. Converting to ERP CSV..."
Write-Host ""

# ---- CSV escape helper ----
function Escape-Csv {
    param($value)
    if ($null -eq $value) { return "" }
    $s = "$value"
    if ($s -match '[",\r\n]') {
        return '"' + ($s -replace '"', '""') + '"'
    }
    return $s
}

# ---- Build CSV rows ----
$csvRows = @()
$header = "쇼핑몰,주문번호,주문일,주문 고객명,주문자 연락처,이메일,주문 제품명,수량,결제금액,받는 사람 이름,받는 사람 전화번호,우편번호,배송지 주소,배송시 요청사항,결제일,발송 예정일,배송비,송장번호"
$csvRows += $header

$rowCount = 0
foreach ($order in $orders) {
    foreach ($item in $order.orderItems) {
        $orderNo      = $order.orderId
        $orderDate    = ($order.orderedAt -split 'T')[0]
        $paidDate     = ($order.paidAt -split 'T')[0]
        $ordererName  = $order.orderer.name
        $ordererPhone = if ($order.orderer.ordererNumber) { $order.orderer.ordererNumber } else { $order.orderer.safeNumber }
        $ordererEmail = $order.orderer.email

        $productName  = $item.sellerProductName
        if (-not $productName) { $productName = $item.vendorItemName }
        $qty          = $item.shippingCount
        $totalPrice   = [int]$item.orderPrice * [int]$item.shippingCount

        $rcvName      = $order.receiver.name
        $rcvPhone     = if ($order.receiver.receiverNumber) { $order.receiver.receiverNumber } else { $order.receiver.safeNumber }
        $zipcode      = $order.receiver.postCode
        $address      = ($order.receiver.addr1 + " " + $order.receiver.addr2).Trim()
        $msg          = $order.parcelPrintMessage

        $shipDate     = $item.estimatedShippingDate
        $shippingFee  = $order.shippingPrice
        $invoiceNo    = $order.invoiceNumber

        $row = @(
            (Escape-Csv "쿠팡"),
            (Escape-Csv $orderNo),
            (Escape-Csv $orderDate),
            (Escape-Csv $ordererName),
            (Escape-Csv $ordererPhone),
            (Escape-Csv $ordererEmail),
            (Escape-Csv $productName),
            (Escape-Csv $qty),
            (Escape-Csv $totalPrice),
            (Escape-Csv $rcvName),
            (Escape-Csv $rcvPhone),
            (Escape-Csv $zipcode),
            (Escape-Csv $address),
            (Escape-Csv $msg),
            (Escape-Csv $paidDate),
            (Escape-Csv $shipDate),
            (Escape-Csv $shippingFee),
            (Escape-Csv $invoiceNo)
        ) -join ","

        $csvRows += $row
        $rowCount++
    }
}

# ---- Save CSV with UTF-8 BOM (for Excel/Korean support) ----
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputPath = Join-Path $scriptDir "erp-import-$timestamp.csv"

$bom = [System.Text.Encoding]::UTF8.GetPreamble()
$content = ($csvRows -join "`r`n") + "`r`n"
$contentBytes = [System.Text.Encoding]::UTF8.GetBytes($content)
[System.IO.File]::WriteAllBytes($outputPath, $bom + $contentBytes)

Write-Host "[SUCCESS] ERP CSV file created!" -ForegroundColor Green
Write-Host ""
Write-Host "File: $(Split-Path -Leaf $outputPath)"
Write-Host "Total rows: $rowCount (header excluded)"
Write-Host ""
Write-Host "========================================="
Write-Host "  Mapping Preview (first order)"
Write-Host "========================================="
Write-Host ""
if ($orders[0] -and $orders[0].orderItems[0]) {
    $o = $orders[0]
    $it = $o.orderItems[0]
    Write-Host "쇼핑몰            : 쿠팡"
    Write-Host "주문번호          : $($o.orderId)"
    Write-Host "주문일            : $(($o.orderedAt -split 'T')[0])"
    Write-Host "주문 고객명       : $($o.orderer.name)"
    Write-Host "주문자 연락처     : $(if ($o.orderer.ordererNumber) { $o.orderer.ordererNumber } else { $o.orderer.safeNumber })"
    Write-Host "이메일            : $($o.orderer.email)"
    Write-Host "주문 제품명       : $($it.sellerProductName)"
    Write-Host "수량              : $($it.shippingCount)"
    Write-Host "결제금액          : $([int]$it.orderPrice * [int]$it.shippingCount)"
    Write-Host "받는 사람 이름    : $($o.receiver.name)"
    Write-Host "받는 사람 전화    : $(if ($o.receiver.receiverNumber) { $o.receiver.receiverNumber } else { $o.receiver.safeNumber })"
    Write-Host "우편번호          : $($o.receiver.postCode)"
    Write-Host "배송지 주소       : $($o.receiver.addr1) $($o.receiver.addr2)"
    Write-Host "배송시 요청사항   : $($o.parcelPrintMessage)"
    Write-Host "결제일            : $(($o.paidAt -split 'T')[0])"
    Write-Host "발송 예정일       : $($it.estimatedShippingDate)"
    Write-Host "배송비            : $($o.shippingPrice)"
    Write-Host "송장번호          : $($o.invoiceNumber)   (ACCEPT status = empty, will be filled later)"
}
Write-Host ""
Write-Host "========================================="
Write-Host ""
Write-Host "Next step: Open the CSV file and check it looks right."
Write-Host "Then upload to your ERP's 주문 관리 page."
Write-Host ""
Read-Host "Press Enter to exit"
