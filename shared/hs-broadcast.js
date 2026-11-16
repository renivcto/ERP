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

/* v2.3.941: bc = 보고 있는 방송사. 페이지를 열면 GS샵이 기본이다. */
window._HSB = window._HSB || { list: [], ts: 0, loadedAt: 0, sel: null, loading: false, chart: null, bc: 'GS샵' };
if (!window._HSB.bc) window._HSB.bc = 'GS샵';

async function _hsbLoad(force) {
  const H = window._HSB;
  if (H.loading) return;
  if (!force && H.ts && (Date.now() - H.loadedAt) < 3 * 60 * 1000) return;
  H.loading = true;
  try {
    const db = window._firebaseDb, docF = window._firestoreDoc;
    const getFn = window._firestoreGetDocFromServer || window._firestoreGetDoc;
    if (!db || !docF || !getFn) throw new Error('Firestore 준비 안 됨');
    /* v2.3.943: 서버가 5분마다 hsBroadcasts 를 통째로 다시 쓴다. 손으로 넣은 관측 기록
       (롯데 등)은 거기 두면 다음 tick 에 지워지므로 hsBroadcastsManual 에 따로 두고 합친다. */
    const read = async (name) => {
      try {
        const snap = await getFn(docF(db, 'erp_data', name));
        const d = (snap && snap.exists && snap.exists()) ? snap.data() : null;
        let arr = d ? d.data : [];
        if (typeof arr === 'string') arr = JSON.parse(arr);
        return { arr: Array.isArray(arr) ? arr : [], ts: (d && d.ts) || 0 };
      } catch (e) { console.warn('hsb read ' + name, e); return { arr: [], ts: 0 }; }
    };
    const readMap = async (name) => {
      try {
        const snap = await getFn(docF(db, 'erp_data', name));
        const d = (snap && snap.exists && snap.exists()) ? snap.data() : null;
        let m = d ? d.data : {};
        if (typeof m === 'string') m = JSON.parse(m);
        return (m && typeof m === 'object') ? m : {};
      } catch (e) { console.warn('hsb read ' + name, e); return {}; }
    };
    const auto = await read('hsBroadcasts');     // GS — 5분 자동 기록
    const sch = await read('hsSchedule');        // 롯데·CJ 편성 (수량 비공개)
    const man = await read('hsBroadcastsManual');// 손으로 넣은 기록
    /* 같은 id 면 manual > auto > schedule — 나중에 넣은 것이 이긴다 */
    const byId = new Map();
    [sch.arr, auto.arr, man.arr].forEach(arr =>
      (arr || []).forEach(b => { if (b && b.id) byId.set(b.id, b); }));
    H.obs = await readMap('hsbObservations');
    H.media = await readMap('hsbMedia');
    H.list = Array.from(byId.values())
      .map(b => _hsbApplyManual(_hsbApplyObs(b, H.obs[b.id]), H.obs[b.id]))
      .sort((a, b) => (a.date + a.start) < (b.date + b.start) ? 1 : -1);   // 최신 먼저
    H.ts = Math.max(auto.ts || 0, man.ts || 0, sch.ts || 0);
    H.loadedAt = Date.now();
    /* v2.3.941: 선택 보정은 renderHsBroadcastPage 가 방송사별로 한다 */
  } finally { H.loading = false; }
}

/* v2.3.942: 롯데 관측 캡처 — 본문(hsBroadcasts)과 분리해 따로 읽는다.
   한 번 읽으면 세션 동안 캐시한다. 없으면 조용히 비워 둔다. */
window._HSB_SHOTS = window._HSB_SHOTS || { map: null, loading: false };
async function _hsbLoadShots() {
  const S = window._HSB_SHOTS;
  if (S.map || S.loading) return;
  S.loading = true;
  try {
    const db = window._firebaseDb, docF = window._firestoreDoc;
    const getFn = window._firestoreGetDocFromServer || window._firestoreGetDoc;
    if (!db || !docF || !getFn) throw new Error('Firestore 준비 안 됨');
    const snap = await getFn(docF(db, 'erp_data', 'hsbShots'));
    const d = (snap && snap.exists && snap.exists()) ? snap.data() : null;
    let m = d ? d.data : {};
    if (typeof m === 'string') m = JSON.parse(m);
    S.map = m || {};
  } catch (e) { console.warn('hsbShots', e); S.map = {}; }
  finally { S.loading = false; }
}

/* v2.3.945: 관측(수량)을 방송 기록에 입힌다.
   관측은 erp_data/hsbObservations 에 id 별로 쌓인다 — 편성 기록을 덮어쓰지 않고 얹는다.
     { "<id>": { obs:[{t,n,pi?,live?,left?,shot?}], final:true, note:"" } }
   pi 는 구성(products) 번호, 없으면 0번. t 는 한국시간 HH:MM, n 은 화면에 뜬 수량. */
function _hsbApplyObs(b, rec) {
  if (!b || !rec || !Array.isArray(rec.obs) || !rec.obs.length) return b;
  const out = JSON.parse(JSON.stringify(b));
  const prods = out.products && out.products.length ? out.products : [{ name: out.title || '-', salePrice: 0 }];
  prods.forEach(p => { p.obs = []; });
  rec.obs.slice().sort((x, y) => String(x.t || '') < String(y.t || '') ? -1 : 1)
    .forEach(o => {
      const i = Math.min(Math.max(Number(o.pi) || 0, 0), prods.length - 1);
      prods[i].obs.push(o);
    });
  let tot = 0, amt = 0;
  prods.forEach(p => {
    if (!p.obs.length) return;
    const last = Number(p.obs[p.obs.length - 1].n) || 0;
    p.first = Number(p.obs[0].n) || 0;
    p.last = last; p.sold = last;
    tot += last; amt += last * (Number(p.salePrice) || 0);
  });
  out.products = prods;
  out.sold = tot; out.amount = amt; out.obsTotal = tot;
  out.obsFinal = rec.final === true;
  out.obsNote = rec.note || out.obsNote || '';
  out.src = 'app-observation';
  /* 구간 막대그래프 — 첫 관측은 그때까지 쌓인 양, 이후는 직전 대비 증가분 */
  const flat = prods.reduce((a, p) => a.concat(p.obs || []), [])
    .slice().sort((x, y) => String(x.t || '') < String(y.t || '') ? -1 : 1);
  if (flat.length > 1 && prods.filter(p => (p.obs || []).length).length === 1) {
    let prev = null;
    out.ticks = flat.map(o => {
      const n = Number(o.n) || 0;
      const d = (prev == null) ? n : (n - prev);
      prev = n;
      return { t: o.t, sold: d, amount: 0 };
    });
  }
  return out;
}

