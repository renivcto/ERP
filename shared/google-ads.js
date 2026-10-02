/* =============================================================================
   구글 광고 — 일일 리포트 + 기간 성과 (메타 광고 화면과 같은 구성)          — v2.3.875~
   =============================================================================
   데이터 흐름: 구글 광고 스크립트 'RENIV ERP 구글 광고 일일 내보내기'(구글 서버, 매일 04~05시)
     → 시트 RENIV_GoogleAds_ERP → 아침 분석 작업이 Firestore 에 쓴다. 프론트는 읽기만 한다.
     erp_data/googleAds         {data: JSON([행]), ts}   행 = 날짜×광고 (spend, impressions, clicks, videoViews, p25~p100,
                                                         addToCart, purchases, purchaseValue, youtubeId, ytViews, policy …)
     erp_data/googleAdsReports  {data: JSON([리포트]), ts} 리포트 = {date, kpi{day,prev,avg7,w7}, ads[], alerts[], recs[], analysis(md)}
   ⚠️ 공개 저장소 — 어떤 키·토큰도 두지 않는다.
   ============================================================================= */

window._GADS = window._GADS || { rows: [], reports: [], ts: 0, sel: null, loading: false, charts: {} };

async function _gadsLoad(force) {
  const G = window._GADS;
  if (G.loading) return;
  if (!force && G.ts && (Date.now() - G.loadedAt) < 5 * 60 * 1000) return;
  G.loading = true;
  try {
    const db = window._firebaseDb, docF = window._firestoreDoc;
    const getFn = window._firestoreGetDocFromServer || window._firestoreGetDoc;
    if (!db || !docF || !getFn) throw new Error('Firestore 준비 안 됨');
    const parse = (s) => { try { const d = s && s.exists && s.exists() ? s.data() : null; if (!d) return { arr: [], ts: 0 }; let a = d.data; if (typeof a === 'string') a = JSON.parse(a); return { arr: Array.isArray(a) ? a : [], ts: d.ts || 0 }; } catch (_) { return { arr: [], ts: 0 }; } };
    const [r1, r2] = await Promise.all([getFn(docF(db, 'erp_data', 'googleAds')), getFn(docF(db, 'erp_data', 'googleAdsReports'))]);
    const rows = parse(r1), reps = parse(r2);
    G.rows = rows.arr; G.reports = reps.arr.slice().sort((a, b) => (a.date < b.date ? 1 : -1)); G.ts = reps.ts || rows.ts; G.loadedAt = Date.now();
    if (!G.sel || !G.reports.find(r => r.date === G.sel)) G.sel = G.reports.length ? G.reports[0].date : null;
  } finally { G.loading = false; }
}

