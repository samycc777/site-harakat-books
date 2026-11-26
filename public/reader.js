// Book page reading tools (hand-edited, defer):
// - Font size controls (أ− / أ+) in .actions, remembered in localStorage "fs" (applied before paint by theme.js).
// - Harakat-insensitive in-book search bar (#findbar), opened from .actions, floating #findbtn, or "/".
(function () {
  var art = document.querySelector('article.text');
  if (!art) return;

  var AR = '٠١٢٣٤٥٦٧٨٩';
  function arN(n) { return String(n).replace(/[0-9]/g, function (d) { return AR[d]; }); }

  // ---- Font size controls ----
  var STEPS = [0.8, 0.9, 1, 1.12, 1.25, 1.38, 1.5];
  var root = document.documentElement;
  function curScale() {
    var v = parseFloat(root.style.getPropertyValue('--fs'));
    return (v >= STEPS[0] && v <= STEPS[STEPS.length - 1]) ? v : 1;
  }
  function stepIndex(v) {
    var best = 2, diff = 9;
    for (var i = 0; i < STEPS.length; i++) {
      var d = Math.abs(STEPS[i] - v);
      if (d < diff) { diff = d; best = i; }
    }
    return best;
  }
  function anchorPara() {
    if (art.getBoundingClientRect().top > 0) return null;
    var ps = art.querySelectorAll(':scope > p, :scope > h2, :scope > h3');
    var lo = 0, hi = ps.length - 1;
    if (hi < 0) return null;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (ps[mid].getBoundingClientRect().bottom > 1) hi = mid; else lo = mid + 1;
    }
    var r = ps[lo].getBoundingClientRect();
    return { el: ps[lo], f: r.height ? Math.max(0, Math.min(1, -r.top / r.height)) : 0 };
  }
  var idx = stepIndex(curScale());
  var bDec, bInc;
  function setScale(newIdx) {
    newIdx = Math.max(0, Math.min(STEPS.length - 1, newIdx));
    if (newIdx === idx) return;
    var anc = anchorPara();
    idx = newIdx;
    var v = STEPS[idx];
    if (v === 1) {
      root.style.removeProperty('--fs');
      try { localStorage.removeItem('fs'); } catch (e) {}
    } else {
      root.style.setProperty('--fs', String(v));
      try { localStorage.setItem('fs', String(v)); } catch (e) {}
    }
    syncFsButtons();
    if (anc) {
      var r = anc.el.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + r.top + r.height * anc.f);
    }
  }
  function syncFsButtons() {
    if (bDec) bDec.disabled = idx <= 0;
    if (bInc) bInc.disabled = idx >= STEPS.length - 1;
  }

  var SEARCH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
  var actions = document.querySelector('.actions');
  if (actions) {
    var tools = document.createElement('div');
    tools.className = 'read-tools';
    tools.setAttribute('role', 'group');
    tools.setAttribute('aria-label', 'أدوات القراءة');
    bInc = document.createElement('button');
    bInc.type = 'button'; bInc.className = 'tool-btn'; bInc.textContent = 'أ+';
    bInc.setAttribute('aria-label', 'تكبير الخط'); bInc.title = 'تكبير الخط';
    bInc.onclick = function () { setScale(idx + 1); };
    bDec = document.createElement('button');
    bDec.type = 'button'; bDec.className = 'tool-btn'; bDec.textContent = 'أ−';
    bDec.setAttribute('aria-label', 'تصغير الخط'); bDec.title = 'تصغير الخط';
    bDec.onclick = function () { setScale(idx - 1); };
    var bFindTop = document.createElement('button');
    bFindTop.type = 'button'; bFindTop.className = 'tool-btn find-trigger';
    bFindTop.setAttribute('aria-label', 'بحث في الكتاب'); bFindTop.title = 'بحث في الكتاب (/)';
    bFindTop.innerHTML = SEARCH_SVG;
    bFindTop.onclick = function () { openFind(bFindTop); };
    tools.appendChild(bInc);
    tools.appendChild(bDec);
    tools.appendChild(bFindTop);
    var meta = actions.querySelector('.meta');
    if (meta) actions.insertBefore(tools, meta); else actions.appendChild(tools);
    syncFsButtons();
  }

  // ---- Floating search button in .fab ----
  var fabBtn = document.createElement('button');
  fabBtn.id = 'findbtn'; fabBtn.type = 'button';
  fabBtn.setAttribute('aria-label', 'بحث في الكتاب'); fabBtn.title = 'بحث في الكتاب (/)';
  fabBtn.innerHTML = SEARCH_SVG;
  fabBtn.onclick = function () { openFind(fabBtn); };
  var fab = (window.KM && window.KM.fab) ? window.KM.fab() : document.body;
  var totop = document.getElementById('totop');
  if (totop && totop.parentNode === fab) fab.insertBefore(fabBtn, totop); else fab.appendChild(fabBtn);
  var fabOn = false;
  function fabVis() {
    var v = scrollY > innerHeight * 0.6;
    if (v !== fabOn) { fabOn = v; fabBtn.classList.toggle('on', v); }
  }
  addEventListener('scroll', fabVis, { passive: true });
  fabVis();

  // ---- Harakat-insensitive in-book search ----
  var STRIP = /[\u064B-\u065F\u0670\u0640]/;
  var STRIP_G = /[\u064B-\u065F\u0670\u0640]/g;
  function normChar(ch) {
    if (STRIP.test(ch)) return '';
    if (ch === 'أ' || ch === 'إ' || ch === 'آ' || ch === 'ٱ') return 'ا';
    if (ch === 'ة') return 'ه';
    if (ch === 'ى') return 'ي';
    return ch.toLowerCase();
  }
  function normStr(s) {
    return s.replace(STRIP_G, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
  }

  var bar = null, input = null, cntEl = null, prevBtn = null, nextBtn = null, opener = null;
  var blocks = null;       // [{ el, text }] built lazily on first open
  var matches = [];        // [{ bi, start, end }]
  var curMatch = -1;
  var markedEls = [];      // elements currently containing <mark class="hit">
  var debounce = null;
  var MAX_ALL_MARKS = 300; // above this, highlight only the active block so 1-letter queries on 5MB books stay instant

  function textNodes(el) {
    var out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      var n = w.currentNode, p = n.parentNode;
      if (p && p.classList && p.classList.contains('nref')) continue;
      out.push(n);
    }
    return out;
  }
  function buildIndex() {
    if (blocks) return;
    blocks = [];
    var els = art.querySelectorAll('p, h2, h3, td, th, .tree .node');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.querySelector('p, h2, h3')) continue;
      var nodes = textNodes(el), s = '';
      for (var j = 0; j < nodes.length; j++) s += nodes[j].nodeValue;
      var n = normStr(s);
      if (n) blocks.push({ el: el, norm: n });
    }
  }

  function clearMarks() {
    for (var i = 0; i < markedEls.length; i++) {
      var el = markedEls[i];
      var ms = el.querySelectorAll('mark.hit');
      for (var j = 0; j < ms.length; j++) {
        var m = ms[j], p = m.parentNode;
        while (m.firstChild) p.insertBefore(m.firstChild, m);
        p.removeChild(m);
      }
      el.normalize();
    }
    markedEls = [];
  }

  // Highlight normalized ranges [{start, end, active}] inside a single block element while keeping harakat intact.
  function highlightBlock(el, ranges) {
    var nodes = textNodes(el);
    var map = []; // normalized index -> { node, start, end }
    for (var ni = 0; ni < nodes.length; ni++) {
      var node = nodes[ni], val = node.nodeValue, len = val.length;
      for (var ci = 0; ci < len; ci++) {
        var nc = normChar(val[ci]);
        if (!nc) {
          if (map.length && map[map.length - 1].node === node) map[map.length - 1].end = ci + 1;
          continue;
        }
        map.push({ node: node, start: ci, end: ci + 1 });
      }
    }
    // Group per-node slices to wrap in reverse document order so offsets stay valid.
    var slices = [];
    for (var ri = 0; ri < ranges.length; ri++) {
      var r = ranges[ri];
      if (r.start >= map.length || r.end > map.length || r.end <= r.start) continue;
      var curNode = null, sOff = 0, eOff = 0;
      for (var k = r.start; k < r.end; k++) {
        var entry = map[k];
        if (entry.node !== curNode) {
          if (curNode) slices.push({ node: curNode, start: sOff, end: eOff, active: r.active, mi: r.mi });
          curNode = entry.node; sOff = entry.start; eOff = entry.end;
        } else {
          eOff = entry.end;
        }
      }
      if (curNode) slices.push({ node: curNode, start: sOff, end: eOff, active: r.active, mi: r.mi });
    }
    var firstActive = null;
    for (var si = slices.length - 1; si >= 0; si--) {
      var sl = slices[si], tNode = sl.node;
      if (sl.end < tNode.nodeValue.length) tNode.splitText(sl.end);
      var mid = sl.start > 0 ? tNode.splitText(sl.start) : tNode;
      var mark = document.createElement('mark');
      mark.className = sl.active ? 'hit cur' : 'hit';
      mark.dataset.mi = String(sl.mi);
      mid.parentNode.insertBefore(mark, mid);
      mark.appendChild(mid);
      if (sl.active) firstActive = mark;
    }
    if (slices.length) markedEls.push(el);
    return firstActive;
  }

  function renderMatch(scroll) {
    if (!matches.length) {
      clearMarks();
      cntEl.textContent = input.value.trim() ? '٠' : '';
      prevBtn.disabled = nextBtn.disabled = true;
      return;
    }
    prevBtn.disabled = nextBtn.disabled = matches.length < 2;
    cntEl.textContent = arN(curMatch + 1) + ' / ' + arN(matches.length);

    var targetEl = null;
    if (matches.length <= MAX_ALL_MARKS && markedEls.length) {
      var prev = art.querySelectorAll('mark.hit.cur');
      for (var i = 0; i < prev.length; i++) prev[i].classList.remove('cur');
      var curMarks = art.querySelectorAll('mark.hit[data-mi="' + curMatch + '"]');
      for (var j = 0; j < curMarks.length; j++) curMarks[j].classList.add('cur');
      targetEl = curMarks[0] || blocks[matches[curMatch].bi].el;
    } else {
      clearMarks();
      if (matches.length <= MAX_ALL_MARKS) {
        var byBlock = {};
        for (var k = 0; k < matches.length; k++) {
          var m = matches[k];
          (byBlock[m.bi] = byBlock[m.bi] || []).push({ start: m.start, end: m.end, active: k === curMatch, mi: k });
        }
        for (var bi in byBlock) {
          var hit = highlightBlock(blocks[bi].el, byBlock[bi]);
          if (hit) targetEl = hit;
        }
      } else {
        var am = matches[curMatch];
        var same = [];
        for (var k2 = 0; k2 < matches.length; k2++) {
          if (matches[k2].bi === am.bi) same.push({ start: matches[k2].start, end: matches[k2].end, active: k2 === curMatch, mi: k2 });
        }
        targetEl = highlightBlock(blocks[am.bi].el, same) || blocks[am.bi].el;
      }
    }
    if (scroll && targetEl) {
      var rect = targetEl.getBoundingClientRect();
      var barH = bar ? bar.offsetHeight + 18 : 64;
      window.scrollTo({ top: window.scrollY + rect.top - Math.max(barH, innerHeight * 0.25), behavior: 'auto' });
    }
  }

  function runSearch(scroll) {
    buildIndex();
    clearMarks();
    matches = [];
    curMatch = -1;
    var q = normStr(input.value).trim();
    if (!q) { renderMatch(false); return; }
    var qLen = q.length;
    for (var bi = 0; bi < blocks.length; bi++) {
      var txt = blocks[bi].norm, pos = 0, at;
      while ((at = txt.indexOf(q, pos)) !== -1) {
        matches.push({ bi: bi, start: at, end: at + qLen });
        pos = at + qLen;
      }
    }
    if (matches.length) {
      // Pick the first match at or below the current viewport top
      curMatch = 0;
      for (var i = 0; i < matches.length; i++) {
        if (blocks[matches[i].bi].el.getBoundingClientRect().bottom > 60) { curMatch = i; break; }
      }
    }
    renderMatch(scroll);
  }

  function step(dir) {
    if (!matches.length) return;
    curMatch = (curMatch + dir + matches.length) % matches.length;
    renderMatch(true);
  }

  function buildBar() {
    if (bar) return;
    bar = document.createElement('div');
    bar.id = 'findbar'; bar.hidden = true; bar.setAttribute('role', 'search');
    bar.innerHTML =
      '<input type="search" placeholder="بحث في الكتاب" aria-label="بحث في الكتاب" autocomplete="off">' +
      '<span class="cnt" aria-live="polite"></span>' +
      '<button type="button" class="nav prev" aria-label="السابق" title="السابق (Shift+Enter)" disabled>▲</button>' +
      '<button type="button" class="nav next" aria-label="التالي" title="التالي (Enter)" disabled>▼</button>' +
      '<button type="button" class="x" aria-label="إغلاق" title="إغلاق (Esc)">×</button>';
    document.body.appendChild(bar);
    input = bar.querySelector('input');
    cntEl = bar.querySelector('.cnt');
    prevBtn = bar.querySelector('.prev');
    nextBtn = bar.querySelector('.next');
    prevBtn.onclick = function () { step(-1); };
    nextBtn.onclick = function () { step(1); };
    bar.querySelector('.x').onclick = function () { closeFind(true); };
    input.addEventListener('input', function () {
      clearTimeout(debounce);
      if (!input.value.trim()) { runSearch(false); return; }
      debounce = setTimeout(function () { runSearch(true); }, 120);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(debounce);
        if (!matches.length && input.value.trim()) runSearch(true);
        else step(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeFind(true);
      }
    });
  }

  function openFind(fromEl) {
    buildBar();
    document.dispatchEvent(new CustomEvent('km:pop', { detail: 'find' }));
    opener = fromEl || document.activeElement;
    bar.hidden = false;
    input.focus();
    input.select();
    if (input.value.trim() && !matches.length) runSearch(false);
  }
  function closeFind(focusOpener) {
    if (!bar || bar.hidden) return;
    clearTimeout(debounce);
    clearMarks();
    matches = []; curMatch = -1;
    bar.hidden = true;
    if (focusOpener && opener && typeof opener.focus === 'function') opener.focus();
  }

  document.addEventListener('km:pop', function (e) { if (e.detail !== 'find' && bar && !bar.hidden) closeFind(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && bar && !bar.hidden) { closeFind(true); return; }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var t = document.activeElement, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
      e.preventDefault();
      openFind(t);
    }
  });
})();
