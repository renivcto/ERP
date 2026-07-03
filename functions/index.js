// =============================================================================
// Reniv ERP — Cloud Functions (v2.15, 2026-05, 자동 취소 시 재고 자동 복구)
// =============================================================================
// v2.15 변경:
//   - removeOrdersFromFirestore가 stockDeducted된 주문 삭제 시 재고 자동 복구
//   - items 컬렉션 갱신 + stockHistory 기록 (note: 취소/반품 자동복구)
//   - Slack 알림에 "재고 자동 복구 N건" + 품목별 변화량 표시
// =============================================================================
// v2.14 변경:
//   - 백업 함수 3개(scheduledFirestoreExport / manualBackup / pruneOldBackups)에
//     SLACK_BACKUP_WEBHOOK 시크릿을 명시적으로 사용 (erp-자동백업 채널)
//   - 주문 알림(르니브-주문자동화)와 완전 분리
// =============================================================================
// v2.13 변경:
//   - 네이버페이 충전금/포인트 결제 등 payment_amount=0인 주문도 정확한 금액 산출
//   - 7개 결제/주문 금액 필드 순차 시도 + orderItems 가격×수량 합계 fallback
//   - 0원 감지 시 디버그 로그로 응답 구조 파악
// =============================================================================
// v2.12 변경:
//   - daysBack 기본값 1 → 7 (active 응답 범위 확장)
//   - 휴리스틱 비교 범위 14일 cutoff (orderDate 기준)
//   - [COUPANG HEURISTIC] 진단 로그 (어디서 막히는지 한눈에)
// =============================================================================
// v2.11 변경:
//   - 모든 주문에 대해 cancellation 핵심 필드 한 줄 요약 로그 ([COUPANG ORDER])
//   - holdCountForCancel 검사 추가 (취소 보류 = 취소 요청 들어옴)
// =============================================================================
// v2.10 변경:
//   - 쿠팡 응답의 orderItems[]에서 cancelCount/returnCount/cancelStatus 직접 검사 (인라인)
//   - 디버그 로그: 첫 주문 전체 JSON 출력 (실제 필드 구조 파악용)
//   - 휴리스틱은 보조로 유지
// =============================================================================
// v2.9 변경 (Wing API의 CANCEL/RETURNED status 값이 400 거부됨):
//   - 쿠팡: 휴리스틱 — ERP에 있는데 같은 기간 active 응답에 없는 주문을 취소로 추정
//   - Safety guard: 10건 초과 추정 시 자동 삭제 안 함 (일시 오류 대량 손실 방지)
//   - 자사몰: 응답 order_status가 C*/R*이면 별도 분리 → 정확 처리 (변경 없음)
//   - Slack 알림에 "취소 추정 N건 + 샘플 + 안전 guard 표시"
// =============================================================================
// v2.7 추가:
//   - applyProductMappingsToOrders(): 쇼핑몰별 productMappings + 완제품 정확 일치로 itemId 자동 부여
//   - 쿠팡 / 자사몰 자동 수집에 모두 적용
//   - ERP 주문관리에서 사용자가 매핑하면 다음 수집부터 자동 매핑됨
// =============================================================================
// v2.6 추가:
//   - fetchCafe24Orders: 자사몰(Cafe24) 주문 자동 수집 (KST 9/13/18시, 쿠팡과 동일 스케줄)
//   - manualFetchCafe24Orders: 관리자 수동 호출
//   - Cafe24 OAuth 2.0 — Refresh Token rotation 자동 처리 (Firestore에 저장)
//   - 시크릿: CAFE24_MALL_ID, CAFE24_CLIENT_ID, CAFE24_CLIENT_SECRET, CAFE24_REFRESH_TOKEN(초기값)
// =============================================================================
// v2.5 변경:
//   - 쿠팡 주문 수집 알림은 별도 Slack 채널 (르니브-주문자동화) 으로 전송
//   - 시크릿: SLACK_ORDERS_WEBHOOK
//   - 알림 메시지 간소화: ERP 총 주문 / 상태별 항목 제거
// =============================================================================
// v2.3 추가:
//   - vpcConnector: 'erp-coupang-vpc-conn' (asia-northeast3)
//   - vpcConnectorEgressSettings: 'ALL_TRAFFIC' → 모든 외부 트래픽이 Cloud NAT 경유
//   - Cloud NAT 고정 IP: 34.64.120.224 (erp-coupang-outbound-ip)
//   - 쿠팡 Wing 화이트리스트에 위 IP 등록 필요
// =============================================================================
//
// 기능:
//   [백업]
//   1) scheduledFirestoreExport: 매일 새벽 3시 (KST) Firestore 전체 백업
//   2) manualBackup: 관리자가 웹 UI에서 버튼 클릭으로 즉시 백업
//   3) pruneOldBackups: 30일 이상 된 일일 백업 자동 삭제 (매주 일요일 04:00)
//   [주문 자동 수집 — v2.2]
//   4) fetchCoupangOrders: 매일 KST 09:00 / 13:00 / 18:00 쿠팡 주문 자동 수집
//   5) manualFetchCoupangOrders: 관리자 수동 호출 (테스트/즉시 수집용)
//
// 모든 함수는 성공/실패 시 Slack 알림 전송 (functions.config().slack.webhook)
//
// 배포 전 시크릿 등록 (한 번만):
//   firebase functions:config:set slack.webhook="https://hooks.slack.com/services/..."
//   firebase functions:secrets:set COUPANG_ACCESS_KEY
//   firebase functions:secrets:set COUPANG_SECRET_KEY
//   firebase functions:secrets:set COUPANG_VENDOR_ID
//
// 배포:
//   firebase deploy --only functions --project reniv-erp-135a3
// =============================================================================

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const firestore = require('@google-cloud/firestore');
const {Storage} = require('@google-cloud/storage');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');   // 네이버 커머스API 전자서명용

admin.initializeApp();

const client = new firestore.v1.FirestoreAdminClient();
const storage = new Storage();

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'reniv-erp-135a3';
const BUCKET_NAME = `${PROJECT_ID}-backups`;
const BUCKET = `gs://${BUCKET_NAME}`;
const DATABASE_NAME = client.databasePath(PROJECT_ID, '(default)');
const REGION = 'asia-northeast3';   // 서울 리전

// ─────────────────────────────────────────────────────────────
// 헬퍼: 한국시간(KST) 기준 날짜/시각 문자열
// ─────────────────────────────────────────────────────────────
function kstDate() {
  // YYYY-MM-DD (KST)
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function kstTimestamp() {
  // 2026-04-19 03:00:15 (KST)
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
}

function kstTimestampForFilename() {
  // 2026-04-19_03-00-15 (파일명 안전)
  return kstTimestamp().replace(/[: ]/g, '-').replace(/-T/, '_');
}

// ─────────────────────────────────────────────────────────────
// Slack 알림 헬퍼
//   level: 'success' | 'error' | 'info' | 'warning'
// ─────────────────────────────────────────────────────────────
async function notifySlack({ title, level, details, webhookOverride, titlePrefix }) {
  // v2.5: webhookOverride 가 있으면 그쪽으로 전송 (예: 주문 알림은 별도 채널)
  // v2.16: titlePrefix 옵션 추가 — 미지정 시 [Reniv ERP 백업] (기본), 주문 알림은 [Reniv ERP 주문]
  const webhook = webhookOverride || (functions.config().slack || {}).webhook;
  if (!webhook) {
    console.warn('[SLACK] webhook 미설정 - 알림 건너뜀');
    return;
  }

  const meta = {
    success: { emoji: '✅', color: '#2eb886', label: '성공' },
    error:   { emoji: '🚨', color: '#e01e5a', label: '실패' },
    warning: { emoji: '⚠️',  color: '#ecb22e', label: '경고' },
    info:    { emoji: 'ℹ️',  color: '#1d9bd1', label: '정보' },
  }[level] || { emoji: '🔔', color: '#999999', label: level };

  // v2.17: titlePrefix === '' (빈 문자열) 이면 prefix 없이 제목만 출력
  //         titlePrefix === undefined 이면 기본값 '[Reniv ERP 백업]'
  const prefix = (titlePrefix === undefined) ? '[Reniv ERP 백업]' : titlePrefix;
  const titleText = prefix ? `${prefix} ${title}` : title;
  const payload = {
    text: `${meta.emoji} ${titleText}`,
    attachments: [{
      color: meta.color,
      fields: [
        { title: '시각', value: kstTimestamp() + ' (KST)', short: true },
        { title: '상태', value: meta.label, short: true },
        { title: '상세', value: details || '(내용 없음)', short: false },
      ],
      footer: 'Reniv ERP Cloud Functions',
      ts: Math.floor(Date.now() / 1000),
    }],
  };

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error(`[SLACK] 전송 실패: ${response.status} ${response.statusText}`);
    } else {
      console.log('[SLACK] 알림 전송 완료');
    }
  } catch (e) {
    console.error('[SLACK] 전송 중 예외:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────
// 1) 스케줄 백업 — 매일 새벽 3시 (KST)
// ─────────────────────────────────────────────────────────────
exports.scheduledFirestoreExport = functions
  .region(REGION)
  .runWith({
    secrets: ['SLACK_BACKUP_WEBHOOK']
  })
  .pubsub.schedule('0 3 * * *')
  .timeZone('Asia/Seoul')
  .onRun(async (context) => {
    const today = kstDate();                                  // 2026-04-19 (KST)
    const ts = kstTimestampForFilename();                     // 2026-04-19_03-00-15
    // 같은 날 여러 번 실행해도 충돌 없도록 날짜/시각 2단 구조
    const outputPrefix = `${BUCKET}/daily/${today}/${ts}`;

    try {
      const [response] = await client.exportDocuments({
        name: DATABASE_NAME,
        outputUriPrefix: outputPrefix,
        collectionIds: [],   // 빈 배열 = 전체 컬렉션
      });

      console.log(`[BACKUP] ✅ Export 시작: ${outputPrefix}`);
      console.log(`[BACKUP] Operation: ${response.name}`);

      await notifySlack({
        title: '일일 자동 백업 시작 성공',
        level: 'success',
        details:
          `📂 저장 위치: \`${outputPrefix}\`\n` +
          `🔧 작업 ID: \`${response.name.split('/').pop()}\`\n\n` +
          `_(실제 파일 생성 완료까지 1~5분 소요. 완료 확인은 버킷 직접 확인.)_`,
        webhookOverride: process.env.SLACK_BACKUP_WEBHOOK
      });

      return { success: true, operation: response.name, path: outputPrefix };
    } catch (err) {
      console.error(`[BACKUP] ❌ Export 실패:`, err);

      await notifySlack({
        title: '일일 자동 백업 실패',
        level: 'error',
        details:
          `❌ 오류: ${err.message}\n\n` +
          `*즉시 조치 필요:*\n` +
          `1. <https://console.firebase.google.com/project/${PROJECT_ID}/functions/logs|Functions 로그 확인>\n` +
          `2. <https://console.cloud.google.com/iam-admin/iam?project=${PROJECT_ID}|IAM 권한 확인> ` +
          `(서비스 계정에 'Cloud Datastore Import Export Admin', 'Storage Object Admin' 역할 필요)`,
        webhookOverride: process.env.SLACK_BACKUP_WEBHOOK
      });

      throw new functions.https.HttpsError('internal', '백업 실패: ' + err.message);
    }
  });

// ─────────────────────────────────────────────────────────────
// 2) 수동 백업 — 관리자 전용 Callable Function
// ─────────────────────────────────────────────────────────────
exports.manualBackup = functions
  .region(REGION)
  .runWith({
    secrets: ['SLACK_BACKUP_WEBHOOK']
  })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', '로그인이 필요합니다.');
    }

    const uid = context.auth.uid;
    const userDoc = await admin.firestore().doc(`users/${uid}`).get();
    if (!userDoc.exists || userDoc.data().isAdmin !== true) {
      throw new functions.https.HttpsError('permission-denied', '관리자 권한이 필요합니다.');
    }

    const userName = userDoc.data().name || userDoc.data().email || uid;
    const ts = kstTimestampForFilename();
    const outputPrefix = `${BUCKET}/manual/${ts}`;

    try {
      const [response] = await client.exportDocuments({
        name: DATABASE_NAME,
        outputUriPrefix: outputPrefix,
        collectionIds: [],
      });
      console.log(`[MANUAL BACKUP] ✅ ${outputPrefix} by ${uid}`);

      await notifySlack({
        title: '수동 백업 실행 (관리자)',
        level: 'info',
        details:
          `👤 실행자: *${userName}* (\`${uid}\`)\n` +
          `📂 저장 위치: \`${outputPrefix}\`\n` +
          `🔧 작업 ID: \`${response.name.split('/').pop()}\``,
        webhookOverride: process.env.SLACK_BACKUP_WEBHOOK
      });

      return { success: true, operation: response.name, path: outputPrefix };
    } catch (err) {
      console.error(`[MANUAL BACKUP] ❌`, err);

      await notifySlack({
        title: '수동 백업 실패 (관리자)',
        level: 'error',
        details:
          `👤 실행자: *${userName}* (\`${uid}\`)\n` +
          `❌ 오류: ${err.message}`,
        webhookOverride: process.env.SLACK_BACKUP_WEBHOOK
      });

      throw new functions.https.HttpsError('internal', '백업 실패: ' + err.message);
    }
  });