/* v2.3.950: 손으로 고친 값 입히기. 관측(obs)과 같은 문서, 같은 id 아래 manual 에 둔다.
   obs 가 없어도(편성만 있는 기록) 적용된다 — _hsbApplyObs 와 따로 도는 이유다. */
function _hsbApplyManual(b, rec) {
  const m = rec && rec.manual;
  if (!b || !m) return b;
  const out = JSON.parse(JSON.stringify(b));
  const prods = (out.products && out.products.length) ? out.products
    : [{ name: out.title || '-', salePrice: 0 }];
  out._man = {};
  if (m.price !== undefined && m.price !== null && m.price !== '') {
    prods[0].salePrice = Number(m.price) || 0;
    out._man.price = true;
  }
  if (m.event !== undefined && m.event !== null && m.event !== '') {
    prods[0].manualEvent = String(m.event);
    out._man.event = true;
  }
  out.products = prods;
  if (m.sold !== undefined && m.sold !== null && m.sold !== '') {
    out.sold = Number(m.sold) || 0;
    out.obsTotal = out.sold;
    out._man.sold = true;
  }
  if (m.amount !== undefined && m.amount !== null && m.amount !== '') {
    out.amount = Number(m.amount) || 0;
    out._man.amount = true;
  } else {
    /* 판매가만 적어도 매출이 나오게 — 수량 × 판매가 */
    const a = (Number(out.sold) || 0) * (Number(prods[0].salePrice) || 0);
    if (a) { out.amount = a; out._man.amountAuto = true; }
  }
  return out;
}

/* 한 항목만 저장한다. 빈 값이면 그 항목을 지워 원래대로 되돌린다. */
window.hsbSetManual = async function (id, key, value) {
  const db = window._firebaseDb, docF = window._firestoreDoc, setF = window._firestoreSetDoc;
  const getFn = window._firestoreGetDocFromServer || window._firestoreGetDoc;
  if (!db || !docF || !setF) throw new Error('Firestore 준비 안 됨');
  const ref = docF(db, 'erp_data', 'hsbObservations');
  const snap = await getFn(ref);
  let map = {};
  try {
    const d = snap && snap.exists && snap.exists() ? snap.data() : null;
    map = d ? (typeof d.data === 'string' ? JSON.parse(d.data) : (d.data || {})) : {};
  } catch (_) { map = {}; }
  const cur = map[id] || {};
  cur.manual = cur.manual || {};
  if (value === '' || value === null || value === undefined) delete cur.manual[key];
  else cur.manual[key] = value;
  cur.manualBy = (window._currentUser && window._currentUser.name) || '';
  cur.manualAt = new Date().toISOString();
  if (!Object.keys(cur.manual).length) delete cur.manual;
  map[id] = cur;
  await setF(ref, { data: JSON.stringify(map), ts: Date.now() }, { merge: true });
  window._HSB.obs = map;
  window._HSB.loadedAt = 0;
  await _hsbLoad(true);
  renderHsBroadcastPage();
};

/* 요약 칸을 눌렀을 때 뜨는 입력창 */
const _HSB_FIELD = {
  price: { label: '판매가', hint: '숫자만 (예: 139000). 비우면 지웁니다', num: true },
  event: { label: '이벤트', hint: '예: 쿠폰 10% · 무이자 12개월. 비우면 지웁니다', num: false },
  sold: { label: '방송 판매 수량', hint: '숫자만. 비우면 관측값으로 돌아갑니다', num: true },
  amount: { label: '추정 매출', hint: '숫자만. 비우면 수량 × 판매가로 자동 계산합니다', num: true },
};
window._hsbEditField = async function (id, key) {
  const f = _HSB_FIELD[key]; if (!f) return;
  const rec = (window._HSB.obs || {})[id] || {};
  const cur = (rec.manual || {})[key];
  const v = prompt(f.label + ' 을 적어주세요.' + String.fromCharCode(10) + f.hint,
    cur === undefined || cur === null ? '' : String(cur));
  if (v === null) return;
  const s = String(v).trim();
  let val = s;
  if (s !== '') {
    if (f.num) {
      const n = s.replace(/[, 원]/g, '');
      if (!/^[0-9]+$/.test(n)) { alert('숫자만 적어주세요'); return; }
      val = parseInt(n, 10);
    }
  } else { val = ''; }
  try {
    await window.hsbSetManual(id, key, val);
    if (typeof showNotif === 'function') showNotif(f.label + (val === '' ? ' 을 지웠습니다' : ' 을 적었습니다'), 'success');
  } catch (e) { alert('저장 실패: ' + (e && e.message)); }
};

/* ── Aside·사람이 쓰는 입력구 ──────────────────────────────────────────
   await hsbAddObservation('lotte-20261116-1135', [{t:'11:40', n:120}], {final:false, note:''})
   같은 시각(t)이 이미 있으면 덮어쓴다. 방송 끝난 뒤 값이면 final:true 로 준다. */
