/* =============================================================================
   마진 분석 (판매 관리 > 마진 분석)                    — v1.9.371~
   =============================================================================
   ⚠️ 이 파일은 임원용(/index.html)과 직원용(/staff/index.html)이 **함께** 읽는다.
      화면·계산이 한 벌만 존재해야 서로 어긋나지 않는다. 복사본을 만들지 말 것.

   불러오는 쪽(호스트)이 아래를 먼저 준비해야 한다 (window 전역):
     DB.shopOrders[]  주문 (orderDate·shopId·itemId·qty·paymentAmount·status)
     DB.shops[]       쇼핑몰 (id·name·commissionBase·adsCosts[])
     DB.items[]       품목 (id·code·name·type·price) — COGS 조회용
     $(id)            document.getElementById
     fmtW(n)          금액 표기
     requireWrite()   쓰기 권한
     openOrderDetail(id)   주문번호 클릭
     openModal/closeModal  모달 열고 닫기

   그리는 법: renderMarginShell(host, {periodFilter:true}) 로 뼈대를 만든 뒤
             renderMarginAnalysis() 로 값을 채운다.
   ============================================================================= */

function _mgComputePeriod(label) {
  const today = new Date();
  const fmt = dt => dt.toISOString().slice(0,10);
  const yyyy = today.getFullYear();
  const mm = today.getMonth();
  if (label === '이번 달') {
    return { start: fmt(new Date(yyyy, mm, 1)), end: fmt(new Date(yyyy, mm+1, 0)) };
  } else if (label === '지난 달') {
    return { start: fmt(new Date(yyyy, mm-1, 1)), end: fmt(new Date(yyyy, mm, 0)) };
  } else if (label === '최근 7일') {
    const s = new Date(yyyy, mm, today.getDate() - 6);
    return { start: fmt(s), end: fmt(today) };
  }
  // '전체' 또는 알 수 없음 → 무제한
  return { start: '', end: '' };
}

