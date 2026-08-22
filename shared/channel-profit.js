/* =============================================================================
   유통채널 수익계산 (홈쇼핑 / 약국 판매 / 중국 수출)   — v1.9.919~
   =============================================================================
   ⚠️ 이 파일은 임원용(/index.html)과 직원용(/staff/index.html)이 **함께** 읽는다.
      화면·계산이 한 벌만 존재해야 서로 어긋나지 않는다. 복사본을 만들지 말 것.

   불러오는 쪽(호스트)이 아래를 먼저 준비해야 한다 (window 전역):
     DB.items[]        완제품 목록 (id·name·code·type·actualSalePrice·price)
     DB.boms{}         품목별 BOM
     getItem(id)       품목 1건 조회
     showNotif(msg,kind)  알림
     requireWrite()    쓰기 권한 확인 (false 면 수정 차단)
     idbGet/idbSet     로컬 캐시 (없으면 그냥 건너뛴다)
     CP_STORE.load()   Promise<데이터|null>  — 공유 저장소에서 읽기
     CP_STORE.save(d)  Promise<boolean>      — 공유 저장소에 쓰기

   그리는 곳: <div id="sales-panel-channel"></div> (양쪽 동일)
   진입점  : renderChannelProfit()
   ============================================================================= */

var _cpData = null;
var _cpCurrentSub = 'homeshopping';
var _cpModalCh = 'homeshopping';
var _cpEditId = null;

function _cpDefault() { return { updatedAt: 0, rows: [] }; }
function _cpGenId() {
  let id = Date.now();
  const ex = new Set((_cpData && _cpData.rows ? _cpData.rows : []).map(r => String(r && r.id)));
  while (ex.has(String(id))) id++;
  return id;
}
function _cpWon(n) { return '₩' + (Math.round(Number(n)||0)).toLocaleString(); }
/* v2.3.728 — 화면에 쓰는 이름. 새 행은 name 하나에 '롯데홈쇼핑 1차' 가 통째로 들어 있고,
   옛 행은 name(롯데홈쇼핑) + round(1) 로 나뉘어 있어 이어 붙여 준다. */
