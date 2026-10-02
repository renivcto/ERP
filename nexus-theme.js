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
