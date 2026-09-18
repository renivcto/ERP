/* =============================================================================
   메타 광고 — 일일 전환 최적화 리포트 + 기간 성과                 — v2.3.851~
   =============================================================================
   데이터는 서버(hermes-server)가 매일 06:00 KST 에 Firestore 에 쓴다. 프론트는 읽기만 한다.
     erp_data/metaAds         {data: JSON([행]), ts}   행 = 날짜×광고 (spend, impressions, linkClicks, landingPageViews,
                                                       purchases, purchaseValue, video3s, thruplay, … + 파생 linkCtr/lpvRate/cvr/cpa/roas/hookRate/holdRate)
     erp_data/metaAdsReports  {data: JSON([리포트]), ts} 리포트 = {date, kpi{day,prev,avg7,avg28,w7}, ads[], alerts[], recs[], analysis(md), analysisTs}
   ⚠️ 메타 Graph API 호출·토큰은 서버에만 있다. 이 파일(공개 저장소)에는 어떤 키도 두지 않는다.
   호스트가 준비할 것: #metaads-root, window._firebaseDb/_firestoreDoc/_firestoreGetDocFromServer, _period* (shared/margin-analysis.js)
   ============================================================================= */

window._META = window._META || { rows: [], reports: [], ts: 0, sel: null, loading: false, charts: {} };

async function _metaLoad(force) {
  const M = window._META;
  if (M.loading) return;
  if (!force && M.ts && (Date.now() - M.loadedAt) < 5 * 60 * 1000) return;
  M.loading = true;
  try {
    const db = window._firebaseDb, docF = window._firestoreDoc;
    const getFn = window._firestoreGetDocFromServer || window._firestoreGetDoc;
    if (!db || !docF || !getFn) throw new Error('Firestore 준비 안 됨');
    const parse = (s) => { try { const d = s && s.exists && s.exists() ? s.data() : null; if (!d) return { arr: [], ts: 0 }; let a = d.data; if (typeof a === 'string') a = JSON.parse(a); return { arr: Array.isArray(a) ? a : [], ts: d.ts || 0 }; } catch (_) { return { arr: [], ts: 0 }; } };
    const [r1, r2] = await Promise.all([getFn(docF(db, 'erp_data', 'metaAds')), getFn(docF(db, 'erp_data', 'metaAdsReports'))]);
    const rows = parse(r1), reps = parse(r2);
    M.rows = rows.arr; M.reports = reps.arr.slice().sort((a, b) => (a.date < b.date ? 1 : -1)); M.ts = reps.ts || rows.ts; M.loadedAt = Date.now();
    if (!M.sel || !M.reports.find(r => r.date === M.sel)) M.sel = M.reports.length ? M.reports[0].date : null;
  } finally { M.loading = false; }
}

// ── 포맷 헬퍼 ──
const _mWon = (v) => '₩' + Math.round(Number(v) || 0).toLocaleString();
const _mNum = (v, d) => (Number(v) || 0).toLocaleString(undefined, { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d });
const _mPct = (v, d) => _mNum(v, d == null ? 2 : d) + '%';
const _mEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function _mDelta(cur, base, higherGood) {
  cur = Number(cur) || 0; base = Number(base) || 0;
  if (!base) return '<span style="color:#94a3b8;font-size:11px">7일 평균 없음</span>';
  const ch = (cur - base) / base * 100;
  if (Math.abs(ch) < 1) return '<span style="color:#94a3b8;font-size:11px">7일 평균과 같음</span>';
  const good = (ch > 0) === !!higherGood;
  return '<span style="color:' + (good ? '#16a34a' : '#dc2626') + ';font-size:11px;font-weight:700">' + (ch > 0 ? '▲' : '▼') + Math.abs(ch).toFixed(0) + '% <span style="font-weight:500">vs 7일 평균</span></span>';
}
function _mDateK(d) { if (!d) return ''; const dt = new Date(d + 'T00:00:00'); return dt.getFullYear() + '.' + String(dt.getMonth() + 1).padStart(2, '0') + '.' + String(dt.getDate()).padStart(2, '0') + ' (' + '일월화수목금토'[dt.getDay()] + ')'; }
// 분석문(슬랙식 마크다운) → HTML. *굵게*, 줄머리 •/-/숫자 는 목록으로.
function _mMd(md) {
  if (!md) return '';
  return _mEsc(md).split('\n').map(l => {
    l = l.replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
    if (/^\s*[•\-]\s*/.test(l)) return '<div style="padding-left:14px;text-indent:-10px">• ' + l.replace(/^\s*[•\-]\s*/, '') + '</div>';
    if (/^\s*\d+\.\s/.test(l)) return '<div style="padding-left:16px;text-indent:-14px">' + l + '</div>';
    return l.trim() ? '<div style="margin-top:4px">' + l + '</div>' : '';
  }).join('');
}

