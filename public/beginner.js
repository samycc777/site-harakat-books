// Beginner reading superpowers on book pages (loaded defer after reader.js):
// 1. Harakat Practice Toggle (hide harakat on prose, tap any word to peek its vowels; Quran ﴿...﴾ always stays vocalized).
// 2. Tap-a-Word Arabic Dictionary & Personal Vocabulary Saver (Almaany AR/EN/FR + Ejtaal/Hans Wehr + Anki TSV export).
// 3. Selection Mini-Toolbar: Copy Passage Deep-Link (#pN) + Shareable Vocalized Quote Card PNG (canvas, double frame).
(function () {
  var art = document.querySelector('article.text');
  if (!art) return;

  var DIAC = /[\u064B-\u065F\u0670]/;
  var DIAC_G = /[\u064B-\u065F\u0670]/g;
  var AR_WORD = /([\u0621-\u064A\u0671][\u0621-\u064A\u064B-\u065F\u0670\u0640\u0671]*)/g;
  var VOCAB_KEY = 'km_vocab_v1';

  function t(k) { return (window.KM_I18N && window.KM_I18N.t(k)) || k; }
  function lang() { return (window.KM_I18N && window.KM_I18N.lang()) || 'ar'; }
  function stripHarakat(s) { return s.replace(DIAC_G, ''); }

  var hasHarakat = DIAC.test(art.textContent.slice(0, 6000));
  var slug = location.pathname.split('/').filter(Boolean)[0] || '';
  var bookTitle = (document.querySelector('h1') && document.querySelector('h1').textContent.trim()) || '';
  var authorEl = document.querySelector('.actions .meta a.src');
  var bookAuthor = authorEl ? authorEl.textContent.trim() : '';

  // Wait briefly if reader.js hasn't created .read-tools yet (both are defer in order, so it's already there)
  var tools = document.querySelector('.read-tools');
  var actions = document.querySelector('.actions');
  if (!tools && actions) {
    tools = document.createElement('div');
    tools.className = 'read-tools';
    var meta = actions.querySelector('.meta');
    if (meta) actions.insertBefore(tools, meta); else actions.appendChild(tools);
  }

  // ---- Word-wrapping helper (runs lazily on first practice or dict activation) ----
  var wrapped = false;
  function wrapWords() {
    if (wrapped) return;
    wrapped = true;
    var els = art.querySelectorAll('p, h2, h3, td, th, .tree .node');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest('.fn') || el.closest('.ex-ans-panel')) continue;
      if (el.querySelector('p, h2, h3')) continue;
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      var nodes = [];
      while (walker.nextNode()) {
        var n = walker.currentNode;
        var p = n.parentNode;
        if (!p) continue;
        if (p.closest && p.closest('.quran, .nref, button, input, textarea, .ex-word, .hw')) continue;
        if (AR_WORD.test(n.nodeValue)) nodes.push(n);
        AR_WORD.lastIndex = 0;
      }
      for (var j = 0; j < nodes.length; j++) {
        var tn = nodes[j], str = tn.nodeValue, frag = document.createDocumentFragment(), last = 0, m;
        AR_WORD.lastIndex = 0;
        while ((m = AR_WORD.exec(str))) {
          if (m.index > last) frag.appendChild(document.createTextNode(str.slice(last, m.index)));
          var sp = document.createElement('span');
          sp.className = 'hw';
          sp.dataset.v = m[0];
          sp.dataset.b = stripHarakat(m[0]);
          sp.textContent = m[0];
          frag.appendChild(sp);
          last = m.index + m[0].length;
        }
        if (last < str.length) frag.appendChild(document.createTextNode(str.slice(last)));
        tn.parentNode.replaceChild(frag, tn);
      }
    }
  }

  // ---- 1. Harakat Practice Mode (Hide Harakat + Tap-to-Peek) ----
  var practiceOn = false;
  var bHarakat = null, banner = null;

  function updateBanner() {
    if (!banner) return;
    var L = lang();
    var msg = practiceOn
      ? (L === 'en' ? 'Practice Mode: harakat hidden — tap any word to peek its vowels.'
        : L === 'fr' ? 'Mode pratique : harakat masquées — touchez un mot pour révéler ses voyelles.'
        : 'وَضْعُ التَّدْرِيبِ: التَّشْكِيلُ مَخْفِيٌّ — انْقُرْ عَلَى أَيِّ كَلِمَةٍ لِإِظْهَارِ تَشْكِيلِهَا.')
      : (L === 'en' ? 'Dictionary Mode: tap any Arabic word to look it up or save it to My Vocab.'
        : L === 'fr' ? 'Mode dictionnaire : touchez un mot arabe pour le chercher ou l’enregistrer.'
        : 'وَضْعُ الْمُعْجَمِ: انْقُرْ عَلَى أَيِّ كَلِمَةٍ لِلْبَحْثِ عَنْ مَعْنَاهَا أَوْ حِفْظِهَا فِي مُفْرَدَاتِكَ.');
    banner.querySelector('.m').textContent = msg;
  }

  function ensureBanner() {
    if (banner) return;
    banner = document.createElement('div');
    banner.className = 'mode-banner';
    banner.hidden = true;
    banner.innerHTML = '<span class="m"></span><button type="button" class="x" aria-label="إغلاق">×</button>';
    banner.querySelector('.x').onclick = function () {
      if (practiceOn) setPractice(false);
      if (dictOn) setDict(false);
    };
    art.parentNode.insertBefore(banner, art);
  }

  function setPractice(on) {
    if (on && !wrapped) wrapWords();
    practiceOn = on;
    if (on && dictOn) setDict(false);
    art.classList.toggle('practice-on', on);
    var spans = art.querySelectorAll('span.hw');
    for (var i = 0; i < spans.length; i++) {
      var sp = spans[i];
      sp.classList.remove('peek');
      sp.textContent = on ? sp.dataset.b : sp.dataset.v;
    }
    if (bHarakat) {
      bHarakat.setAttribute('aria-pressed', String(on));
      syncToolLabels();
    }
    ensureBanner();
    banner.hidden = !(practiceOn || dictOn);
    if (!banner.hidden) updateBanner();
  }

  // ---- 2. Tap-a-Word Dictionary & Vocabulary Saver ----
  var dictOn = false;
  var bDict = null, dictPop = null, vocabDrawer = null;

  function loadVocab() {
    try { return JSON.parse(localStorage.getItem(VOCAB_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function saveVocab(list) {
    try { localStorage.setItem(VOCAB_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function closeDictPop() {
    if (dictPop) dictPop.hidden = true;
  }

  function setDict(on) {
    if (on && !wrapped) wrapWords();
    dictOn = on;
    if (on && practiceOn) setPractice(false);
    art.classList.toggle('dict-on', on);
    if (!on) closeDictPop();
    if (bDict) bDict.setAttribute('aria-pressed', String(on));
    ensureBanner();
    banner.hidden = !(practiceOn || dictOn);
    if (!banner.hidden) updateBanner();
  }

  function openDictFor(sp) {
    var vow = sp.dataset.v || sp.textContent.trim();
    var bare = sp.dataset.b || stripHarakat(vow);
    if (!bare) return;
    document.dispatchEvent(new CustomEvent('km:pop', { detail: 'dict' }));
    if (!dictPop) {
      dictPop = document.createElement('div');
      dictPop.id = 'dict-pop';
      dictPop.setAttribute('role', 'dialog');
      dictPop.hidden = true;
      document.body.appendChild(dictPop);
    }
    var list = loadVocab();
    var saved = list.some(function (x) { return x.b === bare; });
    var enc = encodeURIComponent(bare);
    var L = lang();
    var saveLbl = saved
      ? (L === 'en' ? 'Saved ✓' : L === 'fr' ? 'Enregistré ✓' : 'مَحْفُوظَةٌ ✓')
      : (L === 'en' ? '+ Save to My Vocab' : L === 'fr' ? '+ Enregistrer' : '+ حِفْظٌ فِي مُفْرَدَاتِي');
    var listLbl = (L === 'en' ? 'My Vocab' : L === 'fr' ? 'Mes fiches' : 'مُفْرَدَاتِي') + ' (' + list.length + ')';

    dictPop.innerHTML =
      '<button type="button" class="x" aria-label="إغلاق">×</button>' +
      '<div class="dw">' + vow + '</div>' +
      '<div class="db">' + bare + '</div>' +
      '<div class="dlinks">' +
        '<a target="_blank" rel="noopener" href="https://www.almaany.com/ar/dict/ar-ar/' + enc + '/">المعاني (عربي)</a>' +
        '<a target="_blank" rel="noopener" href="https://www.almaany.com/en/dict/ar-en/' + enc + '/">Almaany EN</a>' +
        '<a target="_blank" rel="noopener" href="https://www.almaany.com/fr/dict/ar-fr/' + enc + '/">Almaany FR</a>' +
        '<a target="_blank" rel="noopener" href="https://ejtaal.net/aa/#hw4=' + enc + '">Hans Wehr / Lane</a>' +
      '</div>' +
      '<div class="dacts">' +
        '<button type="button" class="btn sm" id="d-save">' + saveLbl + '</button>' +
        '<button type="button" class="btn light sm" id="d-open-v">' + listLbl + '</button>' +
      '</div>';

    dictPop.querySelector('.x').onclick = closeDictPop;
    dictPop.querySelector('#d-save').onclick = function () {
      var cur = loadVocab();
      if (!cur.some(function (x) { return x.b === bare; })) {
        cur.unshift({ v: vow, b: bare, book: bookTitle, slug: slug, t: Date.now() });
        saveVocab(cur.slice(0, 500));
      }
      openDictFor(sp);
    };
    dictPop.querySelector('#d-open-v').onclick = function () {
      closeDictPop();
      openVocabDrawer();
    };

    dictPop.hidden = false;
    var r = sp.getBoundingClientRect();
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var w = dictPop.offsetWidth, h = dictPop.offsetHeight;
    var left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, vw - w - 8));
    var below = vh - r.bottom > h + 16 || r.top < h + 16;
    dictPop.style.left = (left + window.scrollX) + 'px';
    dictPop.style.top = (below ? r.bottom + 8 : r.top - h - 8) + window.scrollY + 'px';
  }

  function openVocabDrawer() {
    if (!vocabDrawer) {
      vocabDrawer = document.createElement('div');
      vocabDrawer.id = 'vocab-modal';
      vocabDrawer.hidden = true;
      document.body.appendChild(vocabDrawer);
    }
    var list = loadVocab();
    var L = lang();
    var heading = L === 'en' ? 'My Saved Vocabulary' : L === 'fr' ? 'Mon vocabulaire enregistré' : 'مُفْرَدَاتِي الْمَحْفُوظَةُ';
    var emptyMsg = L === 'en' ? 'No saved words yet. Tap any word in Dictionary Mode to save it.'
      : L === 'fr' ? 'Aucun mot enregistré. Touchez un mot en mode dictionnaire.'
      : 'لَا تُوجَدُ كَلِمَاتٌ مَحْفُوظَةٌ بَعْدُ. فَعِّلْ وَضْعَ الْمُعْجَمِ وَانْقُرْ عَلَى أَيِّ كَلِمَةٍ لِحِفْظِهَا.';
    var exportLbl = L === 'en' ? 'Export Anki / TSV' : L === 'fr' ? 'Exporter Anki / TSV' : 'تَصْدِيرٌ لِـ Anki (TSV)';
    var clearLbl = L === 'en' ? 'Clear All' : L === 'fr' ? 'Tout effacer' : 'مَسْحُ الْكُلِّ';

    var rows = list.length ? list.map(function (item, idx) {
      var enc = encodeURIComponent(item.b);
      return '<li><span class="vw">' + item.v + '</span>' +
        '<span class="vm"><a target="_blank" rel="noopener" href="https://www.almaany.com/en/dict/ar-en/' + enc + '/">EN</a> · ' +
        '<a target="_blank" rel="noopener" href="https://www.almaany.com/fr/dict/ar-fr/' + enc + '/">FR</a> · ' +
        '<a target="_blank" rel="noopener" href="https://www.almaany.com/ar/dict/ar-ar/' + enc + '/">عربي</a></span>' +
        '<button type="button" class="vdel" data-i="' + idx + '" aria-label="حذف">×</button></li>';
    }).join('') : '<p class="meta">' + emptyMsg + '</p>';

    vocabDrawer.innerHTML =
      '<div class="vback"></div>' +
      '<div class="vcard" role="dialog">' +
        '<div class="vhdr"><h3>' + heading + ' (' + list.length + ')</h3><button type="button" class="x" aria-label="إغلاق">×</button></div>' +
        '<div class="vbody"><ul>' + rows + '</ul></div>' +
        '<div class="vfoot">' +
          (list.length ? '<button type="button" class="btn sm" id="v-exp">' + exportLbl + '</button>' : '') +
          (list.length ? '<button type="button" class="btn light sm" id="v-clr">' + clearLbl + '</button>' : '') +
        '</div>' +
      '</div>';

    vocabDrawer.hidden = false;
    var closeV = function () { vocabDrawer.hidden = true; };
    vocabDrawer.querySelector('.vback').onclick = closeV;
    vocabDrawer.querySelector('.x').onclick = closeV;
    var dels = vocabDrawer.querySelectorAll('.vdel');
    for (var i = 0; i < dels.length; i++) {
      dels[i].onclick = function () {
        var cur = loadVocab();
        cur.splice(parseInt(this.dataset.i, 10), 1);
        saveVocab(cur);
        openVocabDrawer();
      };
    }
    var expBtn = vocabDrawer.querySelector('#v-exp');
    if (expBtn) expBtn.onclick = function () {
      var cur = loadVocab();
      var tsv = cur.map(function (x) { return x.b + '\t' + x.v + '\t' + (x.book || ''); }).join('\n');
      var blob = new Blob(['\ufeff' + tsv], { type: 'text/tab-separated-values;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'mashkula-vocab-anki.tsv';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    };
    var clrBtn = vocabDrawer.querySelector('#v-clr');
    if (clrBtn) clrBtn.onclick = function () {
      saveVocab([]);
      openVocabDrawer();
    };
  }

  // Click delegation on article words
  art.addEventListener('click', function (e) {
    if (!practiceOn && !dictOn) return;
    var sp = e.target.closest('span.hw');
    if (!sp || !art.contains(sp)) return;
    if (practiceOn) {
      var peeked = sp.classList.toggle('peek');
      sp.textContent = peeked ? sp.dataset.v : sp.dataset.b;
    } else if (dictOn) {
      e.stopPropagation();
      openDictFor(sp);
    }
  });

  // Add buttons to .read-tools
  function syncToolLabels() {
    if (bHarakat) {
      bHarakat.textContent = practiceOn ? t('harakat_short_off') : t('harakat_short_on');
      var lbl = practiceOn ? t('harakat_off') : t('harakat_on');
      bHarakat.title = lbl;
      bHarakat.setAttribute('aria-label', lbl);
    }
    if (bDict) {
      bDict.textContent = t('dict_btn');
      bDict.title = t('dict_title');
      bDict.setAttribute('aria-label', t('dict_title'));
    }
    if (banner && !banner.hidden) updateBanner();
  }

  if (tools) {
    if (hasHarakat) {
      bHarakat = document.createElement('button');
      bHarakat.type = 'button';
      bHarakat.className = 'tool-btn txt';
      bHarakat.setAttribute('aria-pressed', 'false');
      bHarakat.onclick = function () { setPractice(!practiceOn); };
      tools.appendChild(bHarakat);
    }
    bDict = document.createElement('button');
    bDict.type = 'button';
    bDict.className = 'tool-btn txt';
    bDict.setAttribute('aria-pressed', 'false');
    bDict.onclick = function () { setDict(!dictOn); };
    tools.appendChild(bDict);
    syncToolLabels();
  }

  document.addEventListener('km:lang', syncToolLabels);
  document.addEventListener('km:pop', function (e) { if (e.detail !== 'dict') closeDictPop(); });
  document.addEventListener('click', function (e) {
    if (dictPop && !dictPop.hidden && !dictPop.contains(e.target)) closeDictPop();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeDictPop();
      if (vocabDrawer && !vocabDrawer.hidden) vocabDrawer.hidden = true;
      if (quoteModal && !quoteModal.hidden) quoteModal.hidden = true;
    }
  });

  // ---- 3. Selection Mini-Toolbar: Copy Passage Link (#pN) + Shareable Quote Card PNG ----
  var selPop = null, quoteModal = null, selText = '', selParaNum = null;

  function paraNumberOf(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return null;
    var block = el.closest('article.text > p, article.text > h2, article.text > h3');
    if (!block) return null;
    var ps = art.querySelectorAll(':scope > p, :scope > h2, :scope > h3');
    for (var i = 0; i < ps.length; i++) if (ps[i] === block) return i + 1;
    return null;
  }

  function hideSelPop() { if (selPop) selPop.hidden = true; }

  function showSelPop() {
    var s = window.getSelection();
    if (!s || s.isCollapsed) { hideSelPop(); return; }
    var txt = String(s).replace(/\s+/g, ' ').trim();
    if (txt.length < 8 || txt.length > 520) { hideSelPop(); return; }
    if (!art.contains(s.anchorNode) || !art.contains(s.focusNode)) { hideSelPop(); return; }
    selText = txt;
    selParaNum = paraNumberOf(s.anchorNode);

    if (!selPop) {
      selPop = document.createElement('div');
      selPop.id = 'sel-pop';
      selPop.hidden = true;
      selPop.innerHTML =
        '<button type="button" id="sp-quote"></button>' +
        '<button type="button" id="sp-link"></button>';
      document.body.appendChild(selPop);
      selPop.querySelector('#sp-quote').onmousedown = function (e) { e.preventDefault(); };
      selPop.querySelector('#sp-link').onmousedown = function (e) { e.preventDefault(); };
      selPop.querySelector('#sp-quote').onclick = function () {
        hideSelPop();
        openQuoteCard(selText);
      };
      selPop.querySelector('#sp-link').onclick = function () {
        var url = location.origin + location.pathname + (selParaNum ? '#p' + selParaNum : '');
        if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {});
        var btn = selPop.querySelector('#sp-link');
        btn.textContent = t('copied');
        setTimeout(hideSelPop, 900);
      };
    }
    selPop.querySelector('#sp-quote').textContent = t('quote_btn');
    selPop.querySelector('#sp-link').textContent = t('copy_link');
    selPop.querySelector('#sp-link').hidden = !selParaNum;

    var range = s.getRangeAt(0);
    var r = range.getBoundingClientRect();
    if (!r.width && !r.height) { hideSelPop(); return; }
    selPop.hidden = false;
    var w = selPop.offsetWidth, h = selPop.offsetHeight;
    var vw = document.documentElement.clientWidth;
    var left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, vw - w - 8));
    var top = r.top > h + 16 ? r.top - h - 10 : r.bottom + 10;
    selPop.style.left = (left + window.scrollX) + 'px';
    selPop.style.top = (top + window.scrollY) + 'px';
  }

  var selTimer = null;
  document.addEventListener('selectionchange', function () {
    clearTimeout(selTimer);
    selTimer = setTimeout(showSelPop, 220);
  });
  document.addEventListener('pointerdown', function (e) {
    if (selPop && !selPop.hidden && !selPop.contains(e.target)) hideSelPop();
  });

  function wrapCanvasText(ctx, text, maxW) {
    var words = text.split(/\s+/), lines = [], line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function renderQuoteCanvas(quote) {
    var W = 1080;
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var fontName = '"Amiri", "Droid Arabic Naskh", serif';
    var fontSize = quote.length > 260 ? 38 : (quote.length > 150 ? 44 : 50);
    var lineH = Math.round(fontSize * 1.95);
    ctx.font = fontSize + 'px ' + fontName;
    var lines = wrapCanvasText(ctx, quote, W - 210);
    var H = Math.max(1080, Math.min(1560, 360 + lines.length * lineH));
    canvas.width = W;
    canvas.height = H;

    // White paper background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Classic double border matching mashkula.com paper look
    ctx.strokeStyle = '#d99a98';
    ctx.lineWidth = 10;
    ctx.strokeRect(44, 44, W - 88, H - 88);
    ctx.strokeStyle = '#8b1e24';
    ctx.lineWidth = 3;
    ctx.strokeRect(62, 62, W - 124, H - 124);

    // Quote text (centered RTL, crisp black)
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111111';
    ctx.font = fontSize + 'px ' + fontName;
    var blockH = lines.length * lineH;
    var startY = (H - 120) / 2 - blockH / 2 + lineH / 2 + 24;
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], W / 2, startY + i * lineH);
    }

    // Citation break at the bottom border
    var cite = bookTitle.split(':')[0].trim();
    if (bookAuthor) cite += ' — ' + bookAuthor;
    if (cite.length > 64) cite = cite.slice(0, 62) + '…';
    ctx.font = 'bold 28px ' + fontName;
    var cw = Math.min(W - 220, ctx.measureText(cite).width + 56);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect((W - cw) / 2, H - 84, cw, 48);
    ctx.fillStyle = '#8b1e24';
    ctx.fillText(cite, W / 2, H - 62);

    // Subtle site URL inside lower margin
    ctx.direction = 'ltr';
    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#7a6e6c';
    ctx.fillText('mashkula.com', W / 2, H - 110);

    return canvas;
  }

  function openQuoteCard(quote) {
    if (!quoteModal) {
      quoteModal = document.createElement('div');
      quoteModal.id = 'quote-modal';
      quoteModal.hidden = true;
      document.body.appendChild(quoteModal);
    }
    var canvas = renderQuoteCanvas(quote);
    var dataUrl = canvas.toDataURL('image/png');
    var L = lang();
    var hdr = L === 'en' ? 'Shareable Quote Card' : L === 'fr' ? 'Carte de citation à partager' : 'بِطَاقَةُ اقْتِبَاسٍ لِلْمُشَارَكَةِ';
    var dl = L === 'en' ? 'Download PNG' : L === 'fr' ? 'Télécharger PNG' : 'تَحْمِيلُ الصُّورَةِ (PNG)';

    quoteModal.innerHTML =
      '<div class="vback"></div>' +
      '<div class="vcard qcard" role="dialog">' +
        '<div class="vhdr"><h3>' + hdr + '</h3><button type="button" class="x" aria-label="إغلاق">×</button></div>' +
        '<div class="qimg"><img alt=""></div>' +
        '<div class="vfoot">' +
          '<a class="btn sm" id="q-dl" download="mashkula-quote.png">' + dl + '</a>' +
        '</div>' +
      '</div>';
    quoteModal.querySelector('img').src = dataUrl;
    quoteModal.querySelector('#q-dl').href = dataUrl;
    quoteModal.hidden = false;
    var closeQ = function () { quoteModal.hidden = true; };
    quoteModal.querySelector('.vback').onclick = closeQ;
    quoteModal.querySelector('.x').onclick = closeQ;
  }
})();
