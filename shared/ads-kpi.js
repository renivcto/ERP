/* =============================================================================
   광고비 관리 — KPI 카드 8개                          — v2.3.129~
   =============================================================================
   ⚠️ 이 파일은 임원용(/index.html)과 직원용(/staff/index.html)이 **함께** 읽는다.
      화면·계산이 한 벌만 존재해야 서로 어긋나지 않는다. 복사본을 만들지 말 것.

   불러오는 쪽(호스트)이 아래를 먼저 준비해야 한다 (window 전역):
     DB.shopOrders[]  주문        DB.shops[]  쇼핑몰(commissionBase)
     DB.items[]       품목        _mgLookupCogs(o)  — shared/margin-analysis.js 에 있다

   쓰는 법:
     renderAdsKpi(hostEl, {
       filtered,          // 화면에 걸린 광고비 행들 (a._shopId·cost·startDate·endDate·projectId·expenseId)
       allAds,            // 필터 무관 전체 광고비 ('이번달 vs 지난달' 카드용). 없으면 filtered 로 본다.
       periodLabelStr,    // '2026년 08월' 같은 기간 이름
       yr, mo,            // 이번달 비교용 (오늘 기준 연도·월index)
       adEntryRefund      // (a, seenSet) => 환불액. 없으면 0 으로 본다.
     });
   ============================================================================= */

/* 기간 매출·NET 데이터 — 광고비 KPI 와 쇼핑몰 순위표가 함께 쓴다.
   임원용에서는 renderAdsPage 안의 지역함수였는데, 같은 계산을 직원용도 써야 해서
   전역으로 올렸다(호출부는 그대로 이 이름을 부른다). */
// 기간 매출 계산 (KPI + ROAS 용)
function _periodRevenue(shopId, startDate, endDate) {
  const orders = (DB.shopOrders || []).filter(o => {
    if (!o || !o.orderDate) return false;
    if (shopId && String(o.shopId) !== String(shopId)) return false;
    if (o.status === '취소' || o.status === '반품') return false;
    const od = new Date(o.orderDate);
    if (startDate && od < new Date(startDate)) return false;
    if (endDate && od > new Date(endDate + 'T23:59:59')) return false;
    return true;
  });
  return orders.reduce((s, o) => s + Number(o.paymentAmount || o.totalPrice || 0), 0);
}

// v1.9.867: 기간 NET 데이터 (revenue + cogs + fee) 합산 — NET 마진 계산용
function _periodNetData(shopId, startDate, endDate) {
  const orders = (DB.shopOrders || []).filter(o => {
    if (!o || !o.orderDate) return false;
    if (shopId && String(o.shopId) !== String(shopId)) return false;
    if (o.status === '취소' || o.status === '반품') return false;
    const od = new Date(o.orderDate);
    if (startDate && od < new Date(startDate)) return false;
    if (endDate && od > new Date(endDate + 'T23:59:59')) return false;
    return true;
  });
  const shop = (DB.shops||[]).find(s => s && String(s.id) === String(shopId));
  let revenue = 0, cogs = 0, fee = 0;
  orders.forEach(o => {
    const r = Number(o.paymentAmount || o.totalPrice || 0);
    revenue += r;
    // COGS
    try {
      if (typeof _mgLookupCogs === 'function') {
        const c = _mgLookupCogs(o);
        cogs += (c && typeof c === 'object') ? (Number(c.cogs)||0) : (Number(c)||0);
      }
    } catch(_){}
    // 쇼핑몰 수수료
    try {
      const feeRate = shop ? (parseFloat(shop.commissionBase) || parseFloat(shop.fee) || 0) : 0;
      fee += r * feeRate / 100;
    } catch(_){}
  });
  return { revenue, cogs, fee, count: orders.length };  // v2.3.135: 주문 건수 추가
}

