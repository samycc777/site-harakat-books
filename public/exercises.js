// Interactive workbook for books with «تمارين» / «تمرين» sections (hand-edited, defer, before progress.js).
// - Turns blanks (..........), empty table cells (...), (✓)/(×) items, multiple-choice parentheses,
//   underline/circle prompts, vowelization prompts, and open i'rab prompts into interactive controls.
// - Auto-saves in localStorage ("ex:<slug>") and syncs per-field (newest timestamp wins) to /api/exercises
//   when signed in with Google (account.js).
// - Shows a compact floating harakat bar (َ ُ ِ ْ ّ ً ٌ ٍ) when typing in any exercise field.
// - Never wraps or removes <p>/<h2> elements directly under article.text so progress.js indices stay intact.
(function () {
  var art = document.querySelector('article.text');
  if (!art) return;

  var slug = location.pathname.replace(/^\/|\/$/g, '');
  var STORE_KEY = 'ex:' + slug;
  var AR_DIG = '٠١٢٣٤٥٦٧٨٩';
  function arN(n) { return String(n).replace(/[0-9]/g, function (d) { return AR_DIG[d]; }); }
  function bare(s) { return String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/\s+/g, ' ').trim(); }

  // ---- Storage + Google account sync ----
  var store = {};
  try { store = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { store = {}; }
  var dirty = {}, saveTimer = null, syncTimer = null;
  var controls = {};       // id -> { get, set, isFilled, section }
  var sections = [];       // [{ fields: [id], countEl, clearBtn }]

  function persistLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  }
  function scheduleLocal() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistLocal, 150);
  }
  function isSignedIn() { return !!(window.KM && window.KM.signedIn && window.KM.signedIn()); }

  function postSync(items, keepalive) {
    return fetch('/api/exercises', {
      method: 'POST', credentials: 'same-origin', keepalive: !!keepalive,
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ slug: slug, items: items })
    });
  }
  function flushSync(keepalive) {
    clearTimeout(syncTimer); syncTimer = null;
    if (!isSignedIn()) { dirty = {}; return; }
    var items = {}, n = 0;
    for (var k in dirty) if (store[k]) { items[k] = store[k]; n++; }
    dirty = {};
    if (n) postSync(items, keepalive).catch(function () {});
  }
  function pullSync() {
    if (!isSignedIn()) return;
    fetch('/api/exercises?slug=' + encodeURIComponent(slug), { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return;
        var srv = d.items || {}, up = {}, n = 0, got = false;
        for (var k in srv) {
          if (!store[k] || srv[k].t > store[k].t) {
            store[k] = srv[k]; got = true;
            if (controls[k]) controls[k].set(srv[k].v);
          }
        }
        for (var k2 in store) {
          if (!srv[k2] || store[k2].t > srv[k2].t) { up[k2] = store[k2]; n++; }
        }
        if (got) { persistLocal(); updateAllCounts(); }
        if (n) postSync(up).catch(function () {});
      }).catch(function () {});
  }

  function record(id, val, immediate) {
    store[id] = { v: val, t: Date.now() };
    if (immediate) { clearTimeout(saveTimer); persistLocal(); } else scheduleLocal();
    if (isSignedIn()) {
      dirty[id] = 1;
      clearTimeout(syncTimer);
      syncTimer = setTimeout(flushSync, 4000);
    }
    var ctrl = controls[id];
    if (ctrl) updateSectionCount(ctrl.section);
  }

  function register(sec, id, ctrl) {
    ctrl.section = sec;
    controls[id] = ctrl;
    sec.fields.push(id);
    if (store[id] && store[id].v !== undefined) ctrl.set(store[id].v);
  }

  function updateSectionCount(sec) {
    var total = sec.fields.length, done = 0;
    for (var i = 0; i < total; i++) {
      var c = controls[sec.fields[i]];
      if (c && c.isFilled()) done++;
    }
    sec.countEl.textContent = done ? (arN(done) + ' / ' + arN(total)) : '';
    sec.countEl.classList.toggle('all', done > 0 && done === total);
    sec.clearBtn.hidden = done === 0;
  }
  function updateAllCounts() {
    for (var i = 0; i < sections.length; i++) updateSectionCount(sections[i]);
  }

  // ---- Auto-sizing helpers ----
  function fitTextarea(ta) {
    ta.style.height = 'auto';
    if (ta.scrollHeight > 0) ta.style.height = ta.scrollHeight + 'px';
  }
  function fitInput(inp) {
    var len = (inp.value || inp.placeholder || '').replace(/[\u064B-\u065F\u0670]/g, '').length;
    var minW = inp.classList.contains('ex-reason') ? 10 : 7;
    inp.style.width = Math.max(minW, Math.min(36, len + 3)) + 'ch';
  }

  // ---- Floating harakat bar for active text inputs / textareas ----
  var activeField = null, hBar = null, hideBarTimer = null;
  var HARAKAT = [
    ['\u064E', 'فَتْحَة'],
    ['\u064F', 'ضَمَّة'],
    ['\u0650', 'كَسْرَة'],
    ['\u0652', 'سُكُون'],
    ['\u0651', 'شَدَّة'],
    ['\u064B', 'تَنْوِين فَتْح'],
    ['\u064C', 'تَنْوِين ضَمّ'],
    ['\u064D', 'تَنْوِين كَسْر']
  ];
  var DIAC_RE = /[\u064B-\u065F\u0670]/;

  function ensureHarakatBar() {
    if (hBar) return hBar;
    hBar = document.createElement('div');
    hBar.id = 'harakat-bar';
    hBar.hidden = true;
    hBar.setAttribute('role', 'toolbar');
    hBar.setAttribute('aria-label', 'الحركات');
    hBar.addEventListener('mousedown', function (e) { e.preventDefault(); });
    for (var i = 0; i < HARAKAT.length; i++) {
      (function (ch, label) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = '\u0640' + ch;
        b.title = label;
        b.setAttribute('aria-label', label);
        b.addEventListener('click', function () { insertHarakah(ch); });
        hBar.appendChild(b);
      })(HARAKAT[i][0], HARAKAT[i][1]);
    }
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'del';
    del.textContent = '⌫';
    del.title = 'مسح حركة';
    del.setAttribute('aria-label', 'مسح حركة');
    del.addEventListener('click', removeLastHarakah);
    hBar.appendChild(del);
    document.body.appendChild(hBar);
    return hBar;
  }

  function insertHarakah(ch) {
    var f = activeField;
    if (!f) return;
    var s = f.selectionStart, e = f.selectionEnd, v = f.value;
    if (s == null) { s = e = v.length; }
    f.value = v.slice(0, s) + ch + v.slice(e);
    f.selectionStart = f.selectionEnd = s + ch.length;
    f.focus();
    f.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function removeLastHarakah() {
    var f = activeField;
    if (!f) return;
    var s = f.selectionStart, e = f.selectionEnd, v = f.value;
    if (s == null) return;
    if (s !== e) {
      f.value = v.slice(0, s) + v.slice(e);
      f.selectionStart = f.selectionEnd = s;
    } else if (s > 0) {
      // Remove preceding diacritic if present, otherwise remove one char
      var k = s - 1;
      if (!DIAC_RE.test(v[k])) {
        // Also scan slightly left within the same letter? Just delete the single char if no diacritic
      }
      f.value = v.slice(0, k) + v.slice(s);
      f.selectionStart = f.selectionEnd = k;
    }
    f.focus();
    f.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function bindFieldFocus(el) {
    el.addEventListener('focus', function () {
      clearTimeout(hideBarTimer);
      activeField = el;
      ensureHarakatBar().hidden = false;
    });
    el.addEventListener('blur', function () {
      clearTimeout(hideBarTimer);
      hideBarTimer = setTimeout(function () {
        if (!activeField || document.activeElement !== activeField) {
          if (hBar) hBar.hidden = true;
          activeField = null;
        }
      }, 140);
    });
  }

  // Keep harakat bar above mobile virtual keyboard when visualViewport shrinks
  if (window.visualViewport) {
    var placeHBar = function () {
      if (!hBar || hBar.hidden) return;
      var vv = window.visualViewport;
      var offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      hBar.style.bottom = (offset + 14) + 'px';
    };
    window.visualViewport.addEventListener('resize', placeHBar);
    window.visualViewport.addEventListener('scroll', placeHBar);
  }

  // ---- Widget factories ----
  function makeTextarea(sec, id, cls, rows, placeholder, initialVal) {
    var ta = document.createElement('textarea');
    ta.className = cls;
    ta.rows = rows || 1;
    ta.dir = 'rtl';
    ta.spellcheck = false;
    if (placeholder) ta.placeholder = placeholder;
    var base = initialVal || '';
    if (base) ta.value = base;
    ta.addEventListener('input', function () {
      fitTextarea(ta);
      ta.classList.toggle('filled', base ? ta.value.trim() !== base.trim() : ta.value.trim().length > 0);
      record(id, ta.value, false);
    });
    ta.addEventListener('blur', function () { persistLocal(); });
    bindFieldFocus(ta);
    register(sec, id, {
      get: function () { return ta.value; },
      set: function (v) {
        var s = typeof v === 'string' ? v : '';
        ta.value = (base && s === '') ? base : s;
        ta.classList.toggle('filled', base ? ta.value.trim() !== base.trim() : ta.value.trim().length > 0);
        fitTextarea(ta);
      },
      reset: function () {
        ta.value = base;
        ta.classList.remove('filled');
        fitTextarea(ta);
        record(id, '', true);
      },
      isFilled: function () {
        return base ? ta.value.trim() !== base.trim() : ta.value.trim().length > 0;
      }
    });
    requestAnimationFrame(function () { fitTextarea(ta); });
    return ta;
  }

  function makeInlineInput(sec, id, cls, placeholder) {
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = cls || 'ex-blank';
    inp.dir = 'rtl';
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    if (placeholder) inp.placeholder = placeholder;
    inp.addEventListener('input', function () {
      fitInput(inp);
      inp.classList.toggle('filled', inp.value.trim().length > 0);
      record(id, inp.value, false);
    });
    inp.addEventListener('blur', function () { persistLocal(); });
    bindFieldFocus(inp);
    fitInput(inp);
    register(sec, id, {
      get: function () { return inp.value; },
      set: function (v) {
        inp.value = typeof v === 'string' ? v : '';
        inp.classList.toggle('filled', inp.value.trim().length > 0);
        fitInput(inp);
      },
      reset: function () {
        inp.value = '';
        inp.classList.remove('filled');
        fitInput(inp);
        record(id, '', true);
      },
      isFilled: function () { return inp.value.trim().length > 0; }
    });
    return inp;
  }

  function makeToggleGroup(sec, id, options, cls, onChange) {
    var wrap = document.createElement('span');
    wrap.className = cls || 'ex-tf';
    wrap.setAttribute('role', 'group');
    var val = '';
    var btns = options.map(function (opt) {
      var label = typeof opt === 'string' ? opt : opt.label;
      var code = typeof opt === 'string' ? opt : opt.val;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ex-btn' + (opt.cls ? ' ' + opt.cls : '');
      b.textContent = label;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        val = (val === code) ? '' : code;
        render();
        record(id, val, true);
      });
      wrap.appendChild(b);
      return { el: b, code: code, label: label };
    });
    function render() {
      var activeLabel = '';
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i].code === val;
        btns[i].el.setAttribute('aria-pressed', on ? 'true' : 'false');
        btns[i].el.classList.toggle('on', on);
        if (on) activeLabel = btns[i].label;
      }
      if (onChange) onChange(val, activeLabel);
    }
    register(sec, id, {
      get: function () { return val; },
      set: function (v) { val = typeof v === 'string' ? v : ''; render(); },
      reset: function () { val = ''; render(); record(id, '', true); },
      isFilled: function () { return val !== ''; }
    });
    return wrap;
  }

  // ---- Clickable words (underline or circle) ----
  var AR_WORD_RE = /([\u0621-\u064A\u0671-\u06D3][\u0621-\u065F\u0670-\u06D3\u0640]*)/g;
  var LEAD_ITEM_RE = /^\s*(?:\([أ-يـ]+\)|[أ-يـ]+\s*[-)])\s*/;

  function makeWordSelectable(sec, id, containers, isCircle, stopAtEndMark) {
    var spans = [];
    var stopped = false;

    function processTextNode(node, skipLead) {
      if (stopped) return;
      var s = node.nodeValue;
      var limit = s.length;
      if (stopAtEndMark) {
        var endAt = s.indexOf('اهـ');
        if (endAt !== -1) { limit = endAt; stopped = true; }
      }
      var prefixLen = 0;
      if (skipLead) {
        var lm = s.match(LEAD_ITEM_RE);
        if (lm) prefixLen = lm[0].length;
      }
      var work = s.slice(prefixLen, limit);
      AR_WORD_RE.lastIndex = 0;
      if (!AR_WORD_RE.test(work)) return;
      AR_WORD_RE.lastIndex = 0;
      var frag = document.createDocumentFragment();
      if (prefixLen > 0) frag.appendChild(document.createTextNode(s.slice(0, prefixLen)));
      var last = 0, m;
      while ((m = AR_WORD_RE.exec(work))) {
        if (m.index > last) frag.appendChild(document.createTextNode(work.slice(last, m.index)));
        var sp = document.createElement('span');
        sp.className = isCircle ? 'ex-word ex-circle' : 'ex-word';
        sp.setAttribute('role', 'button');
        sp.tabIndex = 0;
        sp.setAttribute('aria-pressed', 'false');
        sp.textContent = m[1];
        (function (idx, el) {
          var toggle = function () {
            var on = !el.classList.contains('on');
            el.classList.toggle('on', on);
            el.setAttribute('aria-pressed', on ? 'true' : 'false');
            record(id, selectedIndices(), true);
          };
          el.addEventListener('click', toggle);
          el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
          });
        })(spans.length, sp);
        spans.push(sp);
        frag.appendChild(sp);
        last = m.index + m[0].length;
      }
      if (last < work.length) frag.appendChild(document.createTextNode(work.slice(last)));
      if (limit < s.length) frag.appendChild(document.createTextNode(s.slice(limit)));
      node.parentNode.replaceChild(frag, node);
    }

    function selectedIndices() {
      var out = [];
      for (var i = 0; i < spans.length; i++) if (spans[i].classList.contains('on')) out.push(i);
      return out;
    }

    for (var c = 0; c < containers.length; c++) {
      var root = containers[c].el;
      var onlyQuote = containers[c].onlyQuote;
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      var nodes = [];
      while (w.nextNode()) {
        var tn = w.currentNode;
        if (tn.parentNode && tn.parentNode.classList && tn.parentNode.classList.contains('nref')) continue;
        nodes.push(tn);
      }
      if (onlyQuote) {
        // Only make words inside «...» clickable
        var inQ = false;
        for (var ni = 0; ni < nodes.length; ni++) {
          var nv = nodes[ni].nodeValue;
          var q1 = nv.indexOf('«'), q2 = nv.indexOf('»');
          if (!inQ && q1 !== -1) {
            var before = nv.slice(0, q1 + 1);
            var after = q2 > q1 ? nv.slice(q2) : '';
            var mid = q2 > q1 ? nv.slice(q1 + 1, q2) : nv.slice(q1 + 1);
            var midNode = document.createTextNode(mid);
            var frag = document.createDocumentFragment();
            frag.appendChild(document.createTextNode(before));
            frag.appendChild(midNode);
            if (after) frag.appendChild(document.createTextNode(after));
            nodes[ni].parentNode.replaceChild(frag, nodes[ni]);
            processTextNode(midNode, false);
            inQ = q2 === -1;
          } else if (inQ) {
            if (q2 !== -1) {
              var mNode = document.createTextNode(nv.slice(0, q2));
              var f2 = document.createDocumentFragment();
              f2.appendChild(mNode);
              f2.appendChild(document.createTextNode(nv.slice(q2)));
              nodes[ni].parentNode.replaceChild(f2, nodes[ni]);
              processTextNode(mNode, false);
              inQ = false;
            } else {
              processTextNode(nodes[ni], false);
            }
          }
        }
      } else {
        for (var k = 0; k < nodes.length; k++) {
          processTextNode(nodes[k], k === 0 && !containers[c].isQuran);
        }
      }
    }

    if (!spans.length) return false;
    register(sec, id, {
      get: selectedIndices,
      set: function (v) {
        var set = {};
        if (Array.isArray(v)) for (var i = 0; i < v.length; i++) set[v[i]] = 1;
        for (var j = 0; j < spans.length; j++) {
          var on = !!set[j];
          spans[j].classList.toggle('on', on);
          spans[j].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
      },
      reset: function () {
        for (var j = 0; j < spans.length; j++) {
          spans[j].classList.remove('on');
          spans[j].setAttribute('aria-pressed', 'false');
        }
        record(id, [], true);
      },
      isFilled: function () {
        for (var j = 0; j < spans.length; j++) if (spans[j].classList.contains('on')) return true;
        return false;
      }
    });
    return true;
  }

  // ---- Replace regex occurrences in text nodes of an element with DOM nodes ----
  function replaceTextPattern(el, re, makeNode) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var nodes = [], made = 0;
    while (w.nextNode()) {
      var p = w.currentNode.parentNode;
      if (p && p.classList && (p.classList.contains('nref') || p.closest('.ex-tf,.ex-mc,.ex-choices'))) continue;
      nodes.push(w.currentNode);
    }
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], s = n.nodeValue;
      re.lastIndex = 0;
      if (!re.test(s)) continue;
      re.lastIndex = 0;
      var frag = document.createDocumentFragment(), last = 0, m;
      while ((m = re.exec(s))) {
        if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
        var rep = makeNode(m, s);
        if (rep) { frag.appendChild(rep); made++; }
        else frag.appendChild(document.createTextNode(m[0]));
        last = m.index + m[0].length;
        if (!re.global || m[0].length === 0) break;
      }
      if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
      n.parentNode.replaceChild(frag, n);
    }
    return made;
  }

  // ---- Parse exercise sections in article.text ----
  var children = [].slice.call(art.children);
  var rawSections = [];
  var curSec = null, curSub = null;

  for (var ci = 0; ci < children.length; ci++) {
    var el = children[ci];
    if (el.tagName === 'H2') {
      var b = bare(el.textContent);
      if (b === 'تمارين' || b === 'تمرين') {
        curSec = { h2: el, subs: [] };
        rawSections.push(curSec);
        curSub = { h2: null, els: [] };
        curSec.subs.push(curSub);
      } else if (curSec && /^\([٠-٩0-9]+\)$/.test(b)) {
        curSub = { h2: el, els: [] };
        curSec.subs.push(curSub);
      } else {
        curSec = null;
        curSub = null;
      }
    } else if (curSec && curSub) {
      if (el.classList.contains('fn')) continue;
      curSub.els.push(el);
    }
  }

  if (!rawSections.length) return;

  var DOTS_RE = /\.{4,}|…{2,}/g;
  var PAREN_DOTS_RE = /\(\s*(?:\.{4,}|…{2,})\s*\)\.?|\.{4,}|…{2,}/g;
  var PURE_DOTS_RE = /^[\s.…]+$/;
  var ANS_LEAD_RE = /^\s*(?:الْجَوَابُ|الجواب)\s*[:：]?\s*(?:\.{4,}|…{2,})\s*$/;
  var EMPTY_PAREN_RE = /\(\s*\)/g;
  var MC_TAIL_RE = /\(([^()]+?\s*-\s*[^()]+?)\)\.?\s*$/;

  function enhanceSub(sec, sIdx, qIdx, sub) {
    var els = sub.els;
    if (!els.length) return;
    if (sub.h2) sub.h2.classList.add('ex-sub');

    var promptEl = els[0] && els[0].tagName === 'P' ? els[0] : null;
    var promptText = promptEl ? promptEl.textContent : '';
    var promptBare = bare(promptText);
    var prefix = 's' + sIdx + '_q' + qIdx + '_';
    var fSeq = 0;
    var startFields = sec.fields.length;

    // 1. Editable table cells (<td>...</td>)
    for (var ti = 0; ti < els.length; ti++) {
      if (els[ti].tagName !== 'TABLE') continue;
      var tbl = els[ti], tds = tbl.querySelectorAll('td'), hadCell = false;
      for (var di = 0; di < tds.length; di++) {
        var td = tds[di], tt = td.textContent.trim();
        if (/^(?:\.{2,}|…+)$/.test(tt)) {
          td.textContent = '';
          td.classList.add('ex-td');
          td.appendChild(makeTextarea(sec, prefix + 't' + (fSeq++), 'ex-cell', 1, ''));
          hadCell = true;
        }
      }
      if (hadCell) tbl.classList.add('ex-tbl');
    }

    // 2. Check / Cross (✓) / (×) exercises
    var isTF = promptBare.indexOf('(✓)') !== -1 && (promptBare.indexOf('(×)') !== -1 || promptBare.indexOf('(x)') !== -1);
    var wantsReason = /بيان السبب|ذكر السبب/.test(promptBare);
    if (isTF) {
      for (var i = 1; i < els.length; i++) {
        var p = els[i];
        if (p.tagName !== 'P') continue;
        if (!EMPTY_PAREN_RE.test(p.textContent)) continue;
        EMPTY_PAREN_RE.lastIndex = 0;
        p.classList.add('ex-item');
        replaceTextPattern(p, EMPTY_PAREN_RE, function () {
          return makeToggleGroup(sec, prefix + 'tf' + (fSeq++), [
            { label: '✓', val: '1', cls: 'ok' },
            { label: '×', val: '0', cls: 'no' }
          ], 'ex-tf');
        });
        // If there's also a dots blank on this line, handle it right here; else if prompt asks for reason, add a reason input
        if (DOTS_RE.test(p.textContent)) {
          DOTS_RE.lastIndex = 0;
          replaceTextPattern(p, DOTS_RE, function () {
            return makeInlineInput(sec, prefix + 'in' + (fSeq++), 'ex-blank ex-reason', 'السَّبَبُ…');
          });
        } else if (wantsReason) {
          p.appendChild(document.createTextNode(' '));
          p.appendChild(makeInlineInput(sec, prefix + 'in' + (fSeq++), 'ex-blank ex-reason', 'السَّبَبُ…'));
        }
      }
      return;
    }

    // 3. Two-choice classification: «اكتب بين القوسين (X) أو (Y) ...» (e.g., S11(2))
    var twoChoice = null;
    if (promptBare.indexOf('بين القوسين') !== -1) {
      var m2 = promptText.match(/\(([^()]+)\)\s*أَوْ\s*\(([^()]+)\)/);
      if (m2) twoChoice = [m2[1].trim(), m2[2].trim()];
    }
    if (twoChoice) {
      for (var i2 = 1; i2 < els.length; i2++) {
        var p2 = els[i2];
        if (p2.tagName !== 'P') continue;
        var parenDots = /\(\s*(?:\.{4,}|…{2,})\s*\)/g;
        if (!parenDots.test(p2.textContent)) continue;
        parenDots.lastIndex = 0;
        p2.classList.add('ex-item');
        replaceTextPattern(p2, parenDots, function () {
          var box = document.createElement('span');
          box.className = 'ex-cls';
          box.appendChild(makeToggleGroup(sec, prefix + 'cl' + (fSeq++), twoChoice, 'ex-choices'));
          if (wantsReason) {
            box.appendChild(makeInlineInput(sec, prefix + 'rs' + (fSeq++), 'ex-blank ex-reason', 'السَّبَبُ…'));
          }
          return box;
        });
      }
      return;
    }

    // 4. Multiple-choice from parentheses: «اختر ... من بين القوسين/الأقواس» (S32(2), S33(1))
    if (promptBare.indexOf('اختر') !== -1 && (promptBare.indexOf('القوسين') !== -1 || promptBare.indexOf('الأقواس') !== -1)) {
      for (var i3 = 1; i3 < els.length; i3++) {
        var p3 = els[i3];
        if (p3.tagName !== 'P') continue;
        var mTail = p3.textContent.match(MC_TAIL_RE);
        if (!mTail) continue;
        var opts = mTail[1].split(/\s*-\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
        if (opts.length < 2) continue;
        p3.classList.add('ex-item');
        // Replace any blank slot with a live preview span
        var slotEl = null;
        if (DOTS_RE.test(p3.textContent)) {
          DOTS_RE.lastIndex = 0;
          replaceTextPattern(p3, DOTS_RE, function () {
            slotEl = document.createElement('span');
            slotEl.className = 'ex-slot';
            slotEl.textContent = '……';
            return slotEl;
          });
        }
        // Replace trailing (opt1 - opt2 - ...) with clickable buttons
        (function (slot, choiceList) {
          replaceTextPattern(p3, MC_TAIL_RE, function () {
            return makeToggleGroup(sec, prefix + 'mc' + (fSeq++), choiceList, 'ex-choices', function (v, label) {
              if (slot) {
                slot.textContent = label || '……';
                slot.classList.toggle('filled', !!label);
              }
            });
          });
        })(slotEl, opts);
      }
      return;
    }

    // 5. Click-to-underline: «ضع خطا تحت ...»
    if (promptBare.indexOf('ضع خطا تحت') !== -1) {
      var targetPs = els.slice(1).filter(function (x) { return x.tagName === 'P'; });
      if (!targetPs.length && promptEl && promptEl.textContent.indexOf('«') !== -1) {
        // S17(3): quote is inside the prompt <p> itself
        promptEl.classList.add('ex-clickable');
        makeWordSelectable(sec, prefix + 'ul' + (fSeq++), [{ el: promptEl, onlyQuote: true }], false, false);
      } else {
        for (var u = 0; u < targetPs.length; u++) {
          var tp = targetPs[u];
          tp.classList.add('ex-clickable');
          var qSpan = tp.querySelector('.quran');
          if (qSpan) {
            makeWordSelectable(sec, prefix + 'ul' + (fSeq++), [{ el: qSpan, isQuran: true }], false, false);
          } else if (tp.textContent.indexOf('«') !== -1) {
            makeWordSelectable(sec, prefix + 'ul' + (fSeq++), [{ el: tp, onlyQuote: true }], false, false);
          } else {
            makeWordSelectable(sec, prefix + 'ul' + (fSeq++), [{ el: tp }], false, true);
          }
        }
      }
      return;
    }

    // 6. Click-to-circle: «ضع دائرة على ...» (S39(2))
    if (promptBare.indexOf('ضع دائرة على') !== -1) {
      for (var cr = 1; cr < els.length; cr++) {
        if (els[cr].tagName !== 'P') continue;
        els[cr].classList.add('ex-clickable', 'ex-circles');
        makeWordSelectable(sec, prefix + 'cr' + (fSeq++), [{ el: els[cr] }], true, false);
      }
      return;
    }

    // 7. «في أي الجملتين ... مع ذكر السبب» (S39(4))
    if (promptBare.indexOf('في أي الجملتين') !== -1) {
      var optPs = els.slice(1).filter(function (x) { return x.tagName === 'P'; });
      if (optPs.length >= 2) {
        var optId = prefix + 'opt';
        var curOpt = '';
        function syncOpts() {
          for (var oi = 0; oi < optPs.length; oi++) {
            var on = String(oi) === curOpt;
            optPs[oi].classList.toggle('on', on);
            optPs[oi].setAttribute('aria-pressed', on ? 'true' : 'false');
          }
        }
        for (var oi = 0; oi < optPs.length; oi++) {
          (function (idx, op) {
            op.classList.add('ex-opt');
            op.setAttribute('role', 'button');
            op.tabIndex = 0;
            op.setAttribute('aria-pressed', 'false');
            var pick = function () {
              curOpt = (curOpt === String(idx)) ? '' : String(idx);
              syncOpts();
              record(optId, curOpt, true);
            };
            op.addEventListener('click', pick);
            op.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
            });
          })(oi, optPs[oi]);
        }
        register(sec, optId, {
          get: function () { return curOpt; },
          set: function (v) { curOpt = typeof v === 'string' ? v : ''; syncOpts(); },
          reset: function () { curOpt = ''; syncOpts(); record(optId, '', true); },
          isFilled: function () { return curOpt !== ''; }
        });
        var rBox = document.createElement('div');
        rBox.className = 'ex-box';
        rBox.appendChild(makeTextarea(sec, prefix + 'rs', 'ex-area', 2, 'السَّبَبُ…'));
        var lastOpt = optPs[optPs.length - 1];
        lastOpt.parentNode.insertBefore(rBox, lastOpt.nextSibling);
        return;
      }
    }

    // 8. Vowelize poetry bayt: «اضبط هذا البيت ...» (S37(3))
    if (promptBare.indexOf('اضبط هذا البيت') !== -1 && els[1] && els[1].tagName === 'P') {
      var baytP = els[1];
      var origBayt = baytP.textContent.trim();
      var vBox = document.createElement('div');
      vBox.className = 'ex-box';
      vBox.appendChild(makeTextarea(sec, prefix + 'vow', 'ex-area ex-vow', 2, '', origBayt));
      baytP.classList.add('ex-vow-src');
      baytP.parentNode.insertBefore(vBox, baytP.nextSibling);
    }

    // 9. Dot-blanks (standalone «الجواب: ..........», multi-blank rows, and inline blanks)
    var isLongBlank = /صحح الخطأ|مثل لما يأتي|أعرب ما تحته خط|اجعل كل/.test(promptBare);
    for (var pIdx = 0; pIdx < els.length; pIdx++) {
      var pe = els[pIdx];
      if (pe.tagName !== 'P' || pe.hidden) continue;
      var txt = pe.textContent;
      DOTS_RE.lastIndex = 0;
      if (!DOTS_RE.test(txt)) continue;
      DOTS_RE.lastIndex = 0;

      // Case 9a: «الجواب: ..........» or pure «..........» line
      var isAnsLead = ANS_LEAD_RE.test(txt);
      var isPureDots = PURE_DOTS_RE.test(txt);
      if (isAnsLead || isPureDots) {
        var dotMatches = txt.match(DOTS_RE) || [];
        // Subcase: multi-blank row like «.......... .......... ..........» following a dash-separated word list (S1(2), S1(3))
        if (isPureDots && dotMatches.length >= 2) {
          var prevP = els[pIdx - 1];
          var labels = (prevP && prevP.tagName === 'P' && prevP.textContent.indexOf(' - ') !== -1)
            ? prevP.textContent.split(/\s*-\s*/).map(function (x) { return x.trim(); })
            : [];
          pe.textContent = '';
          pe.classList.add('ex-stack');
          for (var mi = 0; mi < dotMatches.length; mi++) {
            var row = document.createElement('span');
            row.className = 'ex-stack-row';
            if (labels[mi]) {
              var lbl = document.createElement('span');
              lbl.className = 'ex-lbl';
              lbl.textContent = labels[mi] + ':';
              row.appendChild(lbl);
            }
            row.appendChild(makeTextarea(sec, prefix + 'st' + (fSeq++), 'ex-area ex-one', 1, labels[mi] ? 'أَدْخِلْ جُمْلَةً فِيهَا «' + labels[mi] + '»…' : 'الْجَوَابُ…'));
            pe.appendChild(row);
          }
          continue;
        }
        // Merge any consecutive pure-dots <p> lines right after this one (hide them so progress.js indices never shift)
        var extraLines = 0;
        while (pIdx + 1 + extraLines < els.length) {
          var nxt = els[pIdx + 1 + extraLines];
          if (nxt.tagName === 'P' && PURE_DOTS_RE.test(nxt.textContent)) {
            nxt.hidden = true;
            extraLines++;
          } else break;
        }
        pe.textContent = '';
        pe.classList.add('ex-ans-p');
        pe.appendChild(makeTextarea(sec, prefix + 'a' + (fSeq++), 'ex-area', Math.max(2, extraLines + 1), 'الْجَوَابُ…'));
        pIdx += extraLines;
        continue;
      }

      // Case 9b: Inline blank(s) inside a sentence or after a label
      pe.classList.add('ex-item');
      var wideLine = isLongBlank || /[:：←]\s*(?:\.{4,}|…{2,})\s*$/.test(txt);
      replaceTextPattern(pe, PAREN_DOTS_RE, function () {
        if (wideLine) return makeTextarea(sec, prefix + 'w' + (fSeq++), 'ex-blank ex-wide', 1, '…');
        return makeInlineInput(sec, prefix + 'in' + (fSeq++), 'ex-blank', '');
      });
    }

    // 10. Fallback: open-ended exercise (e.g., «أعرب: ...») with no blanks or tables
    if (sec.fields.length === startFields) {
      var box = document.createElement('div');
      box.className = 'ex-box';
      box.appendChild(makeTextarea(sec, prefix + 'open', 'ex-area', 2, 'الْجَوَابُ…'));
      var lastEl = els[els.length - 1];
      lastEl.parentNode.insertBefore(box, lastEl.nextSibling);
    }
  }

  // ---- Build all exercise sections ----
  for (var si = 0; si < rawSections.length; si++) {
    var rs = rawSections[si];
    rs.h2.classList.add('ex-head');

    var bar = document.createElement('div');
    bar.className = 'ex-bar';
    var cnt = document.createElement('span');
    cnt.className = 'ex-cnt';
    var clr = document.createElement('button');
    clr.type = 'button';
    clr.className = 'ex-clr';
    clr.textContent = 'مسح الإجابات';
    clr.hidden = true;
    bar.appendChild(cnt);
    bar.appendChild(clr);
    rs.h2.parentNode.insertBefore(bar, rs.h2.nextSibling);

    var sec = { fields: [], countEl: cnt, clearBtn: clr };
    sections.push(sec);

    (function (sObj, btn) {
      var armed = null;
      btn.addEventListener('click', function () {
        if (!armed) {
          btn.textContent = 'تأكيد المسح؟';
          btn.classList.add('arm');
          armed = setTimeout(function () {
            armed = null;
            btn.textContent = 'مسح الإجابات';
            btn.classList.remove('arm');
          }, 4000);
          return;
        }
        clearTimeout(armed); armed = null;
        btn.textContent = 'مسح الإجابات';
        btn.classList.remove('arm');
        for (var fi = 0; fi < sObj.fields.length; fi++) {
          var c = controls[sObj.fields[fi]];
          if (c) c.reset();
        }
        updateSectionCount(sObj);
      });
    })(sec, clr);

    for (var qi = 0; qi < rs.subs.length; qi++) {
      enhanceSub(sec, si + 1, qi, rs.subs[qi]);
    }
    updateSectionCount(sec);
  }

  // ---- Lifecycle sync hooks ----
  pullSync();
  document.addEventListener('km:auth', function (e) { if (e.detail && e.detail.signedIn) pullSync(); });
  addEventListener('pagehide', function () { clearTimeout(saveTimer); persistLocal(); flushSync(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { clearTimeout(saveTimer); persistLocal(); flushSync(true); }
  });
})();