// 행 집계 (서버 파생식과 동일하게 프론트에서 재계산)
function _mAgg(rows) {
  const t = { spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, landingPageViews: 0, viewContent: 0, addToCart: 0, initiateCheckout: 0, purchases: 0, purchaseValue: 0, video3s: 0, thruplay: 0, watchSum: 0, days: new Set() };
  rows.forEach(r => { Object.keys(t).forEach(k => { if (k !== 'days') t[k] += Number(r[k]) || 0; }); t.days.add(r.date); });
  const pct = (a, b) => b ? a / b * 100 : 0;
  t.days = t.days.size;
  t.linkCtr = pct(t.linkClicks, t.impressions); t.cpc = t.linkClicks ? t.spend / t.linkClicks : 0; t.cpm = t.impressions ? t.spend / t.impressions * 1000 : 0;
  t.frequency = t.reach ? t.impressions / t.reach : 0; t.lpvRate = pct(t.landingPageViews, t.linkClicks); t.cvr = pct(t.purchases, t.landingPageViews);
  t.cpa = t.purchases ? t.spend / t.purchases : 0; t.roas = t.spend ? t.purchaseValue / t.spend : 0; t.hookRate = pct(t.video3s, t.impressions); t.holdRate = pct(t.thruplay, t.video3s);
  return t;
}

const _M_KPI = [
  { k: 'spend', l: '지출', f: _mWon, good: false, bg: '#fdf2f8', c: '#9d174d' },
  { k: 'impressions', l: '노출', f: v => _mNum(v), good: true, bg: '#eff6ff', c: '#1d4ed8' },
  { k: 'linkCtr', l: '링크 CTR', f: v => _mPct(v), good: true, bg: '#eff6ff', c: '#1d4ed8' },
  { k: 'cpc', l: 'CPC', f: _mWon, good: false, bg: '#f8fafc', c: '#475569' },
  { k: 'landingPageViews', l: '랜딩 조회', f: v => _mNum(v), good: true, bg: '#f0fdf4', c: '#15803d', sub: (t) => '조회율 ' + _mPct(t.lpvRate, 0) },
  { k: 'purchases', l: '구매', f: v => _mNum(v) + '건', good: true, bg: '#fefce8', c: '#a16207', sub: (t) => '매출 ' + _mWon(t.purchaseValue) },
  { k: 'cvr', l: '전환율 (구매/랜딩)', f: v => _mPct(v), good: true, bg: '#fefce8', c: '#a16207' },
  { k: 'cpa', l: 'CPA', f: (v, t) => t.purchases ? _mWon(v) : '-', good: false, bg: '#fefce8', c: '#a16207', sub: (t) => 'ROAS ' + _mNum(t.roas, 2) },
];
function _mKpiCards(cur, base) {
  return _M_KPI.map(c => {
    const v = cur[c.k]; const sub = c.sub ? c.sub(cur) : '';
    const dl = base ? _mDelta(v, base[c.k], c.good) : '';
    return '<div style="background:' + c.bg + ';border-radius:12px;padding:14px 12px;text-align:center;border:1px solid rgba(15,23,42,0.05)">' +
      '<div style="font-size:11.5px;color:' + c.c + ';font-weight:700;margin-bottom:6px">' + c.l + '</div>' +
      '<div style="font-size:19px;font-weight:800;color:' + c.c + ';letter-spacing:-0.5px">' + c.f(v, cur) + '</div>' +
      (sub ? '<div style="font-size:11px;color:#64748b;margin-top:3px">' + sub + '</div>' : '') +
      (dl ? '<div style="margin-top:4px">' + dl + '</div>' : '') + '</div>';
  }).join('');
}

