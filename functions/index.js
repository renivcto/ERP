// =============================================================================
// Reniv ERP — Cloud Functions (v2.9, 2026-05, 쿠팡 휴리스틱 취소 감지)
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
async function notifySlack({ title, level, details, webhookOverride }) {
  // v2.5: webhookOverride 가 있으면 그쪽으로 전송 (예: 주문 알림은 별도 채널)
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

  const payload = {
    text: `${meta.emoji} [Reniv ERP 백업] ${title}`,
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
      });

      throw new functions.https.HttpsError('internal', '백업 실패: ' + err.message);
    }
  });

// ─────────────────────────────────────────────────────────────
// 2) 수동 백업 — 관리자 전용 Callable Function
// ─────────────────────────────────────────────────────────────
exports.manualBackup = functions
  .region(REGION)
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

// v2.8: 취소/반품된 orderNo들을 erp_data/shopOrders에서 제거
//   - 동일 shopId 내에서만 매칭 (다른 쇼핑몰의 같은 주문번호 보호)
//   - 삭제된 주문 샘플 최대 3건 반환 (Slack 알림용)
async function removeOrdersFromFirestore(firestoreDb, orderNos, shopId) {
  if (!orderNos) return { removed: 0, samples: [] };
  const set = (orderNos instanceof Set) ? orderNos : new Set(Array.from(orderNos).map(String));
  if (set.size === 0) return { removed: 0, samples: [] };

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
  const filtered = existing.filter(o => {
    if (!o) return false;
    if (o.shopId !== shopId) return true;
    if (set.has(String(o.orderNo))) {
      if (samples.length < 3) {
        samples.push({
          orderNo: o.orderNo,
          customer: o.customerName,
          product: o.productName,
          qty: o.qty,
          amount: o.paymentAmount
        });
      }
      return false;
    }
    return true;
  });

  const removed = existing.length - filtered.length;
  if (removed > 0) {
    await docRef.set({ data: JSON.stringify(filtered), ts: Date.now() });
  }
  return { removed, samples };
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
async function ingestCoupangOrders({ daysBack = 1 } = {}) {
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

  // v2.9: 휴리스틱 취소 감지 — Wing API의 cancel status 값을 알 수 없어서, 
  //   "ERP에 있는데 같은 기간 active 응답에 없는 주문"을 취소로 추정
  //   거짓 양성 위험: 일시적 API 오류로 일부 주문 누락 가능 → Safety guard로 대량 삭제 방지
  const SAFETY_LIMIT = 10;
  const erpDocRef = firestoreDb.doc('erp_data/shopOrders');
  const erpSnap = await erpDocRef.get();
  let erpExisting = [];
  if (erpSnap.exists) {
    const raw = erpSnap.data().data;
    if (typeof raw === 'string') { try { erpExisting = JSON.parse(raw) || []; } catch (_) {} }
    else if (Array.isArray(raw)) erpExisting = raw;
  }
  const activeOrderNos = new Set();
  collected.forEach((_, orderId) => activeOrderNos.add(String(orderId)));
  const presumedCanceledIds = new Set();
  let safetyTriggered = false;
  erpExisting.forEach(o => {
    if (!o || o.shopId !== shopId) return;
    const d = (o.orderDate || '').slice(0, 10);
    // createdAtFrom~To 기간 내 ERP 주문 중 active에 없는 것
    if (d < createdAtFrom || d > createdAtTo) return;
    if (!activeOrderNos.has(String(o.orderNo))) {
      presumedCanceledIds.add(String(o.orderNo));
    }
  });
  if (presumedCanceledIds.size > SAFETY_LIMIT) {
    console.warn(`[COUPANG] 휴리스틱 추정 취소 ${presumedCanceledIds.size}건 — Safety guard 발동, 자동 삭제 건너뜀`);
    safetyTriggered = true;
  }

  const erpOrders = Array.from(collected.values()).map(c => mapCoupangToErpOrder(c, shopId, shopName));
  // v2.7: 매핑 자동 적용
  const mappingResult = await applyProductMappingsToOrders(firestoreDb, erpOrders, shopId);
  console.log('[COUPANG] 매핑 자동 적용:', mappingResult.mapped, '건');
  const merge = await mergeOrdersIntoFirestore(firestoreDb, erpOrders);

  // v2.9: 취소 추정 주문 ERP에서 제거 (Safety guard 통과 시에만)
  let removeResult = { removed: 0, samples: [] };
  if (!safetyTriggered && presumedCanceledIds.size > 0) {
    removeResult = await removeOrdersFromFirestore(firestoreDb, presumedCanceledIds, shopId);
    if (removeResult.removed > 0) console.log('[COUPANG] 휴리스틱 취소 삭제:', removeResult.removed, '건');
  }

  return {
    fetched: erpOrders.length,
    added: merge.added,
    total: merge.total,
    removed: removeResult.removed,
    removedSamples: removeResult.samples,
    presumedCanceled: presumedCanceledIds.size,
    safetyTriggered,
    statusCounts,
    range: `${createdAtFrom} ~ ${createdAtTo}`,
    sampleNew: merge.sampleNew.map(o => ({ orderNo: o.orderNo, customer: o.customerName, product: o.productName, qty: o.qty, amount: o.paymentAmount }))
  };
}

// ─────────────────────────────────────────────────────────────
// 4) 쿠팡 주문 자동 수집 — 매일 KST 09:00 / 13:00 / 18:00
// ─────────────────────────────────────────────────────────────
exports.fetchCoupangOrders = functions
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
      // v2.5: ERP 총 주문 / 상태별 라인 제거 + 별도 채널(르니브-주문자동화)로 전송
      // v2.9: 휴리스틱 취소 감지 정보 + Safety guard 안내
      const removedText = (result.removed > 0)
        ? `\n🗑️ 취소/반품 자동 삭제: ${result.removed}건 _(휴리스틱 추정)_` + (result.removedSamples && result.removedSamples.length
          ? '\n*취소 추정 주문:*\n' + result.removedSamples.map(s => `• ${s.orderNo} — ${s.customer || '-'} / ${s.product || '-'} × ${s.qty || 1}개 / ₩${(s.amount || 0).toLocaleString()}`).join('\n')
          : '')
        : '';
      const safetyText = result.safetyTriggered
        ? `\n⚠️ Safety guard 발동: 추정 취소가 ${result.presumedCanceled}건으로 너무 많아 자동 삭제 건너뜀 (일시 API 오류 가능성). ERP에서 수동 확인 권장.`
        : '';
      const titleParts = [];
      if (result.added > 0) titleParts.push(`신규 ${result.added}건`);
      if (result.removed > 0) titleParts.push(`취소 ${result.removed}건`);
      const titleText = titleParts.length ? titleParts.join(' / ') : '신규/취소 없음';
      await notifySlack({
        title: `쿠팡 자동 주문 수집 — ${titleText}`,
        level: (result.added > 0 || result.removed > 0) ? 'success' : 'info',
        details:
          `📦 가져옴: ${result.fetched}건\n` +
          `✅ 신규 추가: ${result.added}건\n` +
          `📅 조회 기간: ${result.range}` + sampleText + removedText + safetyText,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK
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
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK
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
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK
      });
      return result;
    } catch (err) {
      console.error('[COUPANG MANUAL] 실패:', err);
      await notifySlack({
        title: '쿠팡 수동 주문 수집 실패',
        level: 'error',
        details: `👤 ${userName}\n❌ ${err.message}`,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK
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
  // c: Cafe24 주문 객체
  const items = Array.isArray(c.items) ? c.items : [];
  const totalQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0) || 1;
  const productNames = items.map(it => it.product_name || it.variant_name).filter(Boolean).join(' + ');
  const buyer = c.buyer || {};
  const receiver = (Array.isArray(c.receivers) && c.receivers[0]) || c.receiver || {};

  // 주소 조립
  const address = [receiver.address1, receiver.address2].filter(Boolean).join(' ').trim();

  // 배송완료 여부 판단 — Cafe24 order_status 코드 기반
  // N00: 입금전, N10: 상품준비중, N20: 배송준비중, N21: 배송보류, N22: 배송대기, N30: 배송중, N40: 배송완료
  // C##: 취소 시리즈, R##: 반품 시리즈
  const status = c.order_status || '';
  let mappedStatus = '배송 전';
  if (status.startsWith('N40')) mappedStatus = '배송완료';
  else if (status.startsWith('N30')) mappedStatus = '배송중';
  else if (status.startsWith('C')) mappedStatus = '취소';
  else if (status.startsWith('R')) mappedStatus = '반품';

  return {
    id: Date.now() + Math.floor(Math.random() * 100000),
    orderNo: String(c.order_id || ''),
    orderDate: (c.order_date || '').slice(0, 10),
    customerName: buyer.name || '',
    customerPhone: fmtPhoneKr(buyer.cellphone || buyer.phone || ''),
    email: buyer.email || '',
    productName: productNames,
    qty: totalQty,
    paymentAmount: Number(c.payment_amount) || Number(c.actual_payment_amount) || Number(c.order_price_amount) || 0,
    recipientName: receiver.name || '',
    recipientPhone: fmtPhoneKr(receiver.cellphone || receiver.phone || ''),
    zipCode: receiver.zipcode || receiver.postal_code || '',
    address,
    deliveryNote: c.shipping_message || '',
    paymentDate: (c.payment_date || '').slice(0, 10),
    shipDate: (c.shipped_date || '').slice(0, 10),
    shippingFee: Number(c.shipping_fee) || 0,
    trackingNo: c.invoice_number || '',
    status: mappedStatus,
    shopId,
    shopName,
    source: 'cafe24_auto',
    cafe24Status: status,
    fetchedAt: Date.now()
  };
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
  const erpOrders = activeOrders.map(c => mapCafe24ToErpOrder(c, shopId, shopName));
  // v2.7: 매핑 자동 적용
  const mappingResult = await applyProductMappingsToOrders(firestoreDb, erpOrders, shopId);
  console.log('[CAFE24] 매핑 자동 적용:', mappingResult.mapped, '건');
  const merge = await mergeOrdersIntoFirestore(firestoreDb, erpOrders);

  // v2.8: 취소/반품 주문 ERP에서 제거
  const removeResult = await removeOrdersFromFirestore(firestoreDb, canceledIds, shopId);
  if (removeResult.removed > 0) console.log('[CAFE24] 취소/반품 삭제:', removeResult.removed, '건');

  return {
    fetched: allOrders.length,
    added: merge.added,
    total: merge.total,
    removed: removeResult.removed,
    removedSamples: removeResult.samples,
    range: `${startDate} ~ ${endDate}`,
    sampleNew: merge.sampleNew.map(o => ({
      orderNo: o.orderNo, customer: o.customerName, product: o.productName, qty: o.qty, amount: o.paymentAmount
    }))
  };
}

// ─────────────────────────────────────────────────────────────
// 6) Cafe24 자동 수집 — KST 9/13/18시 (쿠팡과 동일 스케줄)
// ─────────────────────────────────────────────────────────────
exports.fetchCafe24Orders = functions
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
      // v2.8: 취소/반품 삭제 정보 추가
      const removedText = (result.removed > 0)
        ? `\n🗑️ 취소/반품 삭제: ${result.removed}건` + (result.removedSamples && result.removedSamples.length
          ? '\n*취소 주문:*\n' + result.removedSamples.map(s => `• ${s.orderNo} — ${s.customer || '-'} / ${s.product || '-'} × ${s.qty || 1}개 / ₩${(s.amount || 0).toLocaleString()}`).join('\n')
          : '')
        : '';
      const titleParts = [];
      if (result.added > 0) titleParts.push(`신규 ${result.added}건`);
      if (result.removed > 0) titleParts.push(`취소 ${result.removed}건`);
      const titleText = titleParts.length ? titleParts.join(' / ') : '신규/취소 없음';
      await notifySlack({
        title: `자사몰(Cafe24) 자동 주문 수집 — ${titleText}`,
        level: (result.added > 0 || result.removed > 0) ? 'success' : 'info',
        details:
          `📦 가져옴: ${result.fetched}건\n` +
          `✅ 신규 추가: ${result.added}건\n` +
          `📅 조회 기간: ${result.range}` + sampleText + removedText,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK
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
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK
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
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK
      });
      return result;
    } catch (err) {
      console.error('[CAFE24 MANUAL] 실패:', err);
      await notifySlack({
        title: '자사몰(Cafe24) 수동 주문 수집 실패',
        level: 'error',
        details: `👤 ${userName}\n❌ ${err.message}`,
        webhookOverride: process.env.SLACK_ORDERS_WEBHOOK
      });
      throw new functions.https.HttpsError('internal', err.message);
    }
  });
