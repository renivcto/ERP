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
   ?view=sales-month  -> 판매 관리 · 매출 분석, 월별 = 이번 달(KST)
   ERP's own startup (doRender) calls go('dashboard') when the data loader finishes, which can be
   long after this script runs. So we (1) redirect that startup go('dashboard') to the target page,
   (2) re-apply the target until the loader is gone and the screen is stable, (3) stop as soon as
   the user clicks anything. */
(function () {
  var view = null;
  try { view = new URLSearchParams(location.search).get('view'); } catch (_) {}
  if (!/^(pay|sales-yday|sales-month|unpaid-nonpo|unpaid-expense)$/.test(view || '')) return;
  try { history.replaceState(null, '', location.pathname); } catch (_) {}
  var unpaid = /^unpaid-/.test(view) ? view.slice(7) : null;
  var page = (view === 'pay' || unpaid) ? 'approval' : 'sales', want = 'page-' + page;
  var active = true, started = Date.now(), stableSince = 0, startupSeen = 0;
  function kst(d) { return new Date(Date.now() + 9 * 3600e3 + (d || 0) * 86400e3).toISOString().slice(0, 10); }
  var dbg = window.__nxViewDbg = [];
  function log(m) { try { dbg.push(Math.round((Date.now() - started) / 100) / 10 + 's ' + m); } catch (_) {} }
  function stop(why) { if (active) log('stop ' + (why || '')); active = false; }
  document.addEventListener('pointerdown', function (ev) { if (ev.isTrusted) stop('pointer'); }, true);
  document.addEventListener('keydown', function (ev) { if (ev.isTrusted) stop('key ' + ev.key); }, true);
  // (1) intercept the startup jump to 업무 현황
  var wrapped = false;
  function wrapGo() {
    if (wrapped || typeof window.go !== 'function') return;
    var orig = window.go; wrapped = true;
    window.go = function (p) {
      // while active, any programmatic page change (ERP startup restore / dashboard) is redirected to the target
      log('go ' + p + (active ? ' (active)' : ''));
      if (active && p !== page) { var r = orig.call(this, page); setTimeout(applyDetail, 60); return r; }
      return orig.apply(this, arguments);
    };
    if (typeof window.renderDashboard === 'function') {
      var rd = window.renderDashboard;
      window.renderDashboard = function () { if (active) startupSeen = Date.now(); return rd.apply(this, arguments); };
    }
  }
  function setPeriod(mode, value) {
    var blk = document.querySelector('.period-filter[data-prefix="sd"]'); if (!blk || typeof window._periodOnChange !== 'function') return;
    var sel = blk.querySelector('.period-mode'); var inp = blk.querySelector(mode === 'day' ? '.period-day' : '.period-month');
    if (sel.value === mode && inp && inp.value === value) return;
    sel.value = mode; window._periodOnChange('sd'); if (inp) { inp.value = value; window._periodOnChange('sd'); }
  }
  function applyDetail() {
    try {
      if (unpaid) {
        // 결재 관리 (일반 결재 / 지출 결의서 탭) + 미결재 모아보기 팝업, matching chip selected
        if (window._apCurrentTab !== unpaid && typeof window.switchApprovalTab === 'function') window.switchApprovalTab(unpaid);
        var ov = document.getElementById('unpaid-unified-overlay');
        if (!ov && typeof window.openUnpaidUnifiedView === 'function') window.openUnpaidUnifiedView();
        if (typeof window._setUnpaidFilter === 'function') window._setUnpaidFilter(unpaid);
        return;
      }
      if (view === 'pay') { if (window._apCurrentTab !== 'expense' && typeof window.switchApprovalTab === 'function') window.switchApprovalTab('expense'); return; }
      var dash = document.getElementById('sales-panel-dashboard');
      if ((!dash || dash.style.display === 'none') && typeof window.switchSalesTab === 'function') window.switchSalesTab('dashboard');
      setTimeout(function () { if (view === 'sales-yday') setPeriod('day', kst(-1)); else setPeriod('month', kst(0).slice(0, 7)); }, 120);
    } catch (e) { console.warn('[nexus-theme] view detail failed', e); }
  }
  function shown() { var p = document.getElementById(want); return !!(p && p.offsetParent !== null); }
  // (2) keep the target until the ERP finished loading and stayed put for 4s (max 3 min)
  function tick() {
    if (!active) return;
    wrapGo();
    var ready = window._currentUser && typeof window.go === 'function';
    var loading = !!document.getElementById('erp-loader');
    if (ready) {
      if (!shown()) { try { window.go(page); } catch (_) {} setTimeout(applyDetail, 60); stableSince = 0; }
      else if (!stableSince) { applyDetail(); stableSince = Date.now(); }
      var loaded = typeof _firestoreDataLoaded === 'undefined' || _firestoreDataLoaded === true;
      // ERP re-runs its startup (fast path, then after the Firestore merge) at unpredictable times,
      // so the target is held until the user touches the page or 60s pass.
      void loading; void loaded;
    }
    if (Date.now() - started > 60000) { stop('timeout'); return; }
    setTimeout(tick, 400);
  }
  tick();
})();

/* Sidebar: when a sub-menu opens on a short screen, scroll it into view (scrollbar itself is hidden) */
(function () {
  document.addEventListener('click', function (e) {
    var item = e.target && e.target.closest && e.target.closest('#sidebar .nav-group > .nav-item');
    if (!item) return;
    setTimeout(function () {
      var sub = item.nextElementSibling;
      if (sub && sub.classList.contains('nav-sub') && sub.classList.contains('open')) {
        var sb = document.getElementById('sidebar'); if (!sb || sb.scrollHeight <= sb.clientHeight) return;
        var r = sub.getBoundingClientRect(), s = sb.getBoundingClientRect(), bottom = r.bottom + 8;
        if (bottom > s.bottom) sb.scrollTop += Math.min(bottom - s.bottom, item.getBoundingClientRect().top - s.top - 4);
      }
    }, 320);
  });
})();