const _M_FLAG_COLOR = { fatigue: '#f59e0b', no_delivery: '#dc2626', spend_no_conv: '#dc2626', winner: '#16a34a', issue: '#dc2626' };
function _mAdsTable(ads) {
  if (!ads || !ads.length) return '<div style="color:#94a3b8;font-size:12.5px;padding:10px 0">최근 7일 동안 송출된 광고가 없습니다.</div>';
  const th = (t, w) => '<th style="padding:8px 6px;font-size:11px;color:#475569;white-space:nowrap' + (w ? ';width:' + w : '') + '">' + t + '</th>';
  const td = (t, al) => '<td style="padding:8px 6px;font-size:12px;white-space:nowrap;text-align:' + (al || 'right') + '">' + t + '</td>';
  const stg = (a, key) => { const s = (a.stages || []).find(x => x.key === key); if (!s) return '-'; const v = _mPct(s.value, key === 'hook' || key === 'hold' || key === 'landing' ? 0 : 2); if (s.ok === null) return '<span style="color:#94a3b8" title="표본 부족">' + v + '</span>'; return '<span style="color:' + (s.ok ? '#16a34a' : '#dc2626') + ';font-weight:' + (s.ok ? 500 : 700) + '" title="목표 ' + s.target + '%">' + v + '</span>'; };
  let h = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
    th('광고', '') + th('상태') + th('어제 지출') + th('노출') + th('훅률') + th('유지율') + th('링크 CTR') + th('랜딩율') + th('구매') + th('전환율') + th('7일 지출') + th('7일 구매') + th('7일 CPA') + th('약한 단계') + th('신호') + '</tr></thead><tbody>';
  ads.forEach(a => {
    const st = a.status || '-'; const stc = st === 'ACTIVE' ? '#16a34a' : (/PAUSED/.test(st) ? '#94a3b8' : '#dc2626');
    const flags = (a.flags || []).map(f => '<span title="' + _mEsc(f.text) + '" style="display:inline-block;background:' + (_M_FLAG_COLOR[f.code] || '#64748b') + ';color:#fff;border-radius:6px;padding:1px 6px;font-size:10.5px;font-weight:700;margin-right:3px">' + _mEsc(f.label) + '</span>').join('');
    h += '<tr style="border-bottom:1px solid #f1f5f9">' +
      td('<b>' + _mEsc(a.ad) + '</b><div style="font-size:10.5px;color:#94a3b8;font-weight:500">' + _mEsc(a.campaign) + '</div>', 'left') +
      td('<span style="color:' + stc + ';font-weight:700;font-size:11px">' + _mEsc(st) + '</span>', 'center') +
      td(_mWon(a.day.spend)) + td(_mNum(a.day.impressions)) + td(stg(a, 'hook')) + td(stg(a, 'hold')) + td(stg(a, 'click')) + td(stg(a, 'landing')) +
      td(_mNum(a.day.purchases)) + td(stg(a, 'convert')) + td(_mWon(a.w7.spend)) + td(_mNum(a.w7.purchases)) + td(a.w7.purchases ? _mWon(a.w7.cpa) : '-') +
      td(a.weakest ? '<span style="color:#dc2626;font-weight:700" title="' + _mEsc(a.advice || '') + '">' + _mEsc(a.weakest.label) + '</span>' : '<span style="color:#16a34a">양호</span>', 'center') +
      td(flags || '<span style="color:#cbd5e1">-</span>', 'left') + '</tr>';
  });
  return h + '</tbody></table></div><div style="font-size:11px;color:#94a3b8;margin-top:6px">훅률·유지율·링크 CTR·랜딩율·전환율은 최근 7일 기준. 빨강 = 목표 미달, 회색 = 표본 부족. 약한 단계에 마우스를 올리면 개선 방향이 보입니다.</div>';
}