window.hsbAddObservation = async function (id, obs, opts) {
  if (!id || !Array.isArray(obs) || !obs.length) throw new Error('id 와 obs 배열이 필요합니다');
  const db = window._firebaseDb, docF = window._firestoreDoc, setF = window._firestoreSetDoc;
  const getFn = window._firestoreGetDocFromServer || window._firestoreGetDoc;
  if (!db || !docF || !setF) throw new Error('Firestore 준비 안 됨');
  const ref = docF(db, 'erp_data', 'hsbObservations');
  const snap = await getFn(ref);
  let map = {};
  try { const d = snap && snap.exists && snap.exists() ? snap.data() : null;
        map = d ? (typeof d.data === 'string' ? JSON.parse(d.data) : (d.data || {})) : {}; } catch (_) { map = {}; }
  const cur = map[id] || { obs: [] };
  const keep = (cur.obs || []).filter(o => !obs.some(n => String(n.t) === String(o.t) && (Number(n.pi) || 0) === (Number(o.pi) || 0)));
  cur.obs = keep.concat(obs).sort((x, y) => String(x.t || '') < String(y.t || '') ? -1 : 1);
  if (opts && typeof opts.final === 'boolean') cur.final = opts.final;
  if (opts && opts.note != null) cur.note = String(opts.note);
  cur.updatedAt = new Date().toISOString();
  map[id] = cur;
  await setF(ref, { data: JSON.stringify(map), ts: Date.now() }, { merge: true });
  window._HSB.obs = map;
  try { if (document.getElementById('hsbroadcast-root')) { window._HSB.loadedAt = 0; await _hsbLoad(true); renderHsBroadcastPage(); } } catch (_) {}
  return cur;
};

/* 사진·영상 등록. file 은 <input type=file> 의 File, 또는 {url, caption} 으로 링크만 달 수도 있다.
   파일은 Firebase Storage 로 올리고 문서에는 URL 만 남긴다 — 문서 1MB 한계를 넘기지 않기 위해서다. */
window.hsbAddMedia = async function (id, file, caption) {
  if (!id) throw new Error('id 가 필요합니다');
  const db = window._firebaseDb, docF = window._firestoreDoc, setF = window._firestoreSetDoc;
  const getFn = window._firestoreGetDocFromServer || window._firestoreGetDoc;
  if (!db || !docF || !setF) throw new Error('Firestore 준비 안 됨');
  let item;
  if (file && file.url) {
    item = { type: file.type || (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(file.url) ? 'video' : 'image'),
             url: String(file.url), caption: String(file.caption || caption || '') };
  } else {
    if (!window._storageUploadFile) throw new Error('Storage 준비 안 됨');
    const kind = /^video\//.test(file.type || '') ? 'video' : 'image';
    const path = 'erp/hsb/' + id + '/' + Date.now() + '_' + String(file.name || 'file').replace(/[^\w.\-]/g, '_');
    const url = await window._storageUploadFile(path, file);
    item = { type: kind, url: url, path: path, caption: String(caption || ''), size: file.size || 0 };
  }
  item.ts = Date.now();
  item.by = (window._currentUser && window._currentUser.name) || '';
  const ref = docF(db, 'erp_data', 'hsbMedia');
  const snap = await getFn(ref);
  let map = {};
  try { const d = snap && snap.exists && snap.exists() ? snap.data() : null;
        map = d ? (typeof d.data === 'string' ? JSON.parse(d.data) : (d.data || {})) : {}; } catch (_) { map = {}; }
  map[id] = (map[id] || []).concat([item]);
  await setF(ref, { data: JSON.stringify(map), ts: Date.now() }, { merge: true });
  window._HSB.media = map;
  try { renderHsBroadcastPage(); } catch (_) {}
  return item;
};

window.hsbRemoveMedia = async function (id, idx) {
  const db = window._firebaseDb, docF = window._firestoreDoc, setF = window._firestoreSetDoc;
  const map = window._HSB.media || {};
  const arr = map[id] || [];
  const it = arr[idx];
  if (!it) return;
  if (!confirm('이 ' + (it.type === 'video' ? '영상' : '사진') + '을 삭제할까요?')) return;
  arr.splice(idx, 1);
  map[id] = arr;
  await setF(docF(db, 'erp_data', 'hsbMedia'), { data: JSON.stringify(map), ts: Date.now() }, { merge: true });
  if (it.path && window._storageDeletePath) { try { await window._storageDeletePath(it.path); } catch (_) {} }
  window._HSB.media = map;
  renderHsBroadcastPage();
};

// ── 포맷 ──
const _hEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const _hNum = (v) => (Number(v) || 0).toLocaleString();
const _hWon = (v) => '₩' + Math.round(Number(v) || 0).toLocaleString();
function _hDateK(d) {
  if (!d || d.length < 8) return d || '';
  const dt = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
  return d.slice(0, 4) + '.' + d.slice(4, 6) + '.' + d.slice(6, 8) + ' (' + '일월화수목금토'[dt.getDay()] + ')';
}
const _HS_COLOR = { 'GS샵': '#e11d48', 'CJ온스타일': '#7c3aed', '롯데홈쇼핑': '#ea580c', '현대홈쇼핑': '#0f766e' };
const _HS_SHORT = { 'GS샵': 'GS', 'CJ온스타일': 'CJ', '롯데홈쇼핑': '롯데', '현대홈쇼핑': '현대' };
/* compact=true 는 방송 이력 목록용 — 좁은 줄이라 짧고 작게 쓴다.
   상단 '방송 시간' 칸은 자리가 넉넉하고 'GS샵' 이 더 분명하므로 그대로 둔다. */
function _hBadge(b, compact) {
  const c = _HS_COLOR[b] || '#475569';
  const t = compact ? (_HS_SHORT[b] || b) : b;
  const pad = compact ? '1px 6px' : '2px 8px';
  const fs = compact ? '9.5px' : '10.5px';
  return '<span style="display:inline-block;padding:' + pad + ';border-radius:999px;font-size:' + fs + ';font-weight:800;'
    + 'color:#fff;background:' + c + ';flex-shrink:0">' + _hEsc(t) + '</span>';
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
  /* 누르면 크게 — GS 이미지는 주소 끝 숫자가 크기다 (/1/200 -> /1/800, 실측 확인) */
  const big = u.replace(/\/(\d+)$/, '/800');
  return '<img src="' + _hEsc(u) + '" alt="" loading="lazy" referrerpolicy="no-referrer" '
    + 'onclick="event.stopPropagation();window._hsbZoom(&quot;' + _hEsc(big) + '&quot;)" '
    + 'title="크게 보기" '
    + 'onerror="this.style.display=&quot;none&quot;" '
    + 'style="width:' + n + 'px;height:' + n + 'px;border-radius:7px;object-fit:cover;cursor:zoom-in;'
    + 'background:#f1f5f9;border:1px solid #e2e8f0;display:inline-block;vertical-align:middle;margin-right:8px">';
}