// ─────────────────────────────────────────────────────────────
// 3) 오래된 백업 정리 — 매주 일요일 새벽 4시
//    30일 이상 된 일일 백업 삭제 (수동 백업은 영구 보관)
// ─────────────────────────────────────────────────────────────
exports.pruneOldBackups = functions
  .region(REGION)
  .runWith({
    secrets: ['SLACK_BACKUP_WEBHOOK']
  })
  .pubsub.schedule('0 4 * * 0')
  .timeZone('Asia/Seoul')
  .onRun(async (context) => {
    const bucket = storage.bucket(BUCKET_NAME);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      const [files] = await bucket.getFiles({ prefix: 'daily/' });
      let deletedCount = 0;
      let keptCount = 0;
      const deletedFolders = new Set();

      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const created = new Date(metadata.timeCreated);
        if (created < thirtyDaysAgo) {
          await file.delete();
          deletedCount++;
          // 폴더 이름 추출 (daily/2026-03-15/...)
          const folder = file.name.split('/').slice(0, 2).join('/');
          deletedFolders.add(folder);
        } else {
          keptCount++;
        }
      }

      console.log(`[PRUNE] 🗑️ 30일 이상 된 백업 ${deletedCount}개 파일 삭제, ${keptCount}개 유지`);

      await notifySlack({
        title: '주간 백업 정리 완료',
        level: deletedCount > 0 ? 'success' : 'info',
        details:
          `🗑️ 삭제: ${deletedCount}개 파일 (${deletedFolders.size}개 날짜 폴더)\n` +
          `📦 유지: ${keptCount}개 파일\n` +
          `📅 기준: 30일 (${kstDate()} 이전)`,
        webhookOverride: process.env.SLACK_BACKUP_WEBHOOK
      });

      return { deleted: deletedCount, kept: keptCount };
    } catch (err) {
      console.error(`[PRUNE] ❌`, err);

      await notifySlack({
        title: '주간 백업 정리 실패',
        level: 'error',
        details:
          `❌ 오류: ${err.message}\n\n` +
          `<https://console.firebase.google.com/project/${PROJECT_ID}/functions/logs|로그 확인>`,
        webhookOverride: process.env.SLACK_BACKUP_WEBHOOK
      });

      throw err;
    }
  });

// =============================================================================
// v2.2 — 쿠팡 Wing Open API: 주문 자동 수집 → ERP shopOrders Firestore 머지
// =============================================================================
//
// Wing API 인증: HMAC-SHA256 (yymmddTHHmmssZ, UTC 기준)
// IP 화이트리스트가 활성화되어 있다면 Cloud Functions 발신 IP를 등록해야 함
// (필요 시 VPC connector + Cloud NAT 고정 IP 옵션 검토)
// =============================================================================

// 쿠팡 datetime 포맷: yyMMddTHHmmssZ (UTC)
function coupangDatetime() {
  const d = new Date();
  const yy = String(d.getUTCFullYear()).slice(2);
  const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const HH = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;
}