/* v2.3.741 — KPI 카드 8개. 임원용 renderAdsPage 안에 있던 것을 그대로 옮겼다. */
function renderAdsKpi(host, ctx) {
  if (!host) return;
  ctx = ctx || {};
  var filtered = ctx.filtered || [];
  // '이번달 vs 지난달' 카드만 필터와 무관한 전체 광고비를 본다
  var allAds = ctx.allAds || filtered;
  var periodLabelStr = ctx.periodLabelStr || '';
  var _now = new Date();
  var yr = (ctx.yr != null) ? ctx.yr : _now.getFullYear();
  var mo = (ctx.mo != null) ? ctx.mo : _now.getMonth();
  var _adEntryRefund = (typeof ctx.adEntryRefund === 'function') ? ctx.adEntryRefund : function(){ return 0; };
// KPI 계산 — v2.3.135: NET 마진 + CAC + AOV 추가
let totalAds = 0;
let totalRefund = 0;                       // v2.3.390: 환불액 합계(그룹 1회 dedup)
const _refSeen = new Set();
let totalRevenue = 0;
let totalCogs = 0, totalFee = 0, totalOrderCount = 0;
// v1.9.867: 프로젝트별 매출 dedup — 같은 프로젝트 광고비 여러 건이면 매출 1번만
const _revDedupSet = new Set();
filtered.forEach(a => {
  totalAds += Number(a.cost || 0);
  totalRefund += _adEntryRefund(a, _refSeen);
  const startDate = a.startDate || a.date || (a.month + '-01');
  const endDate = a.endDate || a.startDate || a.date || (a.month + '-01');
  const dedupKey = (a.projectId ? 'proj:' + a.projectId : 'single:' + a._shopId + '|' + startDate + '|' + endDate);
  if (_revDedupSet.has(dedupKey)) return;
  _revDedupSet.add(dedupKey);
  const _nd = _periodNetData(a._shopId, startDate, endDate);
  totalRevenue += _nd.revenue;
  totalCogs += _nd.cogs;
  totalFee += _nd.fee;
  totalOrderCount += _nd.count;
});
// v2.3.390: 지표는 실 광고비(=지출-환불) 기준 계산. 표시용 총 지출광고비는 totalAds 유지.
const totalNetAds = Math.max(0, totalAds - totalRefund);
const avgRoas = totalNetAds > 0 ? (totalRevenue / totalNetAds * 100) : 0;
// v2.3.135: NET 마진 / CAC / AOV
const netMargin = totalRevenue - totalCogs - totalFee - totalNetAds;
const netMarginPct = totalRevenue > 0 ? (netMargin / totalRevenue * 100) : 0;
const cac = totalOrderCount > 0 ? Math.round(totalNetAds / totalOrderCount) : 0;
const aov = totalOrderCount > 0 ? Math.round(totalRevenue / totalOrderCount) : 0;
// v2.3.129: 🎯 손익분기 ROAS — 기여마진율 기반
//   BEP ROAS = 매출 / (매출 - 원가 - 수수료) × 100
//   기간 매출이 없으면 전체 주문 기준 원가·수수료 비율로 fallback
let bepRoas = 0, bepBasisLabel = periodLabelStr;
const _cmPeriod = totalRevenue - totalCogs - totalFee;
if (totalRevenue > 0 && _cmPeriod > 0) {
  bepRoas = 100 * totalRevenue / _cmPeriod;
} else {
  try {
    let _r = 0, _c = 0, _f = 0;
    (DB.shopOrders || []).forEach(o => {
      if (!o || o.status === '취소' || o.status === '반품') return;
      const rv = Number(o.paymentAmount || o.totalPrice || 0);
      if (!rv) return;
      _r += rv;
      try {
        if (typeof _mgLookupCogs === 'function') {
          const c = _mgLookupCogs(o);
          _c += (c && typeof c === 'object') ? (Number(c.cogs)||0) : (Number(c)||0);
        }
      } catch(_){}
      try {
        const sh = (DB.shops||[]).find(s2 => s2 && String(s2.id) === String(o.shopId));
        const fr = sh ? (parseFloat(sh.commissionBase) || parseFloat(sh.fee) || 0) : 0;
        _f += rv * fr / 100;
      } catch(_){}
    });
    const _cmAll = _r - _c - _f;
    if (_r > 0 && _cmAll > 0) { bepRoas = 100 * _r / _cmAll; bepBasisLabel = '전체 주문 기준'; }
  } catch(_){}
}
const _roasGap = (bepRoas > 0 && avgRoas > 0) ? (avgRoas - bepRoas) : null;
// v2.3.143: 💰 주문당 순익 = NET마진/주문건수 = AOV - 주문당원가 - 주문당수수료 - CAC
const profitPerOrder = totalOrderCount > 0 ? Math.round(netMargin / totalOrderCount) : null;
const _cogsPerOrder = totalOrderCount > 0 ? Math.round(totalCogs / totalOrderCount) : 0;
const _feePerOrder = totalOrderCount > 0 ? Math.round(totalFee / totalOrderCount) : 0;
const _ppoColor = profitPerOrder == null ? '#94a3b8' : (profitPerOrder > 0 ? '#16a34a' : (profitPerOrder < 0 ? '#dc2626' : '#94a3b8'));
const _ppoSign = (profitPerOrder != null && profitPerOrder > 0) ? '+' : '';
const cntAuto = filtered.filter(a => a.expenseId).length;
const cntManual = filtered.length - cntAuto;

// 이번달 / 지난달 비교 (전체 광고비 — 필터 무관)
const thisMo = new Date(yr, mo, 1);
const thisMoEnd = new Date(yr, mo + 1, 0, 23, 59, 59);
const lastMo = new Date(yr, mo - 1, 1);
const lastMoEnd = new Date(yr, mo, 0, 23, 59, 59);
let thisMoAds = 0, lastMoAds = 0;
const _thisMoSeen = new Set(), _lastMoSeen = new Set();   // v2.3.390: 실 광고비 기준(환불 차감)
allAds.forEach(a => {
  const adStart = new Date(a.startDate || a.date || (a.month + '-01'));
  const adEnd = new Date(a.endDate || a.startDate || a.date || (a.month + '-01'));
  if (!(adEnd < thisMo || adStart > thisMoEnd)) thisMoAds += Number(a.cost || 0) - _adEntryRefund(a, _thisMoSeen);
  if (!(adEnd < lastMo || adStart > lastMoEnd)) lastMoAds += Number(a.cost || 0) - _adEntryRefund(a, _lastMoSeen);
});
thisMoAds = Math.max(0, thisMoAds); lastMoAds = Math.max(0, lastMoAds);
const momPct = lastMoAds > 0 ? ((thisMoAds - lastMoAds) / lastMoAds * 100) : 0;
const momIcon = momPct > 0 ? '▲' : (momPct < 0 ? '▼' : '·');
const momColor = momPct > 0 ? '#dc2626' : (momPct < 0 ? '#16a34a' : '#94a3b8');

// v2.3.139: KPI 카드 6개 + 호버 툴팁 (총광고비 / 평균ROAS / NET마진 / CAC / AOV / vs전월)
const _netColor = netMargin > 0 ? '#16a34a' : (netMargin < 0 ? '#dc2626' : '#94a3b8');
const _netSign = netMargin > 0 ? '+' : '';
// 호버 툴팁 헬퍼 — 흰 바탕 + 카드 색 테두리, 폭 240px
const _tt = (ic, bc, tc, ttl, dsc) =>
  '<span style="position:relative;display:inline-block;cursor:help;color:' + ic + ';font-size:12px;margin-left:4px;font-weight:700;vertical-align:middle;line-height:1"' +
  ' onmouseenter="this.querySelector(\'.kpi-tt\').style.display=\'block\'"' +
  ' onmouseleave="this.querySelector(\'.kpi-tt\').style.display=\'none\'">ⓘ' +
  '<div class="kpi-tt" style="display:none;position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);width:240px;background:#fff;border:2px solid ' + bc + ';border-radius:10px;padding:11px 14px;font-size:11.5px;color:#334155;line-height:1.6;font-weight:500;text-align:left;box-shadow:0 12px 28px rgba(15,23,42,0.12);z-index:999;letter-spacing:-0.1px;white-space:normal">' +
  '<div style="font-weight:800;color:' + tc + ';margin-bottom:5px;font-size:12.5px;letter-spacing:-0.2px">' + ttl + '</div>' + dsc + '</div></span>';
host.innerHTML = `
  <div style="background:#fdf2f8;border:1px solid #fce7f3;border-radius:14px;padding:18px 14px;text-align:center;box-shadow:0 8px 22px rgba(190,24,93,0.07),0 1px 3px rgba(15,23,42,0.04)">
    <div style="font-size:12px;color:#9d174d;font-weight:700;letter-spacing:-0.1px;margin-bottom:8px">총 실 광고비${_tt('#be185d', '#fce7f3', '#9d174d', '총 실 광고비', '선택 기간 광고비에서 <strong>환불액을 뺀 실제 지출</strong>입니다.<br>= 지출 광고비 − 환불액<br><br>모든 지표(ROAS·CAC·NET마진·순익)는 이 실 광고비 기준으로 계산됩니다.')} <span style="color:#be185d;opacity:0.65;font-weight:500;font-size:10px">· ${periodLabelStr}</span></div>
    <div style="font-size:20px;font-weight:800;color:#be185d;letter-spacing:-0.5px;margin-top:3px">₩${totalNetAds.toLocaleString()}</div>
    <div style="font-size:11px;color:#1e3a8a;font-weight:700;margin-top:6px">${totalRefund > 0 ? '지출 ₩' + totalAds.toLocaleString() + ' · 환불 −₩' + totalRefund.toLocaleString() : filtered.length + '건 집행'}</div>
  </div>
  <div style="background:#f0fdf4;border:1px solid #dcfce7;border-radius:14px;padding:18px 14px;text-align:center;box-shadow:0 8px 22px rgba(22,163,74,0.07),0 1px 3px rgba(15,23,42,0.04)">
    <div style="font-size:12px;color:#166534;font-weight:700;letter-spacing:-0.1px;margin-bottom:8px">평균 ROAS${_tt('#16a34a', '#dcfce7', '#166534', '평균 ROAS', 'Return on Ad Spend (광고 수익률)<br>= 광고로 발생한 매출 ÷ 광고비 × 100%<br><br>100% = 본전, 200% = 광고비 1원당 매출 2원.')} <span style="color:#16a34a;opacity:0.65;font-weight:500;font-size:10px">· ${periodLabelStr}</span></div>
    <div style="font-size:20px;font-weight:800;color:#16a34a;letter-spacing:-0.5px;margin-top:3px">${avgRoas > 0 ? avgRoas.toFixed(0) + '%' : '-'}</div>
    <div style="font-size:11px;color:#1e3a8a;font-weight:700;margin-top:6px">매출 ₩${totalRevenue.toLocaleString()}</div>
  </div>
  <div style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:14px;padding:18px 14px;text-align:center;box-shadow:0 8px 22px rgba(8,145,178,0.07),0 1px 3px rgba(15,23,42,0.04)">
    <div style="font-size:12px;color:#155e75;font-weight:700;letter-spacing:-0.1px;margin-bottom:8px">🎯 손익분기 ROAS${_tt('#0891b2', '#a5f3fc', '#155e75', '손익분기 ROAS', '= 매출 ÷ (매출 − 원가 − 수수료) × 100<br><br>광고가 흑자가 되려면 평균 ROAS 가 이 값 <strong>이상</strong>이어야 합니다.<br><br>예: 손익분기 250% 인데 평균 ROAS 200% 면 팔수록 적자.' + (bepBasisLabel === '전체 주문 기준' ? '<br><br>※ 선택 기간 매출이 없어 전체 주문의 원가·수수료 비율로 계산했습니다.' : ''))} <span style="color:#0891b2;opacity:0.65;font-weight:500;font-size:10px">· ${bepBasisLabel}</span></div>
    <div style="font-size:20px;font-weight:800;color:#0e7490;letter-spacing:-0.5px;margin-top:3px">${bepRoas > 0 ? bepRoas.toFixed(0) + '%' : '-'}</div>
    <div style="font-size:11px;font-weight:700;margin-top:6px;color:${_roasGap == null ? '#94a3b8' : (_roasGap >= 0 ? '#16a34a' : '#dc2626')}">${_roasGap == null ? (bepRoas > 0 ? '평균 ROAS 집계 전' : '주문 데이터 필요') : (_roasGap >= 0 ? '🟢 흑자 구간' : '🔴 적자 구간')}</div>
  </div>
  <div style="background:#faf5ff;border:1px solid #ede9fe;border-radius:14px;padding:18px 14px;text-align:center;box-shadow:0 8px 22px rgba(124,58,237,0.07),0 1px 3px rgba(15,23,42,0.04)">
    <div style="font-size:12px;color:#6b21a8;font-weight:700;letter-spacing:-0.1px;margin-bottom:8px">⭐ NET 마진${_tt('#7c3aed', '#ede9fe', '#6b21a8', 'NET 마진', '= 매출 − 제품원가 − 쇼핑몰수수료 − 광고비<br><br>실제로 회사에 남는 순이익입니다.<br>마이너스(−)면 팔수록 적자.<br><br>마진율 = NET 마진 ÷ 매출 × 100')} <span style="color:#7c3aed;opacity:0.65;font-weight:500;font-size:10px">· ${periodLabelStr}</span></div>
    <div style="font-size:20px;font-weight:800;color:${_netColor};letter-spacing:-0.5px;margin-top:3px">${_netSign}₩${Math.round(netMargin).toLocaleString()}</div>
    <div style="font-size:11px;color:#1e3a8a;font-weight:700;margin-top:6px">마진율 ${totalRevenue > 0 ? netMarginPct.toFixed(1) + '%' : '-'}</div>
  </div>
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:18px 14px;text-align:center;box-shadow:0 8px 22px rgba(234,88,12,0.07),0 1px 3px rgba(15,23,42,0.04)">
    <div style="font-size:12px;color:#9a3412;font-weight:700;letter-spacing:-0.1px;margin-bottom:8px">고객획득비용 <span style="font-size:10px;opacity:0.65;font-weight:600">CAC</span>${_tt('#ea580c', '#fed7aa', '#9a3412', '고객획득비용 (CAC)', 'Customer Acquisition Cost<br>= 광고비 ÷ 주문 건수<br><br>고객 한 명을 모으는 데 들어간 평균 광고비.<br>낮을수록 효율 좋음. AOV 가 CAC 보다 높아야 광고가 의미 있음.')} <span style="color:#ea580c;opacity:0.65;font-weight:500;font-size:10px">· ${periodLabelStr}</span></div>
    <div style="font-size:20px;font-weight:800;color:#ea580c;letter-spacing:-0.5px;margin-top:3px">₩${cac.toLocaleString()}</div>
    <div style="font-size:11px;color:#1e3a8a;font-weight:700;margin-top:6px">주문 ${totalOrderCount}건</div>
  </div>
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:14px;padding:18px 14px;text-align:center;box-shadow:0 8px 22px rgba(217,119,6,0.07),0 1px 3px rgba(15,23,42,0.04)">
    <div style="font-size:12px;color:#92400e;font-weight:700;letter-spacing:-0.1px;margin-bottom:8px">객단가 <span style="font-size:10px;opacity:0.65;font-weight:600">AOV</span>${_tt('#d97706', '#fde68a', '#92400e', '객단가 (AOV)', 'Average Order Value<br>= 매출 ÷ 주문 건수<br><br>주문 한 건당 평균 결제 금액.<br>AOV ÷ CAC 가 높을수록 광고로 들어온 고객이 비싼 객단가로 결제했다는 뜻.')} <span style="color:#d97706;opacity:0.65;font-weight:500;font-size:10px">· ${periodLabelStr}</span></div>
    <div style="font-size:20px;font-weight:800;color:#d97706;letter-spacing:-0.5px;margin-top:3px">₩${aov.toLocaleString()}</div>
    <div style="font-size:11px;color:#1e3a8a;font-weight:700;margin-top:6px">${cac > 0 && aov > 0 ? 'AOV/CAC ' + (aov/cac).toFixed(1) + '배' : '주문 ' + totalOrderCount + '건'}</div>
  </div>
  <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:18px 14px;text-align:center;box-shadow:0 8px 22px rgba(5,150,105,0.07),0 1px 3px rgba(15,23,42,0.04)">
    <div style="font-size:12px;color:#065f46;font-weight:700;letter-spacing:-0.1px;margin-bottom:8px">💰 주문당 순익${_tt('#059669', '#a7f3d0', '#065f46', '주문당 순익', '= AOV − 주문당 원가 − 주문당 수수료 − CAC<br>(= NET 마진 ÷ 주문 건수)<br><br>주문 1건이 들어올 때 실제로 회사에 남는 돈.<br>모든 비용이 반영된 <strong>한 줄 요약 지표</strong>입니다.<br><br>' + (profitPerOrder != null ? ('AOV ₩' + aov.toLocaleString() + '<br>− 원가 ₩' + _cogsPerOrder.toLocaleString() + '<br>− 수수료 ₩' + _feePerOrder.toLocaleString() + '<br>− CAC ₩' + cac.toLocaleString()) : '주문 데이터가 쌓이면 자동 계산됩니다.'))} <span style="color:#059669;opacity:0.65;font-weight:500;font-size:10px">· ${periodLabelStr}</span></div>
    <div style="font-size:20px;font-weight:800;color:${_ppoColor};letter-spacing:-0.5px;margin-top:3px">${profitPerOrder != null ? _ppoSign + '₩' + profitPerOrder.toLocaleString() : '-'}</div>
    <div style="font-size:11px;font-weight:700;margin-top:6px;color:${_ppoColor}">${profitPerOrder == null ? '주문 데이터 필요' : (profitPerOrder > 0 ? '🟢 주문마다 이만큼 남음' : (profitPerOrder < 0 ? '🔴 주문마다 이만큼 손해' : '본전'))}</div>
  </div>
  <div style="background:#f0f9ff;border:1px solid #e0f2fe;border-radius:14px;padding:18px 14px;text-align:center;box-shadow:0 8px 22px rgba(14,165,233,0.07),0 1px 3px rgba(15,23,42,0.04)">
    <div style="font-size:12px;color:#0c4a6e;font-weight:700;letter-spacing:-0.1px;margin-bottom:8px">이번달 vs 지난달${_tt('#0284c7', '#e0f2fe', '#0c4a6e', '이번달 vs 지난달', '이번 달과 지난 달 광고비 비교 (기간 필터 무관).<br><br>▲ 빨강 = 광고비 증가<br>▼ 초록 = 광고비 감소<br>(광고비는 줄어든 게 효율적)')}</div>
    <div style="font-size:20px;font-weight:800;color:#0c4a6e;letter-spacing:-0.5px;margin-top:3px">₩${thisMoAds.toLocaleString()}</div>
    <div style="font-size:11px;color:${momColor};margin-top:6px;font-weight:700">${momIcon} ${Math.abs(momPct).toFixed(1)}% (지난달 ₩${lastMoAds.toLocaleString()})</div>
  </div>
`;
}