const _gWon = (v) => '₩' + Math.round(Number(v) || 0).toLocaleString();
const _gNum = (v, d) => (Number(v) || 0).toLocaleString(undefined, { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d });
const _gPct = (v, d) => _gNum(v, d == null ? 2 : d) + '%';
const _gEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function _gDelta(cur, base, higherGood) {
  cur = Number(cur) || 0; base = Number(base) || 0;
  if (!base) return '<span style="color:#94a3b8;font-size:11px">7일 평균 없음</span>';
  const ch = (cur - base) / base * 100;
  if (Math.abs(ch) < 1) return '<span style="color:#94a3b8;font-size:11px">7일 평균과 같음</span>';
  const good = (ch > 0) === !!higherGood;
  return '<span style="color:' + (good ? '#16a34a' : '#dc2626') + ';font-size:11px;font-weight:700">' + (ch > 0 ? '▲' : '▼') + Math.abs(ch).toFixed(0) + '% <span style="font-weight:500">vs 7일 평균</span></span>';
}
function _gDateK(d) { if (!d) return ''; const dt = new Date(d + 'T00:00:00'); return dt.getFullYear() + '.' + String(dt.getMonth() + 1).padStart(2, '0') + '.' + String(dt.getDate()).padStart(2, '0') + ' (' + '일월화수목금토'[dt.getDay()] + ')'; }
function _gMd(md) {
  if (!md) return '';
  return _gEsc(md).split('\n').map(l => {
    l = l.replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
    if (/^\s*[•\-]\s*/.test(l)) return '<div style="padding-left:14px;text-indent:-10px">• ' + l.replace(/^\s*[•\-]\s*/, '') + '</div>';
    if (/^\s*\d+\.\s/.test(l)) return '<div style="padding-left:16px;text-indent:-14px">' + l + '</div>';
    return l.trim() ? '<div style="margin-top:4px">' + l + '</div>' : '';
  }).join('');
}
// 행 집계 (분석 작업의 gAgg 와 같은 식)
function _gAgg(rows) {
  const t = { spend: 0, impressions: 0, clicks: 0, videoViews: 0, vImp: 0, p100w: 0, p25w: 0, addToCart: 0, purchases: 0, purchaseValue: 0, allConversions: 0 };
  const days = new Set();
  rows.forEach(r => { t.spend += +r.spend || 0; t.impressions += +r.impressions || 0; t.clicks += +r.clicks || 0; t.addToCart += +r.addToCart || 0; t.purchases += +r.purchases || 0; t.purchaseValue += +r.purchaseValue || 0; t.allConversions += +r.allConversions || 0;
    if (r.videoViews != null) { t.videoViews += +r.videoViews || 0; t.vImp += +r.impressions || 0; t.p100w += (+r.p100 || 0) * (+r.impressions || 0); t.p25w += (+r.p25 || 0) * (+r.impressions || 0); } days.add(r.date); });
  const pct = (a, b) => b ? a / b * 100 : 0;
  return Object.assign(t, { days: days.size, ctr: pct(t.clicks, t.impressions), cpc: t.clicks ? t.spend / t.clicks : 0, cpm: t.impressions ? t.spend / t.impressions * 1000 : 0,
    viewRate: pct(t.videoViews, t.vImp), cpv: t.videoViews ? t.spend / t.videoViews : 0, p25: t.vImp ? t.p25w / t.vImp * 100 : 0, p100: t.vImp ? t.p100w / t.vImp * 100 : 0,
    cartRate: pct(t.addToCart, t.clicks), cvr: pct(t.purchases, t.clicks), cpa: t.purchases ? t.spend / t.purchases : 0, roas: t.spend ? t.purchaseValue / t.spend : 0 });
}

