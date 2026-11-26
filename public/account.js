// Reading progress + reader accounts (hand-edited; on every page, before progress.js).
// - Progress of each book lives in this browser: localStorage "reading" = {slug: {s, p, d, t}}
//   (s = place "paragraph:fraction" for progress.js, p = 0..1 how far, d = read to the end, t = time).
// - Signed in with Google (functions/api/auth.js), the same data is kept on the server
//   (functions/api/progress.js, D1): merged on every page load, newest wins, sent while reading.
// - Home page and author pages: a thin bar + «٪» under each started book; the home page also gets
//   «متابعة القراءة» (the last books opened and not finished) above «أُضيفت حديثًا».
// - Header: round account button next to the moon (hidden until sign-in is set up on the server).
(function () {
  var KEY = 'reading', ACCT = 'acct', READY = 'acct-ready';
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var store = {};
  try { store = JSON.parse(ls.get(KEY) || '{}') || {}; } catch (e) { store = {}; }
  // places saved before this file existed ("place-<slug>" = "i:f"); t = 0 so any newer copy wins
  try {
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && k.indexOf('place-') === 0) {
        var slug = k.slice(6);
        if (!store[slug]) store[slug] = { s: localStorage.getItem(k), p: null, d: 0, t: 0 };
        localStorage.removeItem(k);
      }
    }
  } catch (e) {}
  function save() { ls.set(KEY, JSON.stringify(store)); }
  save();

  var user = null;
  try { user = JSON.parse(ls.get(ACCT) || 'null'); } catch (e) {}
  var dirty = {}, timer = null;

  function post(items, keepalive) {
    return fetch('/api/progress', { method: 'POST', credentials: 'same-origin', keepalive: !!keepalive,
      headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ items: items }) });
  }
  function flush(keepalive) {
    clearTimeout(timer); timer = null;
    if (!user) { dirty = {}; return; }
    var items = {}, n = 0;
    for (var s in dirty) if (store[s]) { items[s] = store[s]; n++; }
    dirty = {};
    if (n) post(items, keepalive).catch(function () {});
  }

  function ensureFab() {
    var f = document.getElementById('fab');
    if (!f) {
      f = document.createElement('div');
      f.id = 'fab';
      document.body.appendChild(f);
    }
    return f;
  }

  var KM = window.KM = {
    get: function (slug) { return store[slug] || null; },
    all: function () { return store; },
    put: function (slug, e) {
      e.t = Date.now();
      store[slug] = e; save();
      if (user) { dirty[slug] = 1; if (!timer) timer = setTimeout(flush, 15000); }
    },
    flush: flush,
    signedIn: function () { return !!user; },
    render: render,
    fab: ensureFab
  };
  addEventListener('pagehide', function () { flush(true); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); });

  function changed() {
    render();
    document.dispatchEvent(new CustomEvent('km:reading'));
  }
  function sync() {
    if (!user) return Promise.resolve();
    return fetch('/api/progress', { credentials: 'same-origin' }).then(function (r) {
      if (r.status === 401) { setUser(null); throw 0; }
      return r.json();
    }).then(function (d) {
      var srv = d.items || {}, up = {}, n = 0, got = false;
      for (var s in srv) if (!store[s] || srv[s].t > store[s].t) { store[s] = srv[s]; got = true; }
      for (var s2 in store) if (!srv[s2] || store[s2].t > srv[s2].t) { up[s2] = store[s2]; n++; }
      if (got) { save(); changed(); }
      if (n) return post(up);
    }).catch(function () {});
  }

  // ---- progress on the book lists ----
  var AR = '٠١٢٣٤٥٦٧٨٩';
  function arN(n) { return String(n).replace(/[0-9]/g, function (d) { return AR[d]; }); }
  function slugOf(li) {
    var a = li.querySelector('.info h3 a');
    var m = a && a.getAttribute('href').match(/([a-z0-9-]+)\/$/);
    return m && m[1];
  }
  function started(e) { return e && (e.d || e.p > 0 || (e.p == null && e.s)); }
  function bar(e) {
    var full = e.p == null ? null : (e.p >= 0.99 || (e.d && !(e.p > 0)) ? 1 : e.p);
    var div = document.createElement('div');
    div.className = 'prog' + (full === 1 ? ' done' : '');
    if (full != null) {
      var pct = Math.max(1, Math.round(full * 100));
      div.innerHTML = '<span class="track"><i style="width:' + pct + '%"></i></span><span class="pct">' + (full === 1 ? '✓' : arN(pct) + '٪') + '</span>';
    }
    return div;
  }
  function render() {
    var lis = document.querySelectorAll('li.book'), first = {};
    if (!lis.length) return;
    for (var i = 0; i < lis.length; i++) {
      var li = lis[i], slug = slugOf(li), old = li.querySelector('.prog');
      if (old) old.remove();
      if (!slug) continue;
      if (!li.closest('#reading') && (!first[slug] || li.closest('section.v-author'))) first[slug] = li;
      var e = store[slug];
      if (started(e) && e.p != null) li.querySelector('.info').appendChild(bar(e));
    }
    readingSection(first);
    if (window.applyFilter) window.applyFilter();
  }
  // «متابعة القراءة» on the home page: up to 6 books opened most recently and not finished
  function readingSection(first) {
    var nav = document.querySelector('nav.authors');
    var sec = document.getElementById('reading');
    if (!nav || !document.querySelector('.views [data-view]')) return;  // home page only
    var list = Object.keys(store).filter(function (s) {
      var e = store[s]; return first[s] && started(e) && !(e.p >= 0.99) && !(e.d && !(e.p > 0));
    }).sort(function (a, b) { return store[b].t - store[a].t; }).slice(0, 6);
    if (!list.length) { if (sec) sec.remove(); return; }
    if (!sec) {
      sec = document.createElement('section');
      sec.className = 'recent'; sec.id = 'reading';
      sec.innerHTML = '<details open><summary><h2>متابعة القراءة <span></span></h2></summary><ul></ul></details>';
      var d = sec.querySelector('details');
      if (ls.get('fold-reading') === '1') d.open = false;
      d.addEventListener('toggle', function () { ls.set('fold-reading', d.open ? '0' : '1'); });
      var before = document.querySelector('section.recent') || nav;
      before.parentNode.insertBefore(sec, before);
    }
    var ul = sec.querySelector('ul');
    ul.textContent = '';
    for (var i = 0; i < list.length; i++) {
      var li = first[list[i]].cloneNode(true), from = first[list[i]].closest('section.v-author'), meta = li.querySelector('.meta');
      li.removeAttribute('hidden');
      if (from && meta) meta.insertBefore(document.createTextNode(from.querySelector('h2').textContent.trim() + ' · '), meta.firstChild);  // whose book
      ul.appendChild(li);
    }
    sec.querySelector('h2 > span').textContent = '(' + arN(list.length) + ')';
  }

  // ---- account button ----
  var PERSON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.4-6 8-6s6.8 2 8 6"/></svg>';
  var btn, pop, clientId = null, gisLoading = false;
  function setUser(u) {
    user = u;
    if (u) ls.set(ACCT, JSON.stringify(u)); else ls.del(ACCT);
    drawButton();
    if (pop && !pop.hidden) drawPop();
  }
  function drawButton() {
    if (!btn) return;
    btn.textContent = '';
    if (user && user.pic && /^https?:\/\//.test(user.pic)) {
      var img = document.createElement('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.src = user.pic;
      img.onerror = function () { btn.innerHTML = PERSON; };
      btn.appendChild(img);
    } else {
      btn.innerHTML = PERSON;
    }
    var l = user ? (user.name || 'الحساب') : 'تسجيل الدخول';
    btn.setAttribute('aria-label', l); btn.title = l;
    btn.classList.toggle('in', !!user);
  }
  function closePop(focusBtn) {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      if (focusBtn) btn.focus();
    }
  }
  function drawPop() {
    pop.textContent = '';
    if (user) {
      var who = document.createElement('p');
      who.className = 'who';
      who.textContent = user.name || '';
      var out = document.createElement('button');
      out.type = 'button'; out.className = 'btn light'; out.textContent = 'تسجيل الخروج';
      out.onclick = function () {
        flush();
        fetch('/api/auth', { method: 'DELETE', credentials: 'same-origin' }).finally(function () { setUser(null); closePop(true); });
      };
      pop.appendChild(who); pop.appendChild(out);
    } else {
      var g = document.createElement('div');
      g.className = 'gbtn';
      pop.appendChild(g);
      withGis(function () {
        google.accounts.id.renderButton(g, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'ar', width: 240 });
      });
    }
  }
  function withGis(f) {
    if (window.google && google.accounts && google.accounts.id) return f();
    document.addEventListener('km:gis', f, { once: true });
    if (gisLoading) return;
    gisLoading = true;
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client?hl=ar'; s.async = true;
    s.onload = function () {
      google.accounts.id.initialize({ client_id: clientId, callback: signedIn, ux_mode: 'popup', auto_select: false, itp_support: true });
      document.dispatchEvent(new CustomEvent('km:gis'));
    };
    document.head.appendChild(s);
  }
  function signedIn(r) {
    fetch('/api/auth', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: r.credential }) })
      .then(function (x) { return x.json(); })
      .then(function (d) {
        if (!d.ok) return;
        setUser(d.user); closePop(false);
        sync();
      }).catch(function () {});
  }
  function setupButton() {
    btn = document.getElementById('acct');
    if (!btn) return;
    btn.setAttribute('aria-expanded', 'false');
    if (ls.get(READY) === '1') btn.hidden = false;
    drawButton();
    pop = document.createElement('div');
    pop.id = 'acct-pop'; pop.hidden = true;
    btn.parentNode.appendChild(pop);
    document.addEventListener('km:pop', function (ev) { if (ev.detail !== 'acct') closePop(false); });
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (!pop.hidden) return closePop(false);
      document.dispatchEvent(new CustomEvent('km:pop', { detail: 'acct' }));
      pop.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      drawPop();
    });
    document.addEventListener('click', function (ev) { if (!pop.hidden && !pop.contains(ev.target)) closePop(false); });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !pop.hidden) closePop(true); });
    fetch('/api/auth', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ready) { btn.hidden = true; ls.del(READY); if (user) setUser(null); return; }
      clientId = d.clientId; ls.set(READY, '1'); btn.hidden = false;
      if (!d.user && user) setUser(null);       // cookie gone or expired
      else if (d.user) { var was = !!user; setUser(d.user); if (!was) sync(); }
    }).catch(function () {});
  }

  // round ↑ button on long pages (lists, books, ibtida), shown after scrolling down
  function toTop() {
    var b = document.createElement('button');
    b.id = 'totop'; b.type = 'button'; b.setAttribute('aria-label', 'أعلى الصفحة'); b.title = 'أعلى الصفحة';
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    b.onclick = function () { scrollTo({ top: 0, behavior: 'smooth' }); };
    ensureFab().appendChild(b);
    var on = false;
    function vis() {
      var v = scrollY > innerHeight * 1.5;
      if (v !== on) { on = v; b.classList.toggle('on', v); }
    }
    addEventListener('scroll', vis, { passive: true });
    vis();
  }

  function start() {
    toTop();
    render();
    setupButton();
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