function _mReportHtml(rep) {
  if (!rep) return '<div class="card" style="padding:24px;color:#94a3b8;font-size:13px">아직 리포트가 없습니다. 매일 06:00 에 서버가 어제 리포트를 만듭니다.</div>';
  const k = rep.kpi || {}; const day = k.day || _mAgg([]); const avg7 = k.avg7 || null;
  let h = '<div class="card" style="padding:18px 18px 14px;margin-bottom:14px">';
  h += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px"><span style="font-size:15px;font-weight:800;color:#0f172a">📣 일일 리포트 · ' + _mDateK(rep.date) + '</span>' +
    '<span style="font-size:11px;color:#94a3b8">생성 ' + _mEsc((rep.generatedAt || '').replace('T', ' ').slice(0, 16)) + (rep.analysisTs ? ' · 분석 ' + _mEsc(rep.analysisTs.replace('T', ' ').slice(0, 16)) : '') + '</span></div>';
  if (rep.rowsCount === 0) h += '<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px 14px;font-size:12.5px;color:#9a3412;margin-bottom:12px">⚠️ 이 날은 광고 데이터가 없습니다 (송출 없음 또는 수집 실패).</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px">' + _mKpiCards(day, avg7) + '</div>';
  h += '<div style="font-size:11.5px;color:#64748b;margin-bottom:14px">훅률(3초 시청/노출) <b>' + _mPct(day.hookRate, 1) + '</b> · 유지율(ThruPlay/3초) <b>' + _mPct(day.holdRate, 1) + '</b> · 빈도 <b>' + _mNum(day.frequency, 2) + '</b> · CPM <b>' + _mWon(day.cpm) + '</b> · 장바구니 <b>' + _mNum(day.addToCart) + '</b> · 결제 시작 <b>' + _mNum(day.initiateCheckout) + '</b>' +
    (avg7 ? ' &nbsp;|&nbsp; 7일 평균: 지출 ' + _mWon(avg7.spend) + ' · 노출 ' + _mNum(avg7.impressions) + ' · 구매 ' + _mNum(avg7.purchases, 1) : '') + '</div>';
  if (rep.alerts && rep.alerts.length) {
    h += '<div style="margin-bottom:14px">' + rep.alerts.map(a => '<div style="background:' + (a.level === 'good' ? '#f0fdf4' : '#fef2f2') + ';border:1px solid ' + (a.level === 'good' ? '#bbf7d0' : '#fecaca') + ';border-radius:10px;padding:8px 12px;font-size:12.5px;color:' + (a.level === 'good' ? '#166534' : '#991b1b') + ';margin-bottom:6px">' + (a.level === 'good' ? '✅ ' : '🚨 ') + _mEsc(a.text) + '</div>').join('') + '</div>';
  }
  h += '<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:14px;margin-bottom:14px">';
  h += '<div style="background:#f8fafc;border-radius:12px;padding:14px 16px"><div style="font-size:13px;font-weight:800;color:#0f172a;margin-bottom:8px">🧠 Greg 분석 · 권고</div>' +
    (rep.analysis ? '<div style="font-size:12.5px;line-height:1.65;color:#1e293b">' + _mMd(rep.analysis) + '</div>' : '<div style="font-size:12px;color:#94a3b8">분석 대기 중입니다. 06:05 에 Greg 에이전트가 작성하고 06:20 에 반영됩니다.</div>') + '</div>';
  h += '<div style="background:#f8fafc;border-radius:12px;padding:14px 16px"><div style="font-size:13px;font-weight:800;color:#0f172a;margin-bottom:8px">📌 자동 권고 (규칙 기반)</div>' +
    ((rep.recs && rep.recs.length) ? rep.recs.map(r => '<div style="font-size:12.5px;line-height:1.55;color:#1e293b;padding-left:12px;text-indent:-10px;margin-bottom:5px">• ' + _mEsc(r.text) + '</div>').join('') : '<div style="font-size:12px;color:#94a3b8">권고 없음</div>') + '</div></div>';
  h += '<div style="font-size:13px;font-weight:800;color:#0f172a;margin-bottom:6px">🎬 광고별 퍼널 진단</div>' + _mAdsTable(rep.ads);
  return h + '</div>';
}

