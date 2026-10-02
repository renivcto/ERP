/* =============================================================================
   다른 회사 광고 분석 — 경쟁 화장품 브랜드 고효율 소재 vs 글로우샷           — v2.3.873~
   =============================================================================
   데이터는 매일 아침 분석 작업이 Firestore 에 쓴다. 프론트는 읽기만 한다.
     erp_data/compAdsIndex              {data: JSON([날짜별 요약 행]), ts}
     erp_data/compAds_<YYYY-MM-DD>      {data: JSON(리포트), ts}
       리포트 = {date, generatedAt, headline, method, stats, top[], table[], patterns[], ours{}, compare[], diagnosis[], actions[]}
     erp_data/compAdsImg_<date>_<key>   {data: 'data:image/jpeg;base64,…', ts}   소재 장면 캡처(초 단위 12컷)
   ⚠️ 이 파일은 공개 저장소에 있다. 어떤 키·토큰도 두지 않는다.
   호스트가 준비할 것: #compads-root, window._firebaseDb/_firestoreDoc/_firestoreGetDocFromServer
   ============================================================================= */

window._CA = window._CA || { index: [], reps: {}, imgs: {}, sel: null, ts: 0, loading: false };
// v2.3.875: 같은 화면을 구글(_GCA · gcompAds*)에도 쓴다. 렌더 시점의 종류(_CAK)에 따라 문서 이름·버튼이 바뀐다.
window._GCA = window._GCA || { index: [], reps: {}, imgs: {}, sel: null, ts: 0, loading: false };
window._RCA = window._RCA || { index: [], reps: {}, imgs: {}, sel: null, ts: 0, loading: false };   // v2.3.879: 특정 레퍼런스 분석 (구글)
window._MRCA = window._MRCA || { index: [], reps: {}, imgs: {}, sel: null, ts: 0, loading: false };   // v2.3.880: 특정 레퍼런스 분석 (메타)
window._CA_CFG = {
  meta: { st: '_CA', pre: 'compAds', root: 'compads-root', back: 'metaads', backLabel: '← 메타 광고', render: 'renderCompAdsPage', src: '메타 광고 라이브러리 + 우리 메타 광고 실적' },
  google: { st: '_GCA', pre: 'gcompAds', root: 'gcompads-root', back: 'googleads', backLabel: '← 구글 광고', render: 'renderGCompAdsPage', src: '구글 광고 투명성 센터 + 유튜브 공개 조회수 + 우리 구글 광고 실적' },
  ref: { st: '_RCA', pre: 'refAds', root: 'refads-root', back: 'googleads', backLabel: '← 구글 광고', render: 'renderRefAdsPage', src: '부스터스 · 뉴셀렉트 · 아이리스브라이트 — 구글 광고 투명성 센터 + 유튜브 조회수', col: '게재 중 영상 · 구글 광고', colNote: '게재 중 영상 = 구글 영상 광고 중 어제까지 게재된 고유 유튜브 영상 수, 구글 광고 = 투명성 센터의 대한민국 노출 광고 수(공식몰 도메인 기준, 근사치).' },
  mref: { st: '_MRCA', pre: 'mrefAds', root: 'mrefads-root', back: 'metaads', backLabel: '← 메타 광고', render: 'renderMRefAdsPage', src: '부스터스 · 뉴셀렉트 · 아이리스브라이트 — 메타 광고 라이브러리', col: '메타 광고 · 60일+', colNote: '메타 광고 = 광고 라이브러리에서 게재 중으로 확인된 광고 수(브랜드 검색 상위 기준), 60일+ = 그중 60일 이상 게재 중인 광고 수.' } };
window._CAK = window._CAK || 'meta';
const _caC = () => window._CA_CFG[window._CAK] || window._CA_CFG.meta;
const _caS = () => window[_caC().st];

// v2.3.878: 월 → 일 날짜 선택기 (메타·구글 광고 화면 공용). dates = 'YYYY-MM-DD' 배열, cb = 날짜를 받는 전역 함수 이름
window._adsDatePicker = function (dates, sel, cb, label) {
  const ds = (dates || []).slice().sort().reverse(); if (!ds.length) return '';
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  sel = sel && ds.indexOf(sel) >= 0 ? sel : ds[0];
  const ym = sel.slice(0, 7); const months = {}; ds.forEach(d => { (months[d.slice(0, 7)] = months[d.slice(0, 7)] || []).push(d); });
  const mKeys = Object.keys(months).sort().reverse();
  const wd = (d) => '일월화수목금토'[new Date(d + 'T00:00:00').getDay()];
  let h = '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-left:auto">' +
    '<span style="font-size:12px;color:#475569;font-weight:700">' + esc(label || '날짜') + '</span>' +
    '<select onchange="' + cb + '(this.value)" style="height:32px;padding:0 28px 0 10px;line-height:30px;font-size:12.5px;font-weight:700;color:#0f172a;border:1px solid #cbd5e1;border-radius:8px;background-color:#fff;cursor:pointer">' +
    mKeys.map(m => '<option value="' + months[m][0] + '"' + (m === ym ? ' selected' : '') + '>' + m.slice(0, 4) + '년 ' + (+m.slice(5)) + '월 (' + months[m].length + '일)</option>').join('') + '</select></div>';
  h += '<div style="display:flex;flex-wrap:wrap;gap:4px;width:100%;justify-content:flex-end;margin-top:6px">' + months[ym].slice().sort().map(d => {
    const on = d === sel, w = wd(d), wc = w === '일' ? '#dc2626' : (w === '토' ? '#2563eb' : '#475569');
    return '<button onclick="' + cb + '(\'' + d + '\')" title="' + d + '" style="min-width:52px;height:30px;padding:0 8px;border-radius:8px;cursor:pointer;font-size:12px;line-height:28px;border:1px solid ' + (on ? '#2563eb' : '#e2e8f0') + ';background:' + (on ? '#2563eb' : '#fff') + ';color:' + (on ? '#fff' : '#0f172a') + ';font-weight:' + (on ? 800 : 600) + '">' + (+d.slice(8)) + '일 <span style="font-size:10.5px;color:' + (on ? '#dbeafe' : wc) + '">' + w + '</span></button>';
  }).join('') + '</div>';
  return h;
};
window._caPick = function (d) { const s = _caS(); s.sel = d; window[_caC().render](); };


