/* =============================================================================
   홈쇼핑 방송 기록 — 경쟁사 화장품 생방송 5분 단위 판매 추적        — v2.3.912~
   =============================================================================
   데이터는 서버(hermes-server /srv/hsmon)가 쓴다. 프론트는 읽기만 한다.
     erp_data/hsBroadcasts  {data: JSON([방송]), ts}
       방송 = {id, broadcaster, date(YYYYMMDD), pgmId, start, end, title, host,
               brands[], products[{prdCd,name,brand,salePrice,benefit,first,last,sold,soldOut}],
               ticks[{t,sold,amount}], sold, amount, peak{t,sold,amount}, updatedAt}

   수집 방식 (왜 이 숫자를 믿을 수 있나)
     GS샵 편성표에 상품별 '구매수량' 누적값이 공개돼 있다. 5분마다 찍어 **차이**를 낸 것이
     그 구간 판매량이다. 재방송(순환방송)은 제외하고 본방송만 기록한다.
     추정 매출 = 구간 판매량 × 판매가. 실제 결제액(취소·옵션차)과는 다를 수 있다.

   호스트가 준비할 것: #hsbroadcast-root,
                      window._firebaseDb / _firestoreDoc / _firestoreGetDocFromServer
   ============================================================================= */

window._HSB = window._HSB || { list: [], ts: 0, loadedAt: 0, sel: null, loading: false, chart: null };

async function _hsbLoad(force) {
  const H = window._HSB;
  if (H.loading) return;
  if (!force && H.ts && (Date.now() - H.loadedAt) < 3 * 60 * 1000) return;
  H.loading = true;
  try {
    const db = window._firebaseDb, docF = window._firestoreDoc;
    const getFn = window._firestoreGetDocFromServer || window._firestoreGetDoc;
    if (!db || !docF || !getFn) throw new Error('Firestore 준비 안 됨');
    const snap = await getFn(docF(db, 'erp_data', 'hsBroadcasts'));
    const d = (snap && snap.exists && snap.exists()) ? snap.data() : null;
    let arr = d ? d.data : [];
    if (typeof arr === 'string') arr = JSON.parse(arr);
    H.list = (Array.isArray(arr) ? arr : []).slice().sort((a, b) =>
      (a.date + a.start) < (b.date + b.start) ? 1 : -1);          // 최신 먼저
    H.ts = (d && d.ts) || 0;
    H.loadedAt = Date.now();
    if (!H.sel || !H.list.find(b => b.id === H.sel)) H.sel = H.list.length ? H.list[0].id : null;
  } finally { H.loading = false; }
}

// ── 포맷 ──
const _hEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const _hNum = (v) => (Number(v) || 0).toLocaleString();
const _hWon = (v) => '₩' + Math.round(Number(v) || 0).toLocaleString();
function _hDateK(d) {
  if (!d || d.length < 8) return d || '';
  const dt = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
  return d.slice(0, 4) + '.' + d.slice(4, 6) + '.' + d.slice(6, 8) + ' (' + '일월화수목금토'[dt.getDay()] + ')';
}
const _HS_COLOR = { 'GS샵': '#e11d48', 'CJ온스타일': '#7c3aed', '롯데홈쇼핑': '#ea580c' };
function _hBadge(b) {
  const c = _HS_COLOR[b] || '#475569';
  return '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:800;'
    + 'color:#fff;background:' + c + '">' + _hEsc(b) + '</span>';
}