function _mPeriodHtml() {
  const on = "_periodOnChange('ma')";
  const inp = (cls, type, show, extra) => '<input class="fi period-' + cls + '" type="' + type + '" onchange="' + on + '" oninput="' + on + '" style="' + (show ? '' : 'display:none;') + 'width:140px;font-size:12px;height:32px;padding:5px 10px;flex-shrink:0"' + (extra || '') + '>';
  // v2.3.854: 기본값 = 월별 · 이번 달 (첫 렌더의 기간 계산이 _periodInit 보다 먼저라 값을 미리 넣어 둔다)
  const _now = new Date(), _ym = _now.getFullYear() + '-' + String(_now.getMonth() + 1).padStart(2, '0');
  return '<div class="period-filter" data-prefix="ma" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">' +
    '<span style="font-size:12px;color:#475569;font-weight:700;flex-shrink:0">📅 기간</span>' +
    '<select class="fs period-mode" onchange="' + on + '" style="width:90px;font-size:12px;height:32px;padding:5px 8px;flex-shrink:0">' +
    '<option value="all">전체</option><option value="year">연별</option><option value="month" selected>월별</option><option value="week">주별</option><option value="day">일별</option><option value="range">기간별</option></select>' +
    inp('year', 'number', false, ' min="2024" max="2100" step="1"') + inp('month', 'month', true, ' value="' + _ym + '"') + inp('week', 'week', false) + inp('day', 'date', false) + inp('from', 'date', false) +
    '<span class="period-tilde" style="display:none;color:var(--gray-400);font-size:12px;flex-shrink:0">~</span>' + inp('to', 'date', false) +
    '<button class="btn btn-primary btn-sm" onclick="' + on + '" style="height:32px;padding:5px 12px;font-size:12px;flex-shrink:0;white-space:nowrap">🔍 조회</button></div>';
}

function _mPeriodSection(rows) {
  const t = _mAgg(rows);
  let h = '<div class="card" style="padding:18px;margin-bottom:14px"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
    '<span style="font-size:15px;font-weight:800;color:#0f172a">📈 기간 성과 <span style="font-size:12px;color:#94a3b8;font-weight:500">' + t.days + '일 · 행 ' + rows.length + '</span></span><div id="metaads-period-slot"></div></div>';
  h += '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px">' + _mKpiCards(t, null) + '</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px"><div style="height:220px;position:relative"><canvas id="metaads-chart1"></canvas></div><div style="height:220px;position:relative"><canvas id="metaads-chart2"></canvas></div></div>';
  // 광고별 집계표
  const by = {};
  rows.forEach(r => { const k = r.adId || r.ad; (by[k] = by[k] || { ad: r.ad, campaign: r.campaign, rows: [] }).rows.push(r); });
  const list = Object.values(by).map(g => Object.assign({ ad: g.ad, campaign: g.campaign }, _mAgg(g.rows))).sort((a, b) => b.spend - a.spend);
  const th = (x) => '<th style="padding:8px 6px;font-size:11px;color:#475569;white-space:nowrap">' + x + '</th>';
  const td = (x, al) => '<td style="padding:7px 6px;font-size:12px;white-space:nowrap;text-align:' + (al || 'right') + '">' + x + '</td>';
  h += '<div style="font-size:13px;font-weight:800;color:#0f172a;margin:4px 0 6px">광고별 합계</div><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
    th('광고') + th('일수') + th('지출') + th('노출') + th('훅률') + th('유지율') + th('링크 클릭') + th('링크 CTR') + th('CPC') + th('랜딩 조회') + th('랜딩율') + th('구매') + th('전환율') + th('CPA') + th('ROAS') + '</tr></thead><tbody>';
  list.forEach(a => { h += '<tr style="border-bottom:1px solid #f1f5f9">' + td('<b>' + _mEsc(a.ad) + '</b><div style="font-size:10.5px;color:#94a3b8">' + _mEsc(a.campaign) + '</div>', 'left') + td(a.days) + td(_mWon(a.spend)) + td(_mNum(a.impressions)) + td(_mPct(a.hookRate, 1)) + td(_mPct(a.holdRate, 1)) + td(_mNum(a.linkClicks)) + td(_mPct(a.linkCtr)) + td(_mWon(a.cpc)) + td(_mNum(a.landingPageViews)) + td(_mPct(a.lpvRate, 0)) + td(_mNum(a.purchases)) + td(_mPct(a.cvr)) + td(a.purchases ? _mWon(a.cpa) : '-') + td(_mNum(a.roas, 2)) + '</tr>'; });
  if (!list.length) h += '<tr><td colspan="15" style="padding:14px;color:#94a3b8;font-size:12.5px;text-align:center">선택 기간에 데이터가 없습니다.</td></tr>';
  h += '</tbody></table></div>';
  // 일별 표
  const byD = {}; rows.forEach(r => (byD[r.date] = byD[r.date] || []).push(r));
  const days = Object.keys(byD).sort().reverse();
  h += '<details style="margin-top:12px"><summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:#475569">일별 표 (' + days.length + '일)</summary><div style="overflow-x:auto;margin-top:8px"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
    th('날짜') + th('광고 수') + th('지출') + th('노출') + th('훅률') + th('링크 클릭') + th('링크 CTR') + th('랜딩 조회') + th('구매') + th('매출') + th('전환율') + th('CPA') + '</tr></thead><tbody>';
  days.forEach(d => { const a = _mAgg(byD[d]); h += '<tr style="border-bottom:1px solid #f1f5f9">' + td(d, 'left') + td(byD[d].length) + td(_mWon(a.spend)) + td(_mNum(a.impressions)) + td(_mPct(a.hookRate, 1)) + td(_mNum(a.linkClicks)) + td(_mPct(a.linkCtr)) + td(_mNum(a.landingPageViews)) + td(_mNum(a.purchases)) + td(_mWon(a.purchaseValue)) + td(_mPct(a.cvr)) + td(a.purchases ? _mWon(a.cpa) : '-') + '</tr>'; });
  h += '</tbody></table></div></details></div>';
  return { html: h, byD: byD };
}