// Wing API 호출 + HMAC-SHA256 서명
async function callWingAPI({ accessKey, secretKey, vendorId, status, createdAtFrom, createdAtTo }) {
  const method = 'GET';
  const path = `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets`;
  const query = `createdAtFrom=${createdAtFrom}&createdAtTo=${createdAtTo}&status=${status}&maxPerPage=50`;
  const datetime = coupangDatetime();
  const message = `${datetime}${method}${path}${query}`;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  const auth = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
  const url = `https://api-gateway.coupang.com${path}?${query}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json;charset=UTF-8',
      'X-EXTENDED-Timeout': '90000'
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(body unreadable)');
    throw new Error(`Wing API ${response.status}: ${body.slice(0, 500)}`);
  }
  return await response.json();
}

// 한국 전화번호 보정: 첫자리 1~9 면 0 추가 (엑셀 import 로직과 동일 규칙)
function fmtPhoneKr(phone) {
  if (!phone) return '';
  let s = String(phone).trim();
  if (!s) return '';
  if (/^[1-9]/.test(s)) s = '0' + s;
  return s;
}

// 쿠팡 주문 객체 → ERP shopOrders 객체 매핑
function mapCoupangToErpOrder(c, shopId, shopName) {
  const items = Array.isArray(c.orderItems) ? c.orderItems : [];
  const totalAmount = items.reduce((sum, it) =>
    sum + (Number(it.orderPrice) || 0) * (Number(it.shippingCount) || 1), 0);
  const totalQty = items.reduce((sum, it) => sum + (Number(it.shippingCount) || 0), 0) || 1;
  const productNames = items.map(it => it.vendorItemName || it.sellerProductName).filter(Boolean).join(' + ');

  return {
    id: Date.now() + Math.floor(Math.random() * 100000),
    orderNo: String(c.orderId || ''),
    orderDate: (c.orderedAt || '').slice(0, 10),
    customerName: (c.orderer && c.orderer.name) || '',
    customerPhone: fmtPhoneKr((c.orderer && (c.orderer.safeNumber || c.orderer.phoneNumber)) || ''),
    email: (c.orderer && c.orderer.email) || '',
    productName: productNames || '',
    qty: totalQty,
    paymentAmount: totalAmount,
    recipientName: (c.receiver && c.receiver.name) || '',
    recipientPhone: fmtPhoneKr((c.receiver && (c.receiver.safeNumber || c.receiver.receiverNumber)) || ''),
    zipCode: (c.receiver && c.receiver.postCode) || '',
    address: `${(c.receiver && c.receiver.addr1) || ''} ${(c.receiver && c.receiver.addr2) || ''}`.trim(),
    deliveryNote: c.parcelPrintMessage || '',
    paymentDate: (c.paidAt || '').slice(0, 10),
    shipDate: '',
    shippingFee: Number(c.shippingPrice) || 0,
    trackingNo: c.invoiceNumber || '',
    status: c.invoiceNumber ? '배송완료' : '배송 전',
    shopId,
    shopName,
    source: 'coupang_auto',
    coupangStatus: c.status || '',
    fetchedAt: Date.now(),
  };
}

// v2.7: 쇼핑몰별 productMappings + DB.items로 itemId 자동 매핑
//   - shop.productMappings에 매핑되어 있으면 itemId 부여
//   - 또는 ERP의 완제품 이름과 정확히 일치하면 itemId 부여
//   - 매핑 안 된 주문은 itemId 없이 push (ERP 화면에서 사용자가 매핑하면 일괄 갱신됨)
async function applyProductMappingsToOrders(firestoreDb, orders, shopId) {
  if (!Array.isArray(orders) || orders.length === 0) return { mapped: 0 };

  // shops 문서 읽기
  const shopsSnap = await firestoreDb.doc('erp_data/shops').get();
  let shop = null;
  if (shopsSnap.exists) {
    const raw = shopsSnap.data().data;
    let shops = [];
    if (typeof raw === 'string') { try { shops = JSON.parse(raw) || []; } catch (_) {} }
    else if (Array.isArray(raw)) shops = raw;
    shop = shops.find(s => s && s.id === shopId);
  }
  const productMappings = (shop && Array.isArray(shop.productMappings)) ? shop.productMappings : [];

  // items 문서 읽기 (정확 일치 fallback용)
  const itemsSnap = await firestoreDb.doc('erp_data/items').get();
  let items = [];
  if (itemsSnap.exists) {
    const raw = itemsSnap.data().data;
    if (typeof raw === 'string') { try { items = JSON.parse(raw) || []; } catch (_) {} }
    else if (Array.isArray(raw)) items = raw;
  }

  let mapped = 0;
  orders.forEach(o => {
    if (o.itemId) return;
    if (!o.productName) return;

    // 1) shop.productMappings 우선
    const m = productMappings.find(x => x && x.shopProductName === o.productName);
    if (m && m.itemId) { o.itemId = m.itemId; mapped++; return; }

    // 2) DB.items 정확 일치 (완제품)
    const exact = items.find(it => it && it.type === '완제품' && it.name === o.productName);
    if (exact) { o.itemId = exact.id; mapped++; return; }
  });

  return { mapped };
}

// v2.8/v2.15: 취소/반품된 orderNo들을 erp_data/shopOrders에서 제거 + 재고 자동 복구
//   - 동일 shopId 내에서만 매칭 (다른 쇼핑몰의 같은 주문번호 보호)
//   - stockDeducted된 주문이라면 stockDeductedQty 만큼 items 재고 복구 + stockHistory 기록
//   - 삭제된 주문 샘플 최대 3건 + 복구된 재고 정보 반환 (Slack 알림용)
async function removeOrdersFromFirestore(firestoreDb, orderNos, shopId) {
  if (!orderNos) return { removed: 0, samples: [], restoredCount: 0, restoredItems: [] };
  const set = (orderNos instanceof Set) ? orderNos : new Set(Array.from(orderNos).map(String));
  if (set.size === 0) return { removed: 0, samples: [], restoredCount: 0, restoredItems: [] };

  const docRef = firestoreDb.doc('erp_data/shopOrders');
  const snap = await docRef.get();
  let existing = [];
  if (snap.exists) {
    const raw = snap.data().data;
    if (typeof raw === 'string') {
      try { existing = JSON.parse(raw) || []; } catch (_) {}
    } else if (Array.isArray(raw)) {
      existing = raw;
    }
  }

  const samples = [];
  const toRestore = []; // v2.15: 재고 복구 대상 [{itemId, qty, orderNo, productName}]
  const filtered = existing.filter(o => {
    if (!o) return false;
    if (o.shopId !== shopId) return true;
    if (set.has(String(o.orderNo))) {
      if (samples.length < 3) {
        samples.push({
          orderNo: o.orderNo, customer: o.customerName, product: o.productName,
          qty: o.qty, amount: o.paymentAmount
        });
      }
      // v2.15: stockDeducted된 주문이면 재고 복구 대상에 추가
      if (o.stockDeducted && o.itemId) {
        const restoreQty = (typeof o.stockDeductedQty === 'number') ? o.stockDeductedQty : (parseInt(o.qty) || 1);
        if (restoreQty > 0) {
          toRestore.push({ itemId: o.itemId, qty: restoreQty, orderNo: o.orderNo, productName: o.productName });
        }
      }
      return false;
    }
    return true;
  });

  const removed = existing.length - filtered.length;

  // v2.15: items 컬렉션 + stockHistory 갱신 (재고 복구)
  let restoredCount = 0;
  const restoredItems = [];
  if (toRestore.length > 0) {
    const itemsRef = firestoreDb.doc('erp_data/items');
    const itemsSnap = await itemsRef.get();
    let items = [];
    if (itemsSnap.exists) {
      const raw = itemsSnap.data().data;
      if (typeof raw === 'string') { try { items = JSON.parse(raw) || []; } catch (_) {} }
      else if (Array.isArray(raw)) items = raw;
    }

    const histRef = firestoreDb.doc('erp_data/stockHistory');
    const histSnap = await histRef.get();
    let stockHistory = [];
    if (histSnap.exists) {
      const raw = histSnap.data().data;
      if (typeof raw === 'string') { try { stockHistory = JSON.parse(raw) || []; } catch (_) {} }
      else if (Array.isArray(raw)) stockHistory = raw;
    }

    const today = new Date().toISOString().slice(0, 10);
    for (const r of toRestore) {
      const item = items.find(i => i && i.id === r.itemId);
      if (!item) continue;
      const before = item.stock || 0;
      item.stock = before + r.qty;
      stockHistory.push({
        id: Date.now() + Math.floor(Math.random() * 100000),
        itemId: r.itemId, type: 'in', qty: r.qty,
        price: item.price || 0,
        date: today, lot: item.lot || '',
        note: `취소/반품 자동복구 [${r.orderNo}] (자동 수집)`
      });
      restoredCount++;
      restoredItems.push({ name: item.name || '-', qty: r.qty, before, after: item.stock, orderNo: r.orderNo });
    }

    if (restoredCount > 0) {
      await itemsRef.set({ data: JSON.stringify(items), ts: Date.now() });
      await histRef.set({ data: JSON.stringify(stockHistory), ts: Date.now() });
      console.log('[CANCEL] 재고 자동 복구:', restoredCount, '건');
    }
  }

  if (removed > 0) {
    await docRef.set({ data: JSON.stringify(filtered), ts: Date.now() });
  }
  return { removed, samples, restoredCount, restoredItems };
}

// erp_data/shopOrders Firestore 문서에서 기존 주문 읽고 신규만 머지
async function mergeOrdersIntoFirestore(firestoreDb, newOrders) {
  const docRef = firestoreDb.doc('erp_data/shopOrders');
  const snap = await docRef.get();
  let existing = [];
  if (snap.exists) {
    const raw = snap.data().data;
    if (typeof raw === 'string') {
      try { existing = JSON.parse(raw) || []; } catch (_) { existing = []; }
    } else if (Array.isArray(raw)) {
      existing = raw;
    }
  }
  const existingOrderNos = new Set(existing.map(o => String(o.orderNo)));
  const trulyNew = newOrders.filter(o => o.orderNo && !existingOrderNos.has(String(o.orderNo)));

  if (trulyNew.length === 0) {
    return { added: 0, total: existing.length, sampleNew: [] };
  }

  const merged = existing.concat(trulyNew);
  await docRef.set({
    data: JSON.stringify(merged),
    ts: Date.now()
  });

  return { added: trulyNew.length, total: merged.length, sampleNew: trulyNew.slice(0, 3) };
}

// erp_data/shops 에서 쿠팡 shop 객체 찾기
async function findCoupangShop(firestoreDb) {
  const snap = await firestoreDb.doc('erp_data/shops').get();
  if (!snap.exists) return null;
  const raw = snap.data().data;
  let shops = [];
  if (typeof raw === 'string') { try { shops = JSON.parse(raw) || []; } catch (_) {} }
  else if (Array.isArray(raw)) shops = raw;
  const nameMatches = (n) => {
    if (!n) return false;
    const lower = String(n).toLowerCase();
    return n.includes('쿠팡') || lower.includes('coupang');
  };
  return shops.find(s => s && nameMatches(s.name)) || null;
}

// 메인 인입 로직
async function ingestCoupangOrders({ daysBack = 7 } = {}) {
  // v2.4: 시크릿 값에 줄바꿈/공백이 섞여 있어도 안전하도록 trim 처리
  const accessKey = (process.env.COUPANG_ACCESS_KEY || '').trim();
  const secretKey = (process.env.COUPANG_SECRET_KEY || '').trim();
  const vendorId  = (process.env.COUPANG_VENDOR_ID  || '').trim();
  if (!accessKey || !secretKey || !vendorId) {
    throw new Error('COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY / COUPANG_VENDOR_ID 시크릿 미설정');
  }
  console.log('[COUPANG] 시크릿 길이 확인:', {
    accessKeyLen: accessKey.length,
    secretKeyLen: secretKey.length,
    vendorIdLen: vendorId.length,
    vendorIdValue: vendorId  // VENDOR_ID는 민감 정보 아님
  });
  // v2.4 디버그: 함수의 외부 발신 IP 확인 (Cloud NAT 통해 나가야 34.64.120.224)
  try {
    const ipResp = await fetch('https://api.ipify.org?format=json');
    if (ipResp.ok) {
      const ipData = await ipResp.json();
      console.log('[COUPANG] 함수 외부 발신 IP:', ipData.ip,
        ipData.ip === '34.64.120.224' ? '✅ Cloud NAT 정상' : '⚠️ Cloud NAT 미경유 (예상: 34.64.120.224)');
    }
  } catch (e) {
    console.warn('[COUPANG] IP 확인 실패:', e.message);
  }

  // KST 기준 날짜 범위
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000);
  const fromDate = new Date(todayKst); fromDate.setDate(fromDate.getDate() - daysBack);
  const createdAtFrom = fromDate.toISOString().slice(0, 10);
  const createdAtTo   = todayKst.toISOString().slice(0, 10);

  const firestoreDb = admin.firestore();
  const coupangShop = await findCoupangShop(firestoreDb);
  if (!coupangShop) {
    throw new Error('쇼핑몰 관리에 "쿠팡"이 등록되어 있지 않습니다. ERP → 매출 분석 → 쇼핑몰 관리에서 먼저 등록해주세요.');
  }
  const shopId = coupangShop.id;
  const shopName = coupangShop.name || '쿠팡';

  // 모든 active status 순회 + orderId 단위 dedupe
  const activeStatuses = ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY'];
  // v2.8: 취소/반품 status 후보 (Wing API 정확한 값을 모를 수 있어 여러 값 시도)
  const cancelStatuses = ['CANCEL', 'RETURNED'];

  const collected = new Map();
  const statusCounts = {};

  // active 주문 조회
  for (const status of activeStatuses) {
    try {
      const resp = await callWingAPI({ accessKey, secretKey, vendorId, status, createdAtFrom, createdAtTo });
      const list = (resp && Array.isArray(resp.data)) ? resp.data : [];
      statusCounts[status] = list.length;
      for (const order of list) {
        if (order && order.orderId && !collected.has(order.orderId)) {
          collected.set(order.orderId, order);
        }
      }
    } catch (e) {
      statusCounts[status] = `ERROR: ${e.message}`;
      console.warn(`[COUPANG] ${status} 조회 실패:`, e.message);
    }
  }

  // v2.11: 모든 주문에 대해 cancellation 핵심 필드 요약 로그 (한 줄씩)
  collected.forEach((order, orderId) => {
    const items = Array.isArray(order.orderItems) ? order.orderItems : [];
    const totalCancel = items.reduce((s, i) => s + (Number(i && i.cancelCount) || 0), 0);
    const totalReturn = items.reduce((s, i) => s + (Number(i && i.returnCount) || 0), 0);
    const totalHold = items.reduce((s, i) => s + (Number(i && i.holdCountForCancel) || 0), 0);
    const itemStatuses = items.map(i => i && (i.cancelStatus || '')).filter(Boolean).join(',');
    console.log('[COUPANG ORDER]', JSON.stringify({
      orderId: order.orderId,
      customer: order.orderer && order.orderer.name,
      status: order.status,
      cancelStatus: order.cancelStatus || order.cancellationStatus || null,
      cancelCount: totalCancel,
      returnCount: totalReturn,
      holdCountForCancel: totalHold,
      itemStatuses: itemStatuses || null
    }));
  });

  // v2.18: 자동 취소/반품 감지 비활성화 — 사용자 요청으로 수동 처리 전환
  //   (인라인 + 휴리스틱 + removeOrdersFromFirestore 호출 모두 제거)
  const erpOrders = Array.from(collected.values()).map(c => mapCoupangToErpOrder(c, shopId, shopName));
  // v2.7: 매핑 자동 적용
  const mappingResult = await applyProductMappingsToOrders(firestoreDb, erpOrders, shopId);
  console.log('[COUPANG] 매핑 자동 적용:', mappingResult.mapped, '건');
  const merge = await mergeOrdersIntoFirestore(firestoreDb, erpOrders);

  return {
    fetched: erpOrders.length,
    added: merge.added,
    total: merge.total,
    statusCounts,
    range: `${createdAtFrom} ~ ${createdAtTo}`,
    sampleNew: merge.sampleNew.map(o => ({ orderNo: o.orderNo, customer: o.customerName, product: o.productName, qty: o.qty, amount: o.paymentAmount }))
  };
}

// ─────────────────────────────────────────────────────────────
// 4) 쿠팡 주문 자동 수집 — 매일 KST 09:00 / 13:00 / 18:00
// ─────────────────────────────────────────────────────────────
// v2.19: PlusCL(3PL 물류) 배송정보 수집으로 전환 — 쿠팡 자동 크롤러 비활성(export 제거 → 배포 시 삭제).
//   코드는 롤백 대비 보존. 스케줄 트리거는 export 안 되면 등록/실행되지 않음.
const _off_fetchCoupangOrders = functions
  .region(REGION)
  .runWith({
    secrets: ['COUPANG_ACCESS_KEY', 'COUPANG_SECRET_KEY', 'COUPANG_VENDOR_ID', 'SLACK_ORDERS_WEBHOOK'],
    timeoutSeconds: 240,
    memory: '256MB',
    // v2.3: Wing 화이트리스트 통과를 위해 VPC Connector → Cloud NAT 고정 IP 사용
    vpcConnector: 'erp-coupang-vpc-conn',
    vpcConnectorEgressSettings: 'ALL_TRAFFIC'
  })
  .pubsub.schedule('0 9,13,18 * * *')
  .timeZone('Asia/Seoul')
  .onRun(async (context) => {
    try {
      const result = await ingestCoupangOrders({ daysBack: 1 });
      const sampleText = result.sampleNew.length
        ? '\n\n*신규 주문 샘플:*\n' + result.sampleNew.map(s => `• ${s.orderNo} — ${s.customer || '-'} / ${s.product || '-'} × ${s.qty || 1}개 / ₩${(s.amount || 0).toLocaleString()}`).join('\n')
        : '';
      // v2.18: 자동 취소 비활성화 — removedText / safetyText 제거
      const titleText = result.added > 0 ? `신규 ${result.added}건` : '신규 없음';
      await notifySlack({
        title: `쿠팡 자동 주문 수집 — ${titleText}`,
        level: result.added > 0 ? 'success' : 'info',
        details:
          `📦 가져옴: ${result.fetched}건\n` +
          `✅ 신규 추가: ${result.added}건\n` +
          `📅 조회 기간: ${result.range}` + sampleText,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK,
        titlePrefix: ''
      });
      console.log('[COUPANG SCHED] 성공:', JSON.stringify(result));
      return result;
    } catch (err) {
      console.error('[COUPANG SCHED] 실패:', err);
      await notifySlack({
        title: '쿠팡 자동 주문 수집 실패',
        level: 'error',
        details: `❌ 오류: ${err.message}\n\n` +
          `*확인 사항:*\n` +
          `1. <https://console.firebase.google.com/project/${PROJECT_ID}/functions/logs|Functions 로그>\n` +
          `2. Wing 관리자 페이지 → API 설정 → 허용 IP 화이트리스트 (Functions IP가 막혔을 가능성)\n` +
          `3. firebase functions:secrets:get COUPANG_ACCESS_KEY 등 시크릿 등록 확인`,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK,
        titlePrefix: ''
      });
      throw err;
    }
  });