// ── 제품 사진 · 혜택 ──
//   GS샵 이미지는 prdCd 로 주소가 정해진다. 저장된 기록에 img 가 없어도 그려진다.
//   서버(hs_gs.py)가 p.img 를 보내기 시작하면 그 값을 먼저 쓴다.
function _hsbImgUrl(p) {
  let u = String((p && p.img) || '');
  if (!u && /^[0-9]{6,}$/.test(String((p && p.prdCd) || ''))) u = 'https://asset.m-gs.kr/prod/' + p.prdCd + '/1/200';
  if (u.indexOf('//') === 0) u = 'https:' + u;
  return /^https:\/\//.test(u) ? u : '';
}
function _hsbImgTag(p, px) {
  const u = _hsbImgUrl(p); if (!u) return '';
  const n = px || 40;
  return '<img src="' + _hEsc(u) + '" alt="" loading="lazy" referrerpolicy="no-referrer" '
    + 'onerror="this.style.display=&quot;none&quot;" '
    + 'style="width:' + n + 'px;height:' + n + 'px;border-radius:7px;object-fit:cover;'
    + 'background:#f1f5f9;border:1px solid #e2e8f0;flex:0 0 auto">';
}
//   '무료배송' 은 빼고 할인율 %·무이자 개월을 정확히 적는다.
//   서버가 숫자(dcRt·noIntMm)를 보내기 전 기록은 글자 혜택에서 무료배송만 뺀다.
function _hsbEventText(p) {
  if (!p) return '-';
  const out = [];
  let dc = Number(p.dcRt || 0);
  if (!dc && p.listPrice && p.salePrice && p.listPrice > p.salePrice) {
    dc = Math.round((p.listPrice - p.salePrice) * 100 / p.listPrice);
  }
  const mm = Number(p.noIntMm || 0);
  const raw = String(p.benefit || '');
  if (dc > 0) out.push('할인 ' + dc + '%');
  if (p.gsPayDc || /GS Pay/i.test(raw)) out.push('GS Pay 할인');   // GS 는 할인율을 편성표에 안 적는다
  if (p.vipDc) out.push('VIP 할인');
  if (mm > 0) out.push('무이자 ' + mm + '개월');
  if (mm > 0 || dc > 0) {
    // 숫자로 적을 수 없는 나머지 혜택도 흘리지 않는다 (무료배송만 뺀다)
    ['쿠폰', '적립', '사은품', '추가 증정'].forEach(k => { if (raw.indexOf(k) >= 0) out.push(k); });
    return _hEsc(out.join(' · '));
  }
  // 서버가 숫자를 보내기 전 기록: 글자 뭉치에서 무료배송만 뺀다.
  // ⚠️ 공백으로 쪼개면 'GS Pay 할인' 이 세 조각이 된다 — 편성표가 쓰는 칩 이름으로 끊는다.
  const CHIPS = ['GS Pay 할인', 'VIP 할인', '카드 할인', '쿠폰 할인', '쿠폰', '무이자', '적립', '사은품', '추가 증정'];
  const hit = CHIPS.filter(k => raw.indexOf(k) >= 0);
  if (hit.length) return _hEsc(hit.filter((k, i) => !hit.some((o, j) => j !== i && o.indexOf(k) >= 0 && o !== k)).join(' · '));
  const txt = raw.replace(/무료배송/g, ' ').replace(/\s+/g, ' ').trim();
  return txt ? _hEsc(txt) : '-';
}

// ── 상단 요약 8칸 (선택한 방송 기준 + 최근 30일 집계 1칸) ──
//   ⚠️ 1~6·8번은 '선택한 방송', 7번만 30일 집계다. 부연 줄로 구분해 둔다.
function _hMinFrom(start, t) {
  const p = (s) => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1] * 60 + +m[2]) : null; };
  const a = p(start), c = p(t);
  if (a == null || c == null) return null;
  let d = c - a; if (d < 0) d += 24 * 60;      // 자정을 넘긴 방송
  return d;
}
function _hsbSummary(list, b) {
  const cut = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10).replace(/-/g, ''); })();
  const rec = list.filter(x => x.date >= cut);
  const brands = new Set(); rec.forEach(x => (x.brands || []).forEach(v => brands.add(v)));

  // 구성이 여러 개면 가장 많이 팔린 것을 대표로 쓴다
  const prods = ((b && b.products) || []).slice().sort((x, y) => (y.sold || 0) - (x.sold || 0));
  const top = prods[0] || null;
  const topSub = prods.length > 1 ? ('구성 ' + prods.length + '건 중 최다 판매') : '';
  const peakMin = (b && b.peak) ? _hMinFrom(b.start, b.peak.t) : null;

  // [라벨, 값, 부연, 배경, 글자색, 값 글자크기]
  const cards = [
    ['방송 시간', b ? (_hEsc(b.start) + '~' + _hEsc(b.end)) : '-',
      b ? (_hBadge(b.broadcaster) + ' <span style="color:#94a3b8">' + _hDateK(b.date) + '</span>') : '', '#eff6ff', '#1d4ed8', 19],
    ['제품명', top ? _hEsc(top.name) : (b ? _hEsc((b.brands || []).join(' / ') || b.title) : '-'),
      topSub, '#f5f3ff', '#6d28d9', 14],
    ['판매가', top ? _hWon(top.salePrice) : '-', top && top.soldOut ? '품절' : '', '#f8fafc', '#334155', 19],
    ['이벤트', _hsbEventText(top), '', '#fff7ed', '#c2410c', 14],
    ['추적 판매 수량', b ? (_hNum(b.sold) + '개') : '-', '이 방송', '#f0fdf4', '#15803d', 19],
    ['추정 매출', b ? _hWon(b.amount) : '-', '이 방송', '#fefce8', '#a16207', 19],
    ['최근 30일 방송', _hNum(rec.length) + '회', '등장 브랜드 ' + _hNum(brands.size) + '개', '#eef2ff', '#4338ca', 19],
    ['최다 판매', (peakMin == null) ? '-' : (_hNum(peakMin) + '분'),
      (b && b.peak) ? ('시작 후 · ' + _hEsc(b.peak.t) + ' · ' + _hNum(b.peak.sold) + '개') : '방송 시작 후', '#fdf2f8', '#9d174d', 19],
  ];
  return '<div id="hsb-kpi" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:14px;max-width:980px">'
    + cards.map(c => '<div style="background:' + c[3] + ';border-radius:10px;padding:10px 12px;min-width:0">'
      + '<div style="font-size:11.5px;color:#64748b;font-weight:600">' + c[0] + '</div>'
      + '<div style="font-size:' + c[5] + 'px;font-weight:800;color:' + c[4] + ';margin-top:3px;line-height:1.3;'
      + 'overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:anywhere">' + c[1] + '</div>'
      + (c[2] ? '<div style="font-size:10.5px;color:#94a3b8;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + c[2] + '</div>' : '')
      + '</div>').join('')
    + '</div>';
}