const _G_KPI = [
  { k: 'spend', l: '지출', f: _gWon, good: false, bg: '#fdf2f8', c: '#9d174d' },
  { k: 'impressions', l: '노출', f: v => _gNum(v), good: true, bg: '#eff6ff', c: '#1d4ed8' },
  { k: 'viewRate', l: '동영상 조회율', f: v => _gPct(v, 1), good: true, bg: '#ecfeff', c: '#0e7490', sub: (t) => '조회 ' + _gNum(t.videoViews) + '회 · CPV ' + _gWon(t.cpv) },
  { k: 'ctr', l: 'CTR', f: v => _gPct(v), good: true, bg: '#eff6ff', c: '#1d4ed8', sub: (t) => '클릭 ' + _gNum(t.clicks) + '회' },
  { k: 'cpc', l: 'CPC', f: _gWon, good: false, bg: '#f8fafc', c: '#475569', sub: (t) => 'CPM ' + _gWon(t.cpm) },
  { k: 'addToCart', l: '장바구니', f: v => _gNum(v, 0) + '건', good: true, bg: '#f0fdf4', c: '#15803d', sub: (t) => '클릭 대비 ' + _gPct(t.cartRate) },
  { k: 'purchases', l: '구매', f: v => _gNum(v, 0) + '건', good: true, bg: '#fefce8', c: '#a16207', sub: (t) => '전환값 ' + _gWon(t.purchaseValue) },
  { k: 'cpa', l: 'CPA', f: (v, t) => t.purchases ? _gWon(v) : '-', good: false, bg: '#fefce8', c: '#a16207', sub: (t) => 'ROAS ' + _gNum(t.roas, 2) },
];
function _gKpiCards(cur, base) {
  return _G_KPI.map(c => {
    const v = cur[c.k]; const sub = c.sub ? c.sub(cur) : '';
    const dl = base ? _gDelta(v, base[c.k], c.good) : '';
    return '<div style="background:' + c.bg + ';border-radius:12px;padding:14px 12px;text-align:center;border:1px solid rgba(15,23,42,0.05)">' +
      '<div style="font-size:11.5px;color:' + c.c + ';font-weight:700;margin-bottom:6px">' + c.l + '</div>' +
      '<div style="font-size:19px;font-weight:800;color:' + c.c + ';letter-spacing:-0.5px">' + c.f(v, cur) + '</div>' +
      (sub ? '<div style="font-size:11px;color:#64748b;margin-top:3px">' + sub + '</div>' : '') +
      (dl ? '<div style="margin-top:4px">' + dl + '</div>' : '') + '</div>';
  }).join('');
}
const _G_FLAG_COLOR = { spend_no_conv: '#dc2626', winner: '#16a34a', issue: '#dc2626' };
function _gAdsTable(ads) {
  if (!ads || !ads.length) return '<div style="color:#94a3b8;font-size:12.5px;padding:10px 0">최근 7일 동안 송출된 광고가 없습니다.</div>';
  const th = (t) => '<th style="padding:8px 6px;font-size:11px;color:#475569;white-space:nowrap">' + t + '</th>';
  const td = (t, al) => '<td style="padding:8px 6px;font-size:12px;white-space:nowrap;text-align:' + (al || 'right') + '">' + t + '</td>';
  const stg = (a, key) => { const s = (a.stages || []).find(x => x.key === key); if (!s) return '-'; const v = _gPct(s.value, key === 'view' || key === 'complete' ? 1 : 2); if (s.ok === null) return '<span style="color:#94a3b8" title="표본 부족">' + v + '</span>'; return '<span style="color:' + (s.ok ? '#16a34a' : '#dc2626') + ';font-weight:' + (s.ok ? 500 : 700) + '" title="목표 ' + s.target + '%">' + v + '</span>'; };
  let h = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
    th('광고') + th('상태') + th('어제 지출') + th('노출') + th('조회율') + th('100% 시청') + th('CTR') + th('장바구니율') + th('구매') + th('7일 지출') + th('7일 클릭') + th('유튜브 조회수') + th('약한 단계') + th('신호') + '</tr></thead><tbody>';
  ads.forEach(a => {
    const st = a.status || '-'; const stc = st === 'ENABLED' ? '#16a34a' : (/PAUSED/.test(st) ? '#94a3b8' : '#dc2626');
    const flags = (a.flags || []).map(f => '<span title="' + _gEsc(f.text) + '" style="display:inline-block;background:' + (_G_FLAG_COLOR[f.code] || '#64748b') + ';color:#fff;border-radius:6px;padding:1px 6px;font-size:10.5px;font-weight:700;margin-right:3px">' + _gEsc(f.label) + '</span>').join('');
    const yt = a.youtubeId ? '<a href="https://www.youtube.com/watch?v=' + _gEsc(a.youtubeId) + '" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:none">' + (a.ytViews != null ? _gNum(a.ytViews) : '보기') + ' ↗</a>' : '-';
    h += '<tr style="border-bottom:1px solid #f1f5f9">' +
      td('<b>' + _gEsc(a.ad) + '</b><div style="font-size:10.5px;color:#94a3b8;font-weight:500">' + _gEsc(a.campaign) + ' · ' + _gEsc(a.channel) + '</div>', 'left') +
      td('<span style="color:' + stc + ';font-weight:700;font-size:11px">' + _gEsc(st) + '</span>', 'center') +
      td(_gWon(a.day.spend)) + td(_gNum(a.day.impressions)) + td(stg(a, 'view')) + td(stg(a, 'complete')) + td(stg(a, 'click')) + td(stg(a, 'cart')) +
      td(_gNum(a.w7.purchases)) + td(_gWon(a.w7.spend)) + td(_gNum(a.w7.clicks)) + td(yt) +
      td(a.weakest ? '<span style="color:#dc2626;font-weight:700" title="' + _gEsc(a.advice || '') + '">' + _gEsc(a.weakest.label) + '</span>' : '<span style="color:#16a34a">양호</span>', 'center') +
      td(flags || '<span style="color:#cbd5e1">-</span>', 'left') + '</tr>';
  });
  return h + '</tbody></table></div><div style="font-size:11px;color:#94a3b8;margin-top:6px">조회율·100% 시청·CTR·장바구니율은 최근 7일 기준. 빨강 = 목표 미달(조회율 15%, 100% 시청 10%, CTR 1%, 장바구니율 5%), 회색 = 표본 부족. 유튜브 조회수는 영상 전체 공개 조회수입니다.</div>';
}

