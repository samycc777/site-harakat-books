// Reading place: on each book page, the paragraph at the top of the screen is remembered (account.js:
// localStorage "reading", and the reader's account when signed in) while reading; opening the book
// again scrolls back to it. Saved as paragraph number + how far into it, so it still fits after a font
// or screen-size change, plus how far through the book (p, 0..1) for the bars on the book lists, and
// d = 1 once the end was reached. A thin bar at the top of the screen shows how far the reader is.
// A link with #… (a heading) is left alone; back at the title forgets the place (but not "finished").
(function () {
  var art = document.querySelector('article.text');
  if (!art || !window.KM) return;
  var slug = location.pathname.replace(/^\/|\/$/g, '');
  var paras = art.querySelectorAll(':scope > p, :scope > h2, :scope > h3');
  if (paras.length < 2) return;

  var line = document.createElement('div');
  line.id = 'readbar';
  line.innerHTML = '<i></i>';
  document.body.appendChild(line);

  function top() {  // first paragraph whose bottom is below the screen's top
    var lo = 0, hi = paras.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (paras[mid].getBoundingClientRect().bottom > 1) hi = mid; else lo = mid + 1;
    }
    return lo;
  }
  function far() {  // 0 at the start of the text, 1 when its end is on screen
    var r = art.getBoundingClientRect();
    var h = r.height - innerHeight;
    return h <= 0 ? 1 : Math.max(0, Math.min(1, -r.top / h));
  }
  function drawBar() {
    var r = art.getBoundingClientRect();
    line.firstChild.style.width = (r.top > 0 ? 0 : far() * 100) + '%';
  }

  function store() {
    var old = KM.get(slug) || {};
    var p = far(), done = old.d || p >= 0.99 ? 1 : 0;
    if (art.getBoundingClientRect().top > 0) {  // back at the title
      if (old.s || old.p) KM.put(slug, { s: '', p: 0, d: done, t: 0 });
      return;
    }
    var i = top(), r = paras[i].getBoundingClientRect();
    var f = r.height ? Math.max(0, Math.min(1, -r.top / r.height)) : 0;
    KM.put(slug, { s: i + ':' + f.toFixed(3), p: +p.toFixed(3), d: done, t: 0 });
  }
  var timer;
  function save() { clearTimeout(timer); timer = setTimeout(store, 300); }

  var moved = false, goingBack = false;
  function restore() {
    if (moved || location.hash) return;
    var e = KM.get(slug), m = e && e.s && e.s.match(/^(\d+):([\d.]+)$/);
    if (!m) return;
    var p = paras[Math.min(+m[1], paras.length - 1)], r = p.getBoundingClientRect();
    goingBack = true;
    window.scrollTo(0, window.scrollY + r.top + r.height * +m[2]);
    setTimeout(function () { goingBack = false; drawBar(); }, 100);
  }

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  restore();
  // Fonts arriving late change the layout: go back again unless the reader has already scrolled.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(restore);
  window.addEventListener('load', restore);
  // the place from the account (another device) arrived after the page opened
  document.addEventListener('km:reading', restore);
  window.addEventListener('scroll', function () {
    drawBar();
    if (goingBack) return;
    moved = true;
    save();
  }, { passive: true });
  window.addEventListener('pagehide', function () { if (moved) { clearTimeout(timer); store(); KM.flush(true); } });
  drawBar();
})();