// ─────────────────────────────────────────────────────────
// v1.9.379: 공용 기간 필터 — 매출 대시보드 / 주문 관리 / 마진 분석 3개 페이지가 공유
//   모드: 월별(month) / 주별(week) / 일별(day) / 기간별(range) / 전체(all)
//   prefix: 페이지별 식별자 ('sd'·'so'·'mg')
// ─────────────────────────────────────────────────────────
function _periodFmtDate(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const d = String(dt.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

// v1.9.382: 비교용 날짜 정규화 — orderDate 가 '2026.04.17' / '2026/04/17' / '2026-04-17 12:30' 등
//   다양한 형식으로 저장될 수 있어, 비교 전에 항상 'YYYY-MM-DD' 대시 형식으로 통일.
function _periodNormDate(s) {
  if (!s) return '';
  const m = String(s).match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  return String(s).slice(0,10);
}

// v1.9.383: 입력란 표시 토글만 담당 (렌더 트리거 없음 — 무한 재귀 방지)
function _periodToggleVisibility(prefix) {
  const wrap = document.querySelector(`.period-filter[data-prefix="${prefix}"]`);
  if (!wrap) return;
  const mode = wrap.querySelector('.period-mode')?.value || 'month';
  const setDisp = (cls, show) => { const el = wrap.querySelector(cls); if (el) el.style.display = show ? '' : 'none'; };
  setDisp('.period-month', mode === 'month');
  setDisp('.period-week',  mode === 'week');
  setDisp('.period-day',   mode === 'day');
  setDisp('.period-from',  mode === 'range');
  setDisp('.period-tilde', mode === 'range');
  setDisp('.period-to',    mode === 'range');
}

function _periodOnChange(prefix) {
  _periodToggleVisibility(prefix);
  // 페이지별 재렌더 트리거 — 무한 재귀 방지를 위해 _periodInit 는 호출하지 않음
  if (prefix === 'sd' && typeof renderSalesDashboard === 'function') renderSalesDashboard();
  else if (prefix === 'so' && typeof renderShopOrderTable === 'function') renderShopOrderTable();
  else if (prefix === 'mg' && typeof renderMarginAnalysis === 'function') renderMarginAnalysis();
  else if (prefix === 'po' && typeof renderOrderTable === 'function') renderOrderTable();
  else if (prefix === 'ap' && typeof renderApprovalPage === 'function') renderApprovalPage();
  else if (prefix === 'ad' && typeof renderAdsPage === 'function') renderAdsPage();  // v2.3.138
  else if (prefix === 'cg' && typeof renderConsignPage === 'function') renderConsignPage();  // v2.3.695 위탁
}

function _periodComputeRange(prefix) {
  const wrap = document.querySelector(`.period-filter[data-prefix="${prefix}"]`);
  if (!wrap) return { start: '', end: '' };
  const mode = wrap.querySelector('.period-mode')?.value || 'month';
  if (mode === 'all') return { start: '', end: '' };
  if (mode === 'day') {
    const d = wrap.querySelector('.period-day')?.value || '';
    return { start: d, end: d };
  }
  if (mode === 'week') {
    const w = wrap.querySelector('.period-week')?.value || '';
    if (!w) return { start: '', end: '' };
    // 'YYYY-Www' → ISO 주의 월요일~일요일
    const [yStr, wStr] = w.split('-W');
    const y = parseInt(yStr); const ww = parseInt(wStr);
    if (!y || !ww) return { start: '', end: '' };
    // ISO 8601: 1주차는 1월 첫 목요일이 포함된 주
    const jan4 = new Date(y, 0, 4);
    const jan4Dow = jan4.getDay() || 7;  // 1=월, 7=일
    const week1Mon = new Date(jan4);
    week1Mon.setDate(jan4.getDate() - jan4Dow + 1);
    const monday = new Date(week1Mon);
    monday.setDate(week1Mon.getDate() + (ww-1)*7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: _periodFmtDate(monday), end: _periodFmtDate(sunday) };
  }
  if (mode === 'month') {
    const m = wrap.querySelector('.period-month')?.value || '';
    if (!m) return { start: '', end: '' };
    const [y, mm] = m.split('-').map(Number);
    if (!y || !mm) return { start: '', end: '' };
    return { start: _periodFmtDate(new Date(y, mm-1, 1)), end: _periodFmtDate(new Date(y, mm, 0)) };
  }
  if (mode === 'range') {
    const f = wrap.querySelector('.period-from')?.value || '';
    const t = wrap.querySelector('.period-to')?.value   || '';
    // 둘 다 비어있으면 전체로 간주
    if (!f && !t) return { start: '', end: '' };
    return { start: f, end: t };
  }
  return { start: '', end: '' };
}

function _periodInit(prefix) {
  const wrap = document.querySelector(`.period-filter[data-prefix="${prefix}"]`);
  if (!wrap) return;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const dd = String(today.getDate()).padStart(2,'0');
  const monthEl = wrap.querySelector('.period-month');
  if (monthEl && !monthEl.value) monthEl.value = `${yyyy}-${mm}`;
  const dayEl = wrap.querySelector('.period-day');
  if (dayEl && !dayEl.value) dayEl.value = `${yyyy}-${mm}-${dd}`;
  const weekEl = wrap.querySelector('.period-week');
  if (weekEl && !weekEl.value) {
    // 현재 ISO 주차 계산
    const d = new Date(today);
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    weekEl.value = `${d.getFullYear()}-W${String(weekNum).padStart(2,'0')}`;
  }
  const fromEl = wrap.querySelector('.period-from');
  if (fromEl && !fromEl.value) fromEl.value = `${yyyy}-${mm}-01`;
  const toEl = wrap.querySelector('.period-to');
  if (toEl && !toEl.value) toEl.value = `${yyyy}-${mm}-${dd}`;
  // v1.9.383: 초기 모드에 맞춰 입력란 표시 토글만 (렌더 트리거하면 무한 재귀)
  _periodToggleVisibility(prefix);
}

function _mgLookupCogs(o) {
  // 주문 한 건의 COGS — 완제품 BOM/단가 또는 직접 매핑된 itemId
  // v2.3.113: STRICT 완제품 매칭 — 부자재/OEM 등으로 잘못 매칭되어 COGS 폭증 차단
  const items = DB.items || [];
  let item = null;
  const itemId = o.itemId || o.linkedItemId;
  if (itemId != null) {
    item = items.find(i => i && (i.id == itemId || i.code === itemId));
    // itemId 가 완제품이 아니면 사용 안 함 (안전망)
    if (item && item.type && item.type !== '완제품') {
      console.warn('⚠️ [v2.3.113] 주문 매핑된 item 이 완제품 아님 — COGS 0 처리:', o.orderNo, item.name);
      item = null;
    }
  }
  if (!item && o.productName) {
    const lower = String(o.productName).toLowerCase().trim();
    // 완제품(type === '완제품') 만 매칭 — 두 가지 방향
    item = items.find(i => i && i.type === '완제품' && i.name && lower.includes(i.name.toLowerCase()));
    if (!item) item = items.find(i => i && i.type === '완제품' && i.name && i.name.toLowerCase().includes(lower));
  }
  if (!item) return { cogs: 0, item: null };
  const qty = parseInt(o.qty || o.quantity || 1, 10) || 1;
  const unit = parseFloat(item.bomCost) || parseFloat(item.cogs) || parseFloat(item.price) || 0;
  let cogs = unit * qty;
  // v2.3.113 안전망: COGS 가 주문 매출의 5배 초과하면 명백한 오류 → 0 처리
  const _rev = parseFloat(o.paymentAmount || o.totalPrice || 0) || 0;
  if (_rev > 0 && cogs > _rev * 5) {
    console.warn('⚠️ [v2.3.113] COGS 폭주 감지 (cogs/rev = ' + (cogs/_rev).toFixed(1) + 'x):', o.orderNo, '제품:', o.productName, '→ COGS 0 처리');
    cogs = 0;
  }
  return { cogs, item };
}

function _mgAllocateAds(order, shop) {
  // v1.9.779: 광고 기간이 겹쳐도 각 광고를 자기 기간 내 매출 비율로 올바르게 분배.
  //   - 각 매칭 광고마다: (광고비 × 주문매출 / 광고기간내 총매출) 합산
  //   - 매출은 자연스럽게 중복 합산되지 않음 (각 광고가 자기 비율만 가져감)
  //   - 광고비는 모두 정확히 분배됨 (한 광고도 누락되지 않음)
  if (!shop || !Array.isArray(shop.adsCosts) || !shop.adsCosts.length) return 0;
  const orderDate = (order.orderDate || order.date || '').slice(0,10);
  if (!orderDate) return 0;
  const orderRev = parseFloat(order.paymentAmount||order.totalPrice||0) || 0;
  if (orderRev <= 0) return 0;

  // 주문일이 포함된 모든 광고 기간 찾기 (find → filter)
  const matchingAds = shop.adsCosts.filter(x =>
    x && x.startDate && x.endDate &&
    x.startDate <= orderDate && orderDate <= x.endDate &&
    (parseFloat(x.cost) || 0) > 0
  );
  if (!matchingAds.length) return 0;

  // 광고 기간별 총매출 캐시 (같은 광고가 여러 주문에서 호출되므로 가능하면 캐시)
  if (!shop._mgAdRevCache) shop._mgAdRevCache = {};
  const cache = shop._mgAdRevCache;
  const _periodKey = (a) => a.startDate + '_' + a.endDate;

  let totalAllocated = 0;
  for (const a of matchingAds) {
    const adCost = parseFloat(a.cost) || 0;
    const key = _periodKey(a);
    let totalRev = cache[key];
    if (totalRev == null) {
      totalRev = (DB.shopOrders||[]).reduce((s, o) => {
        if (o.shopId !== shop.id) return s;
        if (o.status === '취소' || o.status === '반품') return s;
        const d = (o.orderDate||o.date||'').slice(0,10);
        if (d < a.startDate || d > a.endDate) return s;
        return s + (parseFloat(o.paymentAmount||o.totalPrice||0) || 0);
      }, 0);
      cache[key] = totalRev;
    }
    if (totalRev <= 0) continue;
    totalAllocated += adCost * orderRev / totalRev;
  }
  return totalAllocated;
}

function _mgPopulateShopFilter() {
  const sel = $('mg-shop-filter');
  if (!sel) return;
  const cur = sel.value;
  const shops = (DB.shops||[]).slice();
  sel.innerHTML = '<option value="">전체 쇼핑몰</option>' +
    shops.map(s => `<option value="${s.id}">${(s.name||'쇼핑몰').replace(/</g,'&lt;')}</option>`).join('');
  if (cur && shops.find(s => s.id === cur)) sel.value = cur;
}

// v1.9.522: 테이블 컬럼별 도움말 모달 (showMarginInfo와 같은 디자인)
function showColumnInfo(type) {
  const info = {
    mgTotalOrders: {
      title: '총 주문 (Total Orders)', icon: '📋', color: '#3b82f6', bgColor: '#eff6ff', borderColor: '#bfdbfe',
      formula: '주문 건수 / 결제금액 합계 (부가세 포함)',
      desc: '조회 기간 내 <b>정상 주문 건수</b>와 <b>실 결제금액 합계</b>. 결제금액은 부가세 포함.',
      detail: [
        '<b>건수</b>: 정상 주문만 (취소·반품 제외)',
        '<b>결제금액</b>: 고객이 실제 결제한 총액 (VAT 포함)',
        '※ 회계상 매출(VAT 제외)은 Gross Margin / Contribution / Net Margin 카드의 보조 금액 참조',
        '※ 마진율 % 계산은 부가세 제외 기준'
      ]
    },
    sdTotalRev: {
      title: '총 매출 (Gross Revenue)', icon: '💰', color: '#3b82f6', bgColor: '#eff6ff', borderColor: '#bfdbfe',
      formula: '∑ (각 주문의 결제금액)',
      desc: '조회 기간 내 모든 주문의 결제금액 합계. <b>부가세 포함</b> (고객이 실제 결제한 총액).',
      detail: [
        '<b>대상</b>: 정상 주문만 (취소·반품 제외)',
        '<b>금액 기준</b>: 부가세 포함 (= 결제 총액)',
        '쇼핑몰별 매출 비중 차트와 TOP 3도 VAT 포함 기준으로 표시',
        '※ 회계상 매출(VAT 제외)은 정산 매출 / NET 마진 카드 참조'
      ]
    },
    sdNetRev: {
      title: '정산 매출 (Net Revenue after Fee)', icon: '🏦', color: '#3b82f6', bgColor: '#eff6ff', borderColor: '#bfdbfe',
      formula: '(총 매출 ÷ 1.1) − (수수료 ÷ 1.1)',
      desc: '쇼핑몰 판매수수료를 차감한 <b>실제 정산 받을 매출</b>. <b>부가세 제외(Net) 기준</b>.',
      detail: [
        '<b>수수료</b>: 쇼핑몰별 수수료율 (예: 쿠팡 11%, 자사몰 0~3%)',
        '회계상 매출 = 부가세 제외 (총 매출 ÷ 1.1)',
        '쇼핑몰별 정산 주기에 따라 실제 입금됨',
        '아직 원가·광고비는 차감되지 않은 단계 (= Contribution 매출)'
      ]
    },
    sdNetMargin: {
      title: 'NET 마진 (금액)', icon: '🎯', color: '#16a34a', bgColor: '#f0fdf4', borderColor: '#bbf7d0',
      formula: '(총 매출 ÷ 1.1) − 원가 − (수수료 ÷ 1.1) − (광고비 ÷ 1.1)',
      desc: '모든 직접 비용을 차감한 <b>실 마진 금액</b>. <b>부가세 제외(Net) 기준</b>.',
      detail: [
        '<b>원가</b>: 매핑된 ERP 완제품의 BOM 또는 단가 × 수량 (이미 VAT 제외)',
        '<b>수수료·광고비</b>: VAT 포함 원본을 ÷ 1.1로 Net 변환',
        '※ 인건비·임대료·세금 등은 미포함 (회계상 영업이익과는 다름)'
      ]
    },
    sdMarginRate: {
      title: 'NET 마진율 (%)', icon: '📊', color: '#16a34a', bgColor: '#f0fdf4', borderColor: '#bbf7d0',
      formula: 'NET 마진 ÷ 순매출 × 100  (VAT 제외 기준)',
      desc: '<b>회계상 순매출(VAT 제외) 대비 실 마진 비율</b>. 사업 효율성을 한눈에 보는 핵심 지표.',
      detail: [
        '🟢 30% 이상 → 우수',
        '🟡 10~30% → 양호',
        '⚪ 0~10% → 낮음',
        '🔴 0% 미만 → 손실 (즉시 검토 필요)',
        '※ 분모는 부가세 제외 매출 (= 총 매출 ÷ 1.1)'
      ]
    },
    revenue: {
      title: '판매가 (결제금액)', icon: '💵', color: '#3b82f6', bgColor: '#eff6ff', borderColor: '#bfdbfe',
      formula: '결제금액 (부가세 포함)',
      desc: '주문 1건의 <b>실 결제금액</b>. 고객이 결제한 총 금액 그대로 (부가세 포함).',
      detail: [
        '<b>원본</b>: 쇼핑몰 응답의 paymentAmount / totalPrice',
        '<b>표시</b>: VAT 포함 (직관적, 결제 총액)',
        '예: 결제금액 39,000원 → 그대로 39,000원 표시',
        '※ 마진율(%) 계산 시에는 판매가 ÷ 1.1로 VAT 제외 변환 후 사용 (회계 정확도)',
        '※ COGS, 수수료, 광고비, NET 마진은 부가세 제외 기준'
      ]
    },
    cogs: {
      title: 'COGS (Cost of Goods Sold)', icon: '📦', color: '#3b82f6', bgColor: '#eff6ff', borderColor: '#bfdbfe',
      formula: 'BOM 합산 또는 단가 × 수량',
      desc: '주문된 상품의 <b>매출 원가</b>. 매핑된 ERP 완제품의 BOM 비용 또는 등록 단가.',
      detail: [
        '<b>우선순위</b>: 1) bomCost (BOM 부품 합산) → 2) cogs → 3) price',
        '<b>매핑</b>: 쇼핑몰 상품명 → ERP 완제품 (자동 매핑된 경우)',
        '이미 부가세 제외 기준 (그대로 사용)'
      ]
    },
    fee: {
      title: '수수료 (쇼핑몰 판매수수료)', icon: '🏪', color: '#3b82f6', bgColor: '#eff6ff', borderColor: '#bfdbfe',
      formula: '(판매가 × 쇼핑몰 수수료율) ÷ 1.1',
      desc: '쇼핑몰에 지급되는 <b>판매 중개 수수료</b>. 부가세 제외 기준.',
      detail: [
        '<b>수수료율</b>: 쇼핑몰 관리 → 기본 수수료 (%) 등록 값',
        '예: 쿠팡 11%, 와디즈 5% 등 쇼핑몰별 다름',
        '원본은 VAT 포함이므로 ÷1.1로 Net 변환'
      ]
    },
    ads: {
      title: '광고비 (안분 적용)', icon: '📢', color: '#3b82f6', bgColor: '#eff6ff', borderColor: '#bfdbfe',
      formula: '광고비 × (이 주문 매출 ÷ 같은 기간 매출 합계) ÷ 1.1',
      desc: '광고비 기간에 발생한 매출 비례로 <b>주문 단위 안분</b>한 광고비. VAT 제외.',
      detail: [
        '<b>광고비 등록</b>: 결재 요청 → 지출결의서 → 광고비 카테고리',
        '<b>안분 방식</b>: 광고비 × (이 주문 매출 ÷ 광고 기간 총 매출)',
        '광고비 미등록이면 "-" 표시',
        '원본은 VAT 포함 → ÷1.1로 Net 변환'
      ]
    },
    netAmt: {
      title: 'NET 마진 (금액)', icon: '🎯', color: '#16a34a', bgColor: '#f0fdf4', borderColor: '#bbf7d0',
      formula: '순매출(판매가 ÷ 1.1) − COGS − 수수료 − 광고비',
      desc: '주문 1건당 <b>모든 직접 비용을 차감한 실 마진 금액</b>. 모두 부가세 제외 기준.',
      detail: [
        '예: 판매가 39,000 → 순매출 35,455 − COGS 5,171 − 수수료 3,744 − 광고비 0 = 26,540원',
        '판매가(부가세 포함)에서 바로 빼는 게 아니라 <b>÷1.1 한 순매출</b>에서 차감',
        '※ 인건비·임대료·세금 등은 미포함 (영업이익과는 다름)',
        '음수면 손실 (빨간색 표시)'
      ]
    },
    netPct: {
      title: 'NET 마진율 (%)', icon: '📊', color: '#16a34a', bgColor: '#f0fdf4', borderColor: '#bbf7d0',
      formula: 'NET 마진 ÷ 순매출(판매가 ÷ 1.1) × 100',
      desc: '순매출(VAT 제외) 대비 <b>실 마진 비율</b>. 색상으로 효율 즉시 판단.',
      detail: [
        '🟢 30% 이상 → 우수',
        '🟡 10~30% → 양호',
        '⚪ 0~10% → 낮음',
        '🔴 0% 미만 → 손실 (즉시 검토 필요)'
      ]
    }
  };
  // showMarginInfo와 동일한 모달 디자인 재사용
  const data = info[type];
  if (!data) return;
  const exist = document.getElementById('overlay-margin-info');
  if (exist) exist.remove();
  const overlay = document.createElement('div');
  overlay.className = 'overlay show';
  overlay.id = 'overlay-margin-info';
  overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(15,23,42,0.5);align-items:center;justify-content:center;z-index:9999;animation:fadeIn .15s ease-out';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="modal" style="width:540px;max-width:92vw;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden">
      <div style="background:${data.bgColor};border-bottom:1px solid ${data.borderColor};padding:16px 20px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:24px">${data.icon}</span>
          <span style="font-size:16px;font-weight:800;color:${data.color}">${data.title}</span>
        </div>
        <button style="background:none;border:none;font-size:22px;color:#64748b;cursor:pointer;padding:0;line-height:1" onclick="document.getElementById('overlay-margin-info').remove()" title="닫기">✕</button>
      </div>
      <div style="padding:20px 24px;line-height:1.65">
        <div style="font-size:13px;color:#475569;margin-bottom:14px">${data.desc}</div>
        <div style="background:#0f172a;color:#fff;padding:14px 18px;border-radius:9px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13.5px;font-weight:600;margin-bottom:14px;text-align:center;letter-spacing:0.3px">
          ${data.formula}
        </div>
        <ul style="margin:0;padding-left:20px;font-size:12.5px;color:#475569">
          ${data.detail.map(d => `<li style="margin-bottom:5px">${d}</li>`).join('')}
        </ul>
        <div style="margin-top:16px;padding:11px 14px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;font-size:11.5px;color:#92400e;line-height:1.55">
          <b>📝 부가세 처리</b>: 모든 금액을 <b>부가세 제외(Net) 기준</b>으로 통일하여 계산합니다 (회계 표준).
          <br>판매가·수수료·광고비는 ÷1.1 적용, 원가(COGS)는 이미 VAT 제외.
        </div>
      </div>
      <div style="padding:12px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:right">
        <button class="btn" style="background:${data.color};color:#fff;border:none;padding:8px 18px;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer" onclick="document.getElementById('overlay-margin-info').remove()">확인</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

// v1.9.521: 마진 지표 공식 안내 모달
function showMarginInfo(type) {
  const info = {
    gross: {
      title: 'Gross Margin (매출총이익률)',
      icon: '📊',
      color: '#3b82f6',
      bgColor: '#eff6ff',
      borderColor: '#bfdbfe',
      formula: '(순매출 − 원가) ÷ 순매출 × 100',
      desc: '매출에서 <b>상품 원가만</b> 뺀 비율. 가장 기본적인 마진율.',
      detail: [
        '<b>순매출</b>: 판매가 ÷ 1.1 (부가세 제외)',
        '<b>원가</b>: 매핑된 ERP 품목의 BOM 비용 또는 단가 × 수량 (이미 VAT 제외)',
        '예: 매출 100원, 원가 30원 → Gross Margin = 70%'
      ]
    },
    contrib: {
      title: 'Contribution Margin (공헌이익률)',
      icon: '📈',
      color: '#3b82f6',
      bgColor: '#eff6ff',
      borderColor: '#bfdbfe',
      formula: '(순매출 − 원가 − 순수수료) ÷ 순매출 × 100',
      desc: 'Gross Margin에서 <b>쇼핑몰 판매수수료</b>까지 추가 차감.',
      detail: [
        '<b>순수수료</b>: (판매가 × 쇼핑몰 수수료율) ÷ 1.1 (VAT 제외)',
        '쇼핑몰별 수수료율은 <b>매출 분석 → 쇼핑몰 관리</b>에서 설정',
        '주문 1건당 쇼핑몰에 직접 떨어지는 비용 차감 후 손익'
      ]
    },
    net: {
      title: 'Net Margin (순마진) ⭐',
      icon: '🎯',
      color: '#16a34a',
      bgColor: '#f0fdf4',
      borderColor: '#bbf7d0',
      formula: '(순매출 − 원가 − 순수수료 − 순광고비) ÷ 순매출 × 100',
      desc: '모든 <b>직접 비용(원가·수수료·광고비)</b>을 차감한 가장 실질적인 마진.',
      detail: [
        '<b>순광고비</b>: 안분된 광고비 ÷ 1.1 (VAT 제외)',
        '광고비는 <b>지출결의서 광고비 카테고리</b>로 등록된 금액을 매출 비례로 안분',
        '※ 인건비·임대료·감가상각·세금 등은 미포함 (회계상 영업이익과는 다름)'
      ]
    },
    roas: {
      title: '평균 ROAS (Return On Ad Spend)',
      icon: '💰',
      color: '#3b82f6',
      bgColor: '#eff6ff',
      borderColor: '#bfdbfe',
      formula: '순매출 ÷ 순광고비 × 100',
      desc: '광고비 1원당 매출 <b>몇 원</b>이 발생했는지를 나타내는 광고 효율 지표.',
      detail: [
        '<b>해석 기준</b>:',
        '&nbsp;&nbsp;• 100% = 광고비만 겨우 회수한 수준 — <b>원가·수수료를 빼면 아직 적자</b>',
        '&nbsp;&nbsp;• 진짜 본전은 <b>손익분기 ROAS</b>(= 100 ÷ 공헌이익률 × 100) 이상부터 — 광고비 관리의 🎯 카드 참고',
        '&nbsp;&nbsp;• 300% 이상 → ✅ 대체로 효율 우수 (광고 1원당 3원 매출)',
        '광고비 0원이면 표시 불가 (\'-\')'
      ]
    }
  };
  const data = info[type];
  if (!data) return;

  // 기존 모달 제거
  const exist = document.getElementById('overlay-margin-info');
  if (exist) exist.remove();

  const overlay = document.createElement('div');
  overlay.className = 'overlay show';
  overlay.id = 'overlay-margin-info';
  overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(15,23,42,0.5);align-items:center;justify-content:center;z-index:9999;animation:fadeIn .15s ease-out';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="modal" style="width:540px;max-width:92vw;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden">
      <div style="background:${data.bgColor};border-bottom:1px solid ${data.borderColor};padding:16px 20px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:24px">${data.icon}</span>
          <span style="font-size:16px;font-weight:800;color:${data.color}">${data.title}</span>
        </div>
        <button style="background:none;border:none;font-size:22px;color:#64748b;cursor:pointer;padding:0;line-height:1" onclick="document.getElementById('overlay-margin-info').remove()" title="닫기">✕</button>
      </div>
      <div style="padding:20px 24px;line-height:1.65">
        <div style="font-size:13px;color:#475569;margin-bottom:14px">${data.desc}</div>
        <div style="background:#0f172a;color:#fff;padding:14px 18px;border-radius:9px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13.5px;font-weight:600;margin-bottom:14px;text-align:center;letter-spacing:0.3px">
          ${data.formula}
        </div>
        <ul style="margin:0;padding-left:20px;font-size:12.5px;color:#475569">
          ${data.detail.map(d => `<li style="margin-bottom:5px">${d}</li>`).join('')}
        </ul>
        <div style="margin-top:16px;padding:11px 14px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;font-size:11.5px;color:#92400e;line-height:1.55">
          <b>📝 부가세 처리</b>: 모든 금액을 <b>부가세 제외(Net) 기준</b>으로 통일하여 계산합니다 (회계 표준).
          <br>판매가·수수료·광고비는 ÷1.1 적용, 원가는 이미 VAT 제외.
        </div>
      </div>
      <div style="padding:12px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:right">
        <button class="btn" style="background:${data.color};color:#fff;border:none;padding:8px 18px;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer" onclick="document.getElementById('overlay-margin-info').remove()">확인</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function renderMarginAnalysis() {
  _mgPopulateShopFilter();
  // v1.9.379: 공용 기간 필터(월별/주별/일별/기간별/전체)로 교체
  if (typeof _periodInit === 'function') _periodInit('mg');
  const { start, end } = (typeof _periodComputeRange === 'function')
    ? _periodComputeRange('mg')
    : _mgComputePeriod('이번 달');
  const shopFilter = $('mg-shop-filter')?.value || '';

  // v1.9.779: _mgAllocateAds 캐시 초기화 (이번 렌더에서 fresh 계산 보장)
  (DB.shops||[]).forEach(s => { if (s) s._mgAdRevCache = {}; });

  // 1) 주문 필터링
  let orders = (DB.shopOrders||[]).filter(o => {
    if (!o) return false;
    if (o.status === '취소' || o.status === '반품') return false;
    const d = _periodNormDate(o.orderDate || o.date || '');
    if (start && d < start) return false;
    if (end && d > end) return false;
    if (shopFilter && o.shopId !== shopFilter) return false;
    return true;
  });

  // v1.9.520/526: Net (부가세 제외) 기준 + VAT 포함 매출 별도 누적
  //   - 판매가/수수료/광고비: /1.1 로 Net 변환
  //   - COGS: 이미 VAT 제외
  //   - sumRevGross: 총 주문 보조 표시용 (VAT 포함)
  const VAT_DIVIDER = 1.1;
  let sumRev = 0, sumCogs = 0, sumFee = 0, sumAds = 0, sumRevGross = 0;
  const rows = orders.map(o => {
    const shop = (DB.shops||[]).find(s => s.id === o.shopId) || {};
    const revenueGross = parseFloat(o.paymentAmount || o.totalPrice || 0) || 0;
    const revenue = revenueGross / VAT_DIVIDER;
    const { cogs } = _mgLookupCogs(o);
    const feeGross = revenueGross * (parseFloat(shop.commissionBase) || 0) / 100;
    const fee = feeGross / VAT_DIVIDER;
    const adsGross = _mgAllocateAds(o, shop);
    const ads = adsGross / VAT_DIVIDER;
    const net = revenue - cogs - fee - ads;
    const pct = revenue > 0 ? (net / revenue * 100) : 0;
    sumRev += revenue; sumCogs += cogs; sumFee += fee; sumAds += ads;
    sumRevGross += revenueGross;
    return { o, shop, revenueGross, revenue, cogs, fee, ads, net, pct };
  });

  // 3) 상단 KPI 갱신
  const fmtPct = v => isFinite(v) ? v.toFixed(1) + '%' : '-';
  const fmtWon = n => '₩' + Math.round(n).toLocaleString();
  if ($('mg-total-orders')) $('mg-total-orders').textContent = orders.length + '건';
  const grossAmt = sumRev - sumCogs;
  const contribAmt = sumRev - sumCogs - sumFee;
  const netAmt = sumRev - sumCogs - sumFee - sumAds;
  const grossPct = sumRev > 0 ? grossAmt / sumRev * 100 : 0;
  const contribPct = sumRev > 0 ? contribAmt / sumRev * 100 : 0;
  const netPct = sumRev > 0 ? netAmt / sumRev * 100 : 0;
  const roasPct = sumAds > 0 ? sumRev / sumAds * 100 : null;
  if ($('mg-gross'))  $('mg-gross').textContent  = sumRev > 0 ? fmtPct(grossPct) : '-';
  if ($('mg-contrib'))$('mg-contrib').textContent= sumRev > 0 ? fmtPct(contribPct) : '-';
  if ($('mg-net'))    $('mg-net').textContent    = sumRev > 0 ? fmtPct(netPct) : '-';
  if ($('mg-roas'))   $('mg-roas').textContent   = roasPct == null ? '-' : Math.round(roasPct) + '%';
  // v1.9.371: KPI % 아래에 실제 금액(원) 보조 표시
  if ($('mg-total-rev'))  $('mg-total-rev').textContent   = sumRevGross > 0 ? fmtWon(sumRevGross) : '-'; // v1.9.526: VAT 포함 표시
  if ($('mg-gross-amt'))  $('mg-gross-amt').textContent   = sumRev > 0 ? fmtWon(grossAmt) : '-';
  if ($('mg-contrib-amt'))$('mg-contrib-amt').textContent = sumRev > 0 ? fmtWon(contribAmt) : '-';
  if ($('mg-net-amt'))    $('mg-net-amt').textContent     = sumRev > 0 ? fmtWon(netAmt) : '-';
  if ($('mg-roas-amt'))   $('mg-roas-amt').textContent    = sumAds > 0 ? '광고비 ' + fmtWon(sumAds) : (sumRev > 0 ? '광고비 ₩0' : '-');

  // 4) 테이블 갱신
  const tb = $('margin-table');
  if (!tb) return;
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--gray-400);padding:30px;font-size:12.5px">조회 기간에 주문 데이터가 없습니다 — 주문 관리 탭에서 데이터를 수집해 주세요</td></tr>`;
    return;
  }
  tb.innerHTML = rows.map(r => {
    const _color = r.pct >= 30 ? '#16a34a' : r.pct >= 10 ? '#d97706' : r.pct >= 0 ? '#475569' : '#dc2626';
    const _won = n => Math.round(n).toLocaleString() + '원';
    const dim = 'color:var(--gray-400)';
    // v1.9.363: 주문번호 클릭 → 주문 상세 모달 열기
    const _orderNoCell = r.o.id != null
      ? `<span style="font-size:12px;color:#3d6ea8;font-weight:600;cursor:pointer;text-decoration:none" onclick="event.stopPropagation();openOrderDetail(${r.o.id})" title="클릭하면 주문 상세 보기" onmouseenter="this.style.color='#2c5687'" onmouseleave="this.style.color='#3d6ea8'">${(r.o.orderNo||'-').replace(/</g,'&lt;')}</span>`
      : `<span style="font-size:12px;color:#0f172a">${(r.o.orderNo||'-').replace(/</g,'&lt;')}</span>`;
    // v1.9.366: 모든 셀 가운데 정렬로 통일
    return `<tr>
      <td style="text-align:center"><input type="checkbox" class="mg-row-check" data-id="${r.o.id||r.o.orderNo||''}" onchange="updateBulkCount()"></td>
      <td style="text-align:center">${(r.shop.name||'-').replace(/</g,'&lt;')}</td>
      <td style="text-align:center">${_orderNoCell}</td>
      <td style="text-align:center;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(r.o.productName||'-').replace(/</g,'&lt;')}</td>
      <td style="text-align:center">${_won(r.revenueGross)}</td>
      <td style="text-align:center;${r.cogs>0?'':dim}">${r.cogs>0 ? _won(r.cogs) : '-'}</td>
      <td style="text-align:center;${r.fee>0?'':dim}">${r.fee>0 ? _won(r.fee) : '-'}</td>
      <td style="text-align:center;${r.ads>0?'':dim}">${r.ads>0 ? _won(r.ads) : '-'}</td>
      <td style="text-align:center;font-weight:700;color:${_color}">${_won(r.net)}</td>
      <td style="text-align:center;font-weight:700;color:${_color}">${r.pct.toFixed(1)}%</td>
    </tr>`;
  }).join('');
  updateBulkCount();
}

// 마진 분석
function toggleAllMarginRows(masterCb) {
  document.querySelectorAll('.mg-row-check').forEach(cb => { cb.checked = masterCb.checked; });
  updateBulkCount();
}
function updateBulkCount() {
  const cnt = document.querySelectorAll('.mg-row-check:checked').length;
  const display = $('mg-sel-count'); if (display) display.textContent = cnt;
  const btn = $('mg-bulk-btn'); if (btn) btn.disabled = cnt === 0;
}
function openBulkEdit() {
  if (!requireWrite()) return;
  const cnt = document.querySelectorAll('.mg-row-check:checked').length;
  if (!cnt) return;
  $('bulk-count').textContent = cnt;
  ['bulk-commission','bulk-commission-won','bulk-ads'].forEach(id => { if($(id)) $(id).value = ''; });
  openModal('bulk-edit-modal');
}
function applyBulkEdit() {
  if (!requireWrite()) return;
  closeModal('bulk-edit-modal');
  alert('일괄 수정이 적용되었습니다. (주문 데이터 연동 후 실제 marginSnapshot이 업데이트됩니다)');
}

/* v2.3.740 — 마진 분석 화면의 뼈대(HTML).
   임원용 페이지에 하드코딩돼 있던 것을 여기로 옮겼다. 직원용도 이걸 쓰므로
   KPI 카드·필터·표 머리글이 서로 달라질 수 없다.
   periodFilter:true 면 기간 필터도 함께 그린다(직원용은 자체 툴바가 없다). */
function renderMarginShell(host, opt) {
  if (!host) return;
  opt = opt || {};
  var h = '';
  if (opt.periodFilter) {
    h += '<div style="display:flex;justify-content:flex-start;align-items:center;gap:18px;margin-bottom:14px;flex-wrap:wrap">'
    + '<div class="period-filter sales-period-block" data-prefix="mg" data-tab="margin" style="display:none;gap:5px;align-items:center;flex-wrap:nowrap">'
    + '<span style="font-size:12px;color:var(--gray-500);font-weight:500;flex-shrink:0">📅</span>'
    + '<select class="fs period-mode" onchange="_periodOnChange(\'mg\')" style="width:80px;font-size:12px;height:32px;padding:5px 8px;flex-shrink:0">'
    + '<option value="month">월별</option><option value="week">주별</option><option value="day">일별</option><option value="range">기간별</option><option value="all">전체</option>'
    + '</select>'
    + '<input class="fi period-month" type="month" onchange="_periodOnChange(\'mg\')" oninput="_periodOnChange(\'mg\')" style="width:140px;font-size:12px;height:32px;padding:5px 10px;flex-shrink:0">'
    + '<input class="fi period-week"  type="week"  onchange="_periodOnChange(\'mg\')" oninput="_periodOnChange(\'mg\')" style="display:none;width:140px;font-size:12px;height:32px;padding:5px 10px;flex-shrink:0">'
    + '<input class="fi period-day"   type="date"  onchange="_periodOnChange(\'mg\')" oninput="_periodOnChange(\'mg\')" style="display:none;width:140px;font-size:12px;height:32px;padding:5px 10px;flex-shrink:0">'
    + '<input class="fi period-from"  type="date"  onchange="_periodOnChange(\'mg\')" oninput="_periodOnChange(\'mg\')" style="display:none;width:140px;font-size:12px;height:32px;padding:5px 10px;flex-shrink:0">'
    + '<span class="period-tilde" style="display:none;color:var(--gray-400);font-size:12px;flex-shrink:0">~</span>'
    + '<input class="fi period-to"    type="date"  onchange="_periodOnChange(\'mg\')" oninput="_periodOnChange(\'mg\')" style="display:none;width:140px;font-size:12px;height:32px;padding:5px 10px;flex-shrink:0">'
    + '<button class="btn btn-primary btn-sm" onclick="_periodOnChange(\'mg\')" style="height:32px;padding:5px 12px;font-size:12px;flex-shrink:0;white-space:nowrap">🔍 조회</button>'
    + '</div>'
      + '</div>';
  }
  h += ''
    + '<div class="card" style="margin-bottom:14px;padding:14px 18px">'
    + '<!-- v1.9.371: 각 KPI % 아래에 실제 금액(원) 보조 표시 — 비율과 절대값을 한눈에 -->'
    + '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px;text-align:center;align-items:end">'
    + '<div>'
    + '<div style="font-size:13.5px;color:#334155;font-weight:700;margin-bottom:5px">총 주문<sup onclick="showColumnInfo(\'mgTotalOrders\')" style="cursor:pointer;color:#3b82f6;font-size:12px;font-weight:600;margin-left:3px;line-height:1;position:relative;top:-3px;opacity:0.7;transition:opacity .15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7" title="공식 보기">ⓘ</sup></div>'
    + '<div style="font-size:22px;font-weight:800;color:#0f172a" id="mg-total-rev">-</div>'
    + '<div style="font-size:12.5px;color:#1e3a8a;font-weight:700;margin-top:4px" id="mg-total-orders">-</div>'
    + '</div>'
    + '<div>'
    + '<div style="font-size:13.5px;color:#334155;font-weight:700;margin-bottom:5px">Gross Margin<sup onclick="showMarginInfo(\'gross\')" style="cursor:pointer;color:#3b82f6;font-size:12px;font-weight:600;margin-left:3px;line-height:1;position:relative;top:-3px;opacity:0.7;transition:opacity .15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7" title="공식 보기">ⓘ</sup></div>'
    + '<div style="font-size:22px;font-weight:800;color:#0f172a" id="mg-gross-amt">-</div>'
    + '<div style="font-size:12.5px;color:#1e3a8a;font-weight:700;margin-top:4px" id="mg-gross">-</div>'
    + '</div>'
    + '<div>'
    + '<div style="font-size:13.5px;color:#334155;font-weight:700;margin-bottom:5px">Contribution<sup onclick="showMarginInfo(\'contrib\')" style="cursor:pointer;color:#3b82f6;font-size:12px;font-weight:600;margin-left:3px;line-height:1;position:relative;top:-3px;opacity:0.7;transition:opacity .15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7" title="공식 보기">ⓘ</sup></div>'
    + '<div style="font-size:22px;font-weight:800;color:#0f172a" id="mg-contrib-amt">-</div>'
    + '<div style="font-size:12.5px;color:#1e3a8a;font-weight:700;margin-top:4px" id="mg-contrib">-</div>'
    + '</div>'
    + '<div>'
    + '<div style="font-size:13.5px;color:#166534;font-weight:800;margin-bottom:5px;display:flex;align-items:center;justify-content:center;gap:4px"><span>⭐</span><span>Net Margin</span><sup onclick="showMarginInfo(\'net\')" style="cursor:pointer;color:#16a34a;font-size:12px;font-weight:600;margin-left:3px;line-height:1;position:relative;top:-3px;opacity:0.7;transition:opacity .15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7" title="공식 보기">ⓘ</sup></div>'
    + '<div style="font-size:24px;font-weight:900;color:#166534" id="mg-net-amt">-</div>'
    + '<div style="font-size:12.5px;color:#166534;font-weight:700;margin-top:4px" id="mg-net">-</div>'
    + '</div>'
    + '<div>'
    + '<div style="font-size:13.5px;color:#334155;font-weight:700;margin-bottom:5px">평균 ROAS<sup onclick="showMarginInfo(\'roas\')" style="cursor:pointer;color:#3b82f6;font-size:12px;font-weight:600;margin-left:3px;line-height:1;position:relative;top:-3px;opacity:0.7;transition:opacity .15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7" title="공식 보기">ⓘ</sup></div>'
    + '<div style="font-size:22px;font-weight:800;color:#0f172a" id="mg-roas">-</div>'
    + '<div style="font-size:12.5px;color:#1e3a8a;font-weight:700;margin-top:4px" id="mg-roas-amt" title="총 광고비">-</div>'
    + '</div>'
    + '</div>'
    + '</div>'
    + '<!-- v1.9.381: 기간 필터는 상단 toolbar 로 이동, 여기엔 쇼핑몰 필터 + 일괄 수정 버튼만 -->'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">'
    + '<div style="display:flex;gap:6px;align-items:center">'
    + '<select class="fs" id="mg-shop-filter" onchange="renderMarginAnalysis()" style="width:140px;padding:5px 8px;font-size:12px;height:32px"><option value="">전체 쇼핑몰</option></select>'
    + '</div>'
    + '<div style="display:flex;gap:6px">'
    + '<button class="btn btn-outline btn-sm" id="mg-bulk-btn" onclick="openBulkEdit()" disabled>✏️ 일괄 수정 (<span id="mg-sel-count">0</span>건)</button>'
    + '</div>'
    + '</div>'
    + '<div class="card"><div class="card-body" style="overflow-x:auto">'
    + '<table class="tbl" style="text-align:center"><thead><tr><th style="width:30px;text-align:center"><input type="checkbox" id="mg-check-all" onchange="toggleAllMarginRows(this)"></th><th style="text-align:center">쇼핑몰</th><th style="text-align:center">주문번호</th><th style="text-align:center">상품</th><th style="text-align:center">판매가<sup onclick="showColumnInfo(\'revenue\')" style="cursor:pointer;color:#3b82f6;font-size:11px;font-weight:600;margin-left:3px;line-height:1;position:relative;top:-3px;opacity:0.7;transition:opacity .15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7" title="공식 보기">ⓘ</sup></th><th style="text-align:center">COGS<sup onclick="showColumnInfo(\'cogs\')" style="cursor:pointer;color:#3b82f6;font-size:11px;font-weight:600;margin-left:3px;line-height:1;position:relative;top:-3px;opacity:0.7;transition:opacity .15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7" title="공식 보기">ⓘ</sup></th><th style="text-align:center">수수료<sup onclick="showColumnInfo(\'fee\')" style="cursor:pointer;color:#3b82f6;font-size:11px;font-weight:600;margin-left:3px;line-height:1;position:relative;top:-3px;opacity:0.7;transition:opacity .15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7" title="공식 보기">ⓘ</sup></th><th style="text-align:center">광고비<sup onclick="showColumnInfo(\'ads\')" style="cursor:pointer;color:#3b82f6;font-size:11px;font-weight:600;margin-left:3px;line-height:1;position:relative;top:-3px;opacity:0.7;transition:opacity .15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7" title="공식 보기">ⓘ</sup></th><th style="text-align:center">NET 마진<sup onclick="showColumnInfo(\'netAmt\')" style="cursor:pointer;color:#16a34a;font-size:11px;font-weight:600;margin-left:3px;line-height:1;position:relative;top:-3px;opacity:0.7;transition:opacity .15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7" title="공식 보기">ⓘ</sup></th><th style="text-align:center">NET 마진율<sup onclick="showColumnInfo(\'netPct\')" style="cursor:pointer;color:#16a34a;font-size:11px;font-weight:600;margin-left:3px;line-height:1;position:relative;top:-3px;opacity:0.7;transition:opacity .15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7" title="공식 보기">ⓘ</sup></th></tr></thead><tbody id="margin-table"></tbody></table>'
    + '</div></div>';
  host.innerHTML = h;
}