function _cpTitle(r) {
  if (!r) return '-';
  const nm = String(r.name || '').trim();
  const rd = String(r.round || '').trim();
  if (!rd) return nm || '-';
  if (nm.indexOf(rd) >= 0) return nm;                 // 이미 이름에 회차가 들어 있으면 그대로
  return (nm + ' ' + rd + (/차$/.test(rd) ? '' : '차')).trim();
}
function _cpPct(n) { return (Math.round((Number(n)||0)*10)/10) + '%'; }
function _cpEsc(s) { return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _cpNum(id) { const el = document.getElementById(id); return el ? (parseFloat(String(el.value).replace(/,/g,''))||0) : 0; }

/* v2.3.722 — 세트(제품+판매가+원가+목표수량). 2번 세트는 비워 둘 수 있다. */
function _cpSetPrice(st) {
  if (!st) return 0;
  if (st.priceMode !== 'manual' && st.itemId) {
    const it = (DB.items||[]).find(x => x && String(x.id) === String(st.itemId));
    if (it && it.actualSalePrice != null && it.actualSalePrice !== '') return Number(it.actualSalePrice)||0;
  }
  return Number(st.price)||0;
}
function _cpSetCogs(st) {
  if (!st) return 0;
  if (st.cogsMode !== 'manual' && st.itemId) {
    try { const bc = _cpBomCost(st.itemId); if (bc > 0) return bc; } catch(_){}
    const it = (DB.items||[]).find(x => x && String(x.id) === String(st.itemId));
    if (it && it.price) return Number(it.price)||0;
  }
  return Number(st.cogs)||0;
}
function _cpSetName(st) {
  if (!st) return '';
  const it = (DB.items||[]).find(x => x && String(x.id) === String(st.itemId));
  return it ? (it.name || '') : '';
}
/* 값이 들어 있는 세트만 — 2번을 비워 두면 계산·표에서 아예 빠진다 */
function _cpSetsOf(r) {
  return (Array.isArray(r && r.sets) ? r.sets : [])
    .filter(st => st && (st.itemId || (Number(st.qty)||0) > 0 || (Number(st.price)||0) > 0));
}
// 수익 계산 엔진
function _cpCalc(r) {
  const targetCost = Number(r.targetCost)||0;
  const conv = (Number(r.convRate)||0) / 100;
  let hsRevenue, actualRevenue, orderQty, soldQty, achieveRate, setRows = [], cogsFromSets = null;
  if (Array.isArray(r.sets)) {
    // v2.3.722 — 수량이 출발점. 달성률은 결과다.
    const sets = _cpSetsOf(r);
    hsRevenue = 0; orderQty = 0; soldQty = 0; cogsFromSets = 0;
    sets.forEach((st, i) => {
      const price = _cpSetPrice(st), qty = Number(st.qty)||0, unit = _cpSetCogs(st);
      const sold = Math.round(qty * conv);
      hsRevenue += price * qty; orderQty += qty; soldQty += sold; cogsFromSets += unit * sold;
      setRows.push({ no: i+1, name: _cpSetName(st), price, qty, sold, cogsUnit: unit, amount: price * qty,
                     itemId: st.itemId || '', cogsManual: (st.cogsMode === 'manual') });
    });
    actualRevenue = hsRevenue * conv;
    achieveRate = targetCost > 0 ? (hsRevenue / targetCost * 100) : 0;
  } else {
    // 옛 행 — 달성률 입력 방식 그대로 (화면이 갑자기 0 이 되지 않게)
    achieveRate = Number(r.achieveRate)||0;
    hsRevenue = targetCost * achieveRate / 100;
    actualRevenue = hsRevenue * conv;
    const sp = _cpLivePrice(r);
    orderQty = sp > 0 ? hsRevenue / sp : 0;
    soldQty  = sp > 0 ? actualRevenue / sp : 0;
  }
  const specialFee = Number(r.specialFee)||0, guestFee = Number(r.guestFee)||0, insertFee = Number(r.insertFee)||0;
  const specialVat = specialFee * 0.1;
  const guestVat = guestFee * 0.1;
  const insertVat = insertFee * 0.1;   // v1.9.949: 자동 10% (인서트 부가세 입력칸 제거)
  const hsComm = actualRevenue * (Number(r.hsCommPct)||0) / 100;          // 홈쇼핑 수수료(부가세 포함)
  const vendorComm = actualRevenue * (Number(r.vendorCommPct)||0) / 100;  // 밴더 수수료(부가세 포함)
  const cogs = (cogsFromSets != null) ? cogsFromSets : (soldQty * _cpLiveCost(r));   // 제품원가
  const cogsVat = cogs * 0.1;
  // v1.9.947: 순이익 = 부가세 제외(공급가) 기준. 매출·수수료는 부가세 포함값이라 ÷1.1 로
  //   공급가 환산, 특약금·게스트비·인서트비·제품원가는 이미 공급가(부가세 별도) 입력값.
  const netRevenue    = actualRevenue / 1.1;   // 실제매출 공급가
  const netHsComm     = hsComm / 1.1;          // 홈쇼핑수수료 공급가
  const netVendorComm = vendorComm / 1.1;      // 밴더수수료 공급가
  const settlement = netRevenue - specialFee - guestFee - insertFee - netHsComm - netVendorComm - cogs;
  const profitRate = netRevenue > 0 ? (settlement / netRevenue * 100) : 0;
  return { hsRevenue, actualRevenue, orderQty, soldQty, achieveRate, sets: setRows,
           specialFee, specialVat, guestFee, guestVat, insertFee, insertVat, hsComm, vendorComm, cogs, cogsVat, settlement, profitRate };
}

// ── 저장 / 로드 (IndexedDB 주 저장 + localStorage 보조 + updatedAt 비교) ──
function _cpSave() {
  if (!_cpData) _cpData = _cpDefault();
  _cpData.updatedAt = Date.now();
  const payload = JSON.stringify(_cpData);
  try { if (typeof idbSet === 'function') idbSet('reniv_channel_profit', payload); } catch(_){}
  try { localStorage.setItem('reniv_channel_profit', payload); } catch(_){}
  // v2.3.726: 공유 저장 — 이게 없으면 만든 사람 브라우저에만 남는다(실제로 그랬다)
  // v2.3.739: 어디에 저장할지는 호스트가 정한다(CP_STORE). 임원용·직원용이 같은 문서를 쓴다.
  try {
    if (window.CP_STORE && typeof CP_STORE.save === 'function') {
      Promise.resolve(CP_STORE.save(_cpData))
        .then(ok => { if (!ok) console.warn('[수익계산] 공유 저장 실패 — 이 브라우저에만 남았습니다'); })
        .catch(e => console.warn('[수익계산] 공유 저장 실패:', e && e.message));
    }
  } catch(e) { console.warn('[수익계산] 공유 저장 실패:', e && e.message); }
}
async function _cpLoad() {
  const cand = [];
  // v2.3.726: 공유본(shared/channel_profit) — 다른 임원이 만든 것도 여기서 온다
  let sharedVal = null;
  // v2.3.739: 임원용·직원용이 같은 문서를 본다(CP_STORE).
  try {
    if (window.CP_STORE && typeof CP_STORE.load === 'function') {
      const sv = await CP_STORE.load();
      if (sv && Array.isArray(sv.rows)) { sharedVal = sv; cand.push(sv); }
    }
  } catch(e) { console.warn('[수익계산] 공유 불러오기 실패:', e && e.message); }
  try { const ls = localStorage.getItem('reniv_channel_profit'); if (ls) { const p = JSON.parse(ls); if (p && Array.isArray(p.rows)) cand.push(p); } } catch(_){}
  try {
    if (typeof idbGet === 'function') {
      const raw = await idbGet('reniv_channel_profit');
      if (raw) { const p = JSON.parse(raw); if (p && Array.isArray(p.rows)) cand.push(p); }
    }
  } catch(_){}
  cand.sort((a,b) => (Number(b.updatedAt)||0) - (Number(a.updatedAt)||0));
  _cpData = cand[0] || _cpDefault();
  // 공유본이 없거나 내 것이 더 최신이면 한 번 올려 준다 — 고치지 않아도 다른 임원이 보게
  try {
    const mine = Number(_cpData.updatedAt) || 0;
    const theirs = Number(sharedVal && sharedVal.updatedAt) || 0;
    if ((_cpData.rows||[]).length && mine > theirs && window.CP_STORE && typeof CP_STORE.save === 'function') {
      Promise.resolve(CP_STORE.save(_cpData))
        .then(ok => { if (ok) console.log('📤 [수익계산] 공유 저장소에 올렸습니다 — 모두에게 보입니다'); })
        .catch(() => {});
    }
  } catch(_){}
}

/* v2.3.739 — 다른 사람이 고친 것을 받아 화면을 다시 그린다(양방향 연동).
   호스트가 문서 변경을 감지하면 이걸 부른다. 내가 가진 것보다 오래된 내용이면
   무시한다 — 내 화면이 뒤로 되감기지 않게. */
window._cpApplyRemote = function(data) {
  if (!data || !Array.isArray(data.rows)) return false;
  const mine = Number(_cpData && _cpData.updatedAt) || 0;
  const theirs = Number(data.updatedAt) || 0;
  if (theirs <= mine) return false;
  _cpData = data;
  try { localStorage.setItem('reniv_channel_profit', JSON.stringify(data)); } catch(_){}
  // 입력 중인 팝업이 열려 있으면 화면을 갈아끼우지 않는다 — 쓰던 내용이 날아간다
  if (document.getElementById('cp-modal-overlay')) return true;
  try { if (document.getElementById('sales-panel-channel')) _cpRender(); } catch(_){}
  return true;
};

// ── 렌더 ──
function renderChannelProfit() {
  const host = document.getElementById('sales-panel-channel');
  if (!host) return;
  if (!_cpData) {
    host.innerHTML = '<div style="padding:48px;text-align:center;color:#94a3b8;font-size:13px">불러오는 중…</div>';
    _cpLoad().then(() => _cpRender()).catch(() => { _cpData = _cpDefault(); _cpRender(); });
    return;
  }
  _cpRender();
}
function switchChannelSubTab(sub) { _cpCurrentSub = sub; _cpRender(); }
/* v2.3.722 — 옛 방식 홈쇼핑 행만 지운다. 약국·중국 수출 행은 건드리지 않는다. */
window._cpClearLegacyHs = function() {
  if (!_cpData) return;
  const legacy = (_cpData.rows||[]).filter(x => x && (x.channelType||'homeshopping') === 'homeshopping' && !Array.isArray(x.sets));
  if (!legacy.length) return;
  if (!confirm('옛 방식으로 만든 홈쇼핑 행 ' + legacy.length + '건을 지울까요?' + String.fromCharCode(10, 10)
    + '· 되돌릴 수 없습니다' + String.fromCharCode(10)
    + '· 약국 판매·중국 수출 행은 그대로 둡니다')) return;
  _cpData.rows = (_cpData.rows||[]).filter(x => !(x && (x.channelType||'homeshopping') === 'homeshopping' && !Array.isArray(x.sets)));
  _cpSave();
  _cpRender();
  showNotif('🗑 옛 행 ' + legacy.length + '건을 정리했습니다', 'success');
};
function _cpRender() {
  const host = document.getElementById('sales-panel-channel');
  if (!host) return;
  if (!_cpData) _cpData = _cpDefault();
  const subs = [ {k:'homeshopping',label:'📺 홈쇼핑 판매'}, {k:'pharmacy',label:'💊 약국 판매'}, {k:'export',label:'🇨🇳 중국 수출'} ];
  let h = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">';
  h += '<div style="display:inline-flex;gap:3px;background:#f1f5f9;border-radius:9px;padding:3px">';
  subs.forEach(s => {
    const on = _cpCurrentSub === s.k;
    h += '<button onclick="switchChannelSubTab(\'' + s.k + '\')" style="padding:8px 18px;border:none;border-radius:7px;font-size:13px;font-weight:' + (on?'700':'500') + ';cursor:pointer;background:' + (on?'#fff':'transparent') + ';color:' + (on?'#0369a1':'#64748b') + ';box-shadow:' + (on?'0 1px 3px rgba(0,0,0,.12)':'none') + ';transition:all .12s">' + s.label + '</button>';
  });
  h += '</div>';
  h += '<button onclick="openCpModal(null)" style="padding:9px 18px;background:#0f172a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">＋ 행 추가</button>';
  h += '</div>';
  // v2.3.722: 옛 방식(세트 없음) 홈쇼핑 행 — 새 계산식과 섞이지 않게 정리 버튼을 띄운다
  if (_cpCurrentSub === 'homeshopping') {
    const _legacy = (_cpData.rows||[]).filter(x => x && (x.channelType||'homeshopping') === 'homeshopping' && !Array.isArray(x.sets));
    if (_legacy.length) {
      h += '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
        + '<span style="font-size:12.5px;color:#92400e">⚠️ 옛 방식(달성률 직접 입력)으로 만든 행이 <b>' + _legacy.length + '건</b> 있습니다. 새 계산식(세트·목표수량)과 방식이 달라 함께 두면 헷갈립니다.</span>'
        + '<button onclick="_cpClearLegacyHs()" style="margin-left:auto;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;padding:6px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer">🗑 옛 행 ' + _legacy.length + '건 정리</button>'
        + '</div>';
    }
  }
  h += '<div id="cp-table-wrap"></div>';
  host.innerHTML = h;
  _cpRenderTable();
}
function _cpRenderTable() {
  const wrap = document.getElementById('cp-table-wrap');
  if (!wrap) return;
  if (_cpCurrentSub === 'pharmacy') { _cpRenderPharmacyTable(wrap); return; }
  if (_cpCurrentSub === 'export') { _cpRenderExportTable(wrap); return; }
  const rows = (_cpData.rows||[]).filter(r => r && (r.channelType||'homeshopping') === _cpCurrentSub);
  rows.sort((a,b) => String(b.broadcastDate||'').localeCompare(String(a.broadcastDate||'')) || (Number(b.id)||0)-(Number(a.id)||0));
  if (!rows.length) {
    wrap.innerHTML = '<div style="padding:44px;text-align:center;color:#94a3b8;font-size:13px;background:#f8fafc;border:1px dashed #e2e8f0;border-radius:12px">등록된 행이 없습니다. <b>＋ 행 추가</b> 버튼으로 시작하세요.</div>';
    return;
  }
  const TH = (t,extra) => '<th style="padding:9px 8px;font-size:11px;font-weight:700;color:#475569;white-space:nowrap;border-bottom:2px solid #e2e8f0;position:sticky;top:0;z-index:2;background:#f8fafc;' + (extra||'') + '">' + t + '</th>';
  let h = '<div style="overflow:auto;max-height:70vh;border:1px solid #e2e8f0;border-radius:12px;background:#fff">';
  h += '<table style="border-collapse:collapse;white-space:nowrap;font-size:12px;min-width:100%"><thead><tr>';
  // 회차 / 방송 유형 / 홈쇼핑 방송 주문 / 실제매출 — sticky-left 4개
  // v2.3.724: 고정 4칸이 넓어 오른쪽 칸들이 밀렸다 — 내용에 맞게 줄인다(회차 40 · 유형 124 · 금액 124 · 실매출 120)
  // v2.3.728: 회차 + 방송 유형 → '채널 · 회차' 한 칸
  h += TH('채널 · 회차','position:sticky;left:0;z-index:4;width:150px;min-width:150px;max-width:150px');
  h += TH('목표 주문 금액','position:sticky;left:150px;z-index:4;width:124px;min-width:124px;max-width:124px') + TH('예상 실매출','background:#e0f2fe;position:sticky;left:274px;z-index:4;width:120px;min-width:120px;max-width:120px');
  // 순이익 / 수익률 — 비스티키 (자연 흐름 위치)
  h += TH('예상 순이익<span style="cursor:help;color:#0ea5e9;font-weight:700;font-size:10px;margin-left:1px;vertical-align:super" title="순이익 = 부가세 제외(공급가) 기준 순이익&#10;&#10;= 실제매출 ÷ 1.1&#10;  - 특약금&#10;  - 게스트비&#10;  - 인서트비&#10;  - 홈쇼핑수수료 ÷ 1.1&#10;  - 밴더수수료 ÷ 1.1&#10;  - 제품원가&#10;&#10;※ 특약금·게스트비·인서트비·제품원가는 이미 공급가(부가세 별도) 입력값">ⓘ</span><div style="font-size:9px;color:#b45309;font-weight:600;margin-top:1px">부가세 제외</div>','background:#fffbeb;border-bottom-color:#fde68a;width:120px;min-width:120px;max-width:120px');
  h += TH('예상 수익률<div style="font-size:9px;color:#b45309;font-weight:600;margin-top:1px">부가세 제외</div>','background:#fffbeb;border-bottom-color:#fde68a;width:68px;min-width:68px;max-width:68px');
  h += TH('구좌 목표 비용') + TH('판매가') + TH('목표 주문 수량') + TH('예상 실판매 수량','background:#e0f2fe') + TH('특약금') + TH('게스트비') + TH('인서트비') + TH('홈쇼핑 수수료') + TH('밴더 수수료') + TH('제품원가') + TH('관리');
  h += '</tr></thead><tbody>';
  rows.forEach(r => {
    const c = _cpCalc(r);
    const posS = c.settlement >= 0, posR = c.profitRate >= 0;
    const TD = (v,extra) => '<td style="padding:8px;text-align:center;border-bottom:1px solid #f1f5f9;' + (extra||'') + '">' + v + '</td>';
    const sub = (base,vat,lbl) => _cpWon(base) + '<div style="font-size:9.5px;color:#94a3b8;margin-top:1px">' + (lbl||'부가세') + ' ' + _cpWon(vat) + '</div>';
    h += '<tr>';
    h += TD('<div style="max-width:138px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 auto"><span onclick="openCpDetail(' + r.id + ')" style="color:#1e40af;font-weight:700;cursor:pointer" title="' + _cpEsc(_cpTitle(r)) + '">' + _cpEsc(_cpTitle(r)) + '</span></div>', 'position:sticky;left:0;z-index:3;width:150px;min-width:150px;max-width:150px;background:#fff');
    h += TD(_cpWon(c.hsRevenue) + '<div style="font-size:11.5px;color:#e11d48;font-weight:700;margin-top:2px">달성률 ' + _cpPct(c.achieveRate) + '</div>', 'position:sticky;left:150px;z-index:3;width:124px;min-width:124px;max-width:124px;background:#fff');
    h += TD('<b>' + _cpWon(c.actualRevenue) + '</b><div style="font-size:11.5px;color:#0369a1;font-weight:700;margin-top:2px">전환율 ' + _cpPct(r.convRate) + '</div>', 'background:#e0f2fe;position:sticky;left:274px;z-index:3;width:120px;min-width:120px;max-width:120px');
    h += '<td style="padding:8px;text-align:center;border-bottom:1px solid #f1f5f9;background:#fffbeb;font-weight:800;width:120px;min-width:120px;max-width:120px;color:' + (posS?'#15803d':'#dc2626') + '">' + _cpWon(c.settlement) + '</td>';
    h += '<td style="padding:8px;text-align:center;border-bottom:1px solid #f1f5f9;background:#fffbeb;font-weight:800;width:68px;min-width:68px;max-width:68px;color:' + (posR?'#15803d':'#dc2626') + '">' + _cpPct(c.profitRate) + '</td>';
    h += TD(_cpWon(r.targetCost));
    // v2.3.722: 세트가 있으면 세트별로 나눠 보여준다 (없으면 옛 행 — 한 줄)
    // v2.3.725: 세트 이름·번호가 너무 작아 안 읽혔다 — 9.5 → 11px
    const _setLine = (v, sub2) => '<div style="line-height:1.4">' + v
      + (sub2 ? '<div style="font-size:11px;color:#64748b;font-weight:600">' + sub2 + '</div>' : '') + '</div>';
    if (c.sets && c.sets.length) {
      h += TD(c.sets.map(s2 => _setLine(_cpWon(s2.price), s2.no + '번 ' + _cpEsc(s2.name || '세트'))).join(''));
      h += TD(c.sets.map(s2 => _setLine('<b>' + s2.qty.toLocaleString() + '개</b>', s2.no + '번')).join(''));
      h += TD(c.sets.map(s2 => _setLine('<b>' + s2.sold.toLocaleString() + '개</b>', s2.no + '번')).join(''), 'background:#e0f2fe');
    } else {
      h += TD(_cpWon(_cpLivePrice(r)));
      h += TD(Math.round(c.orderQty).toLocaleString() + '개');
      h += TD(Math.round(c.soldQty).toLocaleString() + '개', 'background:#e0f2fe');
    }
    h += TD(sub(c.specialFee, c.specialVat));
    h += TD(sub(c.guestFee, c.guestVat));
    h += TD(sub(c.insertFee, c.insertVat));
    h += TD(_cpWon(c.hsComm) + '<div style="font-size:9.5px;color:#94a3b8;margin-top:1px">부가세 포함</div>');
    h += TD(_cpWon(c.vendorComm) + '<div style="font-size:9.5px;color:#94a3b8;margin-top:1px">부가세 포함</div>');
    h += TD(sub(c.cogs, c.cogsVat));
    h += TD('<div style="display:flex;flex-direction:column;gap:2px;align-items:center"><button onclick="openCpModal(' + r.id + ')" style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;line-height:1.5">✏️</button><button onclick="copyCpRow(' + r.id + ')" title="이 행을 복사해 새 행 추가" style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;line-height:1.5">📋</button></div>');
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  wrap.innerHTML = h;
}

// ── 행 추가/수정 모달 ──
// ═══════════ v1.9.962: 약국 판매 수익계산 (바로팜 채널) ═══════════
function _cpCalcPharmacy(r) {
  r = r || {};
  const salePrice = _cpLivePrice(r);
  const supplyRate = Number(r.supplyRate)||0;
  const qty = Number(r.qty)||0;
  const fixedCost = Number(r.fixedCost)||0;
  const shipping = Number(r.shipping)||0;
  const fee1Pct = (r.fee1Pct===''||r.fee1Pct==null) ? 15 : (Number(r.fee1Pct)||0);
  const fee2Pct = (r.fee2Pct===''||r.fee2Pct==null) ? 13 : (Number(r.fee2Pct)||0);
  // v2.2.5: 바로팜 부대 수수료 (기본 5%) — 매출 × % (부가세 포함)
  const extraFeePct = (r.extraFeePct===''||r.extraFeePct==null) ? 5 : (Number(r.extraFeePct)||0);
  const unitCost = _cpLiveCost(r);
  // v2.3.734: 4+1 사은품 — 4개 팔 때마다 1개를 얹어 준다. 매출은 없고 원가만 나간다.
  //   기준(giftPer)은 행마다 고칠 수 있다. 0·빈칸이면 사은품 없음.
  const giftPer = (r.giftPer === '' || r.giftPer == null) ? 4 : (Number(r.giftPer) || 0);
  const giftQty = giftPer > 0 ? Math.floor(qty / giftPer) : 0;
  const shipQty = qty + giftQty;                             // 실제로 나가는 수량
  const giftCost = unitCost * giftQty;                       // 사은품 원가 (부가세 제외)
  const supplyPrice = salePrice * supplyRate / 100;          // 공급가 (부가세 포함)
  const revenue = supplyPrice * qty;                         // 매출 (부가세 포함) — 사은품은 빠진다
  const fee1 = revenue * fee1Pct / 100;                      // 바로팜 1차 수수료 (부가세 포함)
  const fee2 = revenue * fee2Pct / 100;                      // 바로팜 2차 수수료 (부가세 포함)
  const extraFee = revenue * extraFeePct / 100;              // 바로팜 부대 수수료 (부가세 포함)
  const totalCost = unitCost * shipQty;                      // 총원가 (부가세 제외) — 사은품 몫 포함
  const netRevenue = revenue / 1.1;                          // 매출 공급가 (부가세 제외)
  // 순이익(부가세 제외): 매출·수수료·배송비는 부가세 포함값이라 ÷1.1, 고정비·총원가는 이미 부가세 제외
  const netProfit = netRevenue - (fee1/1.1) - (fee2/1.1) - (extraFee/1.1) - fixedCost - totalCost - (shipping/1.1);
  const profitRate = netRevenue > 0 ? (netProfit / netRevenue * 100) : 0;
  return { supplyPrice:supplyPrice, revenue:revenue, fee1:fee1, fee2:fee2, extraFee:extraFee, extraFeePct:extraFeePct, totalCost:totalCost,
    netRevenue:netRevenue, netProfit:netProfit, profitRate:profitRate, fee1Pct:fee1Pct, fee2Pct:fee2Pct,
    giftPer:giftPer, giftQty:giftQty, shipQty:shipQty, giftCost:giftCost, unitCost:unitCost };
}

var _CP_PHARM_INFO = {
  ph_name: ['제품명', '이 행에 연결된 완제품입니다.\n제품명을 클릭하면 전체 내역을 팝업으로 볼 수 있습니다.'],
  ph_revenue: ['매출 (부가세 포함)', '약국 공급 매출액입니다. (부가세 포함)\n\n매출 = 공급가 × 판매수량'],
  ph_netProfit: ['순이익 (부가세 제외)', '부가세를 제외한 순이익입니다.\n\n순이익 = 매출÷1.1 − 바로팜1차÷1.1 − 바로팜2차÷1.1 − 바로팜부대÷1.1 − 고정비 − 총원가 − 예상배송비÷1.1\n\n※ 매출·수수료·배송비는 부가세 포함값이라 ÷1.1로 부가세를 빼고, 고정비·총원가는 이미 부가세 제외 금액입니다.\n※ 총원가에는 4+1 사은품의 원가가 포함됩니다 — 사은품은 매출이 없어 순이익이 그만큼 줄어듭니다.'],
  ph_profitRate: ['수익율 (부가세 제외)', '부가세 제외 기준 수익율입니다.\n\n수익율 = 순이익 ÷ (매출÷1.1) × 100'],
  ph_salePrice: ['실제 판매가 (부가세 포함)', '완제품의 실제 판매가입니다. (부가세 포함)\n완제품을 선택하면 자동 입력되며 수정할 수 있습니다.'],
  ph_qty: ['판매수량', '약국에 돈을 받고 판매한 수량입니다. (입력값)\n사은품은 여기에 들어가지 않습니다.'],
  ph_giftQty: ['사은품 수량', '약국 판매는 4+1 입니다 — 4개 팔 때마다 1개를 사은품으로 얹어 줍니다.\n\n사은품 수량 = 판매수량 ÷ 기준(기본 4), 버림\n\n사은품은 매출이 없고 원가만 나갑니다. 그래서 총원가에 더해지고, 그만큼 순이익과 수익율이 내려갑니다.\n기준은 행 수정에서 바꿀 수 있습니다(0 이면 사은품 없음).'],
  ph_supplyPrice: ['공급가 (부가세 포함)', '약국에 공급하는 단가입니다. (부가세 포함)\n\n공급가 = 실제 판매가 × 공급율'],
  ph_fee1: ['바로팜 1차 수수료 (부가세 포함)', '바로팜 1차 수수료입니다. (부가세 포함)\n\n바로팜 1차 수수료 = 매출 × 1차 수수료%'],
  ph_fee2: ['바로팜 2차 수수료 (부가세 포함)', '바로팜 2차 수수료입니다. (부가세 포함)\n\n바로팜 2차 수수료 = 매출 × 2차 수수료%'],
  ph_extraFee: ['바로팜 부대 수수료 (부가세 포함)', '바로팜 부대 수수료입니다. (부가세 포함, 기본값 5%)\n\n바로팜 부대 수수료 = 매출 × 부대 수수료%'],
  ph_fixedCost: ['고정비 (부가세 제외)', '입력한 고정비입니다. (부가세 제외 금액)'],
  ph_cogs: ['제품원가 COGS', '제품 1개당 원가입니다. COGS이므로 부가세 제외 금액입니다.\n완제품의 BOM 합계 원가를 자동으로 가져오며, 수정할 수 있습니다.'],
  ph_totalCost: ['총원가 (부가세 제외)', '실제로 나가는 수량 전체의 제조원가입니다. (부가세 제외)\n\n총원가 = 제품원가 COGS × (판매수량 + 사은품 수량)\n\n※ 사은품은 돈을 받지 않지만 원가는 똑같이 나갑니다.'],
  ph_shipping: ['예상 배송비 (부가세 포함)', '입력한 예상 배송비 총액입니다. (부가세 포함)\n순이익 계산 시 ÷1.1로 부가세를 빼고 차감합니다.']
};

function _cpRenderPharmacyTable(wrap) {
  var rows = (_cpData.rows||[]).filter(function(r){ return r && (r.channelType||'homeshopping') === 'pharmacy'; });
  rows.sort(function(a,b){ return (Number(b.updatedAt)||0)-(Number(a.updatedAt)||0) || (Number(b.id)||0)-(Number(a.id)||0); });
  if (!rows.length) {
    wrap.innerHTML = '<div style="padding:44px;text-align:center;color:#94a3b8;font-size:13px;background:#f8fafc;border:1px dashed #e2e8f0;border-radius:12px">등록된 행이 없습니다. <b>＋ 행 추가</b> 버튼으로 시작하세요.</div>';
    return;
  }
  var INFO = function(key){ return '<span onclick="_cpInfo(event,\'' + key + '\')" style="cursor:pointer;color:#0ea5e9;font-weight:800;font-size:10px;margin-left:2px;vertical-align:super" title="클릭하면 설명·계산식">ⓘ</span>'; };
  var TH = function(t, key, sub, extra){
    var sc = sub ? (sub.indexOf('제외') >= 0 ? '#b45309' : (sub.indexOf('포함') >= 0 ? '#0369a1' : '#94a3b8')) : '';
    return '<th style="padding:9px 8px;font-size:11px;font-weight:700;color:#475569;white-space:nowrap;text-align:center;border-bottom:2px solid #e2e8f0;position:sticky;top:0;z-index:2;background:#f8fafc;' + (extra||'') + '">' + t + (key?INFO(key):'')
      + (sub ? ('<div style="font-size:9px;font-weight:600;margin-top:1px;color:' + sc + '">' + sub + '</div>') : '') + '</th>';
  };
  var h = '<div style="overflow:auto;max-height:70vh;border:1px solid #e2e8f0;border-radius:12px;background:#fff">';
  h += '<table style="border-collapse:collapse;white-space:nowrap;font-size:12px;min-width:100%"><thead><tr>';
  h += TH('제품명', 'ph_name', '', 'position:sticky;left:0;z-index:4;background:#f8fafc;width:172px;min-width:172px');
  h += TH('판매수량', 'ph_qty', '', '');
  h += TH('사은품 수량', 'ph_giftQty', '4개 구매시 1개 증정', '');   // v2.3.734: 4+1
  h += TH('매출', 'ph_revenue', '부가세 포함', 'background:#e0f2fe');
  h += TH('순이익', 'ph_netProfit', '부가세 제외', 'background:#fffbeb;border-bottom-color:#fde68a');
  h += TH('수익율', 'ph_profitRate', '부가세 제외', 'background:#fffbeb;border-bottom-color:#fde68a');
  h += TH('실제 판매가', 'ph_salePrice', '부가세 포함', '');
  h += TH('공급가', 'ph_supplyPrice', '부가세 포함', '');
  h += TH('바로팜 1차 수수료', 'ph_fee1', '부가세 포함', '');
  h += TH('바로팜 2차 수수료', 'ph_fee2', '부가세 포함', '');
  h += TH('바로팜 부대 수수료', 'ph_extraFee', '부가세 포함', '');
  h += TH('고정비', 'ph_fixedCost', '부가세 제외', '');
  h += TH('제품원가', 'ph_cogs', 'COGS', '');
  h += TH('총원가', 'ph_totalCost', '부가세 제외', '');
  h += TH('예상 배송비', 'ph_shipping', '부가세 포함', '');
  h += TH('관리', '', '', '');
  h += '</tr></thead><tbody>';
  rows.forEach(function(r){
    var c = _cpCalcPharmacy(r);
    var prod = (DB.items||[]).find(function(i){ return i && String(i.id) === String(r.productId); });
    var nm = (prod && prod.name) || r.name || '(제품 미선택)';
    var TD = function(v, extra){ return '<td style="padding:8px;text-align:center;border-bottom:1px solid #f1f5f9;' + (extra||'') + '">' + v + '</td>'; };
    h += '<tr>';
    h += '<td style="padding:8px 10px;text-align:center;border-bottom:1px solid #f1f5f9;position:sticky;left:0;z-index:3;background:#fff;width:172px;min-width:172px"><span onclick="openCpDetail(' + r.id + ')" style="color:#9d174d;font-weight:700;cursor:pointer">' + _cpEsc(nm) + '</span></td>';
    h += TD('<b>' + (Math.round(Number(r.qty)||0)).toLocaleString() + '개</b>');
    // v2.3.736: 사은품 수량 + 그 원가. 규칙(4+1)은 열 제목에 있으니 금액만 적는다.
    h += TD(c.giftQty > 0
      ? ('<b style="color:#9d174d">+' + c.giftQty.toLocaleString() + '개</b>'
         + '<div style="font-size:9.5px;color:#94a3b8;margin-top:1px;font-weight:600">' + _cpWon(c.giftCost) + '</div>')
      : '<span style="color:#cbd5e1">-</span>');
    h += TD('<b>' + _cpWon(c.revenue) + '</b>', 'background:#e0f2fe');
    h += TD('<b style="color:' + (c.netProfit>=0?'#15803d':'#dc2626') + '">' + _cpWon(c.netProfit) + '</b>', 'background:#fffbeb;font-weight:800');
    h += TD('<b style="color:' + (c.profitRate>=0?'#15803d':'#dc2626') + '">' + _cpPct(c.profitRate) + '</b>', 'background:#fffbeb;font-weight:800');
    h += TD(_cpWon(_cpLivePrice(r)));
    h += TD(_cpWon(c.supplyPrice) + '<div style="font-size:9.5px;color:#94a3b8;margin-top:1px;font-weight:600">공급율 ' + _cpPct(r.supplyRate) + '</div>');
    h += TD(_cpWon(c.fee1) + '<div style="font-size:9.5px;color:#0369a1;margin-top:1px;font-weight:700">' + _cpPct(c.fee1Pct) + '</div>');
    h += TD(_cpWon(c.fee2) + '<div style="font-size:9.5px;color:#0369a1;margin-top:1px;font-weight:700">' + _cpPct(c.fee2Pct) + '</div>');
    h += TD(_cpWon(c.extraFee) + '<div style="font-size:9.5px;color:#0369a1;margin-top:1px;font-weight:700">' + _cpPct(c.extraFeePct) + '</div>');
    h += TD(_cpWon(r.fixedCost));
    h += TD(_cpWon(_cpLiveCost(r)));
    h += TD(_cpWon(c.totalCost)
      + (c.giftQty > 0 ? ('<div style="font-size:9.5px;color:#94a3b8;margin-top:1px;font-weight:600">출고 ' + c.shipQty.toLocaleString() + '개</div>') : ''));
    h += TD(_cpWon(r.shipping));
    h += TD('<div style="display:flex;flex-direction:column;gap:2px;align-items:center"><button onclick="openCpModal(' + r.id + ')" style="background:#fce7f3;color:#9d174d;border:1px solid #fbcfe8;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;line-height:1.5">✏️</button><button onclick="copyCpRow(' + r.id + ')" title="이 행을 복사해 새 행 추가" style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;line-height:1.5">📋</button></div>');
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  wrap.innerHTML = h;
}

function _cpOpenModalPharmacy(id, r) {
  const g = (f, d) => (r && r[f] != null && r[f] !== '') ? r[f] : (d==null?'':d);
  const items = (DB.items||[]).filter(i => i && i.name && i.type === '완제품');
  let prodOpts = '<option value="">— 완제품 선택 —</option>';
  items.forEach(i => {
    prodOpts += '<option value="' + i.id + '"' + (r && String(r.productId)===String(i.id) ? ' selected' : '') + '>' + _cpEsc(i.name) + (i.code?(' ('+_cpEsc(i.code)+')'):'') + '</option>';
  });
  const fld = (label, fid, val, unit, sub) => {
    const subHtml = sub ? (' <span style="font-size:9.5px;font-weight:600;color:' + (sub.indexOf('제외')>=0?'#b45309':'#0369a1') + '">(' + sub + ')</span>') : '';
    return '<div>'
      + '<label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:3px">' + label + subHtml + '</label>'
      + '<div style="display:flex;align-items:center;border:1px solid #cbd5e1;border-radius:7px;overflow:hidden">'
      + '<input id="' + fid + '" type="number" step="any" value="' + _cpEsc(val) + '" oninput="_cpModalLive()" placeholder="0" style="flex:1;border:none;padding:7px 9px;font-size:12.5px;outline:none;min-width:0">'
      + (unit ? ('<span style="padding:0 10px;font-size:11.5px;color:#94a3b8;background:#f8fafc;align-self:stretch;display:flex;align-items:center;border-left:1px solid #e2e8f0">' + unit + '</span>') : '')
      + '</div></div>';
  };
  // v1.9.975: 자동/수동 모드 토글 필드 (실제 판매가 / 제품원가 COGS 용)
  const modeFld = (label, fid, val, unit, sub, mode, prefix) => {
    const subHtml = sub ? (' <span style="font-size:9.5px;font-weight:600;color:' + (sub.indexOf('제외')>=0?'#b45309':'#0369a1') + '">(' + sub + ')</span>') : '';
    const isAuto = (mode !== 'manual');
    const ON  = 'padding:3px 11px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid #0f172a;background:#0f172a;color:#fff;font-weight:700;line-height:1.3';
    const OFF = 'padding:3px 11px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#475569;font-weight:500;line-height:1.3';
    const inpBg = isAuto ? '#f1f5f9' : '#fff';
    const inpColor = isAuto ? '#475569' : '#0f172a';
    const inpCursor = isAuto ? 'not-allowed' : 'text';
    return '<div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;gap:6px">'
      + '<label style="font-size:11px;font-weight:700;color:#475569">' + label + subHtml + '</label>'
      + '<span style="display:inline-flex;gap:4px;flex-shrink:0">'
      + '<button type="button" id="' + fid + '-modeAuto" onclick="_cp' + prefix + 'Auto()" title="완제품 정보에서 자동으로 가져옴 (수정 불가)" style="' + (isAuto?ON:OFF) + '">자동</button>'
      + '<button type="button" id="' + fid + '-modeManual" onclick="_cp' + prefix + 'Manual()" title="직접 입력 (수정 가능)" style="' + (isAuto?OFF:ON) + '">수동</button>'
      + '</span></div>'
      + '<div style="display:flex;align-items:center;border:1px solid #cbd5e1;border-radius:7px;overflow:hidden">'
      + '<input id="' + fid + '" type="number" step="any" value="' + _cpEsc(val) + '" oninput="_cpModalLive()" placeholder="0" data-mode="' + (isAuto?'auto':'manual') + '"' + (isAuto?' disabled':'') + ' style="flex:1;border:none;padding:7px 9px;font-size:12.5px;outline:none;min-width:0;background:' + inpBg + ';color:' + inpColor + ';cursor:' + inpCursor + '">'
      + (unit ? ('<span style="padding:0 10px;font-size:11.5px;color:#94a3b8;background:#f8fafc;align-self:stretch;display:flex;align-items:center;border-left:1px solid #e2e8f0">' + unit + '</span>') : '')
      + '</div></div>';
  };
  const ov = document.createElement('div');
  ov.id = 'cp-modal-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99988;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:32px 16px';
  ov.onclick = function(ev){ if (ev.target === ov) closeCpModal(); };
  ov.innerHTML = '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:14px;width:680px;max-width:96vw;box-shadow:0 18px 50px rgba(0,0,0,.3);overflow:hidden">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;background:linear-gradient(135deg,#fce7f3,#fbcfe8)">'
    + '<div style="font-size:15px;font-weight:800;color:#9d174d">💊 약국 판매 — ' + (id!=null?'행 수정':'행 추가') + '</div>'
    + '<button onclick="closeCpModal()" style="background:rgba(255,255,255,.5);border:none;width:26px;height:26px;border-radius:7px;cursor:pointer;font-size:14px;color:#9d174d">✕</button>'
    + '</div>'
    + '<div style="padding:18px 20px;max-height:62vh;overflow-y:auto">'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:11px">'
    + '<div style="grid-column:1/3"><label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:3px">완제품 선택</label>'
    + '<select id="cp-ph-product" onchange="_cpPharmProductChange()" style="width:100%;border:1px solid #cbd5e1;border-radius:7px;padding:7px 9px;font-size:12.5px">' + prodOpts + '</select></div>'
    + modeFld('실제 판매가', 'cp-ph-salePrice', g('salePrice',0), '원', '부가세 포함', g('salePriceMode','auto'), 'PhPrice')
    + fld('공급율', 'cp-ph-supplyRate', g('supplyRate',50), '%', '')
    + fld('고정비', 'cp-ph-fixedCost', g('fixedCost',0), '원', '부가세 제외')
    + fld('판매 수량', 'cp-ph-qty', g('qty',0), '개', '')
    // v2.3.734: 약국은 4+1 — 기준을 바꾸거나 0 으로 두면 사은품 없음
    + fld('사은품 기준 (n개당 1개)', 'cp-ph-giftPer', g('giftPer',4), '개당 1개', '')
    + fld('예상 배송비', 'cp-ph-shipping', g('shipping',0), '원', '부가세 포함')
    + fld('바로팜 1차 수수료', 'cp-ph-fee1', g('fee1Pct',15), '%', '')
    + fld('바로팜 2차 수수료', 'cp-ph-fee2', g('fee2Pct',13), '%', '')
    + fld('바로팜 부대 수수료', 'cp-ph-extraFee', g('extraFeePct',5), '%', '')
    + modeFld('제품원가 COGS', 'cp-ph-unitCost', g('unitCost',0), '원', '', g('unitCostMode','auto'), 'PhCogs')
    + '<div style="grid-column:1/3"><label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:3px">비고</label>'
    + '<input id="cp-ph-note" value="' + _cpEsc(g('note')) + '" style="width:100%;border:1px solid #cbd5e1;border-radius:7px;padding:7px 9px;font-size:12.5px"></div>'
    + '</div>'
    + '<div style="font-size:10.5px;color:#94a3b8;margin-top:10px;line-height:1.7">· <b style="color:#475569">자동</b>: 완제품 품목정보의 실제 판매가·BOM 원가를 자동 사용 (수정 불가, 품목정보 변경 시 즉시 반영)<br>· <b style="color:#475569">수동</b>: 빈칸에 직접 입력 (품목정보 변경에 영향받지 않음)<br>· 공급가 = 실제 판매가 × 공급율 &nbsp; · &nbsp; 매출 = 공급가 × 판매수량</div>'
    + '<div id="cp-m-live" style="margin-top:12px;background:#fdf2f8;border:1px solid #fbcfe8;border-radius:9px;padding:11px 14px;display:flex;gap:22px;align-items:center;flex-wrap:wrap"></div>'
    + '</div>'
    + '<div style="padding:13px 20px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;gap:8px">'
    // v2.3.621: 목록의 🗑️ 를 복사(📋)로 바꾸면서 삭제는 수정 모달 안으로 이동
    + (id != null ? '<button onclick="deleteCpRowFromModal()" style="margin-right:auto;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">🗑️ 삭제</button>' : '')
    + '<button onclick="closeCpModal()" style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">취소</button>'
    + '<button onclick="saveCpRow()" style="background:#9d174d;color:#fff;border:none;padding:9px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">저장</button>'
    + '</div></div>';
  document.body.appendChild(ov);
  // v1.9.975: 자동 모드일 때만 BOM·품목정보로 자동 동기화 (수동 모드는 사용자 입력 보존)
  try {
    var _ps = document.getElementById('cp-ph-product');
    if (_ps && _ps.value) {
      var _itm = (DB.items||[]).find(function(x){ return x && String(x.id) === String(_ps.value); });
      var _uc = document.getElementById('cp-ph-unitCost');
      if (_uc && _uc.dataset.mode !== 'manual') {
        var _bc = _cpBomCost(_ps.value);
        if (_bc > 0) _uc.value = _bc;
        else if (_itm && _itm.price) _uc.value = _itm.price;
      }
      var _spx = document.getElementById('cp-ph-salePrice');
      if (_spx && _spx.dataset.mode !== 'manual' && _itm && _itm.actualSalePrice != null && _itm.actualSalePrice !== '') {
        _spx.value = _itm.actualSalePrice;
      }
    }
  } catch(_){}
  _cpModalLive();
}

function _cpPharmProductChange() {
  var sel = document.getElementById('cp-ph-product');
  if (!sel) return;
  var itm = (DB.items||[]).find(function(i){ return i && String(i.id) === String(sel.value); });
  if (itm) {
    // v1.9.975: 자동 모드일 때만 갱신 (수동 모드는 사용자 입력 보존)
    var sp = document.getElementById('cp-ph-salePrice');
    if (sp && sp.dataset.mode !== 'manual' && itm.actualSalePrice != null && itm.actualSalePrice !== '') sp.value = itm.actualSalePrice;
    var uc = document.getElementById('cp-ph-unitCost');
    if (uc && uc.dataset.mode !== 'manual') {
      var bom = _cpBomCost(itm.id);
      if (bom > 0) uc.value = bom;
      else if (itm.price) uc.value = itm.price;
    }
  }
  _cpModalLive();
}

function _cpReadModalPharmacy() {
  var sel = document.getElementById('cp-ph-product');
  var pid = sel ? sel.value : '';
  var prod = (DB.items||[]).find(function(i){ return i && String(i.id) === String(pid); });
  return {
    productId: pid,
    name: (prod && prod.name) || '',
    salePrice: _cpNum('cp-ph-salePrice'),
    salePriceMode: _cpModeOf('cp-ph-salePrice'),
    supplyRate: _cpNum('cp-ph-supplyRate'),
    fixedCost: _cpNum('cp-ph-fixedCost'),
    qty: _cpNum('cp-ph-qty'),
    giftPer: _cpNum('cp-ph-giftPer'),   // v2.3.734: 4+1 기준
    shipping: _cpNum('cp-ph-shipping'),
    fee1Pct: _cpNum('cp-ph-fee1'),
    fee2Pct: _cpNum('cp-ph-fee2'),
    extraFeePct: _cpNum('cp-ph-extraFee'),
    unitCost: _cpNum('cp-ph-unitCost'),
    unitCostMode: _cpModeOf('cp-ph-unitCost'),
    note: (document.getElementById('cp-ph-note')||{}).value || ''
  };
}

function _cpModalLivePharmacy(box) {
  const c = _cpCalcPharmacy(_cpReadModalPharmacy());
  box.innerHTML = '<div><span style="font-size:11px;color:#9d174d;font-weight:700">순이익</span> '
    + '<b style="font-size:16px;color:' + (c.netProfit>=0?'#15803d':'#dc2626') + '">' + _cpWon(c.netProfit) + '</b>'
    + '<span style="font-size:9.5px;color:#b45309;margin-left:3px">부가세 제외</span></div>'
    + '<div><span style="font-size:11px;color:#9d174d;font-weight:700">수익율</span> '
    + '<b style="font-size:16px;color:' + (c.profitRate>=0?'#15803d':'#dc2626') + '">' + _cpPct(c.profitRate) + '</b></div>'
    + '<div style="font-size:11px;color:#9d174d;line-height:1.7">매출 ' + _cpWon(c.revenue) + ' · 공급가 ' + _cpWon(c.supplyPrice) + ' · 총원가 ' + _cpWon(c.totalCost)
    // v2.3.734: 사은품이 몇 개 나가고 원가가 얼마인지 그 자리에서 보여준다
    + (c.giftQty > 0 ? ('<br>사은품 <b>' + c.giftQty.toLocaleString() + '개</b> (' + c.giftPer + '+1) · 사은품 원가 <b>' + _cpWon(c.giftCost) + '</b> · 출고 ' + c.shipQty.toLocaleString() + '개') : '')
    + '</div>';
}

function _cpOpenDetailPharmacy(r) {
  const c = _cpCalcPharmacy(r);
  const prod = (DB.items||[]).find(i => i && String(i.id) === String(r.productId));
  const nm = (prod && prod.name) || r.name || '(제품 미선택)';
  const ov = document.createElement('div');
  ov.id = 'cp-detail-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99989;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:32px 16px';
  ov.onclick = function(ev){ if (ev.target === ov) closeCpDetail(); };
  const line = (lbl, val, opts) => {
    opts = opts || {};
    return '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;'
      + (opts.hi?'background:#fdf2f8;font-weight:800;padding:9px 10px;border-radius:7px;border-bottom:none;margin:4px 0':'') + '">'
      + '<span style="font-size:12px;color:' + (opts.hi?'#9d174d':'#64748b') + ';font-weight:' + (opts.hi?'800':'600') + '">' + lbl + '</span>'
      + '<span style="font-size:' + (opts.hi?'14px':'12.5px') + ';color:' + (opts.color||'#0f172a') + ';font-weight:' + (opts.hi?'800':'700') + '">' + val + '</span></div>';
  };
  const sect = (t) => '<div style="font-size:11.5px;font-weight:800;color:#9d174d;margin:14px 0 4px">' + t + '</div>';
  ov.innerHTML = '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:14px;width:480px;max-width:96vw;box-shadow:0 18px 50px rgba(0,0,0,.3);overflow:hidden">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;background:linear-gradient(135deg,#fce7f3,#fbcfe8)">'
    + '<div><div style="font-size:15px;font-weight:800;color:#9d174d">' + _cpEsc(nm) + '</div>'
    + '<div style="font-size:11.5px;color:#be185d;margin-top:2px">💊 약국 판매</div></div>'
    + '<button onclick="closeCpDetail()" style="background:rgba(255,255,255,.5);border:none;width:26px;height:26px;border-radius:7px;cursor:pointer;font-size:14px;color:#9d174d">✕</button>'
    + '</div>'
    + '<div style="padding:16px 20px;max-height:68vh;overflow-y:auto">'
    + line('순이익 (부가세 제외)', _cpWon(c.netProfit), {hi:true, color:(c.netProfit>=0?'#15803d':'#dc2626')})
    + line('수익율 (부가세 제외)', _cpPct(c.profitRate), {hi:true, color:(c.profitRate>=0?'#15803d':'#dc2626')})
    + sect('매출')
    + line('실제 판매가 (부가세 포함)', _cpWon(_cpLivePrice(r)))
    + line('공급율', _cpPct(r.supplyRate))
    + line('공급가 (부가세 포함)', _cpWon(c.supplyPrice))
    + line('판매 수량', (Math.round(Number(r.qty)||0)).toLocaleString() + '개')
    // v2.3.734: 사은품은 매출이 없다 — 매출 줄 위에 함께 보여 준다
    + (c.giftQty > 0 ? line('사은품 수량 (' + c.giftPer + '+1, 매출 없음)', '+' + c.giftQty.toLocaleString() + '개', {color:'#9d174d'}) : '')
    + line('매출 (부가세 포함)', _cpWon(c.revenue))
    + sect('비용 · 원가')
    + line('바로팜 1차 수수료 (' + _cpPct(c.fee1Pct) + ', 부가세 포함)', _cpWon(c.fee1))
    + line('바로팜 2차 수수료 (' + _cpPct(c.fee2Pct) + ', 부가세 포함)', _cpWon(c.fee2))
    + line('고정비 (부가세 제외)', _cpWon(r.fixedCost))
    + line('제품원가 COGS (개당)', _cpWon(_cpLiveCost(r)))
    + (c.giftQty > 0 ? line('사은품 원가 (' + c.giftQty.toLocaleString() + '개, 부가세 제외)', _cpWon(c.giftCost), {color:'#9d174d'}) : '')
    + line('총원가 (부가세 제외' + (c.giftQty > 0 ? ', 출고 ' + c.shipQty.toLocaleString() + '개' : '') + ')', _cpWon(c.totalCost))
    + line('예상 배송비 (부가세 포함)', _cpWon(r.shipping))
    + (r.note ? (sect('비고') + '<div style="font-size:12px;color:#475569;padding:4px 0;white-space:pre-wrap">' + _cpEsc(r.note) + '</div>') : '')
    + '</div>'
    + '<div style="padding:13px 20px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;gap:8px">'
    + '<button onclick="closeCpDetail();openCpModal(' + r.id + ')" style="background:#fce7f3;color:#9d174d;border:1px solid #fbcfe8;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">✏️ 수정</button>'
    + '<button onclick="closeCpDetail()" style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">닫기</button>'
    + '</div></div>';
  document.body.appendChild(ov);
}

// ═══════════ v1.9.965: 중국 수출 수익계산 ═══════════
var _CP_EXPORT_INFO = {
  ex_name: ['제품명', '이 행에 연결된 완제품입니다.\n제품명을 클릭하면 전체 내역을 팝업으로 볼 수 있습니다.'],
  netProfit: ['순이익', '수출 순이익입니다. (수출은 부가세 없음)\n\n순이익 = 매출 − 총 제조원가 − 예상 물류비 − 분담 광고비\n\n= Contribution(광고비 차감 전 이익) − 분담 광고비'],
  ros: ['수익률 (ROS)', 'ROS = Return on Sales — 매출 대비 순이익률\n\n수익률(ROS) = 순이익 ÷ 매출 × 100'],
  contribution: ['Contribution', 'Contribution = 광고비 차감 전 이익\n\nContribution = 매출 − 총 제조원가 − 예상 물류비\n\n※ 분담 광고비를 빼기 전 단계의 이익입니다. 여기서 분담 광고비를 빼면 순이익이 됩니다.'],
  ex_supplyPrice: ['수출 공급가', '중국 측에 공급하는 1개당 단가입니다. (부가세 없음)\n\n수출 공급가격 = 한국 판매가 × 수출 공급가%\n\n금액 아래의 %는 한국 판매가 대비 공급 비율입니다.'],
  ex_krwPrice: ['한국 판매가', '완제품의 한국 판매가입니다. (수출은 부가세 없음 기준)\n품목정보의 실제 판매가를 자동으로 가져오며, 수정할 수 있습니다.'],
  ex_qty: ['수출 수량', '중국에 수출하는 수량입니다. (입력값)'],
  ex_revenue: ['매출', '수출 매출액입니다. (부가세 없음)\n\n매출 = 수출 공급가격 × 수출 수량'],
  ex_totalCogs: ['총 제조원가', '수출 수량 전체의 제조원가입니다. (부가세 없음)\n\n총 제조원가 = 제품원가 COGS × 수출 수량'],
  ex_adCost: ['분담 광고비', '이 수출 건에 분담된 광고비입니다. (입력값)\n순이익 계산 시 차감됩니다. (Contribution 단계에서는 차감 전)'],
  ex_incoterm: ['수출 조건', '수출 거래 조건(Incoterms)입니다.\nEXW·FOB·CIF 등 — 운임·보험·위험 부담 주체를 정하는 국제 무역 조건입니다.'],
  ex_logiCost: ['예상 물류비', '예상 물류비용입니다. (입력값)\nContribution·순이익 계산 시 차감됩니다.'],
  costRate: ['원가율', '한국 판매가 대비 제품원가(COGS) 비율입니다.\n\n원가율 = 제품원가 COGS ÷ 한국 판매가 × 100']
};

function _cpInfoClose() { var p = document.getElementById('cp-info-pop'); if (p) p.remove(); }
function _cpInfo(ev, key) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  var info = _CP_EXPORT_INFO[key] || _CP_PHARM_INFO[key];
  if (!info) return;
  _cpInfoClose();
  var ov = document.createElement('div');
  ov.id = 'cp-info-pop';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.4);z-index:99996;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.onclick = function(){ ov.remove(); };
  ov.innerHTML = '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:12px;width:390px;max-width:94vw;box-shadow:0 16px 44px rgba(0,0,0,.3);overflow:hidden">'
    + '<div style="padding:12px 16px;background:#0f172a;color:#fff;font-size:13px;font-weight:800">ⓘ ' + info[0] + '</div>'
    + '<div style="padding:15px 17px;font-size:12.5px;color:#334155;line-height:1.85;white-space:pre-wrap">' + info[1] + '</div>'
    + '<div style="padding:10px 16px;text-align:right;border-top:1px solid #f1f5f9"><button onclick="_cpInfoClose()" style="background:#0f172a;color:#fff;border:none;padding:7px 17px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer">확인</button></div>'
    + '</div>';
  document.body.appendChild(ov);
}

function _cpCalcExport(r) {
  r = r || {};
  var krwPrice = _cpLivePrice(r);
  var supplyRate = Number(r.supplyRate)||0;
  var qty = Number(r.qty)||0;
  var unitCost = _cpLiveCost(r);
  var adCost = Number(r.adCost)||0;
  var logiCost = Number(r.logiCost)||0;
  var supplyPrice = krwPrice * supplyRate / 100;        // 수출 공급가격
  var revenue = supplyPrice * qty;                      // 매출
  var totalCogs = unitCost * qty;                       // 총 제조원가
  var contribution = revenue - totalCogs - logiCost;    // 광고비 차감 전 이익
  var netProfit = contribution - adCost;                // 순이익
  var ros = revenue > 0 ? (netProfit / revenue * 100) : 0;          // 수익률(ROS)
  var costRate = krwPrice > 0 ? (unitCost / krwPrice * 100) : 0;    // 원가율
  return { supplyPrice:supplyPrice, revenue:revenue, totalCogs:totalCogs, contribution:contribution,
    netProfit:netProfit, ros:ros, costRate:costRate };
}

var _CP_INCOTERMS = ['EXW (EX WORKS)','FCA','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'];

function _cpRenderExportTable(wrap) {
  var rows = (_cpData.rows||[]).filter(function(r){ return r && (r.channelType||'homeshopping') === 'export'; });
  rows.sort(function(a,b){ return (Number(b.updatedAt)||0)-(Number(a.updatedAt)||0) || (Number(b.id)||0)-(Number(a.id)||0); });
  if (!rows.length) {
    wrap.innerHTML = '<div style="padding:44px;text-align:center;color:#94a3b8;font-size:13px;background:#f8fafc;border:1px dashed #e2e8f0;border-radius:12px">등록된 행이 없습니다. <b>＋ 행 추가</b> 버튼으로 시작하세요.</div>';
    return;
  }
  var INFO = function(key){ return '<span onclick="_cpInfo(event,\'' + key + '\')" style="cursor:pointer;color:#0ea5e9;font-weight:800;font-size:10px;margin-left:2px;vertical-align:super" title="클릭하면 설명·계산식">ⓘ</span>'; };
  var TH = function(t, extra){ return '<th style="padding:9px 8px;font-size:11px;font-weight:700;color:#475569;white-space:nowrap;text-align:center;border-bottom:2px solid #e2e8f0;position:sticky;top:0;z-index:2;background:#f8fafc;' + (extra||'') + '">' + t + '</th>'; };
  var h = '<div style="overflow:auto;max-height:70vh;border:1px solid #e2e8f0;border-radius:12px;background:#fff">';
  h += '<table style="border-collapse:collapse;white-space:nowrap;font-size:12px;min-width:100%"><thead><tr>';
  h += TH('제품명' + INFO('ex_name'), 'position:sticky;left:0;z-index:4;background:#f8fafc;width:172px;min-width:172px');
  h += TH('수출 공급가' + INFO('ex_supplyPrice'));
  h += TH('수출 수량' + INFO('ex_qty'));
  h += TH('순이익' + INFO('netProfit'), 'background:#fffbeb;border-bottom-color:#fde68a');
  h += TH('수익률 (ROS)' + INFO('ros'), 'background:#fffbeb;border-bottom-color:#fde68a');
  h += TH('Contribution' + INFO('contribution'), 'background:#eff6ff;border-bottom-color:#bfdbfe');
  h += TH('한국 판매가' + INFO('ex_krwPrice'));
  h += TH('매출' + INFO('ex_revenue'));
  h += TH('총 제조원가' + INFO('ex_totalCogs'));
  h += TH('분담 광고비' + INFO('ex_adCost'));
  h += TH('수출 조건' + INFO('ex_incoterm'));
  h += TH('예상 물류비' + INFO('ex_logiCost'));
  h += TH('원가율' + INFO('costRate'));
  h += TH('관리');
  h += '</tr></thead><tbody>';
  rows.forEach(function(r){
    var c = _cpCalcExport(r);
    var prod = (DB.items||[]).find(function(i){ return i && String(i.id) === String(r.productId); });
    var nm = (prod && prod.name) || r.name || '(제품 미선택)';
    var TD = function(v, extra){ return '<td style="padding:8px;text-align:center;border-bottom:1px solid #f1f5f9;' + (extra||'') + '">' + v + '</td>'; };
    h += '<tr>';
    h += '<td style="padding:8px 10px;text-align:center;border-bottom:1px solid #f1f5f9;position:sticky;left:0;z-index:3;background:#fff;width:172px;min-width:172px"><span onclick="openCpDetail(' + r.id + ')" style="color:#c2410c;font-weight:700;cursor:pointer">' + _cpEsc(nm) + '</span></td>';
    h += TD(_cpWon(c.supplyPrice) + '<div style="font-size:9.5px;color:#e11d48;font-weight:600;margin-top:1px">' + _cpPct(r.supplyRate) + '</div>');
    h += TD((Math.round(Number(r.qty)||0)).toLocaleString() + '개');
    h += TD('<b style="color:' + (c.netProfit>=0?'#15803d':'#dc2626') + '">' + _cpWon(c.netProfit) + '</b>', 'background:#fffbeb;font-weight:800');
    h += TD('<b style="color:' + (c.ros>=0?'#15803d':'#dc2626') + '">' + _cpPct(c.ros) + '</b>', 'background:#fffbeb;font-weight:800');
    h += TD('<b style="color:' + (c.contribution>=0?'#1d4ed8':'#dc2626') + '">' + _cpWon(c.contribution) + '</b>', 'background:#eff6ff;font-weight:700');
    h += TD(_cpWon(_cpLivePrice(r)));
    h += TD('<b>' + _cpWon(c.revenue) + '</b>');
    h += TD(_cpWon(c.totalCogs));
    h += TD(_cpWon(r.adCost));
    h += TD(_cpEsc(r.incoterm||'-'));
    h += TD(_cpWon(r.logiCost));
    h += TD('<b>' + _cpPct(c.costRate) + '</b><div style="font-size:9px;color:#94a3b8;margin-top:1px">제품원가 ' + _cpWon(_cpLiveCost(r)) + '</div>');
    h += TD('<div style="display:flex;flex-direction:column;gap:2px;align-items:center"><button onclick="openCpModal(' + r.id + ')" style="background:#ffedd5;color:#c2410c;border:1px solid #fed7aa;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;line-height:1.5">✏️</button><button onclick="copyCpRow(' + r.id + ')" title="이 행을 복사해 새 행 추가" style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;line-height:1.5">📋</button></div>');
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  h += '<div style="font-size:11px;color:#7c2d12;margin-top:10px;line-height:1.85;background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;padding:12px 15px">※ 해당 수치는 업계의 통상적 마진율을 기반으로 역산한 수치이며, 계약 조건에 따라 수익률은 달라질 수 있음<br>※ 행운에서 총판하는 달바·코스알엑스·아도르는 중국·한국 판매가격이 거의 비슷함 (상품 개별로 10% 차이 정도까지는 존재하나, 보수적으로 동일하다고 보는 게 맞음)</div>';
  wrap.innerHTML = h;
}

function _cpOpenModalExport(id, r) {
  var g = function(f, d){ return (r && r[f] != null && r[f] !== '') ? r[f] : (d==null?'':d); };
  var items = (DB.items||[]).filter(function(i){ return i && i.name && i.type === '완제품'; });
  var prodOpts = '<option value="">— 완제품 선택 —</option>';
  items.forEach(function(i){
    prodOpts += '<option value="' + i.id + '"' + (r && String(r.productId)===String(i.id) ? ' selected' : '') + '>' + _cpEsc(i.name) + (i.code?(' ('+_cpEsc(i.code)+')'):'') + '</option>';
  });
  var curInco = g('incoterm','FOB');
  var incoOpts = '';
  _CP_INCOTERMS.forEach(function(t){
    incoOpts += '<option value="' + t + '"' + (String(curInco)===String(t)?' selected':'') + '>' + t + '</option>';
  });
  var fld = function(label, fid, val, unit){
    return '<div>'
      + '<label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:3px">' + label + '</label>'
      + '<div style="display:flex;align-items:center;border:1px solid #cbd5e1;border-radius:7px;overflow:hidden">'
      + '<input id="' + fid + '" type="number" step="any" value="' + _cpEsc(val) + '" oninput="_cpModalLive()" placeholder="0" style="flex:1;border:none;padding:7px 9px;font-size:12.5px;outline:none;min-width:0">'
      + (unit ? ('<span style="padding:0 10px;font-size:11.5px;color:#94a3b8;background:#f8fafc;align-self:stretch;display:flex;align-items:center;border-left:1px solid #e2e8f0">' + unit + '</span>') : '')
      + '</div></div>';
  };
  // v1.9.975: 자동/수동 모드 토글 필드 (한국 판매가 / 제품원가 COGS 용)
  var modeFld = function(label, fid, val, unit, mode, prefix){
    var isAuto = (mode !== 'manual');
    var ON  = 'padding:3px 11px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid #0f172a;background:#0f172a;color:#fff;font-weight:700;line-height:1.3';
    var OFF = 'padding:3px 11px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#475569;font-weight:500;line-height:1.3';
    var inpBg = isAuto ? '#f1f5f9' : '#fff';
    var inpColor = isAuto ? '#475569' : '#0f172a';
    var inpCursor = isAuto ? 'not-allowed' : 'text';
    return '<div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;gap:6px">'
      + '<label style="font-size:11px;font-weight:700;color:#475569">' + label + '</label>'
      + '<span style="display:inline-flex;gap:4px;flex-shrink:0">'
      + '<button type="button" id="' + fid + '-modeAuto" onclick="_cp' + prefix + 'Auto()" title="완제품 정보에서 자동으로 가져옴 (수정 불가)" style="' + (isAuto?ON:OFF) + '">자동</button>'
      + '<button type="button" id="' + fid + '-modeManual" onclick="_cp' + prefix + 'Manual()" title="직접 입력 (수정 가능)" style="' + (isAuto?OFF:ON) + '">수동</button>'
      + '</span></div>'
      + '<div style="display:flex;align-items:center;border:1px solid #cbd5e1;border-radius:7px;overflow:hidden">'
      + '<input id="' + fid + '" type="number" step="any" value="' + _cpEsc(val) + '" oninput="_cpModalLive()" placeholder="0" data-mode="' + (isAuto?'auto':'manual') + '"' + (isAuto?' disabled':'') + ' style="flex:1;border:none;padding:7px 9px;font-size:12.5px;outline:none;min-width:0;background:' + inpBg + ';color:' + inpColor + ';cursor:' + inpCursor + '">'
      + (unit ? ('<span style="padding:0 10px;font-size:11.5px;color:#94a3b8;background:#f8fafc;align-self:stretch;display:flex;align-items:center;border-left:1px solid #e2e8f0">' + unit + '</span>') : '')
      + '</div></div>';
  };
  var ov = document.createElement('div');
  ov.id = 'cp-modal-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99988;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:32px 16px';
  ov.onclick = function(ev){ if (ev.target === ov) closeCpModal(); };
  ov.innerHTML = '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:14px;width:680px;max-width:96vw;box-shadow:0 18px 50px rgba(0,0,0,.3);overflow:hidden">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;background:linear-gradient(135deg,#ffedd5,#fed7aa)">'
    + '<div style="font-size:15px;font-weight:800;color:#c2410c">🇨🇳 중국 수출 — ' + (id!=null?'행 수정':'행 추가') + '</div>'
    + '<button onclick="closeCpModal()" style="background:rgba(255,255,255,.5);border:none;width:26px;height:26px;border-radius:7px;cursor:pointer;font-size:14px;color:#c2410c">✕</button>'
    + '</div>'
    + '<div style="padding:18px 20px;max-height:62vh;overflow-y:auto">'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:11px">'
    + '<div style="grid-column:1/3"><label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:3px">제품명 (완제품 선택)</label>'
    + '<select id="cp-ex-product" onchange="_cpExportProductChange()" style="width:100%;border:1px solid #cbd5e1;border-radius:7px;padding:7px 9px;font-size:12.5px">' + prodOpts + '</select></div>'
    + modeFld('한국 판매가', 'cp-ex-krwPrice', g('krwPrice',0), '원', g('krwPriceMode','auto'), 'ExPrice')
    + fld('수출 공급가', 'cp-ex-supplyRate', g('supplyRate',0), '%')
    + fld('수출 수량', 'cp-ex-qty', g('qty',0), '개')
    + modeFld('제품원가 COGS', 'cp-ex-unitCost', g('unitCost',0), '원', g('unitCostMode','auto'), 'ExCogs')
    + fld('분담 광고비', 'cp-ex-adCost', g('adCost',0), '원')
    + '<div><label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:3px">수출 조건 (Incoterms)</label>'
    + '<select id="cp-ex-incoterm" style="width:100%;border:1px solid #cbd5e1;border-radius:7px;padding:7px 9px;font-size:12.5px;background:#fff">' + incoOpts + '</select></div>'
    + fld('예상 물류비용', 'cp-ex-logiCost', g('logiCost',0), '원')
    + '<div style="grid-column:1/3"><label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:3px">비고</label>'
    + '<input id="cp-ex-note" value="' + _cpEsc(g('note')) + '" style="width:100%;border:1px solid #cbd5e1;border-radius:7px;padding:7px 9px;font-size:12.5px"></div>'
    + '</div>'
    + '<div style="font-size:10.5px;color:#94a3b8;margin-top:10px;line-height:1.7">· <b style="color:#475569">자동</b>: 완제품 품목정보의 한국 판매가·BOM 원가를 자동 사용 (수정 불가, 품목정보 변경 시 즉시 반영)<br>· <b style="color:#475569">수동</b>: 빈칸에 직접 입력 (품목정보 변경에 영향받지 않음)<br>· 수출 금액은 부가세가 없습니다 — 모두 부가세 없는 금액으로 입력하세요.<br>· 수출 공급가격 = 한국 판매가 × 수출 공급가%</div>'
    + '<div id="cp-m-live" style="margin-top:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;padding:11px 14px;display:flex;gap:20px;align-items:center;flex-wrap:wrap"></div>'
    + '</div>'
    + '<div style="padding:13px 20px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;gap:8px">'
    // v2.3.621: 목록의 🗑️ 를 복사(📋)로 바꾸면서 삭제는 수정 모달 안으로 이동
    + (id != null ? '<button onclick="deleteCpRowFromModal()" style="margin-right:auto;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">🗑️ 삭제</button>' : '')
    + '<button onclick="closeCpModal()" style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">취소</button>'
    + '<button onclick="saveCpRow()" style="background:#c2410c;color:#fff;border:none;padding:9px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">저장</button>'
    + '</div></div>';
  document.body.appendChild(ov);
  // v1.9.975: 자동 모드만 동기화
  try {
    var _ps = document.getElementById('cp-ex-product');
    if (_ps && _ps.value) {
      var _itm = (DB.items||[]).find(function(x){ return x && String(x.id) === String(_ps.value); });
      var _uc = document.getElementById('cp-ex-unitCost');
      if (_uc && _uc.dataset.mode !== 'manual') {
        var _bc = _cpBomCost(_ps.value);
        if (_bc > 0) _uc.value = _bc;
        else if (_itm && _itm.price) _uc.value = _itm.price;
      }
      var _kpx = document.getElementById('cp-ex-krwPrice');
      if (_kpx && _kpx.dataset.mode !== 'manual' && _itm && _itm.actualSalePrice != null && _itm.actualSalePrice !== '') {
        _kpx.value = _itm.actualSalePrice;
      }
    }
  } catch(_){}
  _cpModalLive();
}

function _cpExportProductChange() {
  var sel = document.getElementById('cp-ex-product');
  if (!sel) return;
  var itm = (DB.items||[]).find(function(i){ return i && String(i.id) === String(sel.value); });
  if (itm) {
    // v1.9.975: 자동 모드일 때만 갱신 (수동 모드는 사용자 입력 보존)
    var kp = document.getElementById('cp-ex-krwPrice');
    if (kp && kp.dataset.mode !== 'manual' && itm.actualSalePrice != null && itm.actualSalePrice !== '') kp.value = itm.actualSalePrice;
    var uc = document.getElementById('cp-ex-unitCost');
    if (uc && uc.dataset.mode !== 'manual') {
      var bom = _cpBomCost(itm.id);
      if (bom > 0) uc.value = bom;
      else if (itm.price) uc.value = itm.price;
    }
  }
  _cpModalLive();
}

function _cpReadModalExport() {
  var sel = document.getElementById('cp-ex-product');
  var pid = sel ? sel.value : '';
  var prod = (DB.items||[]).find(function(i){ return i && String(i.id) === String(pid); });
  var inco = document.getElementById('cp-ex-incoterm');
  return {
    productId: pid,
    name: (prod && prod.name) || '',
    krwPrice: _cpNum('cp-ex-krwPrice'),
    krwPriceMode: _cpModeOf('cp-ex-krwPrice'),
    supplyRate: _cpNum('cp-ex-supplyRate'),
    qty: _cpNum('cp-ex-qty'),
    unitCost: _cpNum('cp-ex-unitCost'),
    unitCostMode: _cpModeOf('cp-ex-unitCost'),
    adCost: _cpNum('cp-ex-adCost'),
    incoterm: inco ? inco.value : '',
    logiCost: _cpNum('cp-ex-logiCost'),
    note: (document.getElementById('cp-ex-note')||{}).value || ''
  };
}

function _cpModalLiveExport(box) {
  var c = _cpCalcExport(_cpReadModalExport());
  box.innerHTML = '<div><span style="font-size:11px;color:#c2410c;font-weight:700">순이익</span> '
    + '<b style="font-size:16px;color:' + (c.netProfit>=0?'#15803d':'#dc2626') + '">' + _cpWon(c.netProfit) + '</b></div>'
    + '<div><span style="font-size:11px;color:#c2410c;font-weight:700">수익률(ROS)</span> '
    + '<b style="font-size:16px;color:' + (c.ros>=0?'#15803d':'#dc2626') + '">' + _cpPct(c.ros) + '</b></div>'
    + '<div><span style="font-size:11px;color:#c2410c;font-weight:700">Contribution</span> '
    + '<b style="font-size:14px;color:' + (c.contribution>=0?'#1d4ed8':'#dc2626') + '">' + _cpWon(c.contribution) + '</b></div>'
    + '<div style="font-size:11px;color:#c2410c">매출 ' + _cpWon(c.revenue) + ' · 공급가 ' + _cpWon(c.supplyPrice) + ' · 원가율 ' + _cpPct(c.costRate) + '</div>';
}

function _cpOpenDetailExport(r) {
  var c = _cpCalcExport(r);
  var prod = (DB.items||[]).find(function(i){ return i && String(i.id) === String(r.productId); });
  var nm = (prod && prod.name) || r.name || '(제품 미선택)';
  var ov = document.createElement('div');
  ov.id = 'cp-detail-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99989;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:32px 16px';
  ov.onclick = function(ev){ if (ev.target === ov) closeCpDetail(); };
  var line = function(lbl, val, opts){
    opts = opts || {};
    return '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;'
      + (opts.hi?'background:#fff7ed;font-weight:800;padding:9px 10px;border-radius:7px;border-bottom:none;margin:4px 0':'') + '">'
      + '<span style="font-size:12px;color:' + (opts.hi?'#c2410c':'#64748b') + ';font-weight:' + (opts.hi?'800':'600') + '">' + lbl + '</span>'
      + '<span style="font-size:' + (opts.hi?'14px':'12.5px') + ';color:' + (opts.color||'#0f172a') + ';font-weight:' + (opts.hi?'800':'700') + '">' + val + '</span></div>';
  };
  var sect = function(t){ return '<div style="font-size:11.5px;font-weight:800;color:#c2410c;margin:14px 0 4px">' + t + '</div>'; };
  ov.innerHTML = '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:14px;width:480px;max-width:96vw;box-shadow:0 18px 50px rgba(0,0,0,.3);overflow:hidden">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;background:linear-gradient(135deg,#ffedd5,#fed7aa)">'
    + '<div><div style="font-size:15px;font-weight:800;color:#c2410c">' + _cpEsc(nm) + '</div>'
    + '<div style="font-size:11.5px;color:#ea580c;margin-top:2px">🇨🇳 중국 수출</div></div>'
    + '<button onclick="closeCpDetail()" style="background:rgba(255,255,255,.5);border:none;width:26px;height:26px;border-radius:7px;cursor:pointer;font-size:14px;color:#c2410c">✕</button>'
    + '</div>'
    + '<div style="padding:16px 20px;max-height:68vh;overflow-y:auto">'
    + line('순이익', _cpWon(c.netProfit), {hi:true, color:(c.netProfit>=0?'#15803d':'#dc2626')})
    + line('수익률 (ROS)', _cpPct(c.ros), {hi:true, color:(c.ros>=0?'#15803d':'#dc2626')})
    + line('Contribution (광고비 차감 전 이익)', _cpWon(c.contribution), {hi:true, color:(c.contribution>=0?'#1d4ed8':'#dc2626')})
    + sect('매출')
    + line('한국 판매가', _cpWon(_cpLivePrice(r)))
    + line('수출 공급가 (' + _cpPct(r.supplyRate) + ')', _cpWon(c.supplyPrice))
    + line('수출 수량', (Math.round(Number(r.qty)||0)).toLocaleString() + '개')
    + line('매출', _cpWon(c.revenue))
    + sect('원가 · 비용')
    + line('제품원가 COGS (개당)', _cpWon(_cpLiveCost(r)))
    + line('총 제조원가', _cpWon(c.totalCogs))
    + line('원가율', _cpPct(c.costRate))
    + line('예상 물류비', _cpWon(r.logiCost))
    + line('분담 광고비', _cpWon(r.adCost))
    + sect('수출 조건')
    + line('Incoterms', _cpEsc(r.incoterm||'-'))
    + (r.note ? (sect('비고') + '<div style="font-size:12px;color:#475569;padding:4px 0;white-space:pre-wrap">' + _cpEsc(r.note) + '</div>') : '')
    + '<div style="font-size:10.5px;color:#94a3b8;margin-top:12px;line-height:1.7">※ 수출 금액은 부가세가 없습니다. 모든 금액은 부가세 없는 금액 기준입니다.</div>'
    + '</div>'
    + '<div style="padding:13px 20px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;gap:8px">'
    + '<button onclick="closeCpDetail();openCpModal(' + r.id + ')" style="background:#ffedd5;color:#c2410c;border:1px solid #fed7aa;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">✏️ 수정</button>'
    + '<button onclick="closeCpDetail()" style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">닫기</button>'
    + '</div></div>';
  document.body.appendChild(ov);
}

function openCpModal(id) {
  closeCpModal();
  _cpEditId = id;
  const r = (id != null && _cpData) ? (_cpData.rows||[]).find(x => x && String(x.id) === String(id)) : null;
  _cpModalCh = r ? (r.channelType||'homeshopping') : _cpCurrentSub;
  if (_cpModalCh === 'pharmacy') { _cpOpenModalPharmacy(id, r); return; }
  if (_cpModalCh === 'export') { _cpOpenModalExport(id, r); return; }
  const g = (f,d) => (r && r[f] != null && r[f] !== '') ? r[f] : (d==null?'':d);
  const items = (DB.items||[]).filter(i => i && i.name && i.type === '완제품');
  let prodOpts = '<option value="">(제품 선택 안 함 — COGS 직접 입력)</option>';
  items.forEach(i => {
    prodOpts += '<option value="' + i.id + '"' + (r && String(r.productId)===String(i.id) ? ' selected':'') + '>' + _cpEsc(i.name) + (i.code?(' ('+_cpEsc(i.code)+')'):'') + '</option>';
  });
  const fld = (label, id2, val, unit, opts) => {
    opts = opts || {};
    return '<div>'
      + '<label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:3px">' + label + '</label>'
      + '<div style="display:flex;align-items:center;gap:0;border:1px solid #cbd5e1;border-radius:7px;overflow:hidden">'
      + '<input id="' + id2 + '" ' + (opts.type==='date'?'type="date"':'type="' + (opts.type||'text') + '"') + (opts.type==='number'?' step="any"':'') + ' value="' + _cpEsc(val) + '" '
      + 'oninput="_cpModalLive()" '
      + 'placeholder="' + (unit==='원'?'0':(unit==='%'?'0':'')) + '" '
      + 'style="flex:1;border:none;padding:7px 9px;font-size:12.5px;outline:none;min-width:0">'
      + (unit ? '<span style="padding:0 10px;font-size:11.5px;color:#94a3b8;background:#f8fafc;align-self:stretch;display:flex;align-items:center;border-left:1px solid #e2e8f0">' + unit + '</span>' : '')
      + '</div></div>';
  };
  // v1.9.978: 자동/수동 모드 토글 필드 (판매가 / 제품원가 COGS 용)
  const modeFld = (label, fid, val, unit, mode, prefix) => {
    const isAuto = (mode !== 'manual');
    const ON  = 'padding:3px 11px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid #0f172a;background:#0f172a;color:#fff;font-weight:700;line-height:1.3';
    const OFF = 'padding:3px 11px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#475569;font-weight:500;line-height:1.3';
    const inpBg = isAuto ? '#f1f5f9' : '#fff';
    const inpColor = isAuto ? '#475569' : '#0f172a';
    const inpCursor = isAuto ? 'not-allowed' : 'text';
    return '<div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;gap:6px">'
      + '<label style="font-size:11px;font-weight:700;color:#475569">' + label + '</label>'
      + '<span style="display:inline-flex;gap:4px;flex-shrink:0">'
      + '<button type="button" id="' + fid + '-modeAuto" onclick="_cp' + prefix + 'Auto()" title="완제품 정보에서 자동으로 가져옴 (수정 불가)" style="' + (isAuto?ON:OFF) + '">자동</button>'
      + '<button type="button" id="' + fid + '-modeManual" onclick="_cp' + prefix + 'Manual()" title="직접 입력 (수정 가능)" style="' + (isAuto?OFF:ON) + '">수동</button>'
      + '</span></div>'
      + '<div style="display:flex;align-items:center;border:1px solid #cbd5e1;border-radius:7px;overflow:hidden">'
      + '<input id="' + fid + '" type="number" step="any" value="' + _cpEsc(val) + '" oninput="_cpModalLive()" placeholder="0" data-mode="' + (isAuto?'auto':'manual') + '"' + (isAuto?' disabled':'') + ' style="flex:1;border:none;padding:7px 9px;font-size:12.5px;outline:none;min-width:0;background:' + inpBg + ';color:' + inpColor + ';cursor:' + inpCursor + '">'
      + (unit ? ('<span style="padding:0 10px;font-size:11.5px;color:#94a3b8;background:#f8fafc;align-self:stretch;display:flex;align-items:center;border-left:1px solid #e2e8f0">' + unit + '</span>') : '')
      + '</div></div>';
  };
  /* v2.3.722 — 세트 블록. 세트마다 제품·판매가(자동/수동)·COGS(자동/수동)·목표 판매 수량. */
  const _sets = Array.isArray(r && r.sets) ? r.sets : [];
  const setBlock = (n) => {
    const st = _sets[n-1] || {};
    const opts = '<option value="">(제품 선택 안 함 — 직접 입력)</option>' + items.map(i =>
      '<option value="' + i.id + '"' + (String(st.itemId||'') === String(i.id) ? ' selected' : '') + '>'
      + _cpEsc(i.name) + (i.code ? (' (' + _cpEsc(i.code) + ')') : '') + '</option>').join('');
    const modeBtns = (kind) => {
      const isAuto = (st[kind + 'Mode'] !== 'manual');
      const ON  = 'padding:3px 11px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid #0f172a;background:#0f172a;color:#fff;font-weight:700;line-height:1.3';
      const OFF = 'padding:3px 11px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#475569;font-weight:500;line-height:1.3';
      return '<span style="display:inline-flex;gap:4px;flex-shrink:0">'
        + '<button type="button" id="cp-s' + n + '-' + kind + '-a" onclick="_cpSetMode(' + n + ',&quot;' + kind + '&quot;,&quot;auto&quot;)" title="품목정보·BOM 에서 자동" style="' + (isAuto?ON:OFF) + '">자동</button>'
        + '<button type="button" id="cp-s' + n + '-' + kind + '-m" onclick="_cpSetMode(' + n + ',&quot;' + kind + '&quot;,&quot;manual&quot;)" title="직접 입력" style="' + (isAuto?OFF:ON) + '">수동</button>'
        + '</span>';
    };
    const numFld = (kind, label, val, unit) => {
      const isAuto = (st[kind + 'Mode'] !== 'manual');
      return '<div>'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;gap:6px">'
        + '<label style="font-size:11px;font-weight:700;color:#475569">' + label + '</label>' + modeBtns(kind) + '</div>'
        + '<div style="display:flex;align-items:center;border:1px solid #cbd5e1;border-radius:7px;overflow:hidden">'
        + '<input id="cp-s' + n + '-' + kind + '" type="number" step="any" value="' + _cpEsc(val==null?'':val) + '" oninput="_cpModalLive()" '
        + 'data-mode="' + (isAuto?'auto':'manual') + '"' + (isAuto?' disabled':'')
        + ' style="flex:1;border:none;padding:7px 9px;font-size:12.5px;outline:none;min-width:0;background:' + (isAuto?'#f1f5f9':'#fff') + ';color:' + (isAuto?'#475569':'#0f172a') + ';cursor:' + (isAuto?'not-allowed':'text') + '">'
        + '<span style="padding:0 10px;font-size:11.5px;color:#94a3b8;background:#f8fafc;align-self:stretch;display:flex;align-items:center;border-left:1px solid #e2e8f0">' + unit + '</span>'
        + '</div></div>';
    };
    return '<div style="grid-column:1/-1;border:1px solid ' + (n===1?'#bae6fd':'#e2e8f0') + ';background:' + (n===1?'#f0f9ff':'#fafafa') + ';border-radius:10px;padding:12px 14px">'
      + '<div style="font-size:12.5px;font-weight:800;color:#0c4a6e;margin-bottom:9px">' + n + '번 세트'
      + (n===2 ? '<span style="font-size:11px;font-weight:600;color:#94a3b8;margin-left:6px">선택 — 비워 두면 계산에서 빠집니다</span>' : '') + '</div>'
      + '<div style="margin-bottom:9px"><label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:3px">제품 선택</label>'
      + '<select id="cp-s' + n + '-prod" onchange="_cpSetProductChange(' + n + ')" style="width:100%;border:1px solid #cbd5e1;border-radius:7px;padding:7px 9px;font-size:12.5px">' + opts + '</select></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px">'
      + numFld('price', '판매가', st.price, '원')
      + numFld('cogs', '제품원가 COGS', st.cogs, '원')
      + '<div><label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:3px">목표 판매 수량</label>'
      + '<div style="display:flex;align-items:center;border:1px solid #cbd5e1;border-radius:7px;overflow:hidden">'
      + '<input id="cp-s' + n + '-qty" type="number" step="any" value="' + _cpEsc(st.qty==null?'':st.qty) + '" oninput="_cpModalLive()" placeholder="0" style="flex:1;border:none;padding:7px 9px;font-size:12.5px;outline:none;min-width:0">'
      + '<span style="padding:0 10px;font-size:11.5px;color:#94a3b8;background:#f8fafc;align-self:stretch;display:flex;align-items:center;border-left:1px solid #e2e8f0">개</span>'
      + '</div></div>'
      + '</div></div>';
  };
  const chLabel = '📺 홈쇼핑 판매';
  const ov = document.createElement('div');
  ov.id = 'cp-modal-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99988;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:32px 16px';
  ov.onclick = function(ev){ if (ev.target === ov) closeCpModal(); };
  ov.innerHTML = '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:14px;width:680px;max-width:96vw;box-shadow:0 18px 50px rgba(0,0,0,.3);overflow:hidden">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;background:linear-gradient(135deg,#e0f2fe,#bae6fd)">'
    + '<div style="font-size:15px;font-weight:800;color:#0c4a6e">🧮 ' + chLabel + ' — ' + (id!=null?'행 수정':'행 추가') + '</div>'
    + '<button onclick="closeCpModal()" style="background:rgba(255,255,255,.5);border:none;width:26px;height:26px;border-radius:7px;cursor:pointer;font-size:14px;color:#0c4a6e">✕</button>'
    + '</div>'
    + '<div style="padding:18px 20px;max-height:62vh;overflow-y:auto">'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:11px">'
    // v2.3.728: 채널명 + 회차 → 한 칸 ('롯데홈쇼핑 1차')
    + '<div style="grid-column:1/-1">' + fld('채널 · 회차', 'cp-m-name', _cpTitle(r) === '-' ? '' : _cpTitle(r), '', {}) + '</div>'
    + fld('구좌 목표 비용', 'cp-m-targetCost', g('targetCost',0), '원', {type:'number'})
    + fld('전환율', 'cp-m-convRate', g('convRate',70), '%', {type:'number'})
    + setBlock(1) + setBlock(2)
    + fld('특약금', 'cp-m-specialFee', g('specialFee',0), '원', {type:'number'})
    + fld('게스트 비용', 'cp-m-guestFee', g('guestFee',0), '원', {type:'number'})
    + fld('인서트 비용', 'cp-m-insertFee', g('insertFee',0), '원', {type:'number'})
    + fld('홈쇼핑 수수료', 'cp-m-hsCommPct', g('hsCommPct',12), '%', {type:'number'})
    + fld('밴더 수수료', 'cp-m-vendorCommPct', g('vendorCommPct',4), '%', {type:'number'})
    + fld('비고', 'cp-m-note', g('note'), '', {})
    + '</div>'
    + '<div style="font-size:10.5px;color:#94a3b8;margin-top:10px;line-height:1.7">· <b style="color:#475569">자동</b>: 완제품 품목정보의 실제 판매가·BOM 원가를 자동 사용 (수정 불가, 품목정보 변경 시 즉시 반영)<br>· <b style="color:#475569">수동</b>: 빈칸에 직접 입력 (품목정보 변경에 영향받지 않음)</div>'
    + '<div id="cp-m-live" style="margin-top:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:9px;padding:11px 14px;display:flex;gap:24px;align-items:center;flex-wrap:wrap"></div>'
    + '</div>'
    + '<div style="padding:13px 20px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;gap:8px">'
    // v2.3.621: 목록의 🗑️ 를 복사(📋)로 바꾸면서 삭제는 수정 모달 안으로 이동
    + (id != null ? '<button onclick="deleteCpRowFromModal()" style="margin-right:auto;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">🗑️ 삭제</button>' : '')
    + '<button onclick="closeCpModal()" style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">취소</button>'
    + '<button onclick="saveCpRow()" style="background:#0f172a;color:#fff;border:none;padding:9px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">저장</button>'
    + '</div></div>';
  document.body.appendChild(ov);
  // v2.3.722: 자동 모드인 칸을 품목정보·BOM 으로 채운다 (수동은 입력값 보존)
  try { _cpSetSyncAuto(1); _cpSetSyncAuto(2); } catch(_){}
  _cpModalLive();
}

function closeCpModal() { const ov = document.getElementById('cp-modal-overlay'); if (ov) ov.remove(); }
// v1.9.952: 제품의 현재 BOM 합계 원가 — DB.boms 에서 실시간 계산(캐시 X)
function _cpBomCost(productId) {
  const bom = (DB.boms && DB.boms[productId]) || [];
  if (!bom.length) return 0;
  return Math.round(bom.reduce(function(s, r) {
    const it = (typeof getItem === 'function') ? getItem(r.itemId) : null;
    return s + ((it && it.price) || 0) * (r.qty || 0);
  }, 0));
}
// v1.9.969: 제품원가 — 연결된 완제품에 BOM 이 있으면 현재 BOM 합계 원가를 사용
//   (BOM 변경 즉시 반영), 없으면 저장된 입력값. (홈쇼핑=cogsUnit, 약국·수출=unitCost)
function _cpModeOf(id) { var el = document.getElementById(id); return (el && el.dataset && el.dataset.mode) ? el.dataset.mode : 'auto'; }

function _cpLiveCost(r) {
  if (!r) return 0;
  // v1.9.975: 수동 모드면 저장된 입력값 사용 (자동이면 BOM 합계 live)
  var manual = (r.unitCostMode === 'manual' || r.cogsUnitMode === 'manual');
  if (!manual && r.productId) {
    try { var bc = _cpBomCost(r.productId); if (bc > 0) return bc; } catch(_){}
  }
  var saved = (r.unitCost != null && r.unitCost !== '') ? r.unitCost : r.cogsUnit;
  return Number(saved) || 0;
}

function _cpLivePrice(r) {
  if (!r) return 0;
  // v1.9.975: 수동 모드면 저장된 입력값 사용 (자동이면 품목정보 실제판매가 live)
  var manual = (r.salePriceMode === 'manual' || r.krwPriceMode === 'manual' || r.sellPriceMode === 'manual');
  if (!manual && r.productId) {
    var it = (DB.items||[]).find(function(x){ return x && String(x.id) === String(r.productId); });
    if (it && it.actualSalePrice != null && it.actualSalePrice !== '') return Number(it.actualSalePrice) || 0;
  }
  var saved = (r.salePrice != null && r.salePrice !== '') ? r.salePrice
            : ((r.krwPrice != null && r.krwPrice !== '') ? r.krwPrice : r.sellPrice);
  return Number(saved) || 0;
}

// v1.9.975: 약국·수출 모달의 자동/수동 모드 토글
//   자동: 품목정보(실제 판매가)·BOM(원가) 자동 입력 + 입력 불가
//   수동: 직접 입력 가능 — 품목정보 변경에 영향받지 않음
function _cpFieldMode(opts) {
  var inp = document.getElementById(opts.inputId);
  if (!inp) return;
  inp.dataset.mode = opts.mode;
  inp.disabled = (opts.mode === 'auto');
  inp.style.background = (opts.mode === 'auto') ? '#f1f5f9' : '#fff';
  inp.style.color = (opts.mode === 'auto') ? '#475569' : '#0f172a';
  inp.style.cursor = (opts.mode === 'auto') ? 'not-allowed' : 'text';
  if (opts.mode === 'auto') {
    var sel = document.getElementById(opts.productSelId);
    var pid = sel ? sel.value : '';
    var itm = (DB.items||[]).find(function(x){ return x && String(x.id) === String(pid); });
    if (itm) {
      if (opts.kind === 'price' && itm.actualSalePrice != null && itm.actualSalePrice !== '') inp.value = itm.actualSalePrice;
      if (opts.kind === 'cogs') { var bc = _cpBomCost(itm.id); inp.value = (bc > 0) ? bc : (itm.price || 0); }
    }
  }
  var btnA = document.getElementById(opts.inputId + '-modeAuto');
  var btnM = document.getElementById(opts.inputId + '-modeManual');
  if (btnA && btnM) {
    var ON  = 'padding:3px 11px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid #0f172a;background:#0f172a;color:#fff;font-weight:700;line-height:1.3';
    var OFF = 'padding:3px 11px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#475569;font-weight:500;line-height:1.3';
    btnA.style.cssText = (opts.mode === 'auto')   ? ON : OFF;
    btnM.style.cssText = (opts.mode === 'manual') ? ON : OFF;
  }
  if (typeof _cpModalLive === 'function') _cpModalLive();
}
function _cpPhPriceAuto()   { _cpFieldMode({inputId:'cp-ph-salePrice',productSelId:'cp-ph-product',kind:'price',mode:'auto'}); }
function _cpPhPriceManual() { _cpFieldMode({inputId:'cp-ph-salePrice',productSelId:'cp-ph-product',kind:'price',mode:'manual'}); }
function _cpPhCogsAuto()    { _cpFieldMode({inputId:'cp-ph-unitCost', productSelId:'cp-ph-product',kind:'cogs', mode:'auto'}); }
function _cpPhCogsManual()  { _cpFieldMode({inputId:'cp-ph-unitCost', productSelId:'cp-ph-product',kind:'cogs', mode:'manual'}); }
function _cpExPriceAuto()   { _cpFieldMode({inputId:'cp-ex-krwPrice', productSelId:'cp-ex-product',kind:'price',mode:'auto'}); }
function _cpExPriceManual() { _cpFieldMode({inputId:'cp-ex-krwPrice', productSelId:'cp-ex-product',kind:'price',mode:'manual'}); }
function _cpExCogsAuto()    { _cpFieldMode({inputId:'cp-ex-unitCost', productSelId:'cp-ex-product',kind:'cogs', mode:'auto'}); }
function _cpExCogsManual()  { _cpFieldMode({inputId:'cp-ex-unitCost', productSelId:'cp-ex-product',kind:'cogs', mode:'manual'}); }
function _cpHsPriceAuto()   { _cpFieldMode({inputId:'cp-m-sellPrice', productSelId:'cp-m-product',kind:'price',mode:'auto'}); }
function _cpHsPriceManual() { _cpFieldMode({inputId:'cp-m-sellPrice', productSelId:'cp-m-product',kind:'price',mode:'manual'}); }
function _cpHsCogsAuto()    { _cpFieldMode({inputId:'cp-m-cogsUnit',  productSelId:'cp-m-product',kind:'cogs', mode:'auto'}); }
function _cpHsCogsManual()  { _cpFieldMode({inputId:'cp-m-cogsUnit',  productSelId:'cp-m-product',kind:'cogs', mode:'manual'}); }

/* v2.3.722 — 세트 칸의 자동/수동 토글. 자동이면 품목정보·BOM 값을 넣고 잠근다. */
window._cpSetMode = function(n, kind, mode) {
  const inp = document.getElementById('cp-s' + n + '-' + kind);
  if (!inp) return;
  inp.dataset.mode = mode;
  inp.disabled = (mode === 'auto');
  inp.style.background = (mode === 'auto') ? '#f1f5f9' : '#fff';
  inp.style.color = (mode === 'auto') ? '#475569' : '#0f172a';
  inp.style.cursor = (mode === 'auto') ? 'not-allowed' : 'text';
  const ON  = 'padding:3px 11px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid #0f172a;background:#0f172a;color:#fff;font-weight:700;line-height:1.3';
  const OFF = 'padding:3px 11px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#475569;font-weight:500;line-height:1.3';
  const a = document.getElementById('cp-s' + n + '-' + kind + '-a');
  const m = document.getElementById('cp-s' + n + '-' + kind + '-m');
  if (a) a.style.cssText = (mode === 'auto') ? ON : OFF;
  if (m) m.style.cssText = (mode === 'auto') ? OFF : ON;
  if (mode === 'auto') _cpSetSyncAuto(n);
  _cpModalLive();
};
/* 자동 모드인 칸만 품목정보·BOM 값으로 채운다 */
window._cpSetSyncAuto = function(n) {
  const sel = document.getElementById('cp-s' + n + '-prod');
  if (!sel || !sel.value) return;
  const it = (DB.items||[]).find(x => x && String(x.id) === String(sel.value));
  if (!it) return;
  const pr = document.getElementById('cp-s' + n + '-price');
  if (pr && pr.dataset.mode !== 'manual' && it.actualSalePrice != null && it.actualSalePrice !== '') pr.value = it.actualSalePrice;
  const cg = document.getElementById('cp-s' + n + '-cogs');
  if (cg && cg.dataset.mode !== 'manual') {
    const bc = _cpBomCost(it.id);
    cg.value = (bc > 0) ? bc : (it.price || 0);
  }
};
window._cpSetProductChange = function(n) { _cpSetSyncAuto(n); _cpModalLive(); };

function _cpModalProductChange() {
  var sel = document.getElementById('cp-m-product');
  if (!sel) return;
  var itm = (DB.items||[]).find(function(i){ return i && String(i.id) === String(sel.value); });
  if (itm) {
    // v1.9.978: 자동 모드일 때만 갱신 (수동 모드는 사용자 입력 보존)
    var cog = document.getElementById('cp-m-cogsUnit');
    if (cog && cog.dataset.mode !== 'manual') {
      var unit = _cpBomCost(itm.id) || parseFloat(itm.bomCost) || parseFloat(itm.cogs) || parseFloat(itm.price) || 0;
      cog.value = unit;
    }
    var sp = document.getElementById('cp-m-sellPrice');
    if (sp && sp.dataset.mode !== 'manual' && itm.actualSalePrice != null && itm.actualSalePrice !== '') sp.value = itm.actualSalePrice;
  }
  _cpModalLive();
}

function _cpReadModal() {
  if (_cpModalCh === 'pharmacy') return _cpReadModalPharmacy();
  if (_cpModalCh === 'export') return _cpReadModalExport();
  // v2.3.722: 세트 1·2 — 값이 하나도 없는 세트는 넣지 않는다(2번 비워 두기)
  const readSet = (n) => {
    const sel2 = document.getElementById('cp-s' + n + '-prod');
    const st = {
      itemId: sel2 ? sel2.value : '',
      price: _cpNum('cp-s' + n + '-price'), priceMode: _cpModeOf('cp-s' + n + '-price'),
      cogs: _cpNum('cp-s' + n + '-cogs'), cogsMode: _cpModeOf('cp-s' + n + '-cogs'),
      qty: _cpNum('cp-s' + n + '-qty'),
    };
    return (st.itemId || st.price > 0 || st.qty > 0) ? st : null;
  };
  const _sets = [readSet(1), readSet(2)].filter(Boolean);
  return {
    name: (document.getElementById('cp-m-name')||{}).value || '',
    round: '',                       // v2.3.728: 회차는 이름에 함께 적는다
    sets: _sets,
    targetCost: _cpNum('cp-m-targetCost'),
    convRate: _cpNum('cp-m-convRate'),
    specialFee: _cpNum('cp-m-specialFee'),
    guestFee: _cpNum('cp-m-guestFee'),
    insertFee: _cpNum('cp-m-insertFee'),
    hsCommPct: _cpNum('cp-m-hsCommPct'),
    vendorCommPct: _cpNum('cp-m-vendorCommPct'),
    note: (document.getElementById('cp-m-note')||{}).value || ''
  };
}

function _cpModalLive() {
  const box = document.getElementById('cp-m-live');
  if (!box) return;
  if (_cpModalCh === 'pharmacy') { _cpModalLivePharmacy(box); return; }
  if (_cpModalCh === 'export') { _cpModalLiveExport(box); return; }
  const c = _cpCalc(_cpReadModal());
  box.innerHTML = '<div><span style="font-size:11px;color:#92400e;font-weight:700">순이익</span> '
    + '<b style="font-size:16px;color:' + (c.settlement>=0?'#15803d':'#dc2626') + '">' + _cpWon(c.settlement) + '</b></div>'
    + '<div><span style="font-size:11px;color:#92400e;font-weight:700">수익률</span> '
    + '<b style="font-size:16px;color:' + (c.profitRate>=0?'#15803d':'#dc2626') + '">' + _cpPct(c.profitRate) + '</b></div>'
    // v2.3.722: 수량에서 나온 값들을 그 자리에서 보여준다 — 달성률은 이제 결과다
    + '<div style="font-size:11.5px;color:#a16207;line-height:1.7">'
    + '방송 주문 <b>' + _cpWon(c.hsRevenue) + '</b> · 달성률 <b>' + _cpPct(c.achieveRate) + '</b><br>'
    + '예상 실매출 <b>' + _cpWon(c.actualRevenue) + '</b>'
    + ((c.sets && c.sets.length) ? ' · 실주문 예상 ' + c.sets.map(x => x.no + '번 <b>' + x.sold.toLocaleString() + '개</b>').join(' / ') : '')
    + '</div>';
}
function saveCpRow() {
  if (!_cpData) _cpData = _cpDefault();
  const d = _cpReadModal();
  if ((_cpModalCh === 'pharmacy' || _cpModalCh === 'export') && !d.productId) { showNotif('완제품을 선택하세요', 'warning'); return; }
  if (!d.name.trim()) { showNotif('채널 · 회차를 입력하세요 (예: 롯데홈쇼핑 1차)', 'warning'); return; }
  // v2.3.722: 홈쇼핑은 세트가 출발점 — 1번 세트가 비면 금액이 전부 0 이 된다
  if (_cpModalCh === 'homeshopping' && !(d.sets && d.sets.length)) {
    showNotif('1번 세트의 제품·판매가·목표 판매 수량을 입력하세요', 'warning'); return;
  }
  if (_cpEditId != null) {
    const r = (_cpData.rows||[]).find(x => x && String(x.id) === String(_cpEditId));
    if (r) {
      Object.assign(r, d); r.updatedAt = Date.now();
      // 세트 방식으로 저장했으면 옛 단일 제품 필드는 지운다 — 두 방식이 섞이면 값이 어긋난다
      if (Array.isArray(d.sets)) {
        ['productId','cogsUnit','cogsUnitMode','sellPrice','sellPriceMode','achieveRate'].forEach(k => { delete r[k]; });
      }
    }
  } else {
    _cpData.rows.push(Object.assign({ id: _cpGenId(), channelType: _cpModalCh, updatedAt: Date.now() }, d));
  }
  _cpSave();
  closeCpModal();
  _cpRender();
  showNotif('✅ 저장 완료', 'success');
}
function deleteCpRow(id) {
  if (!_cpData) return;
  const r = (_cpData.rows||[]).find(x => x && String(x.id) === String(id));
  if (!r) return;
  if (!confirm('[' + (r.name||'-') + '] 행을 삭제하시겠습니까?')) return;
  _cpData.rows = (_cpData.rows||[]).filter(x => x && String(x.id) !== String(id));
  _cpSave();
  _cpRender();
  showNotif('🗑 삭제 완료', 'success');
}

// v2.3.621: 수정 모달 안의 삭제 버튼 — 목록의 🗑️ 를 복사로 바꾸면서 삭제는 여기로 이동
function deleteCpRowFromModal() {
  if (_cpEditId == null) return;
  const _id = _cpEditId;
  closeCpModal();
  deleteCpRow(_id);
}

// v2.3.621: 행 복사 — 같은 값의 새 행을 바로 아래에 추가(이름에 '(복사)' 표시)
function copyCpRow(id) {
  if (typeof requireWrite === 'function' && !requireWrite()) return;
  if (!_cpData) return;
  const rows = _cpData.rows || [];
  const idx = rows.findIndex(x => x && String(x.id) === String(id));
  if (idx < 0) return;
  const dup = JSON.parse(JSON.stringify(rows[idx]));
  dup.id = _cpGenId();
  dup.name = String(dup.name || '') + ' (복사)';
  dup.updatedAt = Date.now();
  rows.splice(idx + 1, 0, dup);   // 원본 바로 아래에 삽입
  _cpSave();
  _cpRender();
  showNotif('📋 [' + (rows[idx].name||'-') + '] 행을 복사했습니다', 'success');
}

// ── 상세 팝업 (제목 클릭) ──
function closeCpDetail() { const ov = document.getElementById('cp-detail-overlay'); if (ov) ov.remove(); }
/* v2.3.727 — BOM 구성품 목록. 원가가 어디서 나왔는지 그 자리에서 확인한다. */
function _cpBomListHtml(itemId, unitCost, manual) {
  const bom = (DB.boms && DB.boms[itemId]) || [];
  const box = (inner) => '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:9px 11px;margin:2px 0 8px">' + inner + '</div>';
  if (!bom.length) {
    return box('<div style="font-size:11.5px;color:#94a3b8">BOM 이 등록되지 않았습니다 — 원가는 직접 입력한 값입니다</div>');
  }
  let sum = 0;
  const rows = bom.map(b => {
    const it = (typeof getItem === 'function') ? getItem(b.itemId) : {};
    const price = Number(it && it.price) || 0;
    const qty = Number(b.qty) || 0;
    const amt = price * qty;
    sum += amt;
    return '<tr>'
      + '<td style="padding:4px 6px;font-size:11.5px;color:#0f172a;text-align:left">' + _cpEsc((it && it.name) || ('품목 #' + b.itemId)) + '</td>'
      + '<td style="padding:4px 6px;font-size:11.5px;color:#475569;text-align:right;white-space:nowrap">' + qty.toLocaleString() + (b.unit ? ' ' + _cpEsc(b.unit) : '') + '</td>'
      + '<td style="padding:4px 6px;font-size:11.5px;color:#64748b;text-align:right;white-space:nowrap">' + _cpWon(price) + '</td>'
      + '<td style="padding:4px 6px;font-size:11.5px;color:#0f172a;text-align:right;white-space:nowrap;font-weight:700">' + _cpWon(amt) + '</td>'
      + '</tr>';
  }).join('');
  const foot = '<tr><td colspan="3" style="padding:5px 6px;font-size:11.5px;font-weight:800;color:#475569;text-align:right;border-top:1px solid #e2e8f0">BOM 합계</td>'
    + '<td style="padding:5px 6px;font-size:12px;font-weight:800;color:#0f172a;text-align:right;border-top:1px solid #e2e8f0;white-space:nowrap">' + _cpWon(sum) + '</td></tr>';
  const note = manual
    ? '<div style="font-size:11px;color:#b45309;margin-top:5px">⚠️ 원가는 <b>수동 입력값(' + _cpWon(unitCost) + ')</b> 입니다 — 위 BOM 합계와 다를 수 있습니다</div>'
    : '';
  return box('<table style="width:100%;border-collapse:collapse">'
    + '<thead><tr>'
    + '<th style="padding:3px 6px;font-size:10.5px;color:#94a3b8;text-align:left">구성품</th>'
    + '<th style="padding:3px 6px;font-size:10.5px;color:#94a3b8;text-align:right">수량</th>'
    + '<th style="padding:3px 6px;font-size:10.5px;color:#94a3b8;text-align:right">단가</th>'
    + '<th style="padding:3px 6px;font-size:10.5px;color:#94a3b8;text-align:right">금액</th>'
    + '</tr></thead><tbody>' + rows + foot + '</tbody></table>' + note);
}
window._cpToggleBom = function(no) {
  const el = document.getElementById('cp-bom-' + no);
  const btn = document.getElementById('cp-bombtn-' + no);
  if (!el) return;
  const open = (el.style.display === 'none');
  el.style.display = open ? '' : 'none';
  if (btn) btn.textContent = open ? 'BOM ▲' : 'BOM ▼';
};
function openCpDetail(id) {
  closeCpDetail();
  const r = (_cpData && _cpData.rows ? _cpData.rows : []).find(x => x && String(x.id) === String(id));
  if (!r) { showNotif('행을 찾을 수 없습니다', 'warning'); return; }
  if ((r.channelType||'homeshopping') === 'pharmacy') { _cpOpenDetailPharmacy(r); return; }
  if ((r.channelType||'homeshopping') === 'export') { _cpOpenDetailExport(r); return; }
  const c = _cpCalc(r);
  const prod = (DB.items||[]).find(i => i && String(i.id) === String(r.productId));
  const ov = document.createElement('div');
  ov.id = 'cp-detail-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99989;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:32px 16px';
  ov.onclick = function(ev){ if (ev.target === ov) closeCpDetail(); };
  const line = (lbl,val,opts) => {
    opts = opts || {};
    return '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;'
      + (opts.hi?'background:#fffbeb;font-weight:800;padding:9px 10px;border-radius:7px;border-bottom:none;margin:4px 0':'') + '">'
      + '<span style="font-size:12px;color:' + (opts.hi?'#92400e':'#64748b') + ';font-weight:' + (opts.hi?'800':'600') + '">' + lbl + '</span>'
      + '<span style="font-size:' + (opts.hi?'14px':'12.5px') + ';color:' + (opts.color||(opts.hi?'#0f172a':'#0f172a')) + ';font-weight:' + (opts.hi?'800':'700') + '">' + val + '</span></div>';
  };
  const sect = (t) => '<div style="font-size:11.5px;font-weight:800;color:#0369a1;margin:14px 0 4px">' + t + '</div>';
  ov.innerHTML = '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:14px;width:480px;max-width:96vw;box-shadow:0 18px 50px rgba(0,0,0,.3);overflow:hidden">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;background:linear-gradient(135deg,#e0f2fe,#bae6fd)">'
    + '<div><div style="font-size:15px;font-weight:800;color:#0c4a6e">' + _cpEsc(_cpTitle(r)) + '</div>'
    + '<div style="font-size:11.5px;color:#0369a1;margin-top:2px">' + ((r.channelType==='pharmacy')?'💊 약국 판매':'📺 홈쇼핑 판매') + '</div></div>'
    + '<button onclick="closeCpDetail()" style="background:rgba(255,255,255,.5);border:none;width:26px;height:26px;border-radius:7px;cursor:pointer;font-size:14px;color:#0c4a6e">✕</button>'
    + '</div>'
    + '<div style="padding:16px 20px;max-height:68vh;overflow-y:auto">'
    + line('예상 순이익 (부가세 제외)', _cpWon(c.settlement), {hi:true, color:(c.settlement>=0?'#15803d':'#dc2626')})
    + line('예상 수익률', _cpPct(c.profitRate), {hi:true, color:(c.profitRate>=0?'#15803d':'#dc2626')})
    + sect('매출')
    + line('구좌 목표 비용', _cpWon(r.targetCost))
    // v2.3.723: 달성률은 계산 결과다 — r.achieveRate(옛 입력값)를 보면 새 행에서 0% 가 된다
    + line('달성률', _cpPct(c.achieveRate))
    + line('목표 주문 금액', _cpWon(c.hsRevenue))
    + line('전환율', _cpPct(r.convRate))
    + line('예상 실매출', _cpWon(c.actualRevenue))
    // v2.3.723: 세트가 있으면 제품별로 나눠 보여준다
    + ((c.sets && c.sets.length)
        ? c.sets.map(st => line(st.no + '번 제품 판매가' + (st.name ? ' — ' + _cpEsc(st.name) : ''),
            _cpWon(st.price)
            + '<span style="color:#64748b;font-weight:600;margin-left:8px">− 원가 ' + _cpWon(st.cogsUnit) + '</span>'
            + '<button id="cp-bombtn-' + st.no + '" onclick="_cpToggleBom(' + st.no + ')" style="margin-left:8px;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;border-radius:6px;padding:2px 9px;font-size:11px;font-weight:700;cursor:pointer">BOM ▼</button>')
            + '<div id="cp-bom-' + st.no + '" style="display:none">' + _cpBomListHtml(st.itemId, st.cogsUnit, st.cogsManual) + '</div>').join('')
          + c.sets.map(st => line(st.no + '번 목표 판매수량', st.qty.toLocaleString() + '개')).join('')
          + c.sets.map(st => line(st.no + '번 예상 실판매 수량', st.sold.toLocaleString() + '개')).join('')
        : line('판매가', _cpWon(_cpLivePrice(r)))
          + line('목표 판매수량', Math.round(c.orderQty).toLocaleString() + '개')
          + line('예상 실판매 수량', Math.round(c.soldQty).toLocaleString() + '개'))
    + sect('지출')
    + line('특약금', _cpWon(c.specialFee))
    + line('특약 부가세', _cpWon(c.specialVat))
    + line('게스트 비용', _cpWon(c.guestFee))
    + line('게스트비 부가세', _cpWon(c.guestVat))
    + line('인서트 비용', _cpWon(c.insertFee))
    + line('인서트비 부가세', _cpWon(c.insertVat))
    + line('홈쇼핑 수수료 (' + _cpPct(r.hsCommPct) + ', 부가세 포함)', _cpWon(c.hsComm))
    + line('밴더 수수료 (' + _cpPct(r.vendorCommPct) + ', 부가세 포함)', _cpWon(c.vendorComm))
    + line('제품원가' + (prod?(' — '+_cpEsc(prod.name)):''), _cpWon(c.cogs))
    + line('제품원가 부가세', _cpWon(c.cogsVat))
    + (r.note ? (sect('비고') + '<div style="font-size:12px;color:#475569;padding:4px 0">' + _cpEsc(r.note) + '</div>') : '')
    + '</div>'
    + '<div style="padding:13px 20px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;gap:8px">'
    + '<button onclick="closeCpDetail();openCpModal(' + r.id + ')" style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">✏️ 수정</button>'
    + '<button onclick="closeCpDetail()" style="background:#0f172a;color:#fff;border:none;padding:9px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">닫기</button>'
    + '</div></div>';
  document.body.appendChild(ov);
}