function _gReportHtml(rep) {
  if (!rep) return '<div class="card" style="padding:24px;color:#94a3b8;font-size:13px">아직 리포트가 없습니다. 매일 아침 분석 작업이 어제 리포트를 만듭니다.</div>';
  const k = rep.kpi || {}; const day = k.day || _gAgg([]); const avg7 = k.avg7 || null; const w7 = k.w7 || null;
  let h = '<div class="card" style="padding:18px 18px 14px;margin-bottom:14px">';
  h += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px"><span style="font-size:15px;font-weight:800;color:#0f172a">🔎 일일 리포트 · ' + _gDateK(rep.date) + '</span>' +
    '<span style="font-size:11px;color:#94a3b8">생성 ' + _gEsc((rep.generatedAt || '').replace('T', ' ').slice(0, 16)) + (rep.analysisTs ? ' · 분석 ' + _gEsc(rep.analysisTs.replace('T', ' ').slice(0, 16)) : '') + '</span></div>';
  if (rep.rowsCount === 0) h += '<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px 14px;font-size:12.5px;color:#9a3412;margin-bottom:12px">⚠️ 이 날은 구글 광고 노출이 없습니다 (일시중지 또는 예산 소진).</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px">' + _gKpiCards(day, avg7) + '</div>';
  h += '<div style="font-size:11.5px;color:#64748b;margin-bottom:14px">25% 시청 <b>' + _gPct(day.p25, 1) + '</b> · 100% 시청 <b>' + _gPct(day.p100, 1) + '</b> · 전체 전환 <b>' + _gNum(day.allConversions, 1) + '</b>' +
    (w7 ? ' &nbsp;|&nbsp; 최근 7일: 지출 ' + _gWon(w7.spend) + ' · 노출 ' + _gNum(w7.impressions) + ' · 클릭 ' + _gNum(w7.clicks) + ' · 장바구니 ' + _gNum(w7.addToCart) + ' · 구매 ' + _gNum(w7.purchases) : '') + '</div>';
  if (rep.alerts && rep.alerts.length) h += '<div style="margin-bottom:14px">' + rep.alerts.map(a => '<div style="background:' + (a.level === 'good' ? '#f0fdf4' : '#fef2f2') + ';border:1px solid ' + (a.level === 'good' ? '#bbf7d0' : '#fecaca') + ';border-radius:10px;padding:8px 12px;font-size:12.5px;color:' + (a.level === 'good' ? '#166534' : '#991b1b') + ';margin-bottom:6px">' + (a.level === 'good' ? '✅ ' : '🚨 ') + _gEsc(a.text) + '</div>').join('') + '</div>';
  h += '<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:14px;margin-bottom:14px">';
  h += '<div style="background:#f8fafc;border-radius:12px;padding:14px 16px"><div style="font-size:13px;font-weight:800;color:#0f172a;margin-bottom:8px">🧠 분석 · 권고</div>' +
    (rep.analysis ? '<div style="font-size:12.5px;line-height:1.65;color:#1e293b">' + _gMd(rep.analysis) + '</div>' : '<div style="font-size:12px;color:#94a3b8">이 날짜는 서술형 분석이 없습니다. 최신 날짜를 선택하세요.</div>') + '</div>';
  h += '<div style="background:#f8fafc;border-radius:12px;padding:14px 16px"><div style="font-size:13px;font-weight:800;color:#0f172a;margin-bottom:8px">📌 자동 권고 (규칙 기반)</div>' +
    ((rep.recs && rep.recs.length) ? rep.recs.map(r => '<div style="font-size:12.5px;line-height:1.55;color:#1e293b;padding-left:12px;text-indent:-10px;margin-bottom:5px">• ' + _gEsc(r.text) + '</div>').join('') : '<div style="font-size:12px;color:#94a3b8">권고 없음</div>') + '</div></div>';
  h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><span style="font-size:13px;font-weight:800;color:#0f172a">🎬 광고별 퍼널 진단</span>' +
    '<button class="btn btn-sm" onclick="go(\'gcompads\')" title="경쟁 화장품 브랜드의 구글·유튜브 광고와 글로우샷 비교" style="height:26px;padding:3px 12px;font-size:12px;font-weight:700;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:8px">🔍 다른 회사 광고 분석</button></div>' + _gAdsTable(rep.ads);
  return h + '</div>';
}

