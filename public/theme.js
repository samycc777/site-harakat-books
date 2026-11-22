// Dark and other colours are opt-in through the moon button, remembered in this browser; the site opens light.
// Loaded in <head> without defer so the saved look applies before the page paints.
// Two looks: "paper" (everyone: white page in a red frame, like the المقالات الواضحات videos) and
// "classic" (Bilal only): opening any page with ?look=classic remembers it in this browser, ?look=paper undoes it.
(function () {
  var root = document.documentElement;
  try {
    var m = location.search.match(/[?&]look=(classic|paper)\b/);
    if (m) {
      if (m[1] === 'classic') localStorage.setItem('look', 'classic'); else localStorage.removeItem('look');
      history.replaceState(null, '', location.pathname + location.hash);
    }
    if (localStorage.getItem('look') === 'classic') root.dataset.look = 'classic';
  } catch (e) {}
  // Colours: the moon button opens a row of colour circles. "light"/"dark" are the first two looks;
  // the others set data-palette (CSS at the end of site.css), and the dark ones also data-theme=dark.
  var DARK = { dark: 1, blue: 1, black: 1, darkgreen: 1, nextjs: 1 };
  var apply = function (t) {
    if (DARK[t]) root.dataset.theme = 'dark'; else delete root.dataset.theme;
    if (t === 'light' || t === 'dark') delete root.dataset.palette; else root.dataset.palette = t;
  };
  var saved = function () {
    try { return localStorage.getItem('palette') || (localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'); } catch (e) { return 'light'; }
  };
  apply(saved());
  // Home page: books by author (default) or by subject («حسب العلم»), remembered in this browser.
  try { if (localStorage.getItem('view') === 'science') root.dataset.view = 'science'; } catch (e) {}
  document.addEventListener('DOMContentLoaded', function () {
    var views = document.querySelectorAll('.views button[data-view]');
    var mark = function () {
      var v = root.dataset.view || 'author';
      for (var i = 0; i < views.length; i++) views[i].setAttribute('aria-pressed', views[i].dataset.view === v);
    };
    for (var i = 0; i < views.length; i++) views[i].addEventListener('click', function () {
      var v = this.dataset.view;
      if (v === 'science') root.dataset.view = 'science'; else delete root.dataset.view;
      try { if (v === 'science') localStorage.setItem('view', 'science'); else localStorage.removeItem('view'); } catch (e) {}
      mark();
    });
    if (views.length) mark();
    var btn = document.getElementById('theme');
    if (!btn) return;
    var paper = root.dataset.look !== 'classic';
    var T = [ // name, label, circle colours
      ['light', 'نهاري', paper ? ['#fff', '#a3222b'] : ['#fbf8f1', '#8a6d3b']],
      ['dark', 'ليلي', paper ? ['#0f1b2d', '#f2a097'] : ['#1e1e1e', '#b8955a']],
      ['green', 'أخضر', ['#f3f6ef', '#2c6b45']],
      ['blue', 'أزرق ليلي', ['#0f1724', '#8cbbe6']],
      ['black', 'أسود', ['#000', '#d4b06a']],
      ['darkgreen', 'أخضر ليلي', ['#141b16', '#9fd0a8']],
      ['nextjs', 'Next.js', ['#000', '#ededed']]
    ];
    btn.setAttribute('aria-label', 'الألوان'); btn.title = 'الألوان';
    btn.setAttribute('aria-expanded', 'false');
    var pop = null;
    var close = function () { if (pop) { pop.remove(); pop = null; btn.setAttribute('aria-expanded', 'false'); } };
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (pop) return close();
      pop = document.createElement('div'); pop.id = 'theme-pop';
      var cur = saved();
      T.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button'; b.title = t[1]; b.setAttribute('aria-label', t[1]);
        b.setAttribute('aria-pressed', t[0] === cur);
        b.style.setProperty('--a', t[2][0]); b.style.setProperty('--b', t[2][1]);
        b.addEventListener('click', function () {
          apply(t[0]);
          try {
            localStorage.setItem('theme', DARK[t[0]] ? 'dark' : 'light');
            if (t[0] === 'light' || t[0] === 'dark') localStorage.removeItem('palette'); else localStorage.setItem('palette', t[0]);
          } catch (e) {}
          close(); btn.focus();
        });
        pop.appendChild(b);
      });
      btn.parentNode.appendChild(pop);
      btn.setAttribute('aria-expanded', 'true');
      pop.querySelector('[aria-pressed=true]').focus();
    });
    document.addEventListener('click', function (e) { if (pop && !pop.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pop) { close(); btn.focus(); } });
  });
})();
