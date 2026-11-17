// Reading place: on each book page, the paragraph at the top of the screen is remembered in this
// browser (localStorage "place-<slug>") while reading; opening the book again scrolls back to it.
// Saved as paragraph number + how far into it, so it still fits after a font or screen-size change.
// A link with #… (a heading) or a place near the top of the book is left alone.
(function () {
  var art = document.querySelector('article.text');
  if (!art) return;
  var key = 'place-' + location.pathname.replace(/^\/|\/$/g, '');
  var paras = art.querySelectorAll(':scope > p, :scope > h2, :scope > h3');
  if (paras.length < 2) return;

  function top() {  // first paragraph whose bottom is below the screen's top
    var lo = 0, hi = paras.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (paras[mid].getBoundingClientRect().bottom > 1) hi = mid; else lo = mid + 1;
    }
    return lo;
  }

  function store() {
    var i = top(), r = paras[i].getBoundingClientRect();
    var f = r.height ? Math.max(0, Math.min(1, -r.top / r.height)) : 0;
    try {
      if (art.getBoundingClientRect().top > 0) localStorage.removeItem(key);  // back at the title
      else localStorage.setItem(key, i + ':' + f.toFixed(3));
    } catch (e) {}
  }
  var timer;
  function save() { clearTimeout(timer); timer = setTimeout(store, 300); }

  var moved = false, goingBack = false;
  function restore() {
    if (moved || location.hash) return;
    var v; try { v = localStorage.getItem(key); } catch (e) {}
    var m = v && v.match(/^(\d+):([\d.]+)$/);
    if (!m) return;
    var p = paras[Math.min(+m[1], paras.length - 1)], r = p.getBoundingClientRect();
    goingBack = true;
    window.scrollTo(0, window.scrollY + r.top + r.height * +m[2]);
    setTimeout(function () { goingBack = false; }, 100);
  }

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  restore();
  // Fonts arriving late change the layout: go back again unless the reader has already scrolled.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(restore);
  window.addEventListener('load', restore);
  window.addEventListener('scroll', function () {
    if (goingBack) return;
    moved = true;
    save();
  }, { passive: true });
  window.addEventListener('pagehide', function () { if (moved) { clearTimeout(timer); store(); } });
})();