function _gPeriodHtml() {
  const on = "_periodOnChange('ga')";
  const inp = (cls, type, show, extra) => '<input class="fi period-' + cls + '" type="' + type + '" onchange="' + on + '" oninput="' + on + '" style="' + (show ? '' : 'display:none;') + 'width:140px;font-size:12px;height:32px;padding:5px 10px;flex-shrink:0"' + (extra || '') + '>';
  return '<div class="period-filter" data-prefix="ga" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">' +
    '<span style="font-size:12px;color:#475569;font-weight:700;flex-shrink:0">📅 기간</span>' +
    '<select class="fs period-mode" onchange="' + on + '" style="width:90px;font-size:12px;height:32px;padding:5px 8px;flex-shrink:0">' +
    '<option value="all" selected>전체</option><option value="year">연별</option><option value="month">월별</option><option value="week">주별</option><option value="day">일별</option><option value="range">기간별</option></select>' +
    inp('year', 'number', false, ' min="2024" max="2100" step="1"') + inp('month', 'month', false) + inp('week', 'week', false) + inp('day', 'date', false) + inp('from', 'date', false) +
    '<span class="period-tilde" style="display:none;color:var(--gray-400);font-size:12px;flex-shrink:0">~</span>' + inp('to', 'date', false) +
    '<button class="btn btn-primary btn-sm" onclick="' + on + '" style="height:32px;padding:5px 12px;font-size:12px;flex-shrink:0;white-space:nowrap">🔍 조회</button></div>';
}

function _gPeriodSection(rows) {
  const t = _gAgg(rows);
  let h = '<div class="card" style="padding:18px;margin-bottom:14px"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
    '<span style="font-size:15px;font-weight:800;color:#0f172a">📈 기간 성과 <span style="font-size:12px;color:#94a3b8;font-weight:500">' + t.days + '일 · 행 ' + rows.length + '</span></span><div id="googleads-period-slot"></div></div>';
  h += '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px">' + _gKpiCards(t, null) + '</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px"><div style="height:220px;position:relative"><canvas id="googleads-chart1"></canvas></div><div style="height:220px;position:relative"><canvas id="googleads-chart2"></canvas></div></div>';
  const by = {};
  rows.forEach(r => { const k = r.adId || r.ad; (by[k] = by[k] || { ad: r.ad, campaign: r.campaign, channel: r.channel, yt: r.youtubeId, ytViews: r.ytViews, rows: [] }).rows.push(r); });
  const list = Object.values(by).map(g => Object.assign({ ad: g.ad, campaign: g.campaign, channel: g.channel, yt: g.yt, ytViews: g.ytViews }, _gAgg(g.rows))).sort((a, b) => b.spend - a.spend);
  const th = (x) => '<th style="padding:8px 6px;font-size:11px;color:#475569;white-space:nowrap;text-align:center">' + x + '</th>';
  const td = (x, al) => '<td style="padding:7px 6px;font-size:12px;white-space:nowrap;text-align:' + (al || 'center') + '">' + x + '</td>';
  h += '<div style="font-size:13px;font-weight:800;color:#0f172a;margin:4px 0 6px">광고별 합계</div><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
    th('광고') + th('일수') + th('지출') + th('노출') + th('동영상 조회') + th('조회율') + th('100% 시청') + th('클릭') + th('CTR') + th('CPC') + th('장바구니') + th('구매') + th('ROAS') + th('유튜브 조회수') + '</tr></thead><tbody>';
  list.forEach(a => { h += '<tr style="border-bottom:1px solid #f1f5f9">' + td('<b>' + _gEsc(a.ad) + '</b><div style="font-size:10.5px;color:#94a3b8">' + _gEsc(a.campaign) + '</div>', 'left') + td(a.days) + td(_gWon(a.spend)) + td(_gNum(a.impressions)) + td(a.vImp ? _gNum(a.videoViews) : '-') + td(a.vImp ? _gPct(a.viewRate, 1) : '-') + td(a.vImp ? _gPct(a.p100, 1) : '-') + td(_gNum(a.clicks)) + td(_gPct(a.ctr)) + td(_gWon(a.cpc)) + td(_gNum(a.addToCart)) + td(_gNum(a.purchases)) + td(_gNum(a.roas, 2)) +
    td(a.yt ? '<a href="https://www.youtube.com/watch?v=' + _gEsc(a.yt) + '" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:none">' + (a.ytViews != null ? _gNum(a.ytViews) : '보기') + ' ↗</a>' : '-') + '</tr>'; });
  if (!list.length) h += '<tr><td colspan="14" style="padding:14px;color:#94a3b8;font-size:12.5px;text-align:center">선택 기간에 데이터가 없습니다.</td></tr>';
  h += '</tbody></table></div>';
  const byD = {}; rows.forEach(r => (byD[r.date] = byD[r.date] || []).push(r));
  const days = Object.keys(byD).sort().reverse();
  h += '<details style="margin-top:12px"><summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:#475569">일별 표 (' + days.length + '일)</summary><div style="overflow-x:auto;margin-top:8px"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
    th('날짜') + th('광고 수') + th('지출') + th('노출') + th('조회율') + th('클릭') + th('CTR') + th('CPC') + th('장바구니') + th('구매') + th('전환값') + '</tr></thead><tbody>';
  days.forEach(d => { const a = _gAgg(byD[d]); h += '<tr style="border-bottom:1px solid #f1f5f9">' + td(d, 'left') + td(byD[d].length) + td(_gWon(a.spend)) + td(_gNum(a.impressions)) + td(a.vImp ? _gPct(a.viewRate, 1) : '-') + td(_gNum(a.clicks)) + td(_gPct(a.ctr)) + td(_gWon(a.cpc)) + td(_gNum(a.addToCart)) + td(_gNum(a.purchases)) + td(_gWon(a.purchaseValue)) + '</tr>'; });
  h += '</tbody></table></div></details></div>';
  return { html: h, byD: byD };
}