function _mCharts(byD) {
  if (typeof Chart === 'undefined') return;
  const M = window._META;
  Object.values(M.charts).forEach(c => { try { c.destroy(); } catch (_) {} }); M.charts = {};
  const days = Object.keys(byD).sort(); if (!days.length) return;
  const A = days.map(d => _mAgg(byD[d]));
  const c1 = document.getElementById('metaads-chart1'), c2 = document.getElementById('metaads-chart2'); if (!c1 || !c2) return;
  const lbl = days.map(d => d.slice(5));
  M.charts.a = new Chart(c1, { type: 'bar', data: { labels: lbl, datasets: [
    { label: '지출(₩)', data: A.map(a => Math.round(a.spend)), backgroundColor: 'rgba(190,24,93,0.35)', borderColor: '#be185d', yAxisID: 'y' },
    { label: '구매(건)', data: A.map(a => a.purchases), type: 'line', borderColor: '#a16207', backgroundColor: '#a16207', tension: 0.3, yAxisID: 'y1' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: '일별 지출 · 구매' }, legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { callback: v => '₩' + Number(v).toLocaleString() } }, y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { precision: 0 } } } } });
  M.charts.b = new Chart(c2, { type: 'line', data: { labels: lbl, datasets: [
    { label: '링크 CTR(%)', data: A.map(a => +a.linkCtr.toFixed(2)), borderColor: '#1d4ed8', backgroundColor: '#1d4ed8', tension: 0.3, yAxisID: 'y' },
    { label: '훅률(%)', data: A.map(a => +a.hookRate.toFixed(1)), borderColor: '#0891b2', backgroundColor: '#0891b2', tension: 0.3, yAxisID: 'y1' },
    { label: '전환율(%)', data: A.map(a => +a.cvr.toFixed(2)), borderColor: '#16a34a', backgroundColor: '#16a34a', tension: 0.3, yAxisID: 'y' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: '일별 CTR · 훅률 · 전환율' }, legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true }, y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } } } } });
}

