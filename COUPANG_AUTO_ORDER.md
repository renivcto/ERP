# 쿠팡 주문 자동 수집 — 배포 가이드 (v2.2)

## 개요

매일 한국시간 **09:00 / 13:00 / 18:00** 에 쿠팡 Wing Open API에서 주문을 자동으로 가져와 ERP의 `shopOrders`에 머지합니다. 이미 등록된 주문(`orderNo` 동일)은 건너뜁니다.

```
Cloud Scheduler (KST 9/13/18시)
    ↓
Cloud Function: fetchCoupangOrders
    ↓ HMAC-SHA256 서명 + Wing API 호출
Wing Open API (ordersheets, 5개 status 순회)
    ↓ 매핑
Firestore: erp_data/shopOrders 머지
    ↓
Slack 알림 (성공: 신규 N건 / 실패: 오류 메시지)
```

ERP 화면 새로고침 시 새 주문이 보입니다.

---

## 1. 시크릿 등록 (최초 1회)

`coupang-credentials.txt`에 있는 3개 값을 Firebase Functions Secrets에 등록합니다.

```powershell
# 프로젝트 루트(ERP 폴더)에서 실행
firebase functions:secrets:set COUPANG_ACCESS_KEY
# → 프롬프트에 ACCESS_KEY 값 붙여넣기
firebase functions:secrets:set COUPANG_SECRET_KEY
# → SECRET_KEY 값
firebase functions:secrets:set COUPANG_VENDOR_ID
# → VENDOR_ID 값
```

확인:
```powershell
firebase functions:secrets:access COUPANG_ACCESS_KEY
```

> Slack webhook은 이미 v2.1 때 `firebase functions:config:set slack.webhook=...` 으로 등록되어 있으면 그대로 사용됩니다.

---

## 2. ERP에 쿠팡 쇼핑몰 등록 (최초 1회)

ERP → **매출 분석 → 쇼핑몰 관리 → + 쇼핑몰 추가** → 이름에 `쿠팡` 입력. 이름에 "쿠팡" 또는 "coupang"이 포함되어야 함수가 자동 매칭합니다.

---

## 3. 배포

```powershell
firebase deploy --only functions --project reniv-erp-135a3
```

배포 성공 시 5개 함수가 떠야 합니다:
- `scheduledFirestoreExport` (백업, 기존)
- `manualBackup` (백업, 기존)
- `pruneOldBackups` (백업, 기존)
- `fetchCoupangOrders` ← **신규** (스케줄)
- `manualFetchCoupangOrders` ← **신규** (수동)

---

## 4. 첫 수동 테스트 (스케줄 기다리지 않고 즉시 호출)

Firebase Console → Functions → `manualFetchCoupangOrders` → 직접 호출은 어려우므로, **브라우저 콘솔(F12)** 에서 ERP에 로그인한 채 실행:

```js
// ERP 페이지에서 F12 콘솔
const f = firebase.functions().httpsCallable('manualFetchCoupangOrders');
const result = await f({ daysBack: 7 });
console.log(result.data);
```

**예상 응답 (성공):**
```json
{
  "fetched": 12,
  "added": 12,
  "total": 12,
  "statusCounts": { "ACCEPT": 5, "INSTRUCT": 4, "DEPARTURE": 2, "DELIVERING": 1, "FINAL_DELIVERY": 0 },
  "range": "2026-04-27 ~ 2026-05-04",
  "sampleNew": [...]
}
```

**실패 케이스:**

| 오류 메시지 | 원인 | 해결 |
|---|---|---|
| `COUPANG_*_KEY 시크릿 미설정` | secrets 등록 누락 | 1단계 다시 |
| `Wing API 401: ...` | API 키 만료/잘못됨 | Wing 관리자 → API 키 재발급 |
| `Wing API 403: ...` | **IP 화이트리스트** 차단 가능성 | 5번 항목 참조 |
| `쇼핑몰 관리에 "쿠팡"이 등록되어 있지 않습니다` | 2단계 누락 | ERP에서 쿠팡 쇼핑몰 추가 |

---

## 5. IP 화이트리스트 (403 에러 발생 시)

쿠팡 Wing 관리자 → 마이오피스 → API 설정에서 **허용 IP 목록**이 활성화되어 있을 수 있습니다. Cloud Functions의 발신 IP는 동적이므로 다음 중 하나를 선택해야 합니다:

### 옵션 A: 허용 IP 비활성화 (가장 간단)
Wing 관리자 페이지에서 IP 제한 해제. 보안 우려가 있으면 옵션 B로.

### 옵션 B: VPC Connector + Cloud NAT 고정 IP
GCP Console에서:
1. VPC 네트워크 → 서브넷 생성 (asia-northeast3)
2. Cloud NAT 게이트웨이 + 고정 외부 IP 예약
3. Functions에 VPC connector 연결 (functions/index.js의 `runWith`에 `vpcConnector` 추가)
4. Wing에 그 고정 IP 등록

### 옵션 C: Windows 작업 스케줄러로 폴백
PC 의존이지만 IP 화이트리스트 OK. 기존 PowerShell 스크립트(`fetch-recent-orders.ps1`) 재사용.

→ 우선 옵션 A로 시도해보고 안 되면 옵션 B로 가는 것을 권장합니다.

---

## 6. 스케줄 동작 확인

배포 후 다음 9/13/18시에 자동으로 실행됩니다. Slack에 다음과 같은 메시지가 옵니다:

> ✅ [Reniv ERP 백업] 쿠팡 자동 주문 수집 — 신규 3건
> 📦 가져옴: 5건 / ✅ 신규 추가: 3건 / 📊 ERP 총 주문: 47건
> 📅 조회 기간: 2026-05-03 ~ 2026-05-04
> 📊 상태별: ACCEPT=2, INSTRUCT=1, ...

**스케줄 변경하려면** `functions/index.js`의 `pubsub.schedule('0 9,13,18 * * *')`를 수정 후 재배포.

---

## 7. 로그 확인

```powershell
firebase functions:log --only fetchCoupangOrders --limit 30
firebase functions:log --only manualFetchCoupangOrders --limit 30
```

또는 [Firebase Console Functions 로그](https://console.firebase.google.com/project/reniv-erp-135a3/functions/logs).

---

## 8. 다음 단계 (와디즈 / 스마트스토어 / 자사몰)

쿠팡이 안정적으로 돌면 같은 패턴으로 추가:

1. `functions/index.js`에 `fetchWadizOrders` / `mapWadizToErpOrder` 등 추가
2. 각 쇼핑몰별 시크릿 등록 (`WADIZ_*` 등)
3. ERP에 쇼핑몰 등록 (`와디즈`, `스마트스토어`, `자사몰`)
4. 스케줄은 동일한 cron 사용 (한 번에 모든 쇼핑몰 수집하는 단일 함수로 합치는 것도 가능)

---

## 변경된 파일

- `functions/index.js` — v2.1 → **v2.2** (쿠팡 함수 2개 + 헬퍼들 추가, 백업 함수는 그대로 유지)
- `index.html` — 주문 관리 페이지에서 상태/송장번호 컬럼 제거 (자동 수집 데이터에 부합하도록)

## 사용하지 않게 된 기존 파일 (보존)

기존 PowerShell 인프라는 폴백/디버깅용으로 그대로 두었습니다:
- `test-coupang-api.ps1` — Wing API 연결 테스트 (시크릿 등록 전 검증용)
- `fetch-recent-orders.ps1` — 14일 주문 조회 (샘플 JSON 받기용)
- `map-to-erp-csv.ps1` — JSON → CSV 변환 (옵션 C 폴백 시 사용)
