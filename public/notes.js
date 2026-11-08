// Footnotes as pop-ups: each «(n)» in the text becomes a small number button; tapping it opens
// that page's note in a box under the number (close with ×, a tap outside, or Esc).
// Works on the .fn blocks sync.py writes after each page's text; notes it can't pair stay as they are.
(function () {
  var NUM = /\(([٠-٩0-9]+)\)/g, LEAD = /^\s*\(([٠-٩0-9]+)\)\s*/;
  var pop, cur, carry = null;  // carry = last note of the previous page (a note can run onto the next page)

  function close() {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    if (cur) cur.setAttribute('aria-expanded', 'false');
    cur = null;
  }

  function open(btn) {
    if (cur === btn) { close(); return; }
    close();
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'note-pop'; pop.setAttribute('role', 'dialog'); pop.hidden = true;
      pop.innerHTML = '<button type="button" class="x" aria-label="إغلاق">×</button><div class="body"></div>';
      pop.querySelector('.x').addEventListener('click', close);
      document.body.appendChild(pop);
    }
    pop.querySelector('.body').innerHTML = '<span class="n">(' + btn.textContent + ')</span> ' + btn._note.html;
    pop.hidden = false;
    cur = btn; btn.setAttribute('aria-expanded', 'true');
    place();
  }

  function place() {
    if (!cur) return;
    var r = cur.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var w = pop.offsetWidth, h = pop.offsetHeight, mid = r.left + r.width / 2;
    var left = Math.max(8, Math.min(mid - w / 2, vw - w - 8));
    var below = vh - r.bottom > h + 16 || r.top < h + 16;
    pop.classList.toggle('up', !below);
    pop.style.left = (left + window.scrollX) + 'px';
    pop.style.top = (below ? r.bottom + 10 : r.top - h - 10) + window.scrollY + 'px';
    pop.style.setProperty('--ax', Math.max(14, Math.min(mid - left, w - 14)) + 'px');
  }

  function pair(fn) {
    var notes = {}, last = carry;
    [].forEach.call(fn.querySelectorAll('p'), function (p) {
      var m = p.textContent.match(LEAD);
      if (m && !notes[m[1]]) {
        last = notes[m[1]] = { html: p.innerHTML.replace(LEAD, ''), ps: [p] };
      } else if (last) { last.html += '<br>' + p.innerHTML; last.ps.push(p); }
    });
    carry = last;
    var els = [];
    for (var e = fn.previousElementSibling; e && !e.classList.contains('fn'); e = e.previousElementSibling) els.unshift(e);
    els.forEach(function (el) {
      var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
      while (w.nextNode()) nodes.push(w.currentNode);
      nodes.forEach(function (t) {
        var s = t.nodeValue, i = 0, m, frag = null;
        NUM.lastIndex = 0;
        while ((m = NUM.exec(s))) {
          var n = notes[m[1]];
          if (!n || n.used) continue;
          n.used = true;
          frag = frag || document.createDocumentFragment();
          frag.appendChild(document.createTextNode(s.slice(i, m.index)));
          var b = document.createElement('button');
          b.type = 'button'; b.className = 'nref'; b.textContent = m[1];
          b.setAttribute('aria-label', 'الحاشية ' + m[1]); b.setAttribute('aria-expanded', 'false');
          b._note = n;
          frag.appendChild(b);
          i = m.index + m[0].length;
        }
        if (frag) { frag.appendChild(document.createTextNode(s.slice(i))); t.parentNode.replaceChild(frag, t); }
      });
    });
    Object.keys(notes).forEach(function (k) { var n = notes[k];
      if (n.used) n.ps.forEach(function (p) { p.remove(); });
    });
    if (last && last.used) last.ps.forEach(function (p) { p.remove(); });
    if (!fn.querySelector('p')) fn.remove();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var text = document.querySelector('.text');
    if (!text) return;
    [].forEach.call(text.querySelectorAll('.fn'), pair);
    text.addEventListener('click', function (e) {
      var b = e.target.closest('.nref');
      if (b) { e.stopPropagation(); open(b); }
    });
    document.addEventListener('click', function (e) {
      if (pop && !pop.hidden && !pop.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    window.addEventListener('resize', place);
  });
})();
