/* RENIV ERP — NEXUS theme helper (visual only).
   Keeps the selected day chip visible in the compact one-line date bars. No data access. */
(function () {
  var ROOTS = ['metaads-root', 'googleads-root', 'compads-root', 'gcompads-root', 'refads-root', 'mrefads-root'];
  function selectedChip(bar) {
    var btns = bar.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var s = btns[i].getAttribute('style') || '';
      if (/background:\s*(#2563eb|rgb\(37, 99, 235\))/i.test(s)) return btns[i];
    }
    return btns[btns.length - 1] || null;
  }
  function align() {
    for (var i = 0; i < ROOTS.length; i++) {
      var root = document.getElementById(ROOTS[i]);
      if (!root || !root.firstElementChild) continue;
      var bar = root.firstElementChild.querySelector('div[style*="width:100%"]');
      if (!bar || bar.dataset.nxAligned === bar.childElementCount + ':' + (selectedChip(bar) || {}).title) continue;
      var chip = selectedChip(bar);
      if (chip) bar.scrollLeft = Math.max(0, chip.offsetLeft - bar.offsetLeft - bar.clientWidth + chip.offsetWidth + 8);
      bar.dataset.nxAligned = bar.childElementCount + ':' + (chip || {}).title;
    }
  }
  document.addEventListener('wheel', function (e) {
    var bar = e.target && e.target.closest && e.target.closest('#' + ROOTS.join('>div:first-child div[style*="width:100%"], #') + '>div:first-child div[style*="width:100%"]');
    if (!bar || bar.scrollWidth <= bar.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    bar.scrollLeft += e.deltaY; e.preventDefault();
  }, {passive: false});
  var pending = false;
  function schedule() { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; align(); }); }
  function start() {
    var target = document.getElementById('content') || document.body;
    new MutationObserver(schedule).observe(target, {childList: true, subtree: true});
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* NEXUS deep links (navigation only, no data writes):
   ?view=pay          -> 결재 관리 · 지출 결의서 (이번 달 지급 예정)
   ?view=sales-yday   -> 판매 관리 · 매출 분석, 일별 = 어제(KST)
   ?view=sales-month  -> 판매 관리 · 매출 분석, 월별 = 이번 달(KST) */
(function () {
  var view = null;
  try { view = new URLSearchParams(location.search).get('view'); } catch (_) {}
  if (!/^(pay|sales-yday|sales-month)$/.test(view || '')) return;
  var started = Date.now();
  function kst(offsetDays) { return new Date(Date.now() + 9 * 3600e3 + (offsetDays || 0) * 86400e3).toISOString().slice(0, 10); }
  function setPeriod(mode, value) {
    var blk = document.querySelector('.period-filter[data-prefix="sd"]'); if (!blk) return false;
    var sel = blk.querySelector('.period-mode'); sel.value = mode; window._periodOnChange('sd');
    var inp = blk.querySelector(mode === 'day' ? '.period-day' : '.period-month'); if (inp) { inp.value = value; window._periodOnChange('sd'); }
    return true;
  }
  function run() {
    if (view === 'pay') { window.go('approval'); window.switchApprovalTab('expense'); return; }
    window.go('sales');
    setTimeout(function () {
      window.switchSalesTab('dashboard');
      setTimeout(function () { if (view === 'sales-yday') setPeriod('day', kst(-1)); else setPeriod('month', kst(0).slice(0, 7)); }, 150);
    }, 30);
  }
  function tick() {
    var ready = window._currentUser && typeof window.go === 'function' && typeof window.switchSalesTab === 'function'
      && typeof window._periodOnChange === 'function' && (typeof _firestoreDataLoaded === 'undefined' || _firestoreDataLoaded === true);
    if (ready) {
      try { history.replaceState(null, '', location.pathname); } catch (_) {}
      // ERP may switch back to 업무 현황 after its own startup; keep the requested screen for ~12s
      var want = view === 'pay' ? 'page-approval' : 'page-sales', tries = 0;
      var shown = function () { var p = document.getElementById(want); return p && p.offsetParent !== null && (view !== 'pay' || window._apCurrentTab === undefined || window._apCurrentTab === 'expense'); };
      var guard = function () {
        if (!shown()) { try { run(); } catch (e) { console.warn('[nexus-theme] view link failed', e); } }
        if (++tries < 24) setTimeout(guard, 500);
      };
      setTimeout(function () { try { run(); } catch (e) {} setTimeout(guard, 500); }, 300);
      document.addEventListener('click', function stop(ev) { if (ev.isTrusted) { tries = 99; document.removeEventListener('click', stop, true); } }, true);
      return;
    }
    if (Date.now() - started < 30000) setTimeout(tick, 200);
  }
  tick();
})();