// ─────────────────────────────────────────────────────────────
// 5) 수동 트리거 (관리자 콜) — 테스트/즉시 수집용
// ─────────────────────────────────────────────────────────────
exports.manualFetchCoupangOrders = functions
  .region(REGION)
  .runWith({
    secrets: ['COUPANG_ACCESS_KEY', 'COUPANG_SECRET_KEY', 'COUPANG_VENDOR_ID', 'SLACK_ORDERS_WEBHOOK'],
    timeoutSeconds: 240,
    memory: '256MB',
    // v2.3: Wing 화이트리스트 통과를 위해 VPC Connector → Cloud NAT 고정 IP 사용
    vpcConnector: 'erp-coupang-vpc-conn',
    vpcConnectorEgressSettings: 'ALL_TRAFFIC'
  })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', '로그인이 필요합니다.');
    }
    const uid = context.auth.uid;
    const userDoc = await admin.firestore().doc(`users/${uid}`).get();
    if (!userDoc.exists || userDoc.data().isAdmin !== true) {
      throw new functions.https.HttpsError('permission-denied', '관리자 권한이 필요합니다.');
    }
    const userName = userDoc.data().name || userDoc.data().email || uid;
    const daysBack = Math.min(Math.max(parseInt((data && data.daysBack) || 1, 10) || 1, 1), 14);

    try {
      const result = await ingestCoupangOrders({ daysBack });
      await notifySlack({
        title: `쿠팡 수동 주문 수집 (관리자 ${userName})`,
        level: 'info',
        details:
          `👤 실행자: *${userName}* (\`${uid}\`)\n` +
          `📦 가져옴: ${result.fetched}건 / 신규 ${result.added}건\n` +
          `📅 조회 기간: ${result.range} (daysBack=${daysBack})`,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK,
        titlePrefix: ''
      });
      return result;
    } catch (err) {
      console.error('[COUPANG MANUAL] 실패:', err);
      await notifySlack({
        title: '쿠팡 수동 주문 수집 실패',
        level: 'error',
        details: `👤 ${userName}\n❌ ${err.message}`,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK,
        titlePrefix: ''
      });
      throw new functions.https.HttpsError('internal', err.message);
    }
  });

// =============================================================================
// v2.6 — Cafe24 자사몰 주문 자동 수집
// =============================================================================
//
// OAuth 2.0 + Refresh Token rotation:
//   - Cafe24는 매 토큰 갱신 시 새 refresh_token을 발급함 (rotation)
//   - 따라서 시크릿에 저장된 초기 토큰은 1회용
//   - 이후 토큰은 Firestore의 system/cafe24_token 문서에 저장 + 매 호출 시 갱신
//
// 토큰 만료:
//   - access_token: 2시간
//   - refresh_token: 2주 (사용 시마다 갱신)
//   → 정기 호출(매일 3회)이면 영구 사용 가능
// =============================================================================

const CAFE24_TOKEN_DOC = 'system/cafe24_token';

// Cafe24 토큰 갱신 (refresh_token → 새 access_token + 새 refresh_token)
async function refreshCafe24Token({ mallId, clientId, clientSecret, refreshToken }) {
  const url = `https://${mallId}.cafe24api.com/api/v2/oauth/token`;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', refreshToken);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + basic,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '(unreadable)');
    throw new Error(`Cafe24 토큰 갱신 실패 (${response.status}): ${errorText.slice(0, 400)}`);
  }
  return await response.json();
}

// Cafe24 주문 조회 API 호출
async function fetchCafe24OrdersRaw({ mallId, accessToken, startDate, endDate, limit = 100, offset = 0 }) {
  const url = `https://${mallId}.cafe24api.com/api/v2/admin/orders`
    + `?start_date=${startDate}`
    + `&end_date=${endDate}`
    + `&date_type=order_date`
    + `&limit=${limit}`
    + `&offset=${offset}`
    + `&embed=items,buyer,receivers`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'X-Cafe24-Api-Version': '2026-03-01',
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '(unreadable)');
    throw new Error(`Cafe24 주문 조회 실패 (${response.status}): ${errorText.slice(0, 400)}`);
  }
  return await response.json();
}

// Cafe24 주문 → ERP shopOrders 형식 매핑
function mapCafe24ToErpOrder(c, shopId, shopName) {
  // v2.19 (2026.05): 한 주문에 여러 상품 → 각 상품별 별도 ERP 행 반환 (배열)
  //   기존: 모든 상품을 하나의 행으로 합쳐서 productName 에 ' + ' 로 연결
  //   문제: 매핑 안 됨 + 마진 분석 부정확
  //   해결: items.length 행을 만들어 각 상품을 독립 행으로
  const items = Array.isArray(c.items) ? c.items : [];
  if (items.length === 0) return [];
  const buyer = c.buyer || {};
  const receiver = (Array.isArray(c.receivers) && c.receivers[0]) || c.receiver || {};

  // 주소 조립
  const address = [receiver.address1, receiver.address2].filter(Boolean).join(' ').trim();

  // 상태 (전체 주문 공통)
  const status = c.order_status || '';
  let mappedStatus = '배송 전';
  if (status.startsWith('N40')) mappedStatus = '배송완료';
  else if (status.startsWith('N30')) mappedStatus = '배송중';
  else if (status.startsWith('C')) mappedStatus = '취소';
  else if (status.startsWith('R')) mappedStatus = '반품';

  // 전체 결제 금액 결정 (item 비율 분배용)
  const itemsTotal = items.reduce((s, it) => {
    if (!it) return s;
    const unit = Number(it.product_price) || Number(it.price) || Number(it.option_price) || 0;
    const q = Number(it.quantity) || 1;
    return s + unit * q;
  }, 0);
  const paymentCandidates = [
    Number(c.payment_amount),
    Number(c.actual_payment_amount),
    Number(c.total_pay_amount),
    Number(c.expected_payment_amount),
    Number(c.order_price_amount),
    Number(c.total_payment_amount),
    Number(c.settle_price),
    itemsTotal
  ];
  const totalPaymentAmount = paymentCandidates.find(v => v && v > 0) || 0;

  if (totalPaymentAmount === 0 && c.order_id) {
    console.warn('[CAFE24 DEBUG] 0원 주문 감지:', c.order_id);
  }

  const baseId = Date.now();
  const orderNoBase = String(c.order_id || '');
  const isMultiItem = items.length > 1;

  return items.map((it, idx) => {
    const productName = (it && (it.product_name || it.variant_name)) || '';
    const qty = Number(it && it.quantity) || 1;
    const unitPrice = Number(it && it.product_price) || Number(it && it.price) || Number(it && it.option_price) || 0;
    const itemAmount = unitPrice * qty;
    // 결제 금액 비율 분배
    let itemPaymentAmount;
    if (itemsTotal > 0 && totalPaymentAmount > 0) {
      itemPaymentAmount = Math.round(totalPaymentAmount * itemAmount / itemsTotal);
    } else if (totalPaymentAmount > 0) {
      itemPaymentAmount = Math.round(totalPaymentAmount / items.length);
    } else {
      itemPaymentAmount = itemAmount;
    }
    // orderNo — 다중 상품이면 -1, -2 접미사 (중복 방지 + 같은 주문 식별)
    const orderNo = isMultiItem ? `${orderNoBase}-${idx + 1}` : orderNoBase;
    return {
      id: baseId + Math.floor(Math.random() * 100000) + idx,
      orderNo,
      orderDate: (c.order_date || '').slice(0, 10),
      customerName: buyer.name || '',
      customerPhone: fmtPhoneKr(buyer.cellphone || buyer.phone || ''),
      email: buyer.email || '',
      productName,
      qty,
      paymentAmount: itemPaymentAmount,
      recipientName: receiver.name || '',
      recipientPhone: fmtPhoneKr(receiver.cellphone || receiver.phone || ''),
      zipCode: receiver.zipcode || receiver.postal_code || '',
      address,
      deliveryNote: c.shipping_message || '',
      paymentDate: (c.payment_date || '').slice(0, 10),
      shipDate: (c.shipped_date || '').slice(0, 10),
      shippingFee: idx === 0 ? (Number(c.shipping_fee) || 0) : 0,  // 첫 행에만 배송비
      trackingNo: c.invoice_number || '',
      status: mappedStatus,
      shopId,
      shopName,
      source: 'cafe24_auto',
      cafe24Status: status,
      cafe24OriginalOrderId: orderNoBase,  // 같은 주문 그룹핑용
      cafe24ItemIdx: idx,
      fetchedAt: Date.now()
    };
  });
}

