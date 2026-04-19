# =============================================================================
# Reniv ERP — Cloud Functions 배포 헬퍼 (PowerShell)
# =============================================================================
# 사용법: PowerShell에서 ERP 폴더로 이동 후
#   .\deploy-functions.ps1
#
# 사전 준비:
#   1) Firebase 프로젝트가 Blaze (종량제) 요금제로 업그레이드되어 있어야 함
#   2) Cloud Storage 버킷 생성 (이 스크립트가 안내함)
# =============================================================================

$ErrorActionPreference = 'Stop'
$ProjectId = 'reniv-erp-135a3'
$BucketName = "$ProjectId-backups"
$Region = 'asia-northeast3'

function Write-Step {
    param([string]$msg)
    Write-Host ""
    Write-Host "==============================================================" -ForegroundColor Cyan
    Write-Host " $msg" -ForegroundColor Cyan
    Write-Host "==============================================================" -ForegroundColor Cyan
}

function Write-Ok    { param($m) Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Warn  { param($m) Write-Host "  [경고] $m" -ForegroundColor Yellow }
function Write-Err   { param($m) Write-Host "  [오류] $m" -ForegroundColor Red }

# ─────────────────────────────────────────────────────────────
# 1단계 — Node.js 확인
# ─────────────────────────────────────────────────────────────
Write-Step "1/5 Node.js 설치 확인"
try {
    $nodeVer = (node --version) 2>$null
    Write-Ok "Node.js $nodeVer 감지됨"
    $major = [int]($nodeVer -replace '^v(\d+)\..+','$1')
    if ($major -lt 18) {
        Write-Warn "Node.js 18 이상 권장 (현재 $nodeVer). https://nodejs.org/ 에서 LTS 다운로드"
    }
} catch {
    Write-Err "Node.js가 설치되어 있지 않습니다."
    Write-Host "  https://nodejs.org/ 에서 LTS 버전 설치 후 다시 실행해 주세요." -ForegroundColor Yellow
    exit 1
}

# ─────────────────────────────────────────────────────────────
# 2단계 — Firebase CLI 확인 / 설치
# ─────────────────────────────────────────────────────────────
Write-Step "2/5 Firebase CLI 확인"
$fbCmd = Get-Command firebase -ErrorAction SilentlyContinue
if (-not $fbCmd) {
    Write-Warn "Firebase CLI가 없어서 설치합니다 (npm install -g firebase-tools)..."
    npm install -g firebase-tools
    if ($LASTEXITCODE -ne 0) {
        Write-Err "firebase-tools 설치 실패. PowerShell을 관리자 권한으로 실행하거나 npm 권한을 확인하세요."
        exit 1
    }
}
$fbVer = (firebase --version) 2>$null
Write-Ok "Firebase CLI $fbVer 사용 가능"

# ─────────────────────────────────────────────────────────────
# 3단계 — Firebase 로그인 확인
# ─────────────────────────────────────────────────────────────
Write-Step "3/5 Firebase 로그인 상태 확인"
$loginCheck = (firebase login:list) 2>&1
if ($loginCheck -match 'No accounts') {
    Write-Warn "Firebase에 로그인이 필요합니다. 브라우저가 열립니다..."
    firebase login
    if ($LASTEXITCODE -ne 0) { Write-Err "로그인 실패"; exit 1 }
} else {
    Write-Ok "이미 로그인되어 있습니다"
    Write-Host "  $loginCheck" -ForegroundColor Gray
}

# ─────────────────────────────────────────────────────────────
# 4단계 — npm install (functions 의존성)
# ─────────────────────────────────────────────────────────────
Write-Step "4/5 functions/ 의존성 설치"
Push-Location functions
try {
    if (-not (Test-Path node_modules)) {
        npm install
        if ($LASTEXITCODE -ne 0) { Write-Err "npm install 실패"; exit 1 }
    } else {
        Write-Ok "node_modules가 이미 존재 (생략)"
    }
} finally {
    Pop-Location
}

# ─────────────────────────────────────────────────────────────
# 5단계 — Cloud Storage 버킷 안내
# ─────────────────────────────────────────────────────────────
Write-Step "5/5 백업 버킷 확인"
Write-Host "  배포 전에 다음 버킷이 만들어져 있어야 합니다:" -ForegroundColor White
Write-Host "  → gs://$BucketName  (리전: $Region)" -ForegroundColor White
Write-Host ""
Write-Host "  버킷이 없다면 아래 둘 중 하나로 만드세요:" -ForegroundColor White
Write-Host "    A) Google Cloud Console (브라우저)" -ForegroundColor Gray
Write-Host "       https://console.cloud.google.com/storage/browser?project=$ProjectId" -ForegroundColor Gray
Write-Host "       '버킷 만들기' → 이름: $BucketName / 위치: $Region (서울)" -ForegroundColor Gray
Write-Host ""
Write-Host "    B) gcloud CLI" -ForegroundColor Gray
Write-Host "       gcloud storage buckets create gs://$BucketName --location=$Region --project=$ProjectId" -ForegroundColor Gray
Write-Host ""
$ans = Read-Host "버킷이 준비되었으면 Enter를 누르고 배포를 진행하세요. 취소하려면 'q'"
if ($ans -eq 'q') { Write-Warn "배포 취소됨"; exit 0 }

# ─────────────────────────────────────────────────────────────
# 배포!
# ─────────────────────────────────────────────────────────────
Write-Step "Functions 배포 중 (5~10분 소요)"
firebase deploy --only functions --project $ProjectId
if ($LASTEXITCODE -ne 0) {
    Write-Err "배포 실패. 가장 흔한 원인:"
    Write-Host "    - Firebase 프로젝트가 Spark(무료) 요금제 → Blaze로 업그레이드 필요" -ForegroundColor Yellow
    Write-Host "      https://console.firebase.google.com/project/$ProjectId/usage/details" -ForegroundColor Yellow
    Write-Host "    - 버킷 권한 부족 → 서비스 계정에 'Cloud Firestore Import Export Admin' 역할 추가" -ForegroundColor Yellow
    exit 1
}

Write-Ok "배포 완료!"
Write-Host ""
Write-Host "확인 방법:" -ForegroundColor White
Write-Host "  - https://console.firebase.google.com/project/$ProjectId/functions" -ForegroundColor Gray
Write-Host "  - 매일 새벽 3시 (KST) 자동 백업 실행 → https://console.cloud.google.com/storage/browser/$BucketName" -ForegroundColor Gray
Write-Host ""
Write-Host "수동 백업 즉시 테스트 (선택):" -ForegroundColor White
Write-Host "  firebase functions:shell" -ForegroundColor Gray
Write-Host "  > scheduledFirestoreExport()" -ForegroundColor Gray
Write-Host ""