function _gCharts(byD) {
  if (typeof Chart === 'undefined') return;
  const G = window._GADS;
  Object.values(G.charts).forEach(c => { try { c.destroy(); } catch (_) {} }); G.charts = {};
  const days = Object.keys(byD).sort(); if (!days.length) return;
  const A = days.map(d => _gAgg(byD[d]));
  const c1 = document.getElementById('googleads-chart1'), c2 = document.getElementById('googleads-chart2'); if (!c1 || !c2) return;
  const lbl = days.map(d => d.slice(5));
  G.charts.a = new Chart(c1, { type: 'bar', data: { labels: lbl, datasets: [
    { label: '지출(₩)', data: A.map(a => Math.round(a.spend)), backgroundColor: 'rgba(37,99,235,0.3)', borderColor: '#2563eb', yAxisID: 'y' },
    { label: '클릭', data: A.map(a => a.clicks), type: 'line', borderColor: '#16a34a', backgroundColor: '#16a34a', tension: 0.3, yAxisID: 'y1' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: '일별 지출 · 클릭' }, legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { callback: v => '₩' + Number(v).toLocaleString() } }, y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { precision: 0 } } } } });
  G.charts.b = new Chart(c2, { type: 'line', data: { labels: lbl, datasets: [
    { label: 'CTR(%)', data: A.map(a => +a.ctr.toFixed(2)), borderColor: '#1d4ed8', backgroundColor: '#1d4ed8', tension: 0.3, yAxisID: 'y' },
    { label: '동영상 조회율(%)', data: A.map(a => a.vImp ? +a.viewRate.toFixed(1) : null), borderColor: '#0891b2', backgroundColor: '#0891b2', tension: 0.3, yAxisID: 'y1' },
    { label: '장바구니율(%)', data: A.map(a => +a.cartRate.toFixed(2)), borderColor: '#a16207', backgroundColor: '#a16207', tension: 0.3, yAxisID: 'y' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: '일별 CTR · 조회율 · 장바구니율' }, legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true }, y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } } } } });
}