// erp_data/shops에서 자사몰(Cafe24) shop 객체 찾기
async function findCafe24Shop(firestoreDb) {
  const snap = await firestoreDb.doc('erp_data/shops').get();
  if (!snap.exists) return null;
  const raw = snap.data().data;
  let shops = [];
  if (typeof raw === 'string') { try { shops = JSON.parse(raw) || []; } catch (_) {} }
  else if (Array.isArray(raw)) shops = raw;
  const nameMatches = (n) => {
    if (!n) return false;
    const lower = String(n).toLowerCase();
    return n.includes('자사몰') || n.includes('cafe24') || lower.includes('cafe24') || n.includes('Cafe24');
  };
  return shops.find(s => s && nameMatches(s.name)) || null;
}

// Firestore에서 현재 refresh_token 가져오기 (rotation 처리)
async function getCurrentCafe24RefreshToken(firestoreDb) {
  const docRef = firestoreDb.doc(CAFE24_TOKEN_DOC);
  const snap = await docRef.get();
  if (snap.exists && snap.data().refresh_token) {
    return { source: 'firestore', refreshToken: snap.data().refresh_token, updatedAt: snap.data().updatedAt };
  }
  // Firestore에 없으면 시크릿의 초기값 사용
  const initial = (process.env.CAFE24_REFRESH_TOKEN || '').trim();
  if (!initial) throw new Error('CAFE24_REFRESH_TOKEN 시크릿 미설정 + Firestore에도 토큰 없음 — OAuth 콜백 페이지에서 토큰 발급 후 등록 필요');
  return { source: 'secret', refreshToken: initial };
}

// Firestore에 새 refresh_token 저장
async function saveCafe24RefreshToken(firestoreDb, refreshToken) {
  await firestoreDb.doc(CAFE24_TOKEN_DOC).set({
    refresh_token: refreshToken,
    updatedAt: Date.now(),
    updatedAtIso: new Date().toISOString()
  });
}

// 메인 인입 로직
// v2.20: 합쳐진 중복 행 자동 cleanup
//   - 분리된 자식 행 (-1, -2 같은 접미사) 이 있는데 같은 originalOrderId 의 합쳐진 행 (접미사 없음) 도 있으면
//   - 합쳐진 행을 자동 삭제 (v2.19 이전에 들어온 잘못된 데이터)
async function cleanupMergedDuplicates(firestoreDb) {
  const docRef = firestoreDb.doc('erp_data/shopOrders');
  const snap = await docRef.get();
  if (!snap.exists) return { removed: 0, total: 0 };
  let orders = [];
  try { orders = JSON.parse(snap.data().data) || []; } catch (_) { return { removed: 0, total: 0 }; }
  // 분리된 행이 존재하는 originalOrderId 수집
  const splitOriginalIds = new Set();
  for (const o of orders) {
    if (o && o.cafe24OriginalOrderId) {
      splitOriginalIds.add(String(o.cafe24OriginalOrderId));
    }
  }
  if (splitOriginalIds.size === 0) return { removed: 0, total: orders.length };
  // 합쳐진 행 (orderNo 가 분리 origin 과 같은데 cafe24OriginalOrderId 가 없는) 삭제
  const cleaned = orders.filter(o => {
    if (!o) return false;
    if (o.cafe24OriginalOrderId) return true;  // 분리된 자식 행은 유지
    if (splitOriginalIds.has(String(o.orderNo))) {
      console.log('[CLEANUP] 합쳐진 중복 삭제:', o.orderNo, '-', (o.productName||'').slice(0, 50));
      return false;
    }
    return true;
  });
  const removed = orders.length - cleaned.length;
  if (removed > 0) {
    await docRef.set({ data: JSON.stringify(cleaned), ts: Date.now() });
    console.log('[CLEANUP] 합쳐진 중복', removed, '건 자동 삭제 완료');
  }
  return { removed, total: cleaned.length };
}

async function ingestCafe24Orders({ daysBack = 1 } = {}) {
  const mallId = (process.env.CAFE24_MALL_ID || '').trim();
  const clientId = (process.env.CAFE24_CLIENT_ID || '').trim();
  const clientSecret = (process.env.CAFE24_CLIENT_SECRET || '').trim();
  if (!mallId || !clientId || !clientSecret) {
    throw new Error('CAFE24_MALL_ID / CAFE24_CLIENT_ID / CAFE24_CLIENT_SECRET 시크릿 미설정');
  }

  const firestoreDb = admin.firestore();
  const cafe24Shop = await findCafe24Shop(firestoreDb);
  if (!cafe24Shop) {
    throw new Error('쇼핑몰 관리에 "자사몰" 또는 "Cafe24"가 등록되어 있지 않습니다. ERP → 매출 분석 → 쇼핑몰 관리에서 먼저 등록해 주세요.');
  }
  const shopId = cafe24Shop.id;
  const shopName = cafe24Shop.name || '자사몰';

  // 1) 현재 refresh_token 가져오기
  const tokenInfo = await getCurrentCafe24RefreshToken(firestoreDb);
  console.log('[CAFE24] refresh_token 출처:', tokenInfo.source,
    tokenInfo.updatedAt ? `(갱신: ${new Date(tokenInfo.updatedAt).toISOString()})` : '');

  // 2) 토큰 갱신 → access_token + 새 refresh_token
  const tokens = await refreshCafe24Token({
    mallId, clientId, clientSecret,
    refreshToken: tokenInfo.refreshToken
  });
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Cafe24 토큰 응답 비정상: ' + JSON.stringify(tokens).slice(0, 300));
  }
  // 새 refresh_token 즉시 Firestore에 저장 (rotation)
  await saveCafe24RefreshToken(firestoreDb, tokens.refresh_token);
  console.log('[CAFE24] 새 refresh_token Firestore 저장 완료');

  // 3) 주문 조회 (KST 기준)
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000);
  const fromDate = new Date(todayKst); fromDate.setDate(fromDate.getDate() - daysBack);
  const startDate = fromDate.toISOString().slice(0, 10);
  const endDate = todayKst.toISOString().slice(0, 10);

  // 페이지네이션 (limit 100씩)
  let allOrders = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const resp = await fetchCafe24OrdersRaw({
      mallId, accessToken: tokens.access_token, startDate, endDate, limit, offset
    });
    const list = (resp && Array.isArray(resp.orders)) ? resp.orders : [];
    allOrders = allOrders.concat(list);
    if (list.length < limit) break;
    offset += limit;
    if (offset > 5000) { console.warn('[CAFE24] 페이지 5000건 초과 — 안전을 위해 중단'); break; }
  }
  console.log('[CAFE24] 가져온 주문:', allOrders.length, '건');

  // v2.8: 응답을 active/취소·반품으로 분리
  const activeOrders = [];
  const canceledIds = new Set();
  for (const c of allOrders) {
    const status = (c && c.order_status) || '';
    if (status.startsWith('C') || status.startsWith('R')) {
      if (c && c.order_id) canceledIds.add(String(c.order_id));
    } else {
      activeOrders.push(c);
    }
  }
  console.log('[CAFE24] active:', activeOrders.length, '건 / 취소·반품:', canceledIds.size, '건');

  // 4) ERP 형식 매핑 + Firestore 머지
  const erpOrders = activeOrders.flatMap(c => mapCafe24ToErpOrder(c, shopId, shopName));  // v2.19: 다중 상품 분리
  // v2.7: 매핑 자동 적용
  const mappingResult = await applyProductMappingsToOrders(firestoreDb, erpOrders, shopId);
  console.log('[CAFE24] 매핑 자동 적용:', mappingResult.mapped, '건');
  const merge = await mergeOrdersIntoFirestore(firestoreDb, erpOrders);

  // v2.20: 합쳐진 중복 행 자동 cleanup (v2.19 이전 잘못 합쳐진 데이터 정리)
  let cleanup = { removed: 0, total: merge.total };
  try {
    cleanup = await cleanupMergedDuplicates(firestoreDb);
    if (cleanup.removed > 0) console.log('[CAFE24] cleanup:', cleanup.removed, '건 자동 정리됨');
  } catch (e) { console.warn('[CAFE24] cleanup 실패:', e.message); }

  // v2.18: 자동 취소/반품 삭제 비활성화 — 사용자 요청으로 수동 처리 전환
  //   (canceledIds는 ERP에 추가하지 않고 그대로 무시. 기존 ERP 주문은 유저가 수동으로 삭제)
  if (canceledIds.size > 0) {
    console.log('[CAFE24] 취소/반품 무시 (자동 삭제 비활성):', canceledIds.size, '건');
  }

  return {
    fetched: allOrders.length,
    added: merge.added,
    cleanedUp: cleanup.removed,
    total: cleanup.total || merge.total,
    range: `${startDate} ~ ${endDate}`,
    sampleNew: merge.sampleNew.map(o => ({
      orderNo: o.orderNo, customer: o.customerName, product: o.productName, qty: o.qty, amount: o.paymentAmount
    }))
  };
}

// ─────────────────────────────────────────────────────────────
// 6) Cafe24 자동 수집 — KST 9/13/18시 (쿠팡과 동일 스케줄)
// ─────────────────────────────────────────────────────────────
// v2.19: PlusCL 전환 — 자사몰(Cafe24) 자동 크롤러 비활성(export 제거 → 배포 시 삭제).
const _off_fetchCafe24Orders = functions
  .region(REGION)
  .runWith({
    secrets: ['CAFE24_MALL_ID', 'CAFE24_CLIENT_ID', 'CAFE24_CLIENT_SECRET', 'CAFE24_REFRESH_TOKEN', 'SLACK_ORDERS_WEBHOOK'],
    timeoutSeconds: 300,
    memory: '256MB'
    // Cafe24는 IP 화이트리스트 없음 → vpcConnector 불필요
  })
  .pubsub.schedule('0 9,13,18 * * *')
  .timeZone('Asia/Seoul')
  .onRun(async (context) => {
    try {
      const result = await ingestCafe24Orders({ daysBack: 1 });
      const sampleText = result.sampleNew.length
        ? '\n\n*신규 주문 샘플:*\n' + result.sampleNew.map(s =>
            `• ${s.orderNo} — ${s.customer || '-'} / ${s.product || '-'} × ${s.qty || 1}개 / ₩${(s.amount || 0).toLocaleString()}`
          ).join('\n')
        : '';
      // v2.18: 자동 취소 비활성화 — removedText 제거
      const titleText = result.added > 0 ? `신규 ${result.added}건` : '신규 없음';
      await notifySlack({
        title: `자사몰(Cafe24) 자동 주문 수집 — ${titleText}`,
        level: result.added > 0 ? 'success' : 'info',
        details:
          `📦 가져옴: ${result.fetched}건\n` +
          `✅ 신규 추가: ${result.added}건\n` +
          `📅 조회 기간: ${result.range}` + sampleText,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK,
        titlePrefix: ''
      });
      console.log('[CAFE24 SCHED] 성공:', JSON.stringify(result));
      return result;
    } catch (err) {
      console.error('[CAFE24 SCHED] 실패:', err);
      await notifySlack({
        title: '자사몰(Cafe24) 자동 주문 수집 실패',
        level: 'error',
        details: `❌ 오류: ${err.message}\n\n` +
          `*확인 사항:*\n` +
          `1. <https://console.firebase.google.com/project/${PROJECT_ID}/functions/logs|Functions 로그>\n` +
          `2. Refresh Token 만료 가능성 — OAuth 콜백 페이지에서 재발급 후 firestoreDb의 system/cafe24_token 갱신\n` +
          `3. ERP 쇼핑몰 관리에 "자사몰" 또는 "Cafe24" 등록 확인`,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK,
        titlePrefix: ''
      });
      throw err;
    }
  });

