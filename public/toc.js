// Book pages: a round button (bottom corner) opens the list of the book's own headings (.text h2);
// tapping one goes there. The heading being read is marked. Only on books with 3 headings or more.
// Jumps don't touch the address (#…), so progress.js keeps saving the reading place.
(function () {
  var hs = [].slice.call(document.querySelectorAll('.text h2')).filter(function (h) {
    return !h.classList.contains('basmala') && label(h);
  });
  if (hs.length < 3) return;

  function label(h) {
    var c = h.cloneNode(true);
    [].forEach.call(c.querySelectorAll('sup, button, .fn'), function (x) { x.remove(); });
    return c.textContent.replace(/\s+/g, ' ').trim();
  }

  var btn = document.createElement('button');
  btn.id = 'tocbtn'; btn.type = 'button'; btn.setAttribute('aria-label', 'الفهرس'); btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/></svg>';
  var back = document.createElement('div'); back.id = 'toc-back'; back.hidden = true;
  var pop = document.createElement('nav'); pop.id = 'toc'; pop.hidden = true;
  var ol = document.createElement('ol');
  var items = hs.map(function (h) {
    var li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.textContent = label(h);
    b.onclick = function () {
      close();
      scrollTo(0, scrollY + h.getBoundingClientRect().top - 12);
    };
    li.appendChild(b); ol.appendChild(li);
    return b;
  });
  pop.appendChild(ol);
  document.body.appendChild(back); document.body.appendChild(pop); document.body.appendChild(btn);

  function current() {  // last heading above the upper third of the screen
    var n = -1;
    for (var i = 0; i < hs.length; i++) { if (hs[i].getBoundingClientRect().top < innerHeight / 3) n = i; else break; }
    return n;
  }
  function open() {
    var n = current();
    items.forEach(function (b, i) { if (i === n) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    pop.hidden = back.hidden = false; btn.setAttribute('aria-expanded', 'true');
    var t = items[Math.max(n, 0)];
    pop.scrollTop = t.offsetTop - pop.clientHeight / 2 + t.offsetHeight / 2;
  }
  function close() { pop.hidden = back.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  btn.onclick = function () { if (pop.hidden) open(); else close(); };
  back.onclick = close;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  // the button shows once the reader is past the title
  var on = false;
  function vis() {
    var v = scrollY > innerHeight * 0.6;
    if (v !== on) { on = v; btn.classList.toggle('on', v); }
  }
  addEventListener('scroll', vis, { passive: true }); vis();
})();