/* 제품 사진 크게 보기 — 아무 데나 누르면 닫힌다 */
window._hsbZoom = function (url) {
  if (!url) return;
  const old = document.getElementById('hsb-zoom'); if (old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'hsb-zoom';
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(10,15,20,.88);'
    + 'display:flex;align-items:center;justify-content:center;padding:18px;cursor:zoom-out';
  ov.innerHTML = '<img src="' + _hEsc(url) + '" alt="" referrerpolicy="no-referrer" '
    + 'style="max-width:100%;max-height:100%;border-radius:12px;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.5)">';
  ov.addEventListener('click', function () { ov.remove(); });
  document.body.appendChild(ov);
};
//   '무료배송' 은 빼고 할인율 %·무이자 개월을 정확히 적는다.
//   서버가 숫자(dcRt·noIntMm)를 보내기 전 기록은 글자 혜택에서 무료배송만 뺀다.
function _hsbEventText(p) {
  if (!p) return '-';
  if (p.manualEvent) return _hEsc(p.manualEvent);      /* v2.3.950: 손으로 적은 이벤트가 이긴다 */
  const out = [];
  let dc = Number(p.dcRt || 0);
  if (!dc && p.listPrice && p.salePrice && p.listPrice > p.salePrice) {
    dc = Math.round((p.listPrice - p.salePrice) * 100 / p.listPrice);
  }
  const mm = Number(p.noIntMm || 0);
  const raw = String(p.benefit || '');
  const cp = Number(p.cpnRt || 0);
  if (cp > 0) out.push('쿠폰 ' + cp + '%');
  if (dc > 0) out.push('할인 ' + dc + '%');
  if (p.gsPayDc || /GS Pay/i.test(raw)) out.push('GS Pay 할인');   // GS 는 할인율을 편성표에 안 적는다
  if (p.vipDc) out.push('VIP 할인');
  if (mm > 0) out.push('무이자 ' + mm + '개월');
  if (mm > 0 || dc > 0 || cp > 0) {
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

  /* v2.3.942: 롯데처럼 '관측' 으로 모은 기록은 GS 의 5분 자동 기록과 뜻이 다르다.
     같은 칸에 같은 이름으로 넣으면 숫자를 잘못 읽게 되므로 라벨과 부연을 바꾼다. */
  const isObs = !!(b && b.src === 'app-observation');
  const isSch = !!(b && b.src === 'schedule');
  /* v2.3.944: 대표 숫자는 '마지막 관측값' = 그 방송의 판매 수량.
     종료 후에 찍었으면 최종, 방송 중에 찍었으면 최종은 그보다 크다 — 부연에 적는다. */
  const qtyCard = isSch
    ? ['방송 판매 수량', (b.sold ? (_hNum(b.sold) + '개') : '비공개'),
       (b.sold ? '' : (b.broadcaster || '') + '은 수량을 공개하지 않습니다'), '#f8fafc', '#64748b', 19, 'sold']
    : isObs
    ? ['방송 판매 수량', _hNum(b.obsTotal || 0) + '개',
       b.obsFinal ? '방송 종료 후 관측 · 최종' : '방송 중 관측 · 최종은 더 큽니다',
       '#f0fdf4', '#15803d', 19, 'sold']
    : ['추적 판매 수량', b ? (_hNum(b.sold) + '개') : '-', '이 방송', '#f0fdf4', '#15803d', 19, 'sold'];
  const amtCard = (b && !b.amount)
    ? ['추정 매출', '—', isSch ? '수량 비공개' : (isObs ? '판매가 미확인' : '-'), '#fefce8', '#a16207', 19, 'amount']
    : ['추정 매출', b ? _hWon(b.amount) : '-',
       (b && b._man && b._man.amountAuto) ? '수량 × 판매가'
         : (isObs ? (b.obsFinal ? '방송 종료 후 관측 · 최종' : '방송 중 관측 · 최종은 더 큼') : '이 방송'),
       '#fefce8', '#a16207', 19, 'amount'];

  // [라벨, 값, 부연, 배경, 글자색, 값 글자크기]
  const cards = [
    ['방송 시간', b ? (_hEsc(b.start) + '~' + _hEsc(b.end)) : '-',
      b ? (_hBadge(b.broadcaster) + ' <span style="color:#94a3b8">' + _hDateK(b.date) + '</span>') : '', '#eff6ff', '#1d4ed8', 19],
    ['제품명', top ? _hEsc(top.name) : (b ? _hEsc((b.brands || []).join(' / ') || b.title) : '-'),
      topSub, '#f5f3ff', '#6d28d9', 14],
    ['판매가', (top && top.salePrice) ? _hWon(top.salePrice)
      : (top && top.listPrice ? _hWon(top.listPrice) : '-'),
      (top && !top.salePrice && top.listPrice) ? '정가 (판매가 화면 가려짐)' : (top && top.soldOut ? '품절' : ''),
      '#f8fafc', '#334155', 19, 'price'],
    ['이벤트', _hsbEventText(top), '', '#fff7ed', '#c2410c', 14, 'event'],
    qtyCard,
    amtCard,
    ['최근 30일 방송', _hNum(rec.length) + '회', '등장 브랜드 ' + _hNum(brands.size) + '개', '#eef2ff', '#4338ca', 19],
    isSch
      ? ['관측 횟수', '0회', '아래에서 수량을 적을 수 있습니다', '#fdf2f8', '#9d174d', 19]
      : isObs
      ? ['관측 횟수', _hNum(((b.products || [])[0] || {}).obs ? ((b.products || [])[0].obs || []).length : 0) + '회',
         '화면을 직접 찍은 횟수', '#fdf2f8', '#9d174d', 19]
      : ['최다 판매', (peakMin == null) ? '-' : (_hNum(peakMin) + '분'),
         (b && b.peak) ? ('시작 후 · ' + _hEsc(b.peak.t) + ' · ' + _hNum(b.peak.sold) + '개') : '방송 시작 후', '#fdf2f8', '#9d174d', 19],
  ];
  return '<div id="hsb-kpi" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:14px;max-width:980px">'
    + cards.map(c => {
      const key = c[6] || '';
      const man = !!(key && b && b._man && b._man[key]);
      const click = (key && b) ? (' onclick="window._hsbEditField(&quot;' + _hEsc(b.id) + '&quot;,&quot;' + key + '&quot;)"'
        + ' title="눌러서 직접 적기"') : '';
      return '<div' + click + ' style="background:' + c[3] + ';border-radius:10px;padding:10px 12px;min-width:0'
      + (key && b ? ';cursor:pointer' : '') + '">'
      + '<div style="font-size:11.5px;color:#64748b;font-weight:600">' + c[0]
      + (man ? '<span style="display:inline-block;margin-left:5px;padding:1px 6px;border-radius:999px;'
        + 'background:#1e293b;color:#fff;font-size:9.5px;font-weight:800;vertical-align:1px">수동</span>' : '')
      + (key && b && !man ? '<span style="margin-left:5px;color:#cbd5e1;font-size:10.5px">✎</span>' : '')
      + '</div>'
      + '<div style="font-size:' + c[5] + 'px;font-weight:800;color:' + c[4] + ';margin-top:3px;line-height:1.3;'
      + 'overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:anywhere">' + c[1] + '</div>'
      + (c[2] ? '<div style="font-size:10.5px;color:#94a3b8;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + c[2] + '</div>' : '')
      + '</div>';
    }).join('')
    + '</div>';
}

/* v2.3.949: '지금'(한국시간) 을 'YYYYMMDDHH:MM' 한 덩어리로. 방송 키와 문자열로 비교한다.
   ⚠️ 브라우저가 호주 시간이라 로컬 시각으로 재면 안 된다 — KST(UTC+9) 로 환산한다. */
function _hNowKstKey() {
  const n = new Date();
  const k = new Date(n.getTime() + n.getTimezoneOffset() * 60000 + 9 * 3600000);
  const p = (v) => String(v).padStart(2, '0');
  return '' + k.getFullYear() + p(k.getMonth() + 1) + p(k.getDate())
    + p(k.getHours()) + ':' + p(k.getMinutes());
}

// ── 방송 목록 ──
function _hsbListHtml(list, selId) {
  if (!list.length) {
    return '<div style="padding:26px;color:#94a3b8;font-size:13px;background:#f8fafc;border-radius:10px">'
      + '기록된 방송이 없습니다.</div>';
  }
  const nowKey = _hNowKstKey();
  let h = '<div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">';
  let lastDate = '';
  list.forEach(b => {
    /* 시작 시각이 아직 안 왔으면 '예정' — 방송한 것과 눈에 띄게 갈라 둔다 */
    const soon = (b.date + (b.start || '')) > nowKey;
    if (b.date !== lastDate) {
      lastDate = b.date;
      h += '<div style="background:#f8fafc;padding:7px 14px;font-size:11.5px;font-weight:800;color:#475569;'
        + 'border-top:1px solid #e2e8f0">' + _hDateK(b.date) + '</div>';
    }
    const on = b.id === selId;
    h += '<div onclick="window._hsbPick(\'' + _hEsc(b.id) + '\')" style="display:flex;align-items:center;gap:7px;'
      + 'padding:8px 12px;cursor:pointer;border-top:1px solid #f1f5f9;'
      + (on ? 'background:#eef2ff' : 'background:#fff') + '">'
      + _hBadge(b.broadcaster, true)
      + '<span style="font-size:11px;font-weight:700;color:' + (soon ? '#94a3b8' : '#0f172a')
      + ';width:76px;flex-shrink:0;letter-spacing:-.3px">' + _hEsc(b.start) + '~' + _hEsc(b.end) + '</span>'
      /* 이름은 두 줄까지 허용해 다 보이게 (전에는 한 줄로 잘려 '에버…' 가 됐다) */
      + '<span style="font-size:12px;font-weight:700;color:' + (soon ? '#94a3b8' : '#0f172a') + ';flex:1;min-width:0;line-height:1.3;'
      + 'word-break:keep-all;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden">'
      + _hEsc((b.brands || []).join(' / ') || b.title) + '</span>'
      /* 금액 위 · 수량 아래, 오른쪽 정렬 — 한 칸으로 합쳐 이름 쪽에 96px 을 돌려준다 */
      + '<span style="display:flex;flex-direction:column;align-items:flex-end;width:104px;flex-shrink:0;line-height:1.25">'
      + (soon
        ? ('<span style="display:inline-block;padding:2px 9px;border-radius:999px;background:#f1f5f9;'
           + 'border:1px solid #e2e8f0;color:#64748b;font-size:11px;font-weight:800">예정</span>')
        : ('<b style="font-size:13px;color:#a16207;font-weight:800;letter-spacing:-.3px">'
           + (b.amount ? _hWon(b.amount) : '<span style="color:#cbd5e1">—</span>') + '</b>'
           + '<small style="font-size:11px;color:#15803d;font-weight:700">'
           + (b.src === 'schedule' ? '<span style="color:#94a3b8;font-weight:600">비공개</span>'
               : (_hNum(b.sold || 0) + '개'
                  + (b.src === 'app-observation' && !b.obsFinal ? '<span style="color:#94a3b8">+</span>' : ''))) + '</small>'))
      + '</span>'
      + '</div>';
  });
  return h + '</div>';
}

// ── 방송 상세 ──
/* v2.3.947: 편성 상품 — 방송사가 가격·쿠폰·무이자·썸네일까지 주면 그대로 보여 준다.
   (현대는 다 준다. 롯데·CJ 는 이름만 오므로 자동으로 이름 줄만 나온다) */
function _hsbSchedProdHtml(b) {
  const ps = b.products || [];
  const rich = ps.some(p => p.salePrice || p.img || p.noIntMm || p.cpnRt || p.dcRt);
  if (!rich) {
    return '<div style="font-size:12.5px;color:#0f172a;line-height:1.7">'
      + ps.map(p => '· ' + _hEsc(p.name)).join('<br>') + '</div>';
  }
  return '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<thead><tr style="background:#f8fafc">'
    + ['구성 (제품)', '판매가', '정가', '혜택'].map((t, i) =>
      '<th style="padding:7px 9px;text-align:' + (i === 0 ? 'left' : 'right') + ';border-bottom:1px solid #e2e8f0;'
      + 'font-size:11px;color:#475569;white-space:nowrap">' + t + '</th>').join('')
    + '</tr></thead><tbody>'
    + ps.map(p => '<tr style="border-bottom:1px solid #f1f5f9">'
      + '<td style="padding:7px 9px;color:#0f172a;vertical-align:middle;line-height:1.4">'
      + _hsbImgTag(p, 40) + _hEsc(p.name) + '</td>'
      + '<td style="padding:7px 9px;text-align:right;white-space:nowrap;font-weight:700">'
      + (p.salePrice ? _hWon(p.salePrice) : '-') + '</td>'
      + '<td style="padding:7px 9px;text-align:right;white-space:nowrap;color:#94a3b8">'
      + (p.listPrice && p.listPrice !== p.salePrice ? _hWon(p.listPrice) : '-') + '</td>'
      + '<td style="padding:7px 9px;text-align:right;white-space:nowrap;color:#c2410c;font-size:11.5px">'
      + _hsbEventText(p) + '</td>'
      + '</tr>').join('')
    + '</tbody></table></div>';
}

/* v2.3.945: 사진·영상 — 어떤 방송에든 손으로 붙일 수 있다.
   파일은 Firebase Storage 로 가고 문서에는 URL 만 남는다(문서 1MB 한계). */
function _hsbMediaHtml(b) {
  const list = ((window._HSB.media || {})[b.id]) || [];
  const BTN = 'height:30px;padding:0 11px;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;';
  let h = '<div style="margin-top:14px;border-top:1px solid #f1f5f9;padding-top:12px">'
    + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">'
    + '<span style="font-size:12.5px;font-weight:800;color:#0f172a">사진 · 영상</span>'
    + '<span style="font-size:11px;color:#94a3b8">' + _hNum(list.length) + '개</span>'
    + '<span style="flex:1"></span>'
    + '<button type="button" onclick="window._hsbPickFile(&quot;' + _hEsc(b.id) + '&quot;)" '
    + 'style="' + BTN + 'border:1px solid #cbd5e1;background:#fff;color:#334155">+ 사진·영상 올리기</button>'
    + '<button type="button" onclick="window._hsbLinkMedia(&quot;' + _hEsc(b.id) + '&quot;)" '
    + 'style="' + BTN + 'border:1px solid #cbd5e1;background:#fff;color:#334155">+ 링크로 달기</button>'
    + '<button type="button" onclick="window._hsbAskObs(&quot;' + _hEsc(b.id) + '&quot;)" '
    + 'style="' + BTN + 'border:0;background:#2f6f5c;color:#fff">+ 판매 수량 적기</button>'
    + '</div>';
  if (!list.length) {
    h += '<div style="font-size:11.5px;color:#94a3b8;padding:8px 0">'
      + '없음</div>';
  } else {
    h += '<div style="display:flex;gap:9px;overflow-x:auto;padding:2px 0 6px">'
      + list.map((m, i) => '<figure style="margin:0;flex:0 0 auto;width:168px;position:relative">'
        + (m.type === 'video'
            ? ('<video src="' + _hEsc(m.url) + '" controls preload="metadata" '
               + 'style="width:168px;border-radius:9px;border:1px solid #e2e8f0;display:block;background:#000"></video>')
            : ('<img src="' + _hEsc(m.url) + '" alt="" loading="lazy" '
               + 'onclick="window._hsbZoom(&quot;' + _hEsc(m.url) + '&quot;)" '
               + 'style="width:168px;border-radius:9px;border:1px solid #e2e8f0;cursor:zoom-in;display:block">'))
        + '<button type="button" title="삭제" onclick="window.hsbRemoveMedia(&quot;' + _hEsc(b.id) + '&quot;,' + i + ')" '
        + 'style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;border:0;'
        + 'background:rgba(15,23,42,.72);color:#fff;font-size:12px;line-height:1;cursor:pointer">x</button>'
        + '<figcaption style="font-size:10.5px;color:#64748b;margin-top:3px;line-height:1.35">'
        + _hEsc(m.caption || (m.type === 'video' ? '영상' : '사진')) + '</figcaption></figure>').join('')
      + '</div>';
  }
  return h + '</div>';
}

/* 파일 고르기 — 숨은 input 하나를 만들어 돌려 쓴다 */
window._hsbPickFile = function (id) {
  let el = document.getElementById('hsb-file');
  if (!el) {
    el = document.createElement('input');
    el.type = 'file'; el.id = 'hsb-file'; el.accept = 'image/*,video/*'; el.multiple = true;
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  el.onchange = async function () {
    const files = Array.prototype.slice.call(el.files || []);
    el.value = '';
    if (!files.length) return;
    if (files.some(f => f.size > 200 * 1024 * 1024)) {
      alert('200MB 가 넘는 파일은 올릴 수 없습니다. 드라이브에 올리고 "+ 링크로 달기" 를 쓰세요.');
      return;
    }
    for (const f of files) {
      try {
        if (typeof showNotif === 'function') showNotif(f.name + ' 올리는 중...', 'info');
        await window.hsbAddMedia(id, f, '');
      } catch (e) { alert('올리기 실패: ' + (e && e.message)); return; }
    }
    if (typeof showNotif === 'function') showNotif(files.length + '개 올렸습니다', 'success');
  };
  el.click();
};

window._hsbLinkMedia = async function (id) {
  const url = prompt('사진·영상 주소를 붙여넣으세요 (드라이브 공유 링크 등)');
  if (!url) return;
  const cap = prompt('설명 (없으면 비워 두세요)') || '';
  try { await window.hsbAddMedia(id, { url: url.trim(), caption: cap }, cap); }
  catch (e) { alert('실패: ' + (e && e.message)); }
};

/* 판매 수량 손으로 적기 — Aside 가 쓰는 hsbAddObservation 과 같은 곳에 쌓인다 */
window._hsbAskObs = async function (id) {
  const b = (window._HSB.list || []).find(x => x.id === id);
  const prods = (b && b.products) || [];
  const t = prompt('관측 시각 (한국시간, 예: 15:35)');
  if (!t) return;
  if (!/^[0-9]{1,2}:[0-9]{2}$/.test(t.trim())) { alert('시각은 HH:MM 으로 적어주세요'); return; }
  const n = prompt('화면에 뜬 수량 (숫자만)');
  if (n == null) return;
  const num = String(n).replace(/[, ]/g, '');
  if (!/^[0-9]+$/.test(num)) { alert('숫자만 적어주세요'); return; }
  let pi = 0;
  if (prods.length > 1) {
    const menu = prods.map((p, i) => (i + 1) + '. ' + String(p.name || '').slice(0, 40)).join(chr10());
    const pick = prompt('구성 번호를 고르세요' + chr10() + menu, '1');
    if (pick == null) return;
    pi = Math.max(0, Math.min(prods.length - 1, (parseInt(pick, 10) || 1) - 1));
  }
  const fin = confirm('방송이 끝난 뒤에 본 값인가요?' + chr10() + chr10()
    + '확인 = 방송 종료 후(최종)' + chr10() + '취소 = 방송 중');
  try {
    await window.hsbAddObservation(id,
      [{ t: t.trim(), n: parseInt(num, 10), pi: pi, live: !fin }], { final: fin });
    if (typeof showNotif === 'function') showNotif('수량을 적었습니다', 'success');
  } catch (e) { alert('실패: ' + (e && e.message)); }
};
function chr10() { return String.fromCharCode(10); }

/* v2.3.942: 롯데 관측 표 — 시각 · 누적 · 직전 대비 · 방송 중 여부 + 그때 화면 */
function _hsbObsHtml(b) {
  const shots = (window._HSB_SHOTS && window._HSB_SHOTS.map) || {};
  /* v2.3.948: 안내 문구 상자는 화면에서 뺀다. obsNote 는 문서에 그대로 남는다. */
  let h = '';

  (b.products || []).forEach(p => {
    const obs = p.obs || [];
    h += '<div style="margin-bottom:16px">'
      + '<div style="font-size:12.5px;font-weight:800;color:#0f172a;margin-bottom:2px;line-height:1.4">' + _hEsc(p.name) + '</div>'
      + '<div style="font-size:11.5px;color:#64748b;margin-bottom:7px">'
      + (p.salePrice ? ('판매가 ' + _hWon(p.salePrice))
          : (p.listPrice ? ('정가 ' + _hWon(p.listPrice) + ' · 판매가는 화면에서 가려짐') : '판매가 미확인'))
      + '</div>'
      + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'
      + '<thead><tr style="background:#f8fafc">'
      + ['관측 시각(KST)', '화면 표시 수량', '직전 관측 대비', '방송 상태'].map((t, i) =>
        '<th style="padding:7px 9px;text-align:' + (i === 0 ? 'left' : 'right') + ';border-bottom:1px solid #e2e8f0;'
        + 'font-size:11px;color:#475569;white-space:nowrap">' + t + '</th>').join('')
      + '</tr></thead><tbody>';
    let prev = null;
    obs.forEach(o => {
      const diff = (prev == null) ? null : (o.n - prev);
      prev = o.n;
      h += '<tr style="border-bottom:1px solid #f1f5f9">'
        + '<td style="padding:7px 9px;color:#0f172a;white-space:nowrap">' + _hEsc(o.t) + '</td>'
        + '<td style="padding:7px 9px;text-align:right;font-weight:700;white-space:nowrap">' + _hNum(o.n) + '개</td>'
        + '<td style="padding:7px 9px;text-align:right;white-space:nowrap;color:' + (diff ? '#15803d' : '#94a3b8') + ';font-weight:' + (diff ? '700' : '400') + '">'
        + (diff == null ? '기준' : ('+' + _hNum(diff) + '개')) + '</td>'
        + '<td style="padding:7px 9px;text-align:right;white-space:nowrap;color:#64748b">'
        + (o.live ? ('방송 중' + (o.left ? ' · ' + _hEsc(o.left) + ' 남음' : '')) : '방송 종료 후') + '</td>'
        + '</tr>';
    });
    h += '</tbody></table></div>';

    const imgs = obs.filter(o => shots[o.shot]);
    if (imgs.length) {
      h += '<div style="display:flex;gap:8px;overflow-x:auto;padding:9px 0 2px">'
        + imgs.map(o => '<figure style="margin:0;flex:0 0 auto;width:150px">'
          + '<img src="' + shots[o.shot] + '" alt="" loading="lazy" '
          + 'onclick="window._hsbZoom(&quot;' + shots[o.shot] + '&quot;)" '
          + 'style="width:150px;border-radius:8px;border:1px solid #e2e8f0;cursor:zoom-in;display:block">'
          + '<figcaption style="font-size:10.5px;color:#64748b;margin-top:3px;text-align:center">'
          + _hEsc(o.t) + ' · ' + _hNum(o.n) + '개</figcaption></figure>').join('')
        + '</div>';
    } else {
      h += '<div style="font-size:11px;color:#94a3b8;padding:6px 0">화면 캡처를 불러오는 중…</div>';
    }
    h += '</div>';
  });
  return h;
}

function _hsbDetailHtml(b) {
  if (!b) return '';
  const hasTicks = (b.ticks || []).length > 0;
  // 머리말(방송사·브랜드·시간)과 판매/매출/피크 줄은 상단 8칸과 같은 내용이라 뺐다.
  let h = '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:14px;background:#fff">';

  /* v2.3.942: 관측 기록(롯데)은 5분 자동 기록이 아니라 전용 블록으로 그린다 */
  if (b.src === 'app-observation') {
    if (hasTicks) h += '<div style="height:190px;margin-bottom:14px"><canvas id="hsb-chart"></canvas></div>';
    h += _hsbObsHtml(b);
    h += _hsbMediaHtml(b);
    return h + '</div>';
  }

  /* v2.3.945: 편성만 있는 기록(롯데·CJ) — 수량은 비공개. 손으로 적을 길만 열어 둔다. */
  if (b.src === 'schedule') {
    h += '<div style="font-size:12.5px;font-weight:800;color:#0f172a;margin-bottom:6px">편성 상품</div>'
      + _hsbSchedProdHtml(b);
    h += _hsbMediaHtml(b);
    return h + '</div>';
  }

  if (hasTicks) {
    h += '<div style="height:200px;margin-bottom:16px"><canvas id="hsb-chart"></canvas></div>';
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
      + '<td style="padding:7px 9px;color:#0f172a;vertical-align:middle">'
      + _hsbImgTag(p, 40) + _hEsc(p.name)
      + (p.soldOut ? ' <span style="color:#dc2626;font-size:10.5px;font-weight:700">품절</span>' : '') + '</td>'
      + '<td style="padding:7px 9px;text-align:right;white-space:nowrap">' + _hWon(p.salePrice) + '</td>'
      + '<td style="padding:7px 9px;text-align:right;font-weight:700;color:#15803d;white-space:nowrap">' + _hNum(p.sold) + '개</td>'
      + '<td style="padding:7px 9px;text-align:right;color:#a16207;white-space:nowrap">' + _hWon((p.sold || 0) * (p.salePrice || 0)) + '</td>'
      + '<td style="padding:7px 9px;text-align:right;color:#94a3b8;white-space:nowrap">' + _hNum(p.first) + ' → ' + _hNum(p.last) + '</td>'
      + '</tr>';
  });
  h += '</tbody></table></div>';
  h += _hsbMediaHtml(b);
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

/* ── v2.3.941: 방송사 탭 ──────────────────────────────────────────────
   데이터의 broadcaster 값은 'GS샵' / '롯데홈쇼핑' / 'CJ온스타일' 이고,
   화면에는 사용자가 부르는 이름(GS홈쇼핑 / 롯데홈쇼핑 / CJ홈쇼핑)으로 쓴다. */
const _HSB_TABS = [
  { bc: 'GS샵', label: 'GS홈쇼핑', navId: 'nav-hsb-GS' },
  { bc: '롯데홈쇼핑', label: '롯데홈쇼핑', navId: 'nav-hsb-LOTTE' },
  { bc: 'CJ온스타일', label: 'CJ홈쇼핑', navId: 'nav-hsb-CJ' },
  { bc: '현대홈쇼핑', label: '현대홈쇼핑', navId: 'nav-hsb-HD' },
];
function _hsbTabsHtml(cur) {
  const all = window._HSB.list || [];
  return '<div id="hsb-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">'
    + _HSB_TABS.map(t => {
      const n = all.filter(b => b.broadcaster === t.bc).length;
      const on = t.bc === cur;
      const c = _HS_COLOR[t.bc] || '#475569';
      return '<button type="button" onclick="window._hsbTab(&quot;' + t.bc + '&quot;)" '
        + 'style="flex:1 1 calc(25% - 5px);min-width:132px;height:38px;padding:0 8px;border-radius:10px;cursor:pointer;'
        + 'font-size:13px;font-weight:800;white-space:nowrap;'
        + (on ? ('background:' + c + ';color:#fff;border:1px solid ' + c + ';')
              : ('background:#fff;color:#475569;border:1px solid #e2e8f0;'))
        + '">' + _hEsc(t.label)
        + '<span style="font-size:11px;font-weight:700;margin-left:6px;opacity:.85">' + _hNum(n) + '</span>'
        + '</button>';
    }).join('')
    + '</div>';
}
function _hsbSyncNav() {
  _HSB_TABS.forEach(t => {
    const el = document.getElementById(t.navId);
    if (el) el.classList.toggle('active', t.bc === window._HSB.bc);
  });
}
window._hsbTab = function (bc) {
  const H = window._HSB;
  if (H.bc === bc) return;
  H.bc = bc; H.sel = null;
  renderHsBroadcastPage();
};
/* 사이드바 하위 메뉴에서 바로 그 방송사로 들어간다 */
window.goHsb = function (bc) {
  const H = window._HSB;
  if (H.bc !== bc) { H.bc = bc; H.sel = null; }
  if (typeof go === 'function') go('hsbroadcast');
  else renderHsBroadcastPage();
};

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
  /* v2.3.941: 선택한 방송사만 본다. 집계(최근 30일 등)도 그 방송사 안에서만 센다. */
  const list = H.list.filter(b => b.broadcaster === H.bc);
  const sel = list.find(b => b.id === H.sel) || list[0];
  H.sel = sel ? sel.id : null;
  host.innerHTML =
    _hsbTabsHtml(H.bc)
    + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
    + '<span style="font-size:12px;color:#64748b">서버 갱신 '
    + (H.ts ? new Date(H.ts).toLocaleString('ko-KR', { hour12: false }) : '-')
    + '</span>'
    + '</div>'
    + (sel ? (_hsbSummary(list, sel) + _hsbDetailHtml(sel)) : '')
    + '<div style="font-size:12.5px;font-weight:800;color:#0f172a;margin-bottom:6px">방송 이력</div>'
    + _hsbListHtml(list, sel && sel.id);
  _hsbSyncNav();
  try { _hsbChart(sel); } catch (e) { console.warn('hsb chart', e); }
  /* 관측 캡처는 무거워서 따로 읽는다 — 다 읽으면 그 자리만 다시 그린다 */
  if (sel && sel.src === 'app-observation' && !(window._HSB_SHOTS.map)) {
    _hsbLoadShots().then(() => { if (window._HSB.sel === sel.id) renderHsBroadcastPage(); });
  }
}