// ─────────────────────────────────────────────────────────────
// 7) Cafe24 수동 트리거 — 테스트/즉시 수집용
// ─────────────────────────────────────────────────────────────
exports.manualFetchCafe24Orders = functions
  .region(REGION)
  .runWith({
    secrets: ['CAFE24_MALL_ID', 'CAFE24_CLIENT_ID', 'CAFE24_CLIENT_SECRET', 'CAFE24_REFRESH_TOKEN', 'SLACK_ORDERS_WEBHOOK'],
    timeoutSeconds: 300,
    memory: '256MB'
  })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', '로그인이 필요합니다.');
    }
    const uid = context.auth.uid;
    const userDoc = await admin.firestore().doc(`users/${uid}`).get();
    if (!userDoc.exists || userDoc.data().isAdmin !== true) {
      throw new functions.https.HttpsError('permission-denied', '관리자 권한이 필요합니다.');
    }
    const userName = userDoc.data().name || userDoc.data().email || uid;
    const daysBack = Math.min(Math.max(parseInt((data && data.daysBack) || 1, 10) || 1, 1), 30);

    try {
      const result = await ingestCafe24Orders({ daysBack });
      await notifySlack({
        title: `자사몰(Cafe24) 수동 주문 수집 (관리자 ${userName})`,
        level: 'info',
        details:
          `👤 실행자: *${userName}* (\`${uid}\`)\n` +
          `📦 가져옴: ${result.fetched}건 / 신규 ${result.added}건\n` +
          `📅 조회 기간: ${result.range} (daysBack=${daysBack})`,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK,
        titlePrefix: ''
      });
      return result;
    } catch (err) {
      console.error('[CAFE24 MANUAL] 실패:', err);
      await notifySlack({
        title: '자사몰(Cafe24) 수동 주문 수집 실패',
        level: 'error',
        details: `👤 ${userName}\n❌ ${err.message}`,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK,
        titlePrefix: ''
      });
      throw new functions.https.HttpsError('internal', err.message);
    }
  });

// =============================================================================
// v2.16 — 네이버 스마트스토어(커머스API) 주문 자동 수집 → ERP shopOrders
// =============================================================================
//   인증: 애플리케이션ID/시크릿 → bcrypt 전자서명 → oauth2/token(client_credentials)
//   조회: 변경 상품주문(last-changed-statuses) 폴링 → 상세조회(product-orders/query)
//   적재: erp_data/shopOrders 에 runTransaction 으로 dedupe append (source:'smartstore_auto')
//   멱등: orderNo(상품주문ID)+customerName 중복 skip + system/smartstore_state 처리이력
//   시크릿: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (Secret Manager) — ERP Firestore 저장 금지
// =============================================================================

const NAVER_API_BASE   = 'https://api.commerce.naver.com';
const SS_STATE_DOC      = 'system/smartstore_state';   // {processedIds[], lastPolledAt}
const SS_PROCESSED_CAP  = 8000;

// 모듈 전역 토큰 캐시 (콜드스타트 시 재발급)
let _ssTokenCache = { token: '', exp: 0 };

// 네이버 전자서명 (bcrypt) → base64
function naverSign(clientId, clientSecret, timestampMs) {
  const pwd = `${clientId}_${timestampMs}`;
  const hashed = bcrypt.hashSync(pwd, clientSecret);   // clientSecret 자체가 bcrypt salt($2a$..)
  return Buffer.from(hashed, 'utf-8').toString('base64');
}

// 액세스 토큰 발급 (client_credentials, type=SELF)
async function naverGetToken(clientId, clientSecret) {
  const now = Date.now();
  if (_ssTokenCache.token && now < _ssTokenCache.exp - 60000) return _ssTokenCache.token;

  const ts = now;
  const sign = naverSign(clientId, clientSecret, ts);
  const body = new URLSearchParams({
    client_id: clientId,
    timestamp: String(ts),
    grant_type: 'client_credentials',
    client_secret_sign: sign,
    type: 'SELF'
  });
  const resp = await fetch(`${NAVER_API_BASE}/external/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '(body unreadable)');
    throw new Error(`네이버 토큰 발급 ${resp.status}: ${t.slice(0, 400)}`);
  }
  const j = await resp.json();
  if (!j.access_token) throw new Error('네이버 토큰 응답에 access_token 없음: ' + JSON.stringify(j).slice(0, 300));
  const ttl = (Number(j.expires_in) || 10800) * 1000;   // 보통 3시간
  _ssTokenCache = { token: j.access_token, exp: now + ttl };
  return j.access_token;
}

// KST '+09:00' ISO8601 (lastChangedFrom 용)
function naverKstIso(ms) {
  const k = new Date(ms + 9 * 3600 * 1000);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}T${p(k.getUTCHours())}:${p(k.getUTCMinutes())}:${p(k.getUTCSeconds())}.000+09:00`;
}

// ISO → 'YYYY-MM-DD HH:MM' (KST, 분까지) — ERP가 시간 표시
function naverToKstMinute(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 16).replace('T', ' ');
  return d.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);  // 'YYYY-MM-DD HH:MM'
}

// 변경 상품주문 폴링 (lastChangedFrom 이후) — moreSequence 페이지네이션
async function naverFetchChangedProductOrderIds(token, fromMs) {
  const ids = new Set();
  let moreSequence = null;
  let guard = 0;
  do {
    const qs = new URLSearchParams({ lastChangedFrom: naverKstIso(fromMs) });
    if (moreSequence) qs.set('moreSequence', moreSequence);
    const resp = await fetch(`${NAVER_API_BASE}/external/v1/pay-order/seller/product-orders/last-changed-statuses?${qs.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(`변경주문 조회 ${resp.status}: ${t.slice(0, 400)}`);
    }
    const j = await resp.json();
    const data = j && j.data ? j.data : {};
    const list = Array.isArray(data.lastChangeStatuses) ? data.lastChangeStatuses : [];
    for (const x of list) { if (x && x.productOrderId) ids.add(String(x.productOrderId)); }
    moreSequence = data.more ? data.moreSequence : null;
    guard++;
  } while (moreSequence && guard < 30);
  return Array.from(ids);
}

// 상세조회 (productOrderIds → 상세) — 최대 300개씩
async function naverQueryProductOrders(token, productOrderIds) {
  const out = [];
  for (let i = 0; i < productOrderIds.length; i += 300) {
    const chunk = productOrderIds.slice(i, i + 300);
    const resp = await fetch(`${NAVER_API_BASE}/external/v1/pay-order/seller/product-orders/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ productOrderIds: chunk })
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(`상세조회 ${resp.status}: ${t.slice(0, 400)}`);
    }
    const j = await resp.json();
    const data = (j && Array.isArray(j.data)) ? j.data : [];
    for (const e of data) out.push(e);
  }
  return out;
}

// 네이버 상품주문 상태 → ERP status
function mapNaverStatus(s) {
  switch (String(s || '').toUpperCase()) {
    case 'PAYMENT_WAITING': case 'PLACE_ORDER': case 'PAYED': return '배송 전';
    case 'DELIVERING': case 'DISPATCHED': return '배송중';
    case 'DELIVERED': case 'PURCHASE_DECIDED': return '배송완료';
    case 'CANCELED': case 'CANCELED_BY_NOPAYMENT': return '취소';
    case 'RETURNED': return '반품';
    default: return '배송 전';
  }
}

// 네이버 상세조회 1건(e = {order, productOrder}) → ERP shopOrders 객체 (브리핑 §2 데이터계약)
function mapNaverToErpOrder(e, shopId, shopName) {
  const order = e.order || {};
  const po = e.productOrder || {};
  const ship = po.shippingAddress || {};
  const productOrderId = String(po.productOrderId || e.productOrderId || '');
  const opt = po.productOption || po.optionCode || '';
  const productName = (po.productName || '') + (opt ? ` [${opt}]` : '');
  const amount = Number(po.totalPaymentAmount || po.totalProductAmount || po.unitPrice || 0) || 0;
  return {
    id: 'ss_' + productOrderId,
    orderNo: productOrderId,                         // 상품주문번호(전역고유)
    orderDate: naverToKstMinute(order.orderDate || po.orderDate || ''),   // 시간 포함
    customerName: order.ordererName || '',
    customerPhone: fmtPhoneKr(order.ordererTel || order.ordererTelNo || ''),
    email: '',
    productName,
    qty: Number(po.quantity) || 1,
    paymentAmount: amount,
    recipientName: ship.name || '',
    recipientPhone: fmtPhoneKr(ship.tel1 || ship.tel2 || ''),
    zipCode: ship.zipCode || '',
    address: `${ship.baseAddress || ''} ${ship.detailedAddress || ''}`.trim(),
    deliveryNote: po.shippingMemo || ship.shippingMemo || '',
    paymentDate: (order.paymentDate || '').slice(0, 10),
    shipDate: '',
    shippingFee: Number(po.deliveryFeeAmount) || 0,
    trackingNo: po.trackingNumber || '',
    status: mapNaverStatus(po.productOrderStatus),
    shopId,
    shopName,                                         // '스마트스토어'
    source: 'smartstore_auto',
    smartstoreStatus: po.productOrderStatus || '',
    cafe24OriginalOrderId: String(order.orderId || ''),  // 다상품 묶음 그룹핑(ERP 필드 재사용)
    fetchedAt: Date.now(),
  };
}

// erp_data/shops 에서 스마트스토어 shop 찾기
async function findSmartstoreShop(firestoreDb) {
  const snap = await firestoreDb.doc('erp_data/shops').get();
  if (!snap.exists) return null;
  const raw = snap.data().data;
  let shops = [];
  if (typeof raw === 'string') { try { shops = JSON.parse(raw) || []; } catch (_) {} }
  else if (Array.isArray(raw)) shops = raw;
  const m = (n) => {
    if (!n) return false; const l = String(n).toLowerCase();
    return n.includes('스마트스토어') || l.includes('smartstore') || n.includes('네이버') || l.includes('naver');
  };
  return shops.find(s => s && m(s.name)) || null;
}

// 처리이력 상태 로드/저장 (perma: 한번 적재한 productOrderId 는 재삽입 안 함 = 사용자 삭제 존중)
async function ssLoadState(db) {
  const snap = await db.doc(SS_STATE_DOC).get();
  if (!snap.exists) return { processedIds: [], lastPolledAt: 0 };
  const d = snap.data() || {};
  return { processedIds: Array.isArray(d.processedIds) ? d.processedIds : [], lastPolledAt: Number(d.lastPolledAt) || 0 };
}
async function ssSaveState(db, processedIds, lastPolledAt) {
  const capped = processedIds.slice(-SS_PROCESSED_CAP);
  await db.doc(SS_STATE_DOC).set({ processedIds: capped, lastPolledAt, ts: Date.now() }, { merge: true });
}