// ── 방송 목록 ──
function _hsbListHtml(list, selId) {
  if (!list.length) {
    return '<div style="padding:26px;color:#94a3b8;font-size:13px;background:#f8fafc;border-radius:10px">'
      + '아직 기록된 방송이 없습니다. 서버가 화장품 생방송 시간에 5분마다 자동으로 쌓습니다.</div>';
  }
  let h = '<div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">';
  let lastDate = '';
  list.forEach(b => {
    if (b.date !== lastDate) {
      lastDate = b.date;
      h += '<div style="background:#f8fafc;padding:7px 14px;font-size:11.5px;font-weight:800;color:#475569;'
        + 'border-top:1px solid #e2e8f0">' + _hDateK(b.date) + '</div>';
    }
    const on = b.id === selId;
    h += '<div onclick="window._hsbPick(\'' + _hEsc(b.id) + '\')" style="display:flex;align-items:center;gap:10px;'
      + 'padding:10px 14px;cursor:pointer;border-top:1px solid #f1f5f9;'
      + (on ? 'background:#eef2ff' : 'background:#fff') + '">'
      + _hBadge(b.broadcaster)
      + '<span style="font-size:12px;font-weight:700;color:#0f172a;width:104px;flex-shrink:0">' + _hEsc(b.start) + '~' + _hEsc(b.end) + '</span>'
      + '<span style="font-size:12.5px;font-weight:700;color:#0f172a;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
      + _hEsc((b.brands || []).join(' / ') || b.title) + '</span>'
      + '<span style="font-size:11.5px;color:#15803d;font-weight:700;width:96px;text-align:right;flex-shrink:0">' + _hNum(b.sold) + '개</span>'
      + '<span style="font-size:11.5px;color:#a16207;font-weight:700;width:118px;text-align:right;flex-shrink:0">' + _hWon(b.amount) + '</span>'
      + '</div>';
  });
  return h + '</div>';
}

