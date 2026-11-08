// Dark look is opt-in through the moon button, remembered in this browser; the site opens light.
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
  try { if (localStorage.getItem('theme') === 'dark') root.dataset.theme = 'dark'; } catch (e) {}
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme');
    if (!btn) return;
    var show = function () {
      var l = root.dataset.theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي';
      btn.setAttribute('aria-label', l); btn.title = l;
    };
    btn.addEventListener('click', function () {
      var d = root.dataset.theme !== 'dark';
      if (d) root.dataset.theme = 'dark'; else delete root.dataset.theme;
      try { localStorage.setItem('theme', d ? 'dark' : 'light'); } catch (e) {}
      show();
    });
    show();
  });
})();