// shopOrders 트랜잭션 머지 (read→dedupe→write) — 브리핑 §4
async function mergeSmartstoreOrdersTx(db, newOrders, processedSet) {
  const ref = db.doc('erp_data/shopOrders');
  let added = 0, sampleNew = [];
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let existing = [];
    if (snap.exists) {
      const raw = snap.data().data;
      if (typeof raw === 'string') { try { existing = JSON.parse(raw) || []; } catch (_) {} }
      else if (Array.isArray(raw)) existing = raw;
    }
    const keyset = new Set(existing.map(o => String(o.orderNo) + '|' + (o.customerName || '')));
    const trulyNew = [];
    for (const o of newOrders) {
      const key = String(o.orderNo) + '|' + (o.customerName || '');
      if (keyset.has(key)) continue;                 // 이미 존재
      if (processedSet.has(String(o.orderNo))) continue;  // 과거 적재분(사용자 삭제 가능) → 재삽입 금지
      keyset.add(key); trulyNew.push(o);
    }
    if (trulyNew.length) tx.set(ref, { data: JSON.stringify(existing.concat(trulyNew)), ts: Date.now() });
    added = trulyNew.length; sampleNew = trulyNew.slice(0, 3);
  });
  return { added, sampleNew };
}

// 메인 인입 로직
async function ingestSmartstoreOrders({ minutesBack = 30 } = {}) {
  const clientId = (process.env.NAVER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.NAVER_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 시크릿 미설정');

  const db = admin.firestore();
  const shop = await findSmartstoreShop(db);
  if (!shop) throw new Error('쇼핑몰 관리에 "스마트스토어"가 등록되어 있지 않습니다. ERP에서 먼저 등록해주세요.');
  const shopId = shop.id;
  const shopName = shop.name || '스마트스토어';

  const state = await ssLoadState(db);
  // 폴링 시작점: 마지막 폴링 -5분 겹침, 없으면 minutesBack 전. 24h 초과 방지.
  const overlap = 5 * 60 * 1000;
  let fromMs = state.lastPolledAt ? (state.lastPolledAt - overlap) : (Date.now() - minutesBack * 60 * 1000);
  const minFrom = Date.now() - 24 * 3600 * 1000 + 60000;
  if (fromMs < minFrom) fromMs = minFrom;

  const token = await naverGetToken(clientId, clientSecret);
  const changedIds = await naverFetchChangedProductOrderIds(token, fromMs);
  if (changedIds.length === 0) {
    await ssSaveState(db, state.processedIds, Date.now());
    return { fetched: 0, added: 0, range: `${naverKstIso(fromMs)} ~ now`, sampleNew: [] };
  }

  const details = await naverQueryProductOrders(token, changedIds);
  const erpOrders = details.map(e => mapNaverToErpOrder(e, shopId, shopName)).filter(o => o.orderNo);

  // 자동 상품 매핑 적용 (쿠팡/Cafe24와 동일 헬퍼 재사용)
  try { await applyProductMappingsToOrders(db, erpOrders, shopId); } catch (e) { console.warn('[SS] 매핑 적용 실패:', e.message); }

  const processedSet = new Set(state.processedIds.map(String));
  const merge = await mergeSmartstoreOrdersTx(db, erpOrders, processedSet);

  // 처리이력 갱신: 이번에 조회된 모든 상품주문ID 를 처리완료로 기록 (재삽입 방지)
  const newProcessed = Array.from(new Set(state.processedIds.concat(erpOrders.map(o => String(o.orderNo)))));
  await ssSaveState(db, newProcessed, Date.now());

  return {
    fetched: erpOrders.length,
    added: merge.added,
    range: `${naverKstIso(fromMs)} ~ now`,
    sampleNew: merge.sampleNew.map(o => ({ orderNo: o.orderNo, customer: o.customerName, product: o.productName, qty: o.qty, amount: o.paymentAmount }))
  };
}

// ─────────────────────────────────────────────────────────────
// 스마트스토어 자동 수집 — 10분마다 (KST)
// ─────────────────────────────────────────────────────────────
// v2.19: PlusCL 전환 — 스마트스토어 자동 크롤러 비활성(export 제거 → 배포 시 삭제).
const _off_fetchSmartstoreOrders = functions
  .region(REGION)
  .runWith({
    secrets: ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'SLACK_ORDERS_WEBHOOK'],
    timeoutSeconds: 240,
    memory: '256MB',
    vpcConnector: 'erp-coupang-vpc-conn',
    vpcConnectorEgressSettings: 'ALL_TRAFFIC'
  })
  .pubsub.schedule('*/10 * * * *')
  .timeZone('Asia/Seoul')
  .onRun(async () => {
    try {
      const result = await ingestSmartstoreOrders({ minutesBack: 30 });
      if (result.added > 0) {
        const sampleText = result.sampleNew.length
          ? '\n\n*신규 주문 샘플:*\n' + result.sampleNew.map(s => `• ${s.orderNo} — ${s.customer || '-'} / ${s.product || '-'} × ${s.qty || 1}개 / ₩${(s.amount || 0).toLocaleString()}`).join('\n')
          : '';
        await notifySlack({
          title: `스마트스토어 자동 주문 수집 — 신규 ${result.added}건`,
          level: 'success',
          details: `📦 가져옴: ${result.fetched}건\n✅ 신규 추가: ${result.added}건${sampleText}`,
          webhookOverride: process.env.SLACK_ORDERS_WEBHOOK,
          titlePrefix: ''
        });
      }
      console.log('[SMARTSTORE SCHED] 성공:', JSON.stringify(result));
      return result;
    } catch (err) {
      console.error('[SMARTSTORE SCHED] 실패:', err);
      await notifySlack({
        title: '스마트스토어 자동 주문 수집 실패',
        level: 'error',
        details: `❌ 오류: ${err.message}\n\n*확인:* 1) NAVER_CLIENT_ID/SECRET 시크릿  2) 커머스API 권한(상품주문 조회)  3) Functions 로그`,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK,
        titlePrefix: ''
      });
      throw err;
    }
  });

// ─────────────────────────────────────────────────────────────
// 스마트스토어 수동 트리거 (관리자) — 테스트/즉시 수집
// ─────────────────────────────────────────────────────────────
exports.manualFetchSmartstoreOrders = functions
  .region(REGION)
  .runWith({
    secrets: ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'SLACK_ORDERS_WEBHOOK'],
    timeoutSeconds: 240,
    memory: '256MB',
    vpcConnector: 'erp-coupang-vpc-conn',
    vpcConnectorEgressSettings: 'ALL_TRAFFIC'
  })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인이 필요합니다.');
    const uid = context.auth.uid;
    const userDoc = await admin.firestore().doc(`users/${uid}`).get();
    if (!userDoc.exists || userDoc.data().isAdmin !== true) {
      throw new functions.https.HttpsError('permission-denied', '관리자 권한이 필요합니다.');
    }
    const userName = userDoc.data().name || userDoc.data().email || uid;
    const minutesBack = Math.min(Math.max(parseInt((data && data.minutesBack) || 1440, 10) || 1440, 10), 1440);
    try {
      const result = await ingestSmartstoreOrders({ minutesBack });
      await notifySlack({
        title: `스마트스토어 수동 주문 수집 (관리자 ${userName})`,
        level: 'info',
        details: `👤 ${userName}\n📦 가져옴 ${result.fetched}건 / 신규 ${result.added}건\n📅 ${result.range}`,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK,
        titlePrefix: ''
      });
      return result;
    } catch (err) {
      console.error('[SMARTSTORE MANUAL] 실패:', err);
      throw new functions.https.HttpsError('internal', err.message);
    }
  });

// =============================================================================
// v2.19 — PlusCL(3PL 물류) 배송정보 자동 수집 → ERP shopOrders
//   기존 쿠팡/자사몰/스마트스토어 개별 크롤링을 대체. 각 쇼핑몰 주문이 PlusCL 에
//   물류 위탁되며, 여기서 '주문 출고 내역'(출고완료)을 가져와 shopOrders 로 적재.
//   쇼핑몰 구분 = ord_comp_name(주문사 명) → 쿠팡/스마트스토어/자사몰 태깅.
//
//   ⚠️ 요청 형식(경로/job_type/type/날짜 파라미터)은 PDF에 응답 스펙만 있어 best-effort.
//      배포 후 manualFetchPlusclShipments 로 테스트하며 아래 PLUSCL_REQ 상수를 조정.
//   시크릿: PLUSCL_AUTH_KEY  (값: 인증키)
// =============================================================================
const PLUSCL_BASE = 'https://service.pluscl.com';
// ── 요청 파라미터(테스트로 조정할 값) ─ '(미확인)'은 실제 응답 보고 맞춤 ──────
// ✅ v2.19c: 실제 API 호출로 확정(2026-07 검증). base_data 조회로 확보한 르니브 코드 사용.
const PLUSCL_REQ = {
  fullUrl: 'https://service.pluscl.com/open/order_report',  // 주문 레포트 엔드포인트
  company_code: 'F103',                           // 업체코드(=화주코드)
  warehouse_code: 'GLXY',                         // 더갤럭시펫 창고 (base_data warehouse_type 조회 확인)
  warehouse_type_code: '0000',                    // 적치존
  seller_code: 'F103',                            // 화주사 코드(르니브_화장품, seller_id 8276)
  job_type: 'search',                             // 조회구분 고정
  type: 'out',                                    // out=출고 내역 (order=접수, cancel=취소 …)
};

function plusclDateStr(d) {
  // yyyymmdd (KST)
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10).replace(/-/g, '');
}

// PlusCL 주문사명(ord_comp_name) → ERP 쇼핑몰명
// ord_comp_name 실제 값 = PlusCL CL_comp_name (앱 etc_company_code.json 확인):
//   K034 쿠팡 / K000 자사주문 / K012 카페24 / K032 스토어팜 / K033 네이버체크아웃 등.
function plusclMallName(ordCompName) {
  const n = String(ordCompName || '');
  const lower = n.toLowerCase();
  if (n.includes('쿠팡') || lower.includes('coupang') || lower.includes('rocket')) return '쿠팡';
  if (n.includes('스마트') || n.includes('네이버') || n.includes('스토어팜') || lower.includes('smartstore') || lower.includes('naver') || lower.includes('storefarm')) return '스마트스토어';
  if (n.includes('자사') || n.includes('카페24') || n.includes('메이크샵') || n.includes('고도몰') || n.includes('아임웹') || lower.includes('cafe24') || n.includes('와디즈') || n.includes('르니브')) return '자사몰';
  return n || '기타';
}

async function findShopByName(firestoreDb, name) {
  const snap = await firestoreDb.doc('erp_data/shops').get();
  if (!snap.exists) return null;
  const raw = snap.data().data;
  let shops = [];
  if (typeof raw === 'string') { try { shops = JSON.parse(raw) || []; } catch (_) {} }
  else if (Array.isArray(raw)) shops = raw;
  const target = String(name || '');
  return shops.find(s => s && s.name && (s.name === target || s.name.includes(target) || target.includes(s.name))) || null;
}