// ── 방송 상세 ──
function _hsbDetailHtml(b) {
  if (!b) return '';
  const hasTicks = (b.ticks || []).length > 0;
  // 머리말(방송사·브랜드·시간)과 판매/매출/피크 줄은 상단 8칸과 같은 내용이라 뺐다.
  let h = '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:14px;background:#fff">';

  if (hasTicks) {
    h += '<div style="height:200px;margin-bottom:16px"><canvas id="hsb-chart"></canvas></div>';
  } else {
    h += '<div style="padding:14px;background:#fffbeb;border-radius:8px;font-size:12px;color:#92400e;margin-bottom:14px">'
      + '아직 구간 데이터가 없습니다 — 방송이 시작되면 5분마다 쌓입니다.</div>';
  }

  h += '<div style="font-size:12.5px;font-weight:800;color:#0f172a;margin-bottom:6px">구성별 판매</div>'
    + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<thead><tr style="background:#f8fafc">'
    + ['구성 (제품)', '판매가', '방송 중 판매', '추정 매출', '누적(시작→끝)'].map((t, i) =>
      '<th style="padding:7px 9px;text-align:' + (i === 0 ? 'left' : 'right') + ';border-bottom:1px solid #e2e8f0;'
      + 'font-size:11px;color:#475569;white-space:nowrap">' + t + '</th>').join('')
    + '</tr></thead><tbody>';
  (b.products || []).forEach(p => {
    h += '<tr style="border-bottom:1px solid #f1f5f9">'
      + '<td style="padding:7px 9px;color:#0f172a"><div style="display:flex;align-items:center;gap:8px;min-width:0">'
      + _hsbImgTag(p, 40)
      + '<span style="min-width:0">' + _hEsc(p.name)
      + (p.soldOut ? ' <span style="color:#dc2626;font-size:10.5px;font-weight:700">품절</span>' : '')
      + '</span></div></td>'
      + '<td style="padding:7px 9px;text-align:right;white-space:nowrap">' + _hWon(p.salePrice) + '</td>'
      + '<td style="padding:7px 9px;text-align:right;font-weight:700;color:#15803d;white-space:nowrap">' + _hNum(p.sold) + '개</td>'
      + '<td style="padding:7px 9px;text-align:right;color:#a16207;white-space:nowrap">' + _hWon((p.sold || 0) * (p.salePrice || 0)) + '</td>'
      + '<td style="padding:7px 9px;text-align:right;color:#94a3b8;white-space:nowrap">' + _hNum(p.first) + ' → ' + _hNum(p.last) + '</td>'
      + '</tr>';
  });
  h += '</tbody></table></div>';
  h += '<div style="margin-top:10px;font-size:11px;color:#94a3b8;line-height:1.6">'
    + '· 홈쇼핑이 공개한 누적 구매수량을 5분마다 읽어 그 차이를 적은 값입니다. 재방송은 제외합니다.<br>'
    + '· 추정 매출 = 구간 판매량 × 판매가. 취소·옵션 차이는 반영되지 않습니다.</div>';
  return h + '</div>';
}

function _hsbChart(b) {
  const H = window._HSB;
  try { if (H.chart) { H.chart.destroy(); H.chart = null; } } catch (_) { }
  if (!b || !(b.ticks || []).length || typeof Chart === 'undefined') return;
  const el = document.getElementById('hsb-chart'); if (!el) return;
  let run = 0;
  const cum = b.ticks.map(t => (run += (t.sold || 0)));
  H.chart = new Chart(el.getContext('2d'), {
    data: {
      labels: b.ticks.map(t => t.t),
      datasets: [
        { type: 'bar', label: '구간 판매(개)', data: b.ticks.map(t => t.sold || 0), backgroundColor: '#818cf8', yAxisID: 'y', order: 2 },
        { type: 'line', label: '누적(개)', data: cum, borderColor: '#15803d', backgroundColor: 'transparent', tension: .3, pointRadius: 2, yAxisID: 'y1', order: 1 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: {
        y: { beginAtZero: true, position: 'left', title: { display: true, text: '구간 판매', font: { size: 10 } }, ticks: { font: { size: 10 } } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '누적', font: { size: 10 } }, ticks: { font: { size: 10 } } },
        x: { ticks: { font: { size: 10 }, maxRotation: 0, autoSkipPadding: 12 } },
      },
    },
  });
}

window._hsbPick = function (id) { window._HSB.sel = id; renderHsBroadcastPage(); };

function renderHsBroadcastPage() {
  const host = document.getElementById('hsbroadcast-root'); if (!host) return;
  const H = window._HSB;
  if (!H.loadedAt && !H.loading) {
    host.innerHTML = '<div style="padding:30px;color:#94a3b8;font-size:13px">홈쇼핑 방송 기록을 불러오는 중…</div>';
    _hsbLoad(false).then(() => renderHsBroadcastPage())
      .catch(e => { host.innerHTML = '<div style="padding:30px;color:#dc2626;font-size:13px">불러오기 실패: ' + _hEsc(e && e.message) + '</div>'; });
    return;
  }
  const sel = H.list.find(b => b.id === H.sel) || H.list[0];
  host.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
    + '<span style="font-size:12px;color:#64748b">서버 갱신 '
    + (H.ts ? new Date(H.ts).toLocaleString('ko-KR', { hour12: false }) : '-')
    + ' · 화장품 생방송 중 5분마다 자동 기록</span>'
    + '</div>'
    + _hsbSummary(H.list, sel)
    + _hsbDetailHtml(sel)
    + '<div style="font-size:12.5px;font-weight:800;color:#0f172a;margin-bottom:6px">방송 이력</div>'
    + _hsbListHtml(H.list, sel && sel.id);
  try { _hsbChart(sel); } catch (e) { console.warn('hsb chart', e); }
}
