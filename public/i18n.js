// Multilingual UI shell (AR / EN / FR) — keeps all Arabic book texts & titles untouched,
// translates interface buttons, navigation, search, reader controls, and /print/ & /support/ pages.
(function () {
  var LANGS = ['ar', 'en', 'fr'];
  var BADGE = { ar: 'ع', en: 'EN', fr: 'FR' };
  var NEXT_LABEL = {
    ar: 'تغيير لغة الواجهة (AR / EN / FR)',
    en: 'Switch UI language (AR / EN / FR)',
    fr: 'Changer la langue de l’interface (AR / EN / FR)'
  };

  var STR = {
    ar: {
      start_pill: 'بماذا يبدأ طالب العلم؟',
      print_pill: 'الطَّبْعَةُ الْوَرَقِيَّةُ',
      support_pill: 'دَعْمُ الْمَشْرُوعِ',
      back_home: 'الْعَوْدَةُ إِلَى الْمَكْتَبَةِ',
      by_author: 'حسب المؤلف',
      by_science: 'حسب العلم',
      h_all: 'الكل',
      h_yes: 'مشكولة',
      h_no: 'غير مشكولة',
      search_home: 'ابحث عن كتاب أو مؤلف',
      search_author: 'ابحث عن كتاب',
      no_results: 'لا توجد نتائج',
      dl_pdf: 'تحميل PDF',
      source: 'المصدر',
      print_btn: 'الطَّبْعَةُ الْوَرَقِيَّةُ',
      sponsor_btn: 'اكْفُلْ تَشْكِيلَ هَذَا الْكِتَابِ',
      harakat_on: 'إخفاء التشكيل (تدريب)',
      harakat_off: 'إظهار التشكيل الكامل',
      harakat_short_on: 'تشكيل',
      harakat_short_off: 'تدريب',
      dict_btn: 'معجم',
      dict_title: 'انقر على أي كلمة للبحث في المعجم وحفظ المفردات',
      vocab_btn: 'مفرداتي',
      quote_btn: 'بطاقة اقتباس',
      copy_link: 'نسخ رابط الفقرة',
      copied: 'نُسِخَ ✓',
      report_open: 'إبلاغ عن خطأ',
      toc: 'الفهرس',
      find_book: 'بحث في الكتاب',
      to_top: 'أعلى الصفحة'
    },
    en: {
      start_pill: 'Where to Start?',
      print_pill: 'Print Editions',
      support_pill: 'Support Mashkula',
      back_home: 'Back to Library',
      by_author: 'By Author',
      by_science: 'By Science',
      h_all: 'All',
      h_yes: 'With Harakat',
      h_no: 'Unvocalized',
      search_home: 'Search book or author (Arabic)…',
      search_author: 'Search book (Arabic)…',
      no_results: 'No results found',
      dl_pdf: 'PDF',
      source: 'Source',
      print_btn: 'Print Edition',
      sponsor_btn: 'Sponsor Harakat',
      harakat_on: 'Hide Harakat (Practice Mode — tap any word to peek)',
      harakat_off: 'Show Full Harakat',
      harakat_short_on: 'Harakat',
      harakat_short_off: 'Practice',
      dict_btn: 'Dict',
      dict_title: 'Tap any Arabic word for dictionary lookup & vocab list',
      vocab_btn: 'My Vocab',
      quote_btn: 'Quote Card',
      copy_link: 'Copy Passage Link',
      copied: 'Copied ✓',
      report_open: 'Report a Typo / Harakah',
      toc: 'Contents',
      find_book: 'Search in book',
      to_top: 'Back to top'
    },
    fr: {
      start_pill: 'Par où commencer ?',
      print_pill: 'Éditions imprimées',
      support_pill: 'Soutenir le projet',
      back_home: 'Retour à la bibliothèque',
      by_author: 'Par auteur',
      by_science: 'Par science',
      h_all: 'Tous',
      h_yes: 'Avec harakat',
      h_no: 'Sans harakat',
      search_home: 'Rechercher un livre ou un auteur (arabe)…',
      search_author: 'Rechercher un livre (arabe)…',
      no_results: 'Aucun résultat',
      dl_pdf: 'PDF',
      source: 'Source',
      print_btn: 'Édition imprimée',
      sponsor_btn: 'Parrainer les harakat',
      harakat_on: 'Masquer les harakat (Entraînement — toucher un mot)',
      harakat_off: 'Afficher toutes les harakat',
      harakat_short_on: 'Harakat',
      harakat_short_off: 'Pratique',
      dict_btn: 'Dico',
      dict_title: 'Toucher un mot arabe pour le dictionnaire et vos fiches',
      vocab_btn: 'Vocabulaire',
      quote_btn: 'Image citation',
      copy_link: 'Copier le lien',
      copied: 'Copié ✓',
      report_open: 'Signaler une erreur',
      toc: 'Sommaire',
      find_book: 'Rechercher dans le livre',
      to_top: 'Haut de page'
    }
  };

  function getLang() {
    try {
      var u = new URLSearchParams(location.search).get('lang');
      if (u && STR[u]) { localStorage.setItem('lang', u); return u; }
      var s = localStorage.getItem('lang');
      if (s && STR[s]) return s;
    } catch (e) {}
    return 'ar';
  }

  var cur = getLang();
  function t(key) { return (STR[cur] && STR[cur][key]) || STR.ar[key] || key; }

  function applyLang(lang) {
    if (!STR[lang]) lang = 'ar';
    cur = lang;
    document.documentElement.dataset.uiLang = lang;
    try {
      if (lang === 'ar') localStorage.removeItem('lang');
      else localStorage.setItem('lang', lang);
    } catch (e) {}

    var btn = document.getElementById('lang');
    if (btn) {
      btn.textContent = BADGE[lang];
      btn.title = NEXT_LABEL[lang];
      btn.setAttribute('aria-label', NEXT_LABEL[lang]);
      btn.setAttribute('aria-pressed', String(lang !== 'ar'));
    }

    // Toggle language-specific content blocks (.lang-ar / .lang-en / .lang-fr)
    var blocks = document.querySelectorAll('.lang-ar, .lang-en, .lang-fr');
    for (var i = 0; i < blocks.length; i++) {
      var el = blocks[i];
      el.hidden = !el.classList.contains('lang-' + lang);
    }

    // Translate explicit [data-i18n] nodes
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var j = 0; j < nodes.length; j++) {
      var key = nodes[j].getAttribute('data-i18n');
      if (STR[lang][key] !== undefined) nodes[j].textContent = STR[lang][key];
    }

    // Translate standard controls across home, author, and book pages
    var mapSel = [
      ['.views button[data-view="author"]', 'by_author'],
      ['.views button[data-view="science"]', 'by_science'],
      ['.harakat button[data-h="all"]', 'h_all'],
      ['.harakat button[data-h="1"]', 'h_yes'],
      ['.harakat button[data-h="0"]', 'h_no'],
      ['#none', 'no_results'],
      ['#report-open', 'report_open']
    ];
    for (var k = 0; k < mapSel.length; k++) {
      var el2 = document.querySelector(mapSel[k][0]);
      if (el2) el2.textContent = t(mapSel[k][1]);
    }

    var q = document.getElementById('q');
    if (q) {
      var isHome = !!document.querySelector('.views [data-view]');
      var ph = t(isHome ? 'search_home' : 'search_author');
      q.placeholder = ph;
      q.setAttribute('aria-label', ph);
    }

    // Book page PDF button label
    var pdfBtn = document.querySelector('.actions a.btn[download]');
    if (pdfBtn) pdfBtn.textContent = t('dl_pdf');

    document.dispatchEvent(new CustomEvent('km:lang', { detail: lang }));
  }

  window.KM_I18N = {
    lang: function () { return cur; },
    t: t,
    set: applyLang
  };

  function init() {
    var btn = document.getElementById('lang');
    if (btn) {
      btn.addEventListener('click', function () {
        var idx = (LANGS.indexOf(cur) + 1) % LANGS.length;
        applyLang(LANGS[idx]);
      });
    }
    applyLang(cur);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
