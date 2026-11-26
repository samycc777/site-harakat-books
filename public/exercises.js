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
  var controls = {};       // id -> { get, set, isFilled, section, q, setState, setReveal }
  var sections = [];       // [{ fields: [id], questions: [qObj], countEl, clearBtn, actsEl }]
  var curQ = null;         // active question object while enhanceSub builds its controls
  var answerKey = null;    // loaded from ../exercises/<slug>.json if available
  var qByKey = {};         // qKey -> qObj
  var fieldQ = {};         // fieldId -> qObj

  function normAr(s) {
    return String(s || '')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ﷲ/g, 'الله')
      .replace(/[.,،؛:؟!()\[\]«»﴿﴾"'ـ\-–—/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hasToken(normText, tok) {
    var t = normAr(tok.charAt(0) === '=' ? tok.slice(1) : tok);
    if (!t) return false;
    if (tok.charAt(0) === '=') {
      return (' ' + normText + ' ').indexOf(' ' + t + ' ') !== -1;
    }
    return normText.indexOf(t) !== -1;
  }

  function expandDiacPattern(pat) {
    // Allow optional diacritics between base Arabic letters unless explicitly constrained
    var out = '';
    for (var i = 0; i < pat.length; i++) {
      var ch = pat[i];
      out += ch;
      if (/[\u0621-\u064A]/.test(ch)) {
        var nxt = pat[i + 1] || '';
        if (!/[\u064B-\u065F\u0670\[]/.test(nxt)) out += '[\\u064B-\\u065F\\u0670]*';
      }
    }
    return out;
  }

  function prepDiacRaw(s) {
    return String(s || '')
      .replace(/\u0640/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/([\u064B-\u0650\u0652])\u0651/g, '\u0651$1')
      .replace(/[.,،؛:؟!()\[\]«»﴿﴾"'ـ\-–—/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function setsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    var sa = a.slice().sort(function (x, y) { return x - y; });
    var sb = b.slice().sort(function (x, y) { return x - y; });
    for (var i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
    return true;
  }

  function matchSpec(val, spec) {
    if (!spec) return null;
    var mode = spec.mode || 'match';
    if (mode === 'open') return 'open';
    if (mode === 'words') {
      var arr = Array.isArray(val) ? val : [];
      if (!arr.length) return 'empty';
      if (setsEqual(arr, spec.idx)) return 'ok';
      if (spec.alt) {
        for (var ai = 0; ai < spec.alt.length; ai++) {
          if (setsEqual(arr, spec.alt[ai])) return 'ok';
        }
      }
      return 'bad';
    }
    var raw = String(val || '').trim();
    if (!raw) return 'empty';
    if (mode === 'exact') {
      var rNorm = raw.replace(/([\u064B-\u0650\u0652])\u0651/g, '\u0651$1');
      var aNorm = String(spec.a || '').replace(/([\u064B-\u0650\u0652])\u0651/g, '\u0651$1');
      if (rNorm === aNorm) return 'ok';
      if (spec.al) {
        for (var ei = 0; ei < spec.al.length; ei++) {
          if (rNorm === String(spec.al[ei]).replace(/([\u064B-\u0650\u0652])\u0651/g, '\u0651$1')) return 'ok';
        }
      }
      return 'bad';
    }
    var n = normAr(raw);
    if (!n) return 'empty';
    if (mode === 'strict_diac') {
      // Base letters must match spec.a or spec.al, AND at least one diac regex must match raw
      var baseOk = n === normAr(spec.a);
      if (!baseOk && spec.al) {
        for (var si = 0; si < spec.al.length; si++) {
          if (n === normAr(spec.al[si])) { baseOk = true; break; }
        }
      }
      if (!baseOk) return 'bad';
      var pr = prepDiacRaw(raw);
      var prNoSh = pr.replace(/\u0651/g, '');
      var pats = spec.diac || [];
      for (var di = 0; di < pats.length; di++) {
        var re = new RegExp(expandDiacPattern(pats[di]));
        if (re.test(pr) || re.test(prNoSh)) return 'ok';
      }
      return 'bad';
    }
    // Default 'match' mode
    if (spec.no) {
      for (var ni = 0; ni < spec.no.length; ni++) {
        if (hasToken(n, spec.no[ni])) return 'bad';
      }
    }
    if (spec.a && n === normAr(spec.a)) return 'ok';
    if (spec.al) {
      for (var li = 0; li < spec.al.length; li++) {
        if (n === normAr(spec.al[li])) return 'ok';
      }
    }
    if (spec.all) {
      var allOk = true;
      for (var gi = 0; gi < spec.all.length; gi++) {
        var grp = spec.all[gi], hit = false;
        for (var g2 = 0; g2 < grp.length; g2++) {
          if (hasToken(n, grp[g2])) { hit = true; break; }
        }
        if (!hit) { allOk = false; break; }
      }
      if (allOk) return 'ok';
    }
    if (spec.kw) {
      var kwOk = true;
      for (var ki = 0; ki < spec.kw.length; ki++) {
        var kgrp = spec.kw[ki], khit = false;
        for (var k2 = 0; k2 < kgrp.length; k2++) {
          if (hasToken(n, kgrp[k2])) { khit = true; break; }
        }
        if (!khit) { kwOk = false; break; }
      }
      if (kwOk) return 'ok';
    }
    return 'bad';
  }

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
    ctrl.q = curQ;
    controls[id] = ctrl;
    sec.fields.push(id);
    if (curQ) {
      curQ.fields.push(id);
      fieldQ[id] = curQ;
    }
    if (store[id] && store[id].v !== undefined) ctrl.set(store[id].v);
  }

  function clearFieldState(id) {
    var c = controls[id];
    if (!c) return;
    if (c.setState) c.setState('');
    if (c.q && c.q.scoreEl) {
      c.q.scoreEl.textContent = '';
      c.q.scoreEl.className = 'ex-qscore';
    }
    if (c.section && c.section.scoreEl) {
      c.section.scoreEl.textContent = '';
      c.section.scoreEl.className = 'ex-sscore';
    }
  }

  function findPoolForField(qData, id) {
    if (qData.tuplePools) {
      for (var i = 0; i < qData.tuplePools.length; i++) {
        var tp = qData.tuplePools[i];
        for (var s = 0; s < tp.slots.length; s++) {
          if (tp.slots[s].indexOf(id) !== -1) return { kind: 'tuple', pool: tp };
        }
      }
    }
    if (qData.setPools) {
      for (var j = 0; j < qData.setPools.length; j++) {
        if (qData.setPools[j].ids.indexOf(id) !== -1) return { kind: 'set', pool: qData.setPools[j] };
      }
    }
    return null;
  }

  function evalTuplePool(tp, onlyFilled) {
    var used = {};
    var ok = 0, total = 0;
    for (var s = 0; s < tp.slots.length; s++) {
      var slot = tp.slots[s];
      var keyIdx = tp.keyCol || 0;
      var keyId = slot[keyIdx];
      var keyCtrl = controls[keyId];
      var keyVal = keyCtrl ? keyCtrl.get() : '';
      var keyFilled = keyCtrl && keyCtrl.isFilled();
      total += slot.length;
      if (!keyFilled) {
        for (var c0 = 0; c0 < slot.length; c0++) {
          var cc0 = controls[slot[c0]];
          if (cc0 && cc0.setState) {
            if (!onlyFilled && cc0.isFilled()) cc0.setState('bad');
            else cc0.setState('');
          }
        }
        continue;
      }
      // Match key column against unused entries
      var matchIdx = -1;
      for (var e = 0; e < tp.entries.length; e++) {
        if (used[e]) continue;
        if (matchSpec(keyVal, tp.entries[e][keyIdx]) === 'ok') { matchIdx = e; break; }
      }
      if (matchIdx === -1) {
        if (keyCtrl && keyCtrl.setState) keyCtrl.setState('bad');
        for (var c1 = 0; c1 < slot.length; c1++) {
          if (c1 === keyIdx) continue;
          var cc1 = controls[slot[c1]];
          if (cc1 && cc1.setState) cc1.setState('');
        }
      } else {
        used[matchIdx] = 1;
        if (keyCtrl && keyCtrl.setState) keyCtrl.setState('ok');
        ok++;
        var entry = tp.entries[matchIdx];
        for (var c2 = 0; c2 < slot.length; c2++) {
          if (c2 === keyIdx) continue;
          var cc2 = controls[slot[c2]];
          if (!cc2) continue;
          if (!cc2.isFilled()) {
            if (cc2.setState) cc2.setState('');
            continue;
          }
          var r2 = matchSpec(cc2.get(), entry[c2]);
          if (cc2.setState) cc2.setState(r2 === 'ok' ? 'ok' : (r2 === 'open' ? 'open' : 'bad'));
          if (r2 === 'ok') ok++;
        }
      }
    }
    return { ok: ok, total: total };
  }

  function evalSetPool(sp, onlyFilled) {
    var used = {};
    var ok = 0, total = sp.ids.length;
    for (var i = 0; i < sp.ids.length; i++) {
      var id = sp.ids[i], ctrl = controls[id];
      if (!ctrl) continue;
      if (!ctrl.isFilled()) {
        if (ctrl.setState) ctrl.setState('');
        continue;
      }
      var val = ctrl.get(), hit = -1;
      for (var p = 0; p < sp.pool.length; p++) {
        if (used[p]) continue;
        if (matchSpec(val, sp.pool[p]) === 'ok') { hit = p; break; }
      }
      if (hit !== -1) {
        used[hit] = 1;
        if (ctrl.setState) ctrl.setState('ok');
        ok++;
      } else {
        if (ctrl.setState) ctrl.setState('bad');
      }
    }
    return { ok: ok, total: total };
  }

  function liveCheckField(id) {
    if (!answerKey) return;
    var qObj = fieldQ[id];
    if (!qObj) return;
    var qData = answerKey[qObj.key];
    if (!qData) return;
    var ctrl = controls[id];
    if (!ctrl || !ctrl.isFilled()) { clearFieldState(id); return; }
    var poolInfo = findPoolForField(qData, id);
    if (poolInfo) {
      if (poolInfo.kind === 'tuple') evalTuplePool(poolInfo.pool, true);
      else evalSetPool(poolInfo.pool, true);
      return;
    }
    var spec = qData.fields && qData.fields[id];
    if (!spec || spec.mode === 'open') return;
    var res = matchSpec(ctrl.get(), spec);
    if (spec.mode === 'words') {
      // Only celebrate automatically when exact match; don't mark red mid-selection
      if (res === 'ok' && ctrl.setState) ctrl.setState('ok', spec, false);
      else if (ctrl.setState) ctrl.setState('');
      return;
    }
    if (ctrl.setState) ctrl.setState(res === 'ok' ? 'ok' : (res === 'bad' ? 'bad' : ''));
  }

  function checkQuestion(qObj, silentOpen) {
    if (!answerKey) return null;
    var qData = answerKey[qObj.key];
    if (!qData) return null;
    var ok = 0, total = 0, openCount = 0, filledOpen = 0;

    if (qData.tuplePools) {
      for (var ti = 0; ti < qData.tuplePools.length; ti++) {
        var tr = evalTuplePool(qData.tuplePools[ti], false);
        ok += tr.ok; total += tr.total;
      }
    }
    if (qData.setPools) {
      for (var si = 0; si < qData.setPools.length; si++) {
        var sr = evalSetPool(qData.setPools[si], false);
        ok += sr.ok; total += sr.total;
      }
    }
    if (qData.fields) {
      for (var fid in qData.fields) {
        var spec = qData.fields[fid];
        var ctrl = controls[fid];
        if (!ctrl) continue;
        if (spec.mode === 'open') {
          openCount++;
          if (ctrl.isFilled()) {
            filledOpen++;
            if (ctrl.setState) ctrl.setState('open');
          }
          continue;
        }
        total++;
        if (!ctrl.isFilled()) {
          if (ctrl.setState) ctrl.setState(spec.mode === 'words' ? 'bad' : '', spec, false);
          continue;
        }
        var res = matchSpec(ctrl.get(), spec);
        if (res === 'ok') {
          ok++;
          if (ctrl.setState) ctrl.setState('ok', spec, false);
        } else {
          if (ctrl.setState) ctrl.setState('bad', spec, spec.mode === 'words');
        }
      }
    }

    if (qObj.scoreEl) {
      if (total > 0) {
        if (ok === total) {
          qObj.scoreEl.textContent = 'صَحِيحٌ ✓';
          qObj.scoreEl.className = 'ex-qscore ok';
        } else {
          qObj.scoreEl.textContent = arN(ok) + ' / ' + arN(total) + ' صَحِيحٌ';
          qObj.scoreEl.className = 'ex-qscore ' + (ok > 0 ? 'part' : 'bad');
        }
      } else if (openCount > 0) {
        qObj.scoreEl.textContent = 'قَارِنْ بِالْإِجَابَةِ النَّمُوذَجِيَّةِ';
        qObj.scoreEl.className = 'ex-qscore open';
      }
    }
    if (!silentOpen && openCount > 0 && (total === 0 || filledOpen > 0)) {
      setQuestionReveal(qObj, true);
    }
    return { ok: ok, total: total, openCount: openCount };
  }

  function renderAnswerPanel(qData) {
    var box = document.createElement('div');
    box.className = 'ex-ans-panel';
    box.hidden = true;
    var hdr = document.createElement('div');
    hdr.className = 'ex-ans-hdr';
    hdr.textContent = qData.note ? 'الْإِجَابَةُ النَّمُوذَجِيَّةُ' : 'الْإِجَابَةُ الصَّحِيحَةُ';
    box.appendChild(hdr);

    if (qData.display && qData.display.length) {
      var list = document.createElement('div');
      list.className = 'ex-ans-list';
      for (var i = 0; i < qData.display.length; i++) {
        var line = document.createElement('div');
        line.className = 'ex-ans-line';
        line.textContent = qData.display[i];
        list.appendChild(line);
      }
      box.appendChild(list);
    }
    if (qData.table && qData.table.headers && qData.table.rows) {
      var wrap = document.createElement('div');
      wrap.className = 'ex-ans-tbl-wrap';
      var tbl = document.createElement('div');
      tbl.className = 'ex-ans-tbl';
      var cols = qData.table.headers.length;
      tbl.style.setProperty('--cols', String(cols));
      var hRow = document.createElement('div');
      hRow.className = 'ex-ans-tr ex-ans-head';
      for (var h = 0; h < cols; h++) {
        var hc = document.createElement('div');
        hc.className = 'ex-ans-th';
        hc.textContent = qData.table.headers[h];
        hRow.appendChild(hc);
      }
      tbl.appendChild(hRow);
      for (var r = 0; r < qData.table.rows.length; r++) {
        var tr = document.createElement('div');
        tr.className = 'ex-ans-tr';
        var row = qData.table.rows[r];
        for (var c = 0; c < cols; c++) {
          var td = document.createElement('div');
          td.className = 'ex-ans-td';
          td.textContent = row[c] || '';
          tr.appendChild(td);
        }
        tbl.appendChild(tr);
      }
      wrap.appendChild(tbl);
      box.appendChild(wrap);
    }
    if (qData.note) {
      var nt = document.createElement('div');
      nt.className = 'ex-ans-note';
      nt.textContent = qData.note;
      box.appendChild(nt);
    }
    return box;
  }

  function setQuestionReveal(qObj, show) {
    if (!qObj.panelEl) return;
    qObj.shown = !!show;
    qObj.panelEl.hidden = !qObj.shown;
    if (qObj.ansBtn) {
      qObj.ansBtn.textContent = qObj.shown ? 'إِخْفَاءُ الْإِجَابَةِ' : 'إِظْهَارُ الْإِجَابَةِ';
      qObj.ansBtn.setAttribute('aria-expanded', qObj.shown ? 'true' : 'false');
      qObj.ansBtn.classList.toggle('on', qObj.shown);
    }
    var qData = answerKey && answerKey[qObj.key];
    if (qData && qData.fields) {
      for (var fid in qData.fields) {
        var c = controls[fid];
        if (c && c.setReveal) c.setReveal(qObj.shown, qData.fields[fid]);
      }
    }
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
      clearFieldState(id);
      record(id, ta.value, false);
    });
    ta.addEventListener('blur', function () { persistLocal(); liveCheckField(id); });
    if (cls.indexOf('ex-cell') !== -1) {
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          persistLocal();
          liveCheckField(id);
        }
      });
    }
    bindFieldFocus(ta);
    register(sec, id, {
      get: function () { return ta.value; },
      set: function (v) {
        var s = typeof v === 'string' ? v : '';
        ta.value = (base && s === '') ? base : s;
        ta.classList.toggle('filled', base ? ta.value.trim() !== base.trim() : ta.value.trim().length > 0);
        fitTextarea(ta);
      },
      setState: function (st) {
        ta.classList.toggle('ex-ok', st === 'ok');
        ta.classList.toggle('ex-bad', st === 'bad');
        ta.classList.toggle('ex-open', st === 'open');
      },
      reset: function () {
        ta.value = base;
        ta.classList.remove('filled', 'ex-ok', 'ex-bad', 'ex-open');
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
      clearFieldState(id);
      record(id, inp.value, false);
    });
    inp.addEventListener('blur', function () { persistLocal(); liveCheckField(id); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        persistLocal();
        liveCheckField(id);
      }
    });
    bindFieldFocus(inp);
    fitInput(inp);
    register(sec, id, {
      get: function () { return inp.value; },
      set: function (v) {
        inp.value = typeof v === 'string' ? v : '';
        inp.classList.toggle('filled', inp.value.trim().length > 0);
        fitInput(inp);
      },
      setState: function (st) {
        inp.classList.toggle('ex-ok', st === 'ok');
        inp.classList.toggle('ex-bad', st === 'bad');
        inp.classList.toggle('ex-open', st === 'open');
      },
      reset: function () {
        inp.value = '';
        inp.classList.remove('filled', 'ex-ok', 'ex-bad', 'ex-open');
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
        if (val) liveCheckField(id); else clearFieldState(id);
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
      setState: function (st) {
        wrap.classList.toggle('ex-ok', st === 'ok');
        wrap.classList.toggle('ex-bad', st === 'bad');
      },
      reset: function () { val = ''; wrap.classList.remove('ex-ok', 'ex-bad'); render(); record(id, '', true); },
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
            clearFieldState(id);
            record(id, selectedIndices(), true);
            liveCheckField(id);
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
      setState: function (st, spec, showMissed) {
        for (var j = 0; j < spans.length; j++) {
          spans[j].classList.remove('ex-w-ok', 'ex-w-bad', 'ex-w-miss');
        }
        if (!st || !spec) return;
        var tgt = spec.idx || [];
        if (st === 'ok' && spec.alt) {
          var sel = selectedIndices();
          if (!setsEqual(sel, tgt)) {
            for (var ai = 0; ai < spec.alt.length; ai++) {
              if (setsEqual(sel, spec.alt[ai])) { tgt = spec.alt[ai]; break; }
            }
          }
        }
        var tset = {};
        for (var ti = 0; ti < tgt.length; ti++) tset[tgt[ti]] = 1;
        for (var k = 0; k < spans.length; k++) {
          var on = spans[k].classList.contains('on');
          if (on) spans[k].classList.add(tset[k] ? 'ex-w-ok' : 'ex-w-bad');
          else if (showMissed && tset[k]) spans[k].classList.add('ex-w-miss');
        }
      },
      setReveal: function (show, spec) {
        var tset = {};
        if (show && spec && spec.idx) {
          for (var ti = 0; ti < spec.idx.length; ti++) tset[spec.idx[ti]] = 1;
        }
        for (var k = 0; k < spans.length; k++) {
          spans[k].classList.toggle('ex-w-ans', !!(show && tset[k]));
        }
      },
      reset: function () {
        for (var j = 0; j < spans.length; j++) {
          spans[j].classList.remove('on', 'ex-w-ok', 'ex-w-bad', 'ex-w-miss');
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
    var qKey = 's' + sIdx + '_q' + qIdx;
    var qObj = { key: qKey, fields: [], anchorEl: els[els.length - 1], sec: sec, barEl: null, scoreEl: null, ansBtn: null, panelEl: null, shown: false };
    sec.questions.push(qObj);
    qByKey[qKey] = qObj;
    curQ = qObj;
    enhanceSubBody(sec, sIdx, qIdx, sub, qObj);
    curQ = null;
  }

  function enhanceSubBody(sec, sIdx, qIdx, sub, qObj) {
    var els = sub.els;
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
              if (curOpt !== '') liveCheckField(optId); else clearFieldState(optId);
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
          setState: function (st) {
            for (var oi = 0; oi < optPs.length; oi++) {
              optPs[oi].classList.remove('ex-ok', 'ex-bad');
            }
            if ((st === 'ok' || st === 'bad') && curOpt !== '' && optPs[+curOpt]) {
              optPs[+curOpt].classList.add(st === 'ok' ? 'ex-ok' : 'ex-bad');
            }
          },
          setReveal: function (show, spec) {
            for (var oi = 0; oi < optPs.length; oi++) {
              optPs[oi].classList.toggle('ex-opt-ans', !!(show && spec && String(oi) === String(spec.a)));
            }
          },
          reset: function () {
            curOpt = '';
            for (var oi = 0; oi < optPs.length; oi++) optPs[oi].classList.remove('ex-ok', 'ex-bad');
            syncOpts();
            record(optId, '', true);
          },
          isFilled: function () { return curOpt !== ''; }
        });
        var rBox = document.createElement('div');
        rBox.className = 'ex-box';
        rBox.appendChild(makeTextarea(sec, prefix + 'rs', 'ex-area', 2, 'السَّبَبُ…'));
        var lastOpt = optPs[optPs.length - 1];
        lastOpt.parentNode.insertBefore(rBox, lastOpt.nextSibling);
        qObj.anchorEl = rBox;
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
      if (qObj.anchorEl === baytP) qObj.anchorEl = vBox;
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
      qObj.anchorEl = box;
    }
  }

  // ---- Build all exercise sections ----
  for (var si = 0; si < rawSections.length; si++) {
    var rs = rawSections[si];
    rs.h2.classList.add('ex-head');

    var bar = document.createElement('div');
    bar.className = 'ex-bar';
    var meta = document.createElement('span');
    meta.className = 'ex-bar-meta';
    var cnt = document.createElement('span');
    cnt.className = 'ex-cnt';
    var sScore = document.createElement('span');
    sScore.className = 'ex-sscore';
    meta.appendChild(cnt);
    meta.appendChild(sScore);

    var acts = document.createElement('span');
    acts.className = 'ex-bar-acts';
    var clr = document.createElement('button');
    clr.type = 'button';
    clr.className = 'ex-clr';
    clr.textContent = 'مسح الإجابات';
    clr.hidden = true;
    acts.appendChild(clr);
    bar.appendChild(meta);
    bar.appendChild(acts);
    rs.h2.parentNode.insertBefore(bar, rs.h2.nextSibling);

    var sec = { fields: [], questions: [], countEl: cnt, scoreEl: sScore, clearBtn: clr, actsEl: acts, barEl: bar };
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
        for (var qi2 = 0; qi2 < sObj.questions.length; qi2++) {
          var qo = sObj.questions[qi2];
          if (qo.scoreEl) { qo.scoreEl.textContent = ''; qo.scoreEl.className = 'ex-qscore'; }
        }
        if (sObj.scoreEl) { sObj.scoreEl.textContent = ''; sObj.scoreEl.className = 'ex-sscore'; }
        updateSectionCount(sObj);
      });
    })(sec, clr);

    for (var qi = 0; qi < rs.subs.length; qi++) {
      enhanceSub(sec, si + 1, qi, rs.subs[qi]);
    }
    updateSectionCount(sec);
  }

  // ---- Mount answer-checking and show-answer controls once answer key loads ----
  function mountAnswerUI() {
    if (!answerKey) return;
    for (var si = 0; si < sections.length; si++) {
      var sec = sections[si];
      var secHasKey = false;
      for (var qi = 0; qi < sec.questions.length; qi++) {
        var qObj = sec.questions[qi];
        var qData = answerKey[qObj.key];
        if (!qData || !qObj.anchorEl) continue;
        secHasKey = true;

        var qBar = document.createElement('div');
        qBar.className = 'ex-qbar';

        var chkBtn = document.createElement('button');
        chkBtn.type = 'button';
        chkBtn.className = 'ex-qbtn ex-chk';
        chkBtn.textContent = 'تَحَقَّقْ';

        var ansBtn = document.createElement('button');
        ansBtn.type = 'button';
        ansBtn.className = 'ex-qbtn ex-rev';
        ansBtn.textContent = 'إِظْهَارُ الْإِجَابَةِ';
        ansBtn.setAttribute('aria-expanded', 'false');

        var qScore = document.createElement('span');
        qScore.className = 'ex-qscore';

        qBar.appendChild(chkBtn);
        qBar.appendChild(ansBtn);
        qBar.appendChild(qScore);

        var panel = renderAnswerPanel(qData);

        qObj.barEl = qBar;
        qObj.scoreEl = qScore;
        qObj.ansBtn = ansBtn;
        qObj.panelEl = panel;

        var par = qObj.anchorEl.parentNode;
        var next = qObj.anchorEl.nextSibling;
        par.insertBefore(qBar, next);
        par.insertBefore(panel, qBar.nextSibling);

        (function (qo) {
          chkBtn.addEventListener('click', function () { checkQuestion(qo, false); });
          ansBtn.addEventListener('click', function () { setQuestionReveal(qo, !qo.shown); });
        })(qObj);
      }

      if (secHasKey) {
        sec.barEl.classList.add('has-key');
        (function (sObj) {
          var sChk = document.createElement('button');
          sChk.type = 'button';
          sChk.className = 'ex-clr ex-schk';
          sChk.textContent = 'تَحَقَّقْ مِنَ الْكُلِّ';
          sChk.addEventListener('click', function () {
            var ok = 0, total = 0;
            for (var i = 0; i < sObj.questions.length; i++) {
              var r = checkQuestion(sObj.questions[i], true);
              if (r) { ok += r.ok; total += r.total; }
            }
            if (total > 0) {
              sObj.scoreEl.textContent = ok === total ? 'الْكُلُّ صَحِيحٌ ✓' : (arN(ok) + ' / ' + arN(total) + ' صَحِيحٌ');
              sObj.scoreEl.className = 'ex-sscore ' + (ok === total ? 'ok' : (ok > 0 ? 'part' : 'bad'));
            }
          });

          var sRev = document.createElement('button');
          sRev.type = 'button';
          sRev.className = 'ex-clr ex-srev';
          sRev.textContent = 'إِظْهَارُ الْإِجَابَاتِ';
          var allShown = false;
          sRev.addEventListener('click', function () {
            allShown = !allShown;
            for (var i = 0; i < sObj.questions.length; i++) {
              setQuestionReveal(sObj.questions[i], allShown);
            }
            sRev.textContent = allShown ? 'إِخْفَاءُ الْإِجَابَاتِ' : 'إِظْهَارُ الْإِجَابَاتِ';
            sRev.classList.toggle('on', allShown);
          });

          sObj.actsEl.insertBefore(sRev, sObj.clearBtn);
          sObj.actsEl.insertBefore(sChk, sRev);
        })(sec);
      }
    }
  }

  function loadAnswerKey() {
    var sc = document.querySelector('script[src*="exercises.js"]');
    var ver = '';
    if (sc) {
      var vm = sc.getAttribute('src').match(/\?v=([a-zA-Z0-9_-]+)/);
      if (vm) ver = '?v=' + vm[1];
    }
    fetch('../exercises/' + encodeURIComponent(slug) + '.json' + ver)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.questions) return;
        answerKey = d.questions;
        mountAnswerUI();
      })
      .catch(function () {});
  }
  loadAnswerKey();

  // ---- Lifecycle sync hooks ----
  pullSync();
  document.addEventListener('km:auth', function (e) { if (e.detail && e.detail.signedIn) pullSync(); });
  addEventListener('pagehide', function () { clearTimeout(saveTimer); persistLocal(); flushSync(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { clearTimeout(saveTimer); persistLocal(); flushSync(true); }
  });
})();
