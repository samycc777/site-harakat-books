// Dark look is opt-in through the moon button, remembered in this browser; the site opens light.
// Loaded in <head> without defer so the saved look applies before the page paints.
(function () {
  var root = document.documentElement;
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