function _caGet(id) {
  const db = window._firebaseDb, docF = window._firestoreDoc;
  const getFn = window._firestoreGetDocFromServer || window._firestoreGetDoc;
  if (!db || !docF || !getFn) return Promise.reject(new Error('Firestore 준비 안 됨'));
  return getFn(docF(db, 'erp_data', id)).then(s => (s && s.exists && s.exists()) ? s.data() : null);
}
async function _caLoadIndex(force) {
  const C = _caS();
  if (C.loading) return;
  if (!force && C.ts && (Date.now() - C.loadedAt) < 5 * 60 * 1000) return;
  C.loading = true;
  try {
    const d = await _caGet(_caC().pre + 'Index');
    let arr = []; try { arr = d ? (typeof d.data === 'string' ? JSON.parse(d.data) : d.data) : []; } catch (_) {}
    C.index = (Array.isArray(arr) ? arr : []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    C.ts = (d && d.ts) || Date.now(); C.loadedAt = Date.now();
    if (!C.sel || !C.index.find(r => r.date === C.sel)) C.sel = C.index.length ? C.index[0].date : null;
    if (force) { C.reps = {}; C.imgs = {}; }
  } finally { C.loading = false; }
}
async function _caLoadReport(date) {
  const C = _caS();
  if (C.reps[date]) return C.reps[date];
  const d = await _caGet(_caC().pre + '_' + date);
  let rep = null; try { rep = d ? (typeof d.data === 'string' ? JSON.parse(d.data) : d.data) : null; } catch (_) {}
  C.reps[date] = rep; return rep;
}
// 이미지는 화면에 그린 뒤 하나씩 받아 채운다 (문서 1MB 제한 때문에 이미지마다 별도 문서)
function _caFillImages(date) {
  const C = _caS();
  document.querySelectorAll('#' + _caC().root + ' img[data-ca-img]').forEach(el => {
    const key = el.getAttribute('data-ca-img'); const id = date + '_' + key;
    const put = (src) => { if (src) { el.src = src; el.style.opacity = 1; if (el.parentElement) el.parentElement.style.minHeight = '0'; el.parentElement && el.parentElement.querySelector('.ca-img-wait') && (el.parentElement.querySelector('.ca-img-wait').style.display = 'none'); } };
    if (C.imgs[id]) { put(C.imgs[id]); return; }
    _caGet(_caC().pre + 'Img_' + id).then(d => { if (d && d.data) { C.imgs[id] = d.data; put(d.data); } }).catch(() => {});
  });
}
function _caOpenImg(el) {
  if (!el || !el.src || el.src.indexOf('data:') !== 0) return;
  const w = window.open(''); if (!w) return;
  w.document.write('<title>소재 장면</title><body style="margin:0;background:#111;display:flex;justify-content:center"><img src="' + el.src + '" style="max-width:100%;height:auto"></body>');
}

const _caEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const _caWon = (v) => '₩' + Math.round(Number(v) || 0).toLocaleString();
const _caNum = (v) => (Number(v) || 0).toLocaleString();
function _caDateK(d) { if (!d) return ''; const dt = new Date(d + 'T00:00:00'); return dt.getFullYear() + '.' + String(dt.getMonth() + 1).padStart(2, '0') + '.' + String(dt.getDate()).padStart(2, '0') + ' (' + '일월화수목금토'[dt.getDay()] + ')'; }
const _caCard = (title, body, extra) => '<div class="card" style="padding:18px;margin-bottom:14px' + (extra || '') + '"><div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:12px">' + title + '</div>' + body + '</div>';
const _caTh = (t, al) => '<th style="padding:8px 6px;font-size:11px;color:#475569;white-space:nowrap;text-align:' + (al || 'center') + '">' + t + '</th>';
const _caTd = (t, al, ex) => '<td style="padding:7px 6px;font-size:12px;text-align:' + (al || 'center') + ';vertical-align:top' + (ex || '') + '">' + t + '</td>';
const _caChip = (t, bg, c) => '<span style="display:inline-block;background:' + (bg || '#f1f5f9') + ';color:' + (c || '#334155') + ';border-radius:999px;padding:2px 9px;font-size:11px;font-weight:700;margin:0 4px 4px 0">' + t + '</span>';
const _caLink = (href, t) => href ? '<a href="' + _caEsc(href) + '" target="_blank" rel="noopener" style="color:#2563eb;font-weight:700;text-decoration:none">' + (t || '보기') + ' ↗</a>' : '-';
const _caImg = (key, h) => '<div style="align-self:start;position:relative;background:#0f172a;border-radius:10px;overflow:hidden;min-height:' + (h || 160) + 'px">' +
  '<div class="ca-img-wait" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:12px">장면 이미지 불러오는 중…</div>' +
  '<img data-ca-img="' + _caEsc(key) + '" onclick="_caOpenImg(this)" title="클릭하면 크게 봅니다" style="display:block;width:100%;height:auto;opacity:0;transition:opacity .2s;cursor:zoom-in;position:relative"></div>';

function _caIndexTable(index, sel) {
  if (!index.length) return '<div style="color:#94a3b8;font-size:12.5px">아직 분석 기록이 없습니다.</div>';
  if (window._CAK === 'google') return _caIndexTableG(index, sel);
  if (window._CAK === 'ref' || window._CAK === 'mref') return _caIndexTableR(index, sel);
  let h = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
    _caTh('날짜', 'left') + _caTh('수집 광고') + _caTh('크리에이터 비중') + _caTh('영상 길이 중앙값') + _caTh('장기 생존 1위 소재', 'left') + _caTh('새로 뜨는 소재', 'left') +
    _caTh('우리 기준일') + _caTh('우리 CPM') + _caTh('우리 링크 CTR') + _caTh('훅률 / 유지율') + _caTh('랜딩 → 장바구니 → 구매') + _caTh('한 줄 결론', 'left') + '</tr></thead><tbody>';
  index.forEach(r => {
    const on = r.date === sel;
    h += '<tr onclick="window.' + _caC().st + '.sel=\'' + r.date + '\';' + _caC().render + '()" style="cursor:pointer;border-bottom:1px solid #f1f5f9;background:' + (on ? '#eff6ff' : 'transparent') + '">' +
      _caTd('<b>' + _caDateK(r.date) + '</b>', 'left', ';white-space:nowrap') + _caTd(_caNum(r.unique) + '개') + _caTd((r.creatorShare || 0) + '%') + _caTd((r.medianLen || 0) + '초') +
      _caTd(_caEsc(r.topBrand) + ' · ' + _caEsc(r.topTitle) + (r.topLink ? ' ' + _caLink(r.topLink, '') : ''), 'left', ';min-width:200px') + _caTd(_caEsc(r.newTop || '-'), 'left', ';min-width:300px') +
      _caTd(_caEsc(r.ourAsOf || '-'), 'center', ';white-space:nowrap') + _caTd(_caWon(r.ourCpm)) + _caTd((r.ourCtr || 0) + '%') + _caTd((r.ourHook || 0) + '% / ' + (r.ourHold || 0) + '%') +
      _caTd(_caNum(r.ourLpv) + ' → ' + _caNum(r.ourAtc) + ' → ' + _caNum(r.ourBuy)) + _caTd(_caEsc(r.headline || ''), 'left', ';min-width:260px') + '</tr>';
  });
  return h + '</tbody></table></div><div style="font-size:11px;color:#94a3b8;margin-top:6px">행을 누르면 그날 분석이 아래에 열립니다. 우리 수치는 기준일까지의 최신 구매 캠페인(소재 1~3) 기준이고, 랜딩·장바구니·구매는 누적입니다.</div>';
}

function _caIndexTableG(index, sel) {
  let h = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
    _caTh('날짜', 'left') + _caTh('수집 소재') + _caTh('유튜브 조회수 1위 소재', 'left') + _caTh('새로 뜨는 소재', 'left') + _caTh('우리 기준일') + _caTh('우리 지출(누적)') + _caTh('우리 CTR') + _caTh('우리 조회율') + _caTh('클릭 → 장바구니 → 구매') + _caTh('한 줄 결론', 'left') + '</tr></thead><tbody>';
  index.forEach(r => {
    const on = r.date === sel;
    h += '<tr onclick="window._GCA.sel=\'' + r.date + '\';renderGCompAdsPage()" style="cursor:pointer;border-bottom:1px solid #f1f5f9;background:' + (on ? '#eff6ff' : 'transparent') + '">' +
      _caTd('<b>' + _caDateK(r.date) + '</b>', 'left', ';white-space:nowrap') + _caTd(_caNum(r.unique) + '개') +
      _caTd(_caEsc(r.topBrand) + ' · ' + _caEsc(r.topTitle) + (r.topLink ? ' ' + _caLink(r.topLink, '') : ''), 'left', ';min-width:200px') + _caTd(_caEsc(r.newTop || '-'), 'left', ';min-width:300px') +
      _caTd(_caEsc(r.ourAsOf || '-'), 'center', ';white-space:nowrap') + _caTd(_caWon(r.ourSpend)) + _caTd((r.ourCtr || 0) + '%') + _caTd((r.ourViewRate || 0) + '%') +
      _caTd(_caNum(r.ourClicks) + ' → ' + _caNum(r.ourAtc) + ' → ' + _caNum(r.ourBuy)) + _caTd(_caEsc(r.headline || ''), 'left', ';min-width:260px') + '</tr>';
  });
  return h + '</tbody></table></div><div style="font-size:11px;color:#94a3b8;margin-top:6px">행을 누르면 그날 분석이 아래에 열립니다. 우리 수치는 구글 광고 계정 누적(최근 90일) 기준입니다.</div>';
}

function _caIndexTableR(index, sel) {
  const cos = (index[0] && index[0].cos) || [];
  let h = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
    _caTh('날짜', 'left') + cos.map(c => _caTh(_caEsc(c.n) + '<div style="font-weight:500;color:#94a3b8">' + (_caC().col || '메타 · 구글') + '</div>')).join('') + _caTh('유튜브 조회수 1위', 'left') + _caTh('새로 뜬 소재', 'left') + _caTh('한 줄 결론', 'left') + '</tr></thead><tbody>';
  index.forEach(r => {
    const on = r.date === sel;
    h += '<tr onclick="window.' + _caC().st + '.sel=\'' + r.date + '\';' + _caC().render + '()" style="cursor:pointer;border-bottom:1px solid #f1f5f9;background:' + (on ? '#eff6ff' : 'transparent') + '">' +
      _caTd('<b>' + _caDateK(r.date) + '</b>', 'left', ';white-space:nowrap') + (r.cos || []).map(c => _caTd(_caNum(c.meta) + ' · ' + _caNum(c.google), 'center', ';white-space:nowrap')).join('') +
      _caTd(_caEsc(r.topTitle || '') + (r.topLink ? ' ' + _caLink(r.topLink, '') : ''), 'left', ';min-width:200px') + _caTd(_caEsc(r.newTop || '-'), 'left', ';min-width:260px') + _caTd(_caEsc(r.headline || ''), 'left', ';min-width:280px') + '</tr>';
  });
  return h + '</tbody></table></div><div style="font-size:11px;color:#94a3b8;margin-top:6px">' + (_caC().colNote || '') + '</div>';
}

function _caCompanies(cos) {
  return '<div style="display:grid;grid-template-columns:repeat(' + Math.min(3, cos.length) + ',minmax(0,1fr));gap:12px">' + cos.map(c =>
    '<div style="border:1px solid #e2e8f0;border-radius:14px;padding:14px;background:#fff">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:15px;font-weight:800;color:#0f172a">' + _caEsc(c.name) + '</span><span style="margin-left:auto">' + _caLink(c.site, '사이트') + '</span></div>' +
    '<div style="font-size:11.5px;color:#64748b;margin-bottom:8px">' + _caEsc(c.note) + '</div>' +
    '<div style="margin-bottom:8px">' + (c.kpis || []).map(k => _caChip(_caEsc(k), '#eff6ff', '#1d4ed8')).join('') + '</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:8px"><thead><tr style="background:#f8fafc">' + _caTh('브랜드', 'left') + _caTh('분야', 'left') + _caTh('메타') + _caTh('구글') + '</tr></thead><tbody>' +
    (c.brands || []).map(b => '<tr style="border-bottom:1px solid #f1f5f9">' + _caTd('<b>' + _caEsc(b.n) + '</b>', 'left') + _caTd(_caEsc(b.cat), 'left', ';font-size:11px;color:#64748b') + _caTd(_caEsc(b.meta)) + _caTd(_caEsc(b.google)) + '</tr>').join('') + '</tbody></table>' +
    '<div style="font-size:12.5px;font-weight:800;color:#0f172a;margin:6px 0 4px">광고 운영 방식</div>' +
    (c.strategy || []).map(s => '<div style="font-size:12px;line-height:1.55;color:#1e293b;padding-left:12px;text-indent:-10px;margin-bottom:3px">• ' + _caEsc(s) + '</div>').join('') +
    (c.apply ? '<div style="background:#f0fdf4;border-radius:10px;padding:8px 10px;margin-top:8px;font-size:12px;color:#166534;line-height:1.55"><b>르니브 적용</b> · ' + _caEsc(c.apply) + '</div>' : '') +
    '</div>').join('') + '</div>';
}

function _caTopCards(top, rep) {
  return top.map((a, i) => {
    const flow = (a.flow || []).map(f => '<tr><td style="padding:4px 8px 4px 0;font-size:11.5px;color:#64748b;white-space:nowrap;vertical-align:top;font-weight:700">' + _caEsc(f[0]) + '</td><td style="padding:4px 0;font-size:12px;color:#1e293b;line-height:1.5">' + _caEsc(f[1]) + '</td></tr>').join('');
    const why = (a.why || []).map(w => '<div style="font-size:12px;line-height:1.55;color:#1e293b;padding-left:12px;text-indent:-10px;margin-bottom:3px">• ' + _caEsc(w) + '</div>').join('');
    return '<div style="border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:12px;background:#fff">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px"><span style="background:#0f172a;color:#fff;border-radius:8px;padding:2px 9px;font-size:12px;font-weight:800">#' + (i + 1) + '</span>' +
      '<span style="font-size:14px;font-weight:800;color:#0f172a">' + _caEsc(a.brand) + ' · ' + _caEsc(a.title) + '</span>' + _caChip(_caEsc(a.verdict), '#ecfdf5', '#047857') +
      '<span style="margin-left:auto">' + _caLink(a.link, a.linkLabel || '광고 라이브러리에서 보기') + (a.link2 ? ' &nbsp;' + _caLink(a.link2, a.link2Label || '영상') : '') + '</span></div>' +
      '<div style="margin-bottom:8px">' + _caChip('제품: ' + _caEsc(a.product)) + _caChip('화자: ' + _caEsc(a.who)) + _caChip('형식: ' + _caEsc(a.format) + (a.lenS ? ' · ' + a.lenS + '초' : '')) +
      _caChip('게재 시작 ' + _caEsc(a.start) + ' · ' + a.days + '일째', '#eff6ff', '#1d4ed8') + (a.views != null ? _caChip('유튜브 조회수 ' + _caNum(a.views) + '회', '#fee2e2', '#b91c1c') : '') + (a.copies ? _caChip((rep && rep.copiesLabel || '복제') + ': ' + _caEsc(a.copies), '#fef3c7', '#92400e') : '') + _caChip('랜딩: ' + _caEsc(a.landing)) + '</div>' +
      '<div style="font-size:11.5px;color:#475569;margin-bottom:10px"><b>' + _caEsc(rep && rep.kwLabel || '노출 지표(조회수 대체)') + '</b> · ' + _caEsc(a.kw) + ' <span style="color:#94a3b8">' + _caEsc(rep && rep.kwNote != null ? rep.kwNote : '(광고 라이브러리 \'높은 노출순\' 순위, 조회수는 메타 비공개)') + '</span></div>' +
      '<div style="display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:14px">' + _caImg(a.img, 200) +
      '<div><div style="font-size:12.5px;font-weight:800;color:#0f172a;margin-bottom:4px">🎬 장면 흐름</div><table style="border-collapse:collapse;margin-bottom:8px">' + flow + '</table>' +
      '<div style="font-size:12.5px;font-weight:800;color:#0f172a;margin:6px 0 4px">💡 효율이 높은 이유</div>' + why +
      '<div style="background:#f0fdf4;border-radius:10px;padding:8px 10px;margin-top:8px;font-size:12px;color:#166534;line-height:1.55"><b>글로우샷 적용</b> · ' + _caEsc(a.apply) + '</div>' +
      (a.caution ? '<div style="background:#fef2f2;border-radius:10px;padding:8px 10px;margin-top:6px;font-size:12px;color:#991b1b;line-height:1.55"><b>주의</b> · ' + _caEsc(a.caution) + '</div>' : '') +
      '</div></div></div>';
  }).join('');
}

function _caListTable(rows, rep) {
  const hasV = rows.some(r => r.views != null); const hasC = !(rep && rep.noCopies);
  let h = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
    _caTh('#') + _caTh('브랜드 / 게재 페이지', 'left') + _caTh('형식') + _caTh('길이') + _caTh('게재 시작일') + _caTh('게재 일수') + (hasC ? _caTh(rep && rep.copiesLabel || '복제') : '') + (hasV ? _caTh('유튜브 조회수') : '') + _caTh(rep && rep.tableKwLabel || '노출 순위 (조회수 대체)', 'left') + _caTh('첫 문구', 'left') + _caTh('링크') + '</tr></thead><tbody>';
  rows.forEach((r, i) => {
    const pg = r.creator ? _caEsc(r.brand) + '<div style="font-size:10.5px;color:#94a3b8">크리에이터 ' + _caEsc(r.creator) + '</div>' : _caEsc(r.page) + (r.landing ? '<div style="font-size:10.5px;color:#94a3b8">' + _caEsc(r.landing) + '</div>' : '');
    h += '<tr style="border-bottom:1px solid #f1f5f9">' + _caTd(i + 1) + _caTd(pg, 'left') + _caTd(_caEsc(r.format)) + _caTd(r.lenS ? r.lenS + '초' : '-') + _caTd(_caEsc(r.start), 'center', ';white-space:nowrap') +
      _caTd('<b style="color:' + (r.days >= 90 ? '#16a34a' : (r.days >= 30 ? '#0f172a' : '#94a3b8')) + '">' + r.days + '일</b>') + (hasC ? _caTd(r.copies > 1 ? '<b style="color:#b45309">' + r.copies + '개</b>' : '1') : '') + (hasV ? _caTd(r.views != null ? '<b style="color:#b91c1c">' + _caNum(r.views) + '</b>' : '-') : '') +
      _caTd(_caEsc(r.kw), 'left', ';font-size:11.5px;min-width:180px') + _caTd(_caEsc(r.hook), 'left', ';font-size:11.5px;color:#475569;min-width:220px') + _caTd(_caLink(r.link, '열기'), 'center', ';white-space:nowrap') + '</tr>';
  });
  return h + '</tbody></table></div><div style="font-size:11px;color:#94a3b8;margin-top:6px">순서 = 노출 순위·여러 키워드 동시 상위·게재 일수·복제 수를 합친 추정 점수. 초록 = 90일 이상 장기 게재.</div>';
}

function _caOurs(o) {
  if (!o) return '';
  if (o.kpis) return _caOursG(o);
  const k = (l, v, sub, bg, c) => '<div style="background:' + bg + ';border-radius:12px;padding:12px;text-align:center"><div style="font-size:11px;color:' + c + ';font-weight:700;margin-bottom:4px">' + l + '</div><div style="font-size:18px;font-weight:800;color:' + c + '">' + v + '</div>' + (sub ? '<div style="font-size:10.5px;color:#64748b;margin-top:2px">' + sub + '</div>' : '') + '</div>';
  const c = o.c0928 || {}, t = o.totals || {};
  let h = '<div style="font-size:11.5px;color:#64748b;margin-bottom:10px">' + _caEsc(o.note) + '</div>';
  h += '<div style="font-size:12.5px;font-weight:800;color:#0f172a;margin-bottom:6px">최근 구매 캠페인 (글로우샷 전환 캠페인_0928, 3일)</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-bottom:12px">' +
    k('지출', _caWon(c.spend), '', '#fdf2f8', '#9d174d') + k('CPM (노출 1천 회 비용)', _caWon(c.cpm), '트래픽 캠페인 ' + _caWon((o.traffic || {}).cpm), '#fef2f2', '#b91c1c') +
    k('훅률 (3초 시청)', c.hook + '%', '목표 20%', '#ecfdf5', '#047857') + k('유지율 (ThruPlay)', c.hold + '%', '목표 25% · 평균 ' + c.avgWatch + '초 시청', '#fef2f2', '#b91c1c') +
    k('링크 CTR · CPC', c.ctr + '%', 'CPC ' + _caWon(c.cpc), '#eff6ff', '#1d4ed8') + k('랜딩 → 장바구니 → 구매', _caNum(c.lpv) + ' → ' + _caNum(c.atc) + ' → ' + _caNum(c.buy), '누적 ' + _caNum(t.lpv) + ' → ' + _caNum(t.atc) + ' → ' + _caNum(t.buy), '#fefce8', '#a16207') + '</div>';
  h += '<details style="margin-bottom:12px"><summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:#475569">광고별 실적 (노출·조회수 포함, ' + _caEsc(t.period) + ')</summary><div style="overflow-x:auto;margin-top:8px"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
    _caTh('광고', 'left') + _caTh('목적') + _caTh('기간') + _caTh('지출') + _caTh('노출') + _caTh('3초 조회') + _caTh('ThruPlay') + _caTh('훅률') + _caTh('유지율') + _caTh('링크 CTR') + _caTh('CPC') + _caTh('CPM') + _caTh('랜딩') + _caTh('장바구니') + _caTh('구매') + '</tr></thead><tbody>';
  (o.ads || []).forEach(a => {
    h += '<tr style="border-bottom:1px solid #f1f5f9">' + _caTd('<b>' + _caEsc(a.ad) + '</b><div style="font-size:10.5px;color:#94a3b8">' + _caEsc(a.campaign) + '</div>', 'left') + _caTd(_caEsc(a.objective)) + _caTd(_caEsc(a.period)) +
      _caTd(_caWon(a.spend)) + _caTd(_caNum(a.impressions)) + _caTd(_caNum(a.video3s)) + _caTd(_caNum(a.thruplay)) + _caTd(a.hook + '%') + _caTd(a.hold + '%') + _caTd(a.ctr + '%') + _caTd(_caWon(a.cpc)) + _caTd(_caWon(a.cpm)) +
      _caTd(_caNum(a.lpv)) + _caTd(_caNum(a.atc)) + _caTd(_caNum(a.buy)) + '</tr>';
  });
  h += '</tbody></table></div><div style="font-size:11px;color:#94a3b8;margin-top:4px">이미지 광고(흑자·검버섯)는 영상이 아니라 3초 조회가 0으로 나옵니다.</div></details>';
  h += '<div style="font-size:12.5px;font-weight:800;color:#0f172a;margin-bottom:6px">우리 최신 완성본 장면 (같은 시점 제작분)</div>';
  h += (o.creatives || []).map(cv => '<div style="border:1px solid #fee2e2;border-radius:14px;padding:12px;margin-bottom:10px;background:#fffafa">' +
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px"><span style="font-size:13.5px;font-weight:800;color:#0f172a">' + _caEsc(cv.name) + '</span>' +
    _caChip(_caEsc(cv.len)) + _caChip('제작 ' + _caEsc(cv.made)) + _caChip('제품 첫 등장 ' + _caEsc(cv.productAt), /^0/.test(cv.productAt) ? '#ecfdf5' : '#fef2f2', /^0/.test(cv.productAt) ? '#047857' : '#b91c1c') +
    '<span style="margin-left:auto">' + _caLink(cv.drive, '드라이브 영상') + '</span></div>' +
    '<div style="display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:14px">' + _caImg(cv.key, 200) +
    '<div>' + (cv.notes || []).map(n => '<div style="font-size:12px;line-height:1.55;color:#1e293b;padding-left:12px;text-indent:-10px;margin-bottom:4px">• ' + _caEsc(n) + '</div>').join('') + '</div></div></div>').join('');
  return h;
}

function _caOursG(o) {
  let h = '<div style="font-size:11.5px;color:#64748b;margin-bottom:10px">' + _caEsc(o.note) + '</div>';
  if (o.kpiTitle) h += '<div style="font-size:12.5px;font-weight:800;color:#0f172a;margin-bottom:6px">' + _caEsc(o.kpiTitle) + '</div>';
  const tone = { bad: ['#fef2f2', '#b91c1c'], good: ['#ecfdf5', '#047857'], info: ['#eff6ff', '#1d4ed8'], warn: ['#fefce8', '#a16207'], spend: ['#fdf2f8', '#9d174d'] };
  h += '<div style="display:grid;grid-template-columns:repeat(' + Math.min(6, o.kpis.length) + ',minmax(0,1fr));gap:8px;margin-bottom:12px">' + o.kpis.map(k => { const t = tone[k.tone] || tone.info; return '<div style="background:' + t[0] + ';border-radius:12px;padding:12px;text-align:center"><div style="font-size:11px;color:' + t[1] + ';font-weight:700;margin-bottom:4px">' + _caEsc(k.l) + '</div><div style="font-size:18px;font-weight:800;color:' + t[1] + '">' + _caEsc(k.v) + '</div>' + (k.sub ? '<div style="font-size:10.5px;color:#64748b;margin-top:2px">' + _caEsc(k.sub) + '</div>' : '') + '</div>'; }).join('') + '</div>';
  if (o.adCols && o.adRows) {
    h += '<details style="margin-bottom:12px"><summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:#475569">' + _caEsc(o.adTitle || '광고별 실적') + '</summary><div style="overflow-x:auto;margin-top:8px"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
      o.adCols.map((c, i) => _caTh(_caEsc(c), i === 0 ? 'left' : 'center')).join('') + '</tr></thead><tbody>' +
      o.adRows.map(r => '<tr style="border-bottom:1px solid #f1f5f9">' + r.map((c, i) => _caTd(i === 0 ? '<b>' + _caEsc(c) + '</b>' : (/^https?:/.test(String(c)) ? _caLink(c, '보기') : _caEsc(c)), i === 0 ? 'left' : 'center')).join('') + '</tr>').join('') + '</tbody></table></div>' +
      (o.adNote ? '<div style="font-size:11px;color:#94a3b8;margin-top:4px">' + _caEsc(o.adNote) + '</div>' : '') + '</details>';
  }
  h += '<div style="font-size:12.5px;font-weight:800;color:#0f172a;margin-bottom:6px">' + _caEsc(o.creativeTitle || '우리 소재 장면') + '</div>';
  h += (o.creatives || []).map(cv => '<div style="border:1px solid #fee2e2;border-radius:14px;padding:12px;margin-bottom:10px;background:#fffafa">' +
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px"><span style="font-size:13.5px;font-weight:800;color:#0f172a">' + _caEsc(cv.name) + '</span>' +
    (cv.chips || []).map(c => _caChip(_caEsc(c))).join('') + (cv.productAt ? _caChip('제품 첫 등장 ' + _caEsc(cv.productAt), /^0/.test(cv.productAt) ? '#ecfdf5' : '#fef2f2', /^0/.test(cv.productAt) ? '#047857' : '#b91c1c') : '') +
    '<span style="margin-left:auto">' + _caLink(cv.link, cv.linkLabel || '영상') + '</span></div>' +
    '<div style="display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:14px">' + _caImg(cv.key, 200) +
    '<div>' + (cv.notes || []).map(n => '<div style="font-size:12px;line-height:1.55;color:#1e293b;padding-left:12px;text-indent:-10px;margin-bottom:4px">• ' + _caEsc(n) + '</div>').join('') + '</div></div></div>').join('');
  return h;
}

function _caCompare(rows, rep) {
  const hd = (rep && rep.compareHead) || ['항목', '경쟁 상위 소재', '글로우샷 (현재)', '차이의 영향'];
  let h = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
    _caTh(hd[0], 'left') + _caTh(hd[1], 'left') + _caTh(hd[2], 'left') + _caTh(hd[3]) + '</tr></thead><tbody>';
  rows.forEach(r => {
    const imp = r[3] || ''; const col = /^높음/.test(imp) ? '#dc2626' : (/^중간/.test(imp) ? '#d97706' : '#64748b');
    h += '<tr style="border-bottom:1px solid #f1f5f9">' + _caTd('<b>' + _caEsc(r[0]) + '</b>', 'left', ';white-space:nowrap') + _caTd(_caEsc(r[1]), 'left', ';color:#166534') + _caTd(_caEsc(r[2]), 'left', ';color:#991b1b') + _caTd('<b style="color:' + col + '">' + _caEsc(imp) + '</b>', 'center', ';white-space:nowrap') + '</tr>';
  });
  return h + '</tbody></table></div>';
}

function renderCompAdsPage() { _caRender('meta'); }
function renderGCompAdsPage() { _caRender('google'); }
function renderRefAdsPage() { _caRender('ref'); }
function renderMRefAdsPage() { _caRender('mref'); }   // v2.3.880: 메타 · 특정 레퍼런스 분석   // v2.3.879: 특정 레퍼런스 분석   // v2.3.875: 구글 · 다른 회사 광고 분석
function _caRender(kind) {
  window._CAK = kind; const K = _caC();
  const host = document.getElementById(K.root); if (!host) return;
  const C = _caS();
  if (!C.ts && !C.loading) {
    host.innerHTML = '<div style="padding:30px;color:#94a3b8;font-size:13px">다른 회사 광고 분석을 불러오는 중…</div>';
    _caLoadIndex(false).then(() => _caRender(kind)).catch(e => { host.innerHTML = '<div style="padding:30px;color:#dc2626;font-size:13px">불러오기 실패: ' + _caEsc(e && e.message) + '</div>'; });
    return;
  }
  const date = C.sel;
  const rep = date ? C.reps[date] : null;
  if (date && rep === undefined) {
    host.innerHTML = '<div style="padding:30px;color:#94a3b8;font-size:13px">' + _caDateK(date) + ' 분석을 불러오는 중…</div>';
    _caLoadReport(date).then(() => _caRender(kind)).catch(e => { host.innerHTML = '<div style="padding:30px;color:#dc2626;font-size:13px">불러오기 실패: ' + _caEsc(e && e.message) + '</div>'; });
    return;
  }
  let h = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
    '<button class="btn btn-sm" onclick="go(\'' + K.back + '\')" style="height:28px;font-size:12px">' + K.backLabel + '</button>' +
    '<span style="font-size:12px;color:#64748b">갱신 ' + (C.ts ? new Date(C.ts).toLocaleString('ko-KR', { hour12: false }) : '-') + ' · 매일 아침 자동 분석 (' + K.src + ')</span>' +
    '<button class="btn btn-sm" onclick="window.' + K.st + '.ts=0;' + K.render + '()" style="height:28px;font-size:12px">🔄 새로고침</button>' +
    window._adsDatePicker(C.index.map(r => r.date), date, '_caPick', '분석 날짜') + '</div>';
  const _ym = (date || '').slice(0, 7); const _mIdx = C.index.filter(r => r.date.slice(0, 7) === _ym);
  h += _caCard('📅 날짜별 요약 · ' + _ym.slice(0, 4) + '년 ' + (+_ym.slice(5)) + '월 <span style="font-size:12px;color:#94a3b8;font-weight:500">(' + _mIdx.length + '일 · 다른 달은 위 날짜 선택에서 고르세요)</span>', _caIndexTable(_mIdx.length ? _mIdx : C.index, date));
  if (!rep) { host.innerHTML = h + '<div class="card" style="padding:24px;color:#94a3b8;font-size:13px">선택한 날짜의 분석이 없습니다.</div>'; return; }
  const m = rep.method || {}, s = rep.stats || {};
  h += '<div class="card" style="padding:16px 18px;margin-bottom:14px;background:linear-gradient(135deg,#eff6ff,#f0fdf4)">' +
    '<div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:6px">🔍 ' + _caDateK(rep.date) + ' 한 줄 결론</div><div style="font-size:13.5px;color:#1e293b;line-height:1.6;margin-bottom:10px">' + _caEsc(rep.headline) + '</div>' +
    '<div>' + (rep.statsChips ? rep.statsChips.map(c => _caChip(_caEsc(c))).join('') : _caChip('수집 광고 ' + _caNum(s.unique) + '개') + _caChip('영상 ' + _caNum(s.video) + ' · 이미지 ' + _caNum(s.image)) + _caChip('크리에이터 파트너십 ' + (s.creatorShare || 0) + '%', '#ecfdf5', '#047857') +
    _caChip('영상 길이 중앙값 ' + (s.medianLen || 0) + '초') + _caChip('60일 이상 게재 ' + _caNum(s.long60) + '개', '#eff6ff', '#1d4ed8')) + '</div>' +
    '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;font-weight:700;color:#475569">조사 방법 · 조회수 안내</summary><div style="font-size:12px;color:#334155;line-height:1.6;margin-top:6px">' + _caEsc(m.text) +
    '<br><b>키워드</b>: ' + _caEsc((m.keywords || []).join(', ') || '-') + ' · <b>브랜드</b>: ' + _caEsc((m.brands || []).join(', ')) + '<br>' + _caEsc(m.viewsNote) + '</div></details></div>';
  if (rep.companies) h += _caCard('🏢 회사별 광고 운영 현황', _caCompanies(rep.companies));
  h += _caCard(rep.topTitle || ('🏆 효율이 높은 소재 TOP ' + (rep.top || []).length + ' — 장면 분석'), _caTopCards(rep.top || [], rep));
  h += _caCard(rep.tableTitle || '📋 노출 상위 소재 전체 표 (게재 시작일·게재 일수순 비교)', _caListTable(rep.table || [], rep));
  h += _caCard((rep.titles && rep.titles.patterns) || '🧩 공통 성공 패턴', '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">' + (rep.patterns || []).map((p, i) =>
    '<div style="background:#f8fafc;border-radius:12px;padding:12px 14px"><div style="font-size:13px;font-weight:800;color:#0f172a;margin-bottom:4px">' + (i + 1) + '. ' + _caEsc(p.t) + '</div><div style="font-size:12px;color:#334155;line-height:1.55">' + _caEsc(p.d) + '</div><div style="font-size:11.5px;color:#64748b;margin-top:4px">예) ' + _caEsc(p.ex) + '</div></div>').join('') + '</div>');
  if (rep.ours) h += _caCard((rep.titles && rep.titles.ours) || '🧴 우리 글로우샷 광고 현황', _caOurs(rep.ours), ';border:1px solid #fecaca');
  h += _caCard((rep.titles && rep.titles.compare) || '⚖️ 글로우샷 vs 경쟁 상위 소재 비교', _caCompare(rep.compare || [], rep));
  h += _caCard((rep.titles && rep.titles.diagnosis) || '🩺 우리 광고 효율이 떨어지는 이유', (rep.diagnosis || []).map((d, i) =>
    '<div style="border-left:4px solid #ef4444;background:#fff7f7;border-radius:10px;padding:10px 14px;margin-bottom:10px"><div style="font-size:13.5px;font-weight:800;color:#991b1b;margin-bottom:4px">' + (i + 1) + '. ' + _caEsc(d.title) + '</div>' +
    '<div style="font-size:12px;color:#1e293b;line-height:1.6"><b>근거</b> · ' + _caEsc(d.evidence) + '</div><div style="font-size:12px;color:#334155;line-height:1.6;margin-top:3px"><b>원인</b> · ' + _caEsc(d.cause) + '</div></div>').join(''));
  h += _caCard((rep.titles && rep.titles.actions) || '✅ 개선할 점 (우선순위)', '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">' + _caTh('우선순위') + _caTh('무엇을', 'left') + _caTh('어떻게', 'left') + _caTh('목표 지표') + '</tr></thead><tbody>' +
    (rep.actions || []).map(a => '<tr style="border-bottom:1px solid #f1f5f9">' + _caTd('<b style="color:' + (a.p === '1순위' ? '#dc2626' : (a.p === '2순위' ? '#d97706' : '#64748b')) + '">' + _caEsc(a.p) + '</b>', 'center', ';white-space:nowrap') +
      _caTd('<b>' + _caEsc(a.what) + '</b>', 'left', ';white-space:nowrap') + _caTd(_caEsc(a.how), 'left', ';line-height:1.55') + _caTd(_caEsc(a.kpi), 'center', ';white-space:nowrap;color:#1d4ed8;font-weight:700') + '</tr>').join('') + '</tbody></table></div>' +
    '<div style="font-size:11px;color:#94a3b8;margin-top:6px">경쟁사 효율은 공개 지표 기반 추정입니다. 광고 켜기/끄기·예산 변경은 이 화면에서 하지 않습니다.</div>');
  host.innerHTML = h;
  _caFillImages(rep.date);
}
