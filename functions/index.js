// =============================================================================
// Reniv ERP — 자동 백업 Cloud Functions (v2.1, 2026-04, Slack 알림 추가)
// =============================================================================
//
// 기능:
//   1) scheduledFirestoreExport: 매일 새벽 3시 (KST) Firestore 전체 백업
//   2) manualBackup: 관리자가 웹 UI에서 버튼 클릭으로 즉시 백업
//   3) pruneOldBackups: 30일 이상 된 일일 백업 자동 삭제 (매주 일요일 04:00)
//
// 모든 함수는 성공/실패 시 Slack 알림 전송 (functions.config().slack.webhook)
//
// 배포 전 Slack webhook 등록 (한 번만):
//   firebase functions:config:set slack.webhook="https://hooks.slack.com/services/..."
//
// 배포:
//   firebase deploy --only functions --project reniv-erp-135a3
// =============================================================================

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const firestore = require('@google-cloud/firestore');
const {Storage} = require('@google-cloud/storage');

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
async function notifySlack({ title, level, details }) {
  const webhook = (functions.config().slack || {}).webhook;
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