// PlusCL API 호출 (주문 출고 내역) — 상세 로깅으로 테스트 시 스펙 조정 용이
async function plusclFetchShipments({ sDate, eDate }) {
  const authKey = (process.env.PLUSCL_AUTH_KEY || '').trim();
  if (!authKey) throw new Error('PLUSCL_AUTH_KEY 시크릿 미설정');
  const url = PLUSCL_REQ.fullUrl;
  const all = [];
  // 페이지당 최대 1,000건 → 1,000 이면 다음 페이지 조회(문서 규정). 안전 상한 50페이지.
  let page = 1;
  while (page <= 50) {
    const body = {
      company_code: PLUSCL_REQ.company_code,
      warehouse_code: PLUSCL_REQ.warehouse_code,
      warehouse_type_code: PLUSCL_REQ.warehouse_type_code,
      seller_code: PLUSCL_REQ.seller_code,
      job_type: PLUSCL_REQ.job_type,
      type: PLUSCL_REQ.type,
      data: { begin_date: sDate, end_date: eDate, page: String(page) },
    };
    if (page === 1) { console.log('[PLUSCL] 요청 URL:', url); console.log('[PLUSCL] 요청 body:', JSON.stringify(body)); }
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'auth_key': authKey },
      body: JSON.stringify(body),
    });
    const textBody = await resp.text();
    let json = null;
    try { json = JSON.parse(textBody); }
    catch (_) { throw new Error(`PlusCL 응답 JSON 파싱 실패 (status ${resp.status}, page ${page}): ${textBody.slice(0, 200)}`); }
    if (json && json.r_code !== undefined && String(json.r_code) !== '0') {
      throw new Error(`PlusCL 오류 r_code=${json.r_code} r_msg=${json.r_msg || ''}`);
    }
    const rows = Array.isArray(json && json.data) ? json.data : [];
    console.log(`[PLUSCL] page ${page}: ${rows.length}건`);
    all.push(...rows);
    if (rows.length < 1000) break;   // 마지막 페이지
    page++;
  }
  return all;
}

// PlusCL 출고행 → ERP shopOrders 객체
function mapPlusclToErpOrder(r, shopId, shopName) {
  const ordNo = String(r.ord_no1 || r.ord_inner_seq || '');
  const itemSeq = Number(r.item_seq) || 1;
  const uid = String(r.ord_inner_seq || ordNo) + '_' + itemSeq;
  const prodName = [r.item_name || r.ord_item_name || '', r.option_name || r.ord_item_opt1 || ''].filter(Boolean).join(' ').trim();
  const shipDt = String(r.regdatetime || '');   // yyyymmddhhnnss (출고완료일시)
  const shipDate = shipDt.length >= 8 ? `${shipDt.slice(0,4)}-${shipDt.slice(4,6)}-${shipDt.slice(6,8)}` : '';
  const ordDate = String(r.ord_date || '');       // yyyymmdd
  const orderDate = ordDate.length >= 8 ? `${ordDate.slice(0,4)}-${ordDate.slice(4,6)}-${ordDate.slice(6,8)}` : '';
  const hasInvoice = !!(r.invoice_no && String(r.invoice_no).trim());
  return {
    id: Date.now() + Math.floor(Math.random() * 100000),
    orderNo: itemSeq > 1 ? (ordNo + '-' + itemSeq) : ordNo,
    cafe24OriginalOrderId: ordNo,                 // 다상품 그룹핑(ERP 중복정리 호환)
    orderDate: orderDate,
    customerName: r.ord_name || r.rcv_name || '',
    customerPhone: fmtPhoneKr(r.ord_hp || r.ord_tel || ''),
    email: r.ord_email || '',
    productName: prodName,
    qty: Number(r.qty) || 1,
    paymentAmount: Number(r.amount) || ((Number(r.sell_price) || 0) * (Number(r.qty) || 1)) || 0,
    recipientName: r.rcv_name || '',
    recipientPhone: fmtPhoneKr(r.rcv_hp || r.rcv_tel || ''),
    zipCode: r.rcv_zipno || '',
    address: r.rcv_addr || '',
    deliveryNote: r.ord_memo || '',
    paymentDate: '',
    shipDate: shipDate,
    shippingFee: Number(r.fare_price) || 0,
    trackingNo: String(r.invoice_no || ''),
    status: hasInvoice ? '배송완료' : '배송 전',
    shopId: shopId || '',
    shopName: shopName,
    source: 'pluscl_auto',
    plusclUid: uid,                               // 멱등 dedupe 키(내부 주문번호+상품순번)
    plusclOrdCompName: r.ord_comp_name || '',
    plusclTranCode: r.tran_comp_code || '',
    fetchedAt: Date.now(),
  };
}

// PlusCL 전용 머지 — plusclUid 로 dedupe(몰 orderNo 충돌 무관, 재폴링 중복 방지)
async function mergePlusclOrders(firestoreDb, newOrders) {
  const docRef = firestoreDb.doc('erp_data/shopOrders');
  const snap = await docRef.get();
  let existing = [];
  if (snap.exists) {
    const raw = snap.data().data;
    if (typeof raw === 'string') { try { existing = JSON.parse(raw) || []; } catch (_) {} }
    else if (Array.isArray(raw)) existing = raw;
  }
  const seenUid = new Set(existing.filter(o => o && o.plusclUid).map(o => String(o.plusclUid)));
  const trulyNew = newOrders.filter(o => o.plusclUid && !seenUid.has(String(o.plusclUid)));
  if (trulyNew.length === 0) return { added: 0, total: existing.length, sampleNew: [] };
  const merged = existing.concat(trulyNew);
  await docRef.set({ data: JSON.stringify(merged), ts: Date.now() });
  return { added: trulyNew.length, total: merged.length, sampleNew: trulyNew.slice(0, 3) };
}

// 메인 인입 로직
async function ingestPlusclShipments({ daysBack = 1 } = {}) {
  const now = new Date();
  const from = new Date(now); from.setDate(from.getDate() - daysBack);
  const sDate = plusclDateStr(from);
  const eDate = plusclDateStr(now);
  const rows = await plusclFetchShipments({ sDate, eDate });
  console.log('[PLUSCL] 수신 행수:', rows.length);
  const firestoreDb = admin.firestore();
  const shopCache = {};
  const erpOrders = [];
  for (const r of rows) {
    const mall = plusclMallName(r.ord_comp_name);
    if (!(mall in shopCache)) {
      const shop = await findShopByName(firestoreDb, mall);
      shopCache[mall] = shop ? { id: shop.id, name: shop.name } : { id: '', name: mall };
    }
    const sc = shopCache[mall];
    erpOrders.push(mapPlusclToErpOrder(r, sc.id, sc.name));
  }
  // 쇼핑몰별 상품 매핑 자동 적용(가능한 경우)
  try {
    for (const mall of Object.keys(shopCache)) {
      const sid = shopCache[mall].id;
      if (sid) await applyProductMappingsToOrders(firestoreDb, erpOrders.filter(o => o.shopId === sid), sid);
    }
  } catch (e) { console.warn('[PLUSCL] 매핑 적용 실패:', e.message); }
  const merge = await mergePlusclOrders(firestoreDb, erpOrders);
  const byMall = {};
  erpOrders.forEach(o => { byMall[o.shopName] = (byMall[o.shopName] || 0) + 1; });
  return {
    fetched: erpOrders.length,
    added: merge.added,
    total: merge.total,
    range: `${sDate} ~ ${eDate}`,
    byMall,
    sampleNew: merge.sampleNew.map(o => ({ orderNo: o.orderNo, mall: o.shopName, customer: o.customerName, product: o.productName, qty: o.qty, amount: o.paymentAmount, tracking: o.trackingNo })),
  };
}

// 스케줄: 매일 KST 16:00 (하루 1회) — 슬랙 요약 1건
exports.fetchPlusclShipments = functions
  .region(REGION)
  .runWith({ secrets: ['PLUSCL_AUTH_KEY', 'SLACK_ORDERS_WEBHOOK'], timeoutSeconds: 300, memory: '256MB' })
  .pubsub.schedule('0 16 * * *')
  .timeZone('Asia/Seoul')
  .onRun(async () => {
    try {
      const result = await ingestPlusclShipments({ daysBack: 1 });
      const mallText = Object.keys(result.byMall).length
        ? '\n\n*쇼핑몰별:* ' + Object.entries(result.byMall).map(([m, c]) => `${m} ${c}건`).join(' · ') : '';
      const sampleText = result.sampleNew.length
        ? '\n\n*신규 샘플:*\n' + result.sampleNew.map(s => `• [${s.mall}] ${s.orderNo} — ${s.customer || '-'} / ${s.product || '-'} ×${s.qty} / 송장 ${s.tracking || '-'}`).join('\n') : '';
      await notifySlack({
        title: `물류(PlusCL) 배송정보 수집 — 신규 ${result.added}건`,
        level: result.added > 0 ? 'success' : 'info',
        details: `📦 가져옴 ${result.fetched}건 / ✅ 신규 ${result.added}건\n📅 ${result.range}` + mallText + sampleText,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK,
        titlePrefix: ''
      });
      console.log('[PLUSCL SCHED] 성공:', JSON.stringify(result));
      return result;
    } catch (err) {
      console.error('[PLUSCL SCHED] 실패:', err);
      await notifySlack({
        title: '물류(PlusCL) 배송정보 수집 실패',
        level: 'error',
        details: `❌ ${err.message}\n\n<https://console.firebase.google.com/project/${PROJECT_ID}/functions/logs|Functions 로그 확인>`,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK,
        titlePrefix: ''
      });
      throw err;
    }
  });

// 수동 트리거(관리자) — 테스트/즉시 수집. daysBack 1~31 (기본 3)
exports.manualFetchPlusclShipments = functions
  .region(REGION)
  .runWith({ secrets: ['PLUSCL_AUTH_KEY', 'SLACK_ORDERS_WEBHOOK'], timeoutSeconds: 300, memory: '256MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인이 필요합니다.');
    const uid = context.auth.uid;
    const userDoc = await admin.firestore().doc(`users/${uid}`).get();
    if (!userDoc.exists || userDoc.data().isAdmin !== true) throw new functions.https.HttpsError('permission-denied', '관리자 권한이 필요합니다.');
    const userName = userDoc.data().name || userDoc.data().email || uid;
    const daysBack = Math.min(Math.max(parseInt((data && data.daysBack) || 3, 10) || 3, 1), 31);
    try {
      const result = await ingestPlusclShipments({ daysBack });
      await notifySlack({
        title: `물류(PlusCL) 수동 수집 (관리자 ${userName})`,
        level: 'info',
        details: `👤 ${userName}\n📦 가져옴 ${result.fetched}건 / 신규 ${result.added}건\n📅 ${result.range}`,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK,
        titlePrefix: ''
      });
      return result;
    } catch (err) {
      console.error('[PLUSCL MANUAL] 실패:', err);
      throw new functions.https.HttpsError('internal', err.message);
    }
  });