function _gHistoryHtml(reports, sel) {
  if (!reports.length) return '';
  let h = '<div class="card" style="padding:18px"><div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:10px">🗂 지난 리포트</div><div style="display:flex;flex-direction:column;gap:4px;max-height:360px;overflow:auto">';
  reports.forEach(r => {
    const d = (r.kpi && r.kpi.day) || {}; const first = (r.analysis || '').split('\n')[0].replace(/\*/g, '').replace(/^한 줄 결론\s*[—-]?\s*/, '');
    h += '<div onclick="window._GADS.sel=\'' + r.date + '\';renderGoogleAdsPage()" style="cursor:pointer;display:flex;gap:12px;align-items:center;padding:7px 10px;border-radius:8px;background:' + (r.date === sel ? '#eff6ff' : 'transparent') + ';border:1px solid ' + (r.date === sel ? '#bfdbfe' : '#f1f5f9') + '">' +
      '<span style="font-size:12px;font-weight:700;color:#0f172a;width:110px;flex-shrink:0">' + _gDateK(r.date) + '</span>' +
      '<span style="font-size:11.5px;color:#475569;width:320px;flex-shrink:0">지출 ' + _gWon(d.spend) + ' · 클릭 ' + _gNum(d.clicks) + ' · 장바구니 ' + _gNum(d.addToCart) + ' · 구매 ' + _gNum(d.purchases) + '</span>' +
      '<span style="font-size:11.5px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (first ? _gEsc(first) : (r.rowsCount === 0 ? '송출 없음' : '분석 없음')) + '</span>' +
      ((r.alerts || []).some(a => a.level !== 'good') ? '<span style="margin-left:auto;font-size:10.5px;color:#dc2626;font-weight:700;flex-shrink:0">경보 ' + r.alerts.filter(a => a.level !== 'good').length + '</span>' : '') + '</div>';
  });
  return h + '</div></div>';
}

function renderGoogleAdsPage() {
  const host = document.getElementById('googleads-root'); if (!host) return;
  const G = window._GADS;
  if (!G.ts && !G.loading) {
    host.innerHTML = '<div style="padding:30px;color:#94a3b8;font-size:13px">구글 광고 데이터를 불러오는 중…</div>';
    _gadsLoad(false).then(() => renderGoogleAdsPage()).catch(e => { host.innerHTML = '<div style="padding:30px;color:#dc2626;font-size:13px">불러오기 실패: ' + _gEsc(e && e.message) + '</div>'; });
    return;
  }
  let filt = host.querySelector('.period-filter[data-prefix="ga"]');
  if (!filt) { const tmp = document.createElement('div'); tmp.innerHTML = _gPeriodHtml(); filt = tmp.firstChild; }
  const range = (typeof _periodComputeRange === 'function') ? (() => { const tmpHost = document.createElement('div'); tmpHost.appendChild(filt); document.body.appendChild(tmpHost); const r = _periodComputeRange('ga'); document.body.removeChild(tmpHost); return r; })() : { start: '', end: '' };
  const rows = G.rows.filter(r => (!range.start || r.date >= range.start) && (!range.end || r.date <= range.end));
  const rep = G.reports.find(r => r.date === G.sel) || G.reports[0];
  const per = _gPeriodSection(rows);
  host.innerHTML = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
    '<span style="font-size:12px;color:#64748b">갱신 ' + (G.ts ? new Date(G.ts).toLocaleString('ko-KR', { hour12: false }) : '-') + ' · 매일 아침 자동 (구글 광고 계정 133-454-6711, 어제 하루)</span>' +
    '<button class="btn btn-sm" onclick="window._GADS.ts=0;renderGoogleAdsPage()" style="height:28px;font-size:12px">🔄 새로고침</button>' +
    '<span style="margin-left:auto;font-size:12px;color:#475569;font-weight:700">리포트 날짜</span><select class="fs" onchange="window._GADS.sel=this.value;renderGoogleAdsPage()" style="width:150px;font-size:12px;height:30px">' +
    G.reports.map(r => '<option value="' + r.date + '"' + (rep && r.date === rep.date ? ' selected' : '') + '>' + r.date + (r.analysis ? ' 🧠' : '') + '</option>').join('') + '</select></div>' +
    _gReportHtml(rep) + per.html + _gHistoryHtml(G.reports, rep && rep.date);
  const slot = document.getElementById('googleads-period-slot'); if (slot) { slot.appendChild(filt); if (typeof _periodInit === 'function') _periodInit('ga'); }
  try { _gCharts(per.byD); } catch (e) { console.warn('googleads chart', e); }
}