function _mHistoryHtml(reports, sel) {
  if (!reports.length) return '';
  let h = '<div class="card" style="padding:18px"><div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:10px">🗂 지난 리포트</div><div style="display:flex;flex-direction:column;gap:4px;max-height:360px;overflow:auto">';
  reports.forEach(r => {
    const d = (r.kpi && r.kpi.day) || {}; const first = (r.analysis || '').split('\n')[0].replace(/\*/g, '').replace(/^한 줄 결론\s*[—-]?\s*/, '');
    h += '<div onclick="window._META.sel=\'' + r.date + '\';renderMetaAdsPage()" style="cursor:pointer;display:flex;gap:12px;align-items:center;padding:7px 10px;border-radius:8px;background:' + (r.date === sel ? '#eff6ff' : 'transparent') + ';border:1px solid ' + (r.date === sel ? '#bfdbfe' : '#f1f5f9') + '">' +
      '<span style="font-size:12px;font-weight:700;color:#0f172a;width:110px;flex-shrink:0">' + _mDateK(r.date) + '</span>' +
      '<span style="font-size:11.5px;color:#475569;width:300px;flex-shrink:0">지출 ' + _mWon(d.spend) + ' · 클릭 ' + _mNum(d.linkClicks) + ' · 구매 ' + _mNum(d.purchases) + ' · CVR ' + _mPct(d.cvr) + '</span>' +
      '<span style="font-size:11.5px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (first ? _mEsc(first) : (r.rowsCount === 0 ? '데이터 없음' : '분석 없음')) + '</span>' +
      ((r.alerts || []).some(a => a.level !== 'good') ? '<span style="margin-left:auto;font-size:10.5px;color:#dc2626;font-weight:700;flex-shrink:0">경보 ' + r.alerts.filter(a => a.level !== 'good').length + '</span>' : '') + '</div>';
  });
  return h + '</div></div>';
}

function renderMetaAdsPage() {
  const host = document.getElementById('metaads-root'); if (!host) return;
  const M = window._META;
  if (!M.ts && !M.loading) {
    host.innerHTML = '<div style="padding:30px;color:#94a3b8;font-size:13px">메타 광고 데이터를 불러오는 중…</div>';
    _metaLoad(false).then(() => renderMetaAdsPage()).catch(e => { host.innerHTML = '<div style="padding:30px;color:#dc2626;font-size:13px">불러오기 실패: ' + _mEsc(e && e.message) + '</div>'; });
    return;
  }
  // 기간 필터 값은 재렌더 사이에 보존 (필터 DOM 을 떼어뒀다가 다시 붙인다)
  let filt = host.querySelector('.period-filter[data-prefix="ma"]');
  if (!filt) { const tmp = document.createElement('div'); tmp.innerHTML = _mPeriodHtml(); filt = tmp.firstChild; }
  const range = (typeof _periodComputeRange === 'function') ? (() => { const tmpHost = document.createElement('div'); tmpHost.appendChild(filt); document.body.appendChild(tmpHost); const r = _periodComputeRange('ma'); document.body.removeChild(tmpHost); return r; })() : { start: '', end: '' };
  const rows = M.rows.filter(r => (!range.start || r.date >= range.start) && (!range.end || r.date <= range.end));
  const rep = M.reports.find(r => r.date === M.sel) || M.reports[0];
  const per = _mPeriodSection(rows);
  host.innerHTML = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
    '<span style="font-size:12px;color:#64748b">서버 갱신 ' + (M.ts ? new Date(M.ts).toLocaleString('ko-KR', { hour12: false }) : '-') + ' · 매일 06:00 자동 (메타 계정 시간대 기준 어제 하루)</span>' +
    '<button class="btn btn-sm" onclick="window._META.ts=0;renderMetaAdsPage()" style="height:28px;font-size:12px">🔄 새로고침</button>' +
    '<span style="margin-left:auto;font-size:12px;color:#475569;font-weight:700">리포트 날짜</span><select class="fs" onchange="window._META.sel=this.value;renderMetaAdsPage()" style="width:150px;font-size:12px;height:30px">' +
    M.reports.map(r => '<option value="' + r.date + '"' + (rep && r.date === rep.date ? ' selected' : '') + '>' + r.date + (r.analysis ? ' 🧠' : '') + '</option>').join('') + '</select></div>' +
    _mReportHtml(rep) + per.html + _mHistoryHtml(M.reports, rep && rep.date);
  const slot = document.getElementById('metaads-period-slot'); if (slot) { slot.appendChild(filt); if (typeof _periodInit === 'function') _periodInit('ma'); }
  try { _mCharts(per.byD); } catch (e) { console.warn('metaads chart', e); }
}
