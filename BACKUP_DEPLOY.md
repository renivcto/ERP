# Firestore 자동 백업 배포 가이드

Reniv ERP의 데이터를 매일 새벽 3시 (KST) 자동으로 Cloud Storage로 백업하는 시스템입니다.

---

## 배포된 기능 요약

배포가 끝나면 아래 3가지가 자동으로 동작합니다.

| 기능 | 실행 시점 | 용도 |
|---|---|---|
| `scheduledFirestoreExport` | 매일 새벽 3시 KST | 전체 Firestore 일일 백업 |
| `manualBackup` | 관리자가 웹 버튼으로 수동 호출 | 긴급 백업 |
| `pruneOldBackups` | 매주 일요일 새벽 4시 KST | 30일 이상 된 일일 백업 자동 삭제 |

**예상 비용:** 월 $1 미만 (데이터 크기에 따라 다름)

---

## 1단계 — Firebase 요금제 업그레이드 (필수)

Cloud Functions와 Scheduler는 **무료 Spark 요금제에서 사용 불가**합니다. 종량제 Blaze로 업그레이드가 필요합니다.

1. 접속: https://console.firebase.google.com/project/reniv-erp-135a3/usage/details
2. 하단 "요금제 수정" → **Blaze (종량제)** 선택
3. 결제 계정 연결 (신용카드 등록)
4. **월 예산 알림 설정** — 월 $10 정도로 설정해두면 이상 과금 방지

> 실제 이 ERP 규모에서는 월 $1 미만으로 나올 가능성이 높지만, 혹시 모를 무한 루프나 버그를 대비해 예산 알림은 꼭 켜두세요.

---

## 2단계 — 백업 저장용 Storage 버킷 생성

다음 둘 중 하나로 만드시면 됩니다.

### 방법 A — Google Cloud Console (브라우저, 권장)

1. 접속: https://console.cloud.google.com/storage/browser?project=reniv-erp-135a3
2. "**버킷 만들기**" 클릭
3. 이름: `reniv-erp-135a3-backups`
4. 위치 유형: **Region** / 위치: **asia-northeast3 (서울)**
5. 스토리지 클래스: **Standard**
6. 액세스 제어: **균일 (Uniform)**
7. "만들기" 클릭

### 방법 B — gcloud CLI (Cloud SDK 설치 필요)

```powershell
gcloud storage buckets create gs://reniv-erp-135a3-backups --location=asia-northeast3 --project=reniv-erp-135a3
```

---

## 3단계 — 서비스 계정 권한 추가

Firestore 내용을 Storage로 export 하려면 서비스 계정에 권한이 필요합니다.

1. 접속: https://console.cloud.google.com/iam-admin/iam?project=reniv-erp-135a3
2. `reniv-erp-135a3@appspot.gserviceaccount.com` 계정 찾기 (없으면 Functions 배포 후 자동 생성됨)
3. "편집(연필 아이콘)" 클릭
4. "역할 추가" → 다음 2개 추가:
   - **Cloud Datastore Import Export Admin**
   - **Storage Object Admin** (버킷에 쓰기 권한)
5. "저장"

> 이 단계는 Functions를 한 번 배포하고 나면 서비스 계정이 자동 생성되므로, 그 이후에 해도 됩니다. 처음 실행 시 권한 오류가 나면 여기로 돌아와서 추가하세요.

---

## 4단계 — 배포 실행

### 자동 스크립트 사용 (권장)

PowerShell을 열어서 ERP 폴더로 이동한 뒤 실행:

```powershell
cd "C:\Users\heeka\OneDrive\0.RENIV\ERP\ERP"
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\deploy-functions.ps1
```

스크립트가 다음을 자동으로 처리합니다:
1. Node.js 설치 확인
2. `firebase-tools` CLI 설치 (필요시)
3. Firebase 로그인 (브라우저 자동 열림 → reniv.cto@gmail.com으로 로그인)
4. `functions/` 의존성 설치
5. 배포 실행

### 수동으로 하시려면

```powershell
cd "C:\Users\heeka\OneDrive\0.RENIV\ERP\ERP"
npm install -g firebase-tools
firebase login
cd functions
npm install
cd ..
firebase deploy --only functions --project reniv-erp-135a3
```

---

## 5단계 — 배포 확인

1. Functions 목록 확인
   https://console.firebase.google.com/project/reniv-erp-135a3/functions
   → 3개 함수가 `asia-northeast3` 리전에 배포되어 있어야 함

2. 스케줄러 확인
   https://console.cloud.google.com/cloudscheduler?project=reniv-erp-135a3
   → `firebase-schedule-scheduledFirestoreExport-asia-northeast3` 작업이 있어야 함

3. **즉시 테스트 실행** (다음 새벽 3시까지 기다리지 않고 지금 돌려보기)
   - 스케줄러 화면에서 작업 오른쪽 점 3개 → "강제 실행"
   - 또는 로그 확인: https://console.firebase.google.com/project/reniv-erp-135a3/functions/logs

4. 버킷에 파일 생성 확인
   https://console.cloud.google.com/storage/browser/reniv-erp-135a3-backups
   → `daily/2026-04-19/` 안에 `.overall_export_metadata` 파일 등이 생성되어야 함

---

## 복구 방법 (혹시 데이터가 날아갔을 때)

```powershell
# 버킷의 특정 날짜 백업을 Firestore로 복원
gcloud firestore import gs://reniv-erp-135a3-backups/daily/2026-04-19 --project=reniv-erp-135a3
```

> 주의: Import는 **기존 Firestore 데이터를 덮어씁니다.** 복구 전에 현재 상태도 한번 수동 백업하시는 걸 권장합니다. 테스트 용도로는 **별도 Firebase 프로젝트를 새로 만들어서** 거기에 import 하는 게 안전합니다.

---

## 문제 해결

### "Cloud Billing account required"
→ 1단계 (Blaze 업그레이드)가 안 되어 있습니다.

### "Permission denied on bucket"
→ 3단계 (서비스 계정 권한)가 안 되어 있습니다.

### "The caller does not have permission"
→ 로그인한 Google 계정이 Firebase 프로젝트 Owner가 아닙니다. `reniv.cto@gmail.com`으로 로그인했는지 확인.

### 배포는 성공했는데 스케줄이 안 돌아감
→ Cloud Scheduler API가 비활성 상태일 수 있습니다.
   https://console.cloud.google.com/apis/library/cloudscheduler.googleapis.com?project=reniv-erp-135a3
   에서 "사용 설정" 클릭.

---

## 배포된 파일 구조

```
ERP/
├── firebase.json              ← Firebase 배포 설정
├── .firebaserc                ← 프로젝트 ID
├── firestore.rules            ← 보안 규칙 (이미 Console에 게시됨)
├── deploy-functions.ps1       ← 배포 헬퍼 스크립트
├── functions/
│   ├── index.js               ← Cloud Functions 코드
│   ├── package.json           ← 의존성 정의
│   └── node_modules/          ← .gitignore 처리됨
└── index.html                 ← ERP 본체
```

---

**배포 중 막히면 에러 메시지 스크린샷 공유해 주세요.**
