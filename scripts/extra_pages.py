#!/usr/bin/env python3
"""Generate /print/ (Print Editions catalog) and /support/ (Support & Sponsor-a-Book) pages
for mashkula.com from support.json, books.json, reading.json, and coming.json.
Called by scripts/sync.py."""
import html, json, os, re

DIG = str.maketrans('0123456789', '٠١٢٣٤٥٦٧٨٩')
def ar(n): return str(n).translate(DIG)
def esc(s): return html.escape(str(s), quote=True)


def tier_price(pages, tiers):
    for t in tiers:
        if pages <= t['max_pages']:
            return t['eur']
    return tiers[-1]['eur'] if tiers else 35


def _payment_buttons_html(pay, lang_mode='all'):
    """Render PayPal & Wise buttons/copy-chips cleanly from support.json['payments']."""
    parts = []
    pp_url = (pay.get('paypal_url') or '').strip()
    pp_handle = (pay.get('paypal_handle') or '').strip()
    w_url = (pay.get('wise_url') or '').strip()
    w_tag = (pay.get('wise_tag') or '').strip()
    w_iban = (pay.get('wise_iban') or '').strip()
    email = (pay.get('contact_email') or '').strip()
    tg = (pay.get('telegram') or '').strip()

    if pp_url:
        parts.append(f'<a class="btn" href="{esc(pp_url)}" target="_blank" rel="noopener">PayPal</a>')
    elif pp_handle:
        parts.append(f'<span class="copy-chip"><span>PayPal: {esc(pp_handle)}</span><button type="button" data-copy="{esc(pp_handle)}">Copy</button></span>')

    if w_url:
        parts.append(f'<a class="btn" href="{esc(w_url)}" target="_blank" rel="noopener">Wise</a>')
    if w_tag:
        parts.append(f'<span class="copy-chip"><span>Wise: {esc(w_tag)}</span><button type="button" data-copy="{esc(w_tag)}">Copy</button></span>')
    if w_iban:
        parts.append(f'<span class="copy-chip"><span>IBAN: {esc(w_iban)}</span><button type="button" data-copy="{esc(w_iban)}">Copy</button></span>')
    if email:
        parts.append(f'<a class="btn light" href="mailto:{esc(email)}">{esc(email)}</a>')
    if tg:
        parts.append(f'<a class="btn light" href="{esc(tg)}" target="_blank" rel="noopener">Telegram</a>')

    if not parts:
        return '''<div class="pay-pending">
      <p class="lang-ar">رَوَابِطُ الدَّفْعِ (PayPal وَ Wise) جَارٍ تَفْعِيلُهَا فِي مِلَفِّ <code>support.json</code>. يُمْكِنُكَ التَّوَاصُلُ مَعَ إِدَارَةِ الْمَوْقِعِ لِتَفَاصِيلِ الدَّعْمِ أَوْ كَفَالَةِ الْكُتُبِ.</p>
      <p class="lang-en ltr-prose" hidden>Direct PayPal &amp; Wise payment links are being connected. Check back shortly or reach out to support or sponsor a book.</p>
      <p class="lang-fr ltr-prose" hidden>Les liens directs PayPal et Wise sont en cours d’activation. Revenez très bientôt ou contactez-nous pour soutenir le projet.</p>
    </div>'''

    return '<div class="pay-row">' + '\n      '.join(parts) + '</div>'


def write_print_page(root, pub, support, books_data, info, head_fn, theme_btn):
    by_slug = {b['slug']: b for b in books_data['books']}
    editions = support.get('print_editions', [])
    pay = support.get('payments', {})
    cards = []

    for ed in editions:
        slug = ed['slug']
        b = by_slug.get(slug)
        if not b:
            continue
        # Detect compiled print page counts if local print-editions exist
        p_counts = {}
        for prof in ('kdp', 'cairo', 'study'):
            pdfp = os.path.join(root, 'print-editions', slug, f'{slug}-{prof}.pdf')
            if os.path.exists(pdfp):
                raw = open(pdfp, 'rb').read()
                p_counts[prof] = len(re.findall(rb'/Type\s*/Page(?![a-zA-Z])', raw))

        kdp_p = p_counts.get('kdp') or info.get(slug, (0,))[0]
        study_p = p_counts.get('study') or kdp_p
        cov = ed.get('preview_cover', '')
        spr = ed.get('preview_spread', '')
        previews_html = ''
        imgs = []
        if cov and os.path.exists(os.path.join(pub, 'print', cov)):
            imgs.append(f'<img src="{esc(cov)}" alt="{esc(b["title"])} — cover" loading="lazy">')
        if spr and os.path.exists(os.path.join(pub, 'print', spr)):
            imgs.append(f'<img src="{esc(spr)}" alt="{esc(b["title"])} — interior spread" loading="lazy">')
        if imgs:
            previews_html = '<div class="print-previews">' + ''.join(imgs) + '</div>'

        kdp_url = (ed.get('kdp_url') or '').strip()
        eur = ed.get('kdp_price_eur', 14)
        egp = ed.get('cairo_price_egp', 150)

        if kdp_url:
            order_btn_ar = f'<a class="btn" href="{esc(kdp_url)}" target="_blank" rel="noopener">طَلَبُ النُّسْخَةِ الْوَرَقِيَّةِ (Amazon · €{eur})</a>'
            order_btn_en = f'<a class="btn" href="{esc(kdp_url)}" target="_blank" rel="noopener">Order Paperback on Amazon (€{eur})</a>'
            order_btn_fr = f'<a class="btn" href="{esc(kdp_url)}" target="_blank" rel="noopener">Commander sur Amazon (€{eur})</a>'
        else:
            order_btn_ar = f'<a class="btn" href="/support/#contact">حَجْزُ الطَّبْعَةِ الْوَرَقِيَّةِ (€{eur} / {ar(egp)} ج.م)</a>'
            order_btn_en = f'<a class="btn" href="/support/#contact">Reserve / Order Print Edition (€{eur} · Cairo {egp} EGP)</a>'
            order_btn_fr = f'<a class="btn" href="/support/#contact">Réserver l’édition imprimée (€{eur} · Le Caire {egp} EGP)</a>'

        cards.append(f'''  <article class="print-item" id="{esc(slug)}">
    <div class="print-top">
      <div>
        <h3><a href="/{esc(slug)}/">{esc(b['title'])}</a></h3>
        <div class="meta">{esc(b['author'])}</div>
      </div>
      <span class="print-badge lang-ar">{esc(ed.get('level_ar', ''))}</span>
      <span class="print-badge lang-en" hidden dir="ltr">{esc(ed.get('level', ''))}</span>
      <span class="print-badge lang-fr" hidden dir="ltr">{esc(ed.get('level_fr', ''))}</span>
    </div>
    <p class="lang-ar">{esc(ed.get('desc_ar', ''))}</p>
    <p class="lang-en ltr-prose" hidden>{esc(ed.get('desc_en', ''))}</p>
    <p class="lang-fr ltr-prose" hidden>{esc(ed.get('desc_fr', ''))}</p>
    {previews_html}
    <p class="meta lang-ar">نُسْخَةُ KDP (٦×٩ بُوصَة): {ar(kdp_p)} صَفْحَةً · نُسْخَةُ الْهَامِشِ الْوَاسِعِ (١٧×٢٤ سم): {ar(study_p)} صَفْحَةً</p>
    <p class="meta lang-en" hidden dir="ltr">Global KDP (6×9 in): {kdp_p} pages · Cairo Wide-Margin Study Edition (17×24 cm): {study_p} pages</p>
    <p class="meta lang-fr" hidden dir="ltr">Format KDP (6×9 po) : {kdp_p} pages · Édition d’étude à larges marges (17×24 cm) : {study_p} pages</p>
    <div class="pay-row">
      <span class="lang-ar">{order_btn_ar}</span>
      <span class="lang-en" hidden>{order_btn_en}</span>
      <span class="lang-fr" hidden>{order_btn_fr}</span>
      <a class="btn light" href="/{esc(slug)}/">
        <span class="lang-ar">قِرَاءَةٌ مَجَّانِيَّةٌ عَلَى الْمَوْقِعِ</span>
        <span class="lang-en" hidden>Read Free Online</span>
        <span class="lang-fr" hidden>Lire gratuitement</span>
      </a>
    </div>
  </article>''')

    title_meta = 'الطَّبْعَةُ الْوَرَقِيَّةُ — Print Editions | كتب مشكولة'
    desc_meta = 'طَبَعَاتٌ وَرَقِيَّةٌ مَشْكُولَةٌ لِكُتُبِ أَهْلِ السُّنَّةِ وَالْجَمَاعَةِ — Verified full-harakat Islamic books in print (Amazon KDP & Cairo wide-margin study editions).'
    page = head_fn(title_meta, '../', 'print', desc_meta) + f'''<body>
<main>
  <header>
  {theme_btn}
  <a class="home" href="/">كتب مشكولة</a>
  <h1 class="lang-ar">الطَّبْعَةُ الْوَرَقِيَّةُ</h1>
  <h1 class="lang-en" hidden dir="ltr">Mashkula Print Editions</h1>
  <h1 class="lang-fr" hidden dir="ltr">Éditions imprimées Mashkula</h1>
  </header>

  <section class="info-card">
    <p class="lang-ar">طَبَعَاتٌ وَرَقِيَّةٌ نَظِيفَةٌ وَمَضْبُوطَةٌ بِالشَّكْلِ الْكَامِلِ لِمُتُونِ أَهْلِ السُّنَّةِ وَالْجَمَاعَةِ وَكُتُبِ الْمُبْتَدِئِينَ، صُمِّمَتْ بِخَطٍّ وَاضِحٍ وَهَوَامِشَ مُرِيحَةٍ لِتَيْسِيرِ الْقِرَاءَةِ وَالدِّرَاسَةِ. تَبْقَى الْقِرَاءَةُ عَلَى الْمَوْقِعِ مَجَّانِيَّةً دَائِمًا، وَيَعُودُ رَيْعُ الطَّبَعَاتِ الْوَرَقِيَّةِ لِدَعْمِ تَشْكِيلِ مَزِيدٍ مِنَ الْكُتُبِ وَالتَّفَرُّغِ لِلْمَشْرُوعِ.</p>
    <p class="lang-en ltr-prose" hidden>Clean, white-paper print editions of foundational Salafi books with <strong>full harakat (tashkeel)</strong>, professionally typeset for Arabic learners and students of knowledge. Reading online at <strong>mashkula.com</strong> is always 100% free; print proceeds fund ongoing vocalization, proofreading, and full-time work on the library.</p>
    <p class="lang-fr ltr-prose" hidden>Des éditions papier soignées, entièrement voyellisées (<strong>harakat complètes</strong>), conçues pour les étudiants en sciences islamiques et les débutants en langue arabe. La lecture en ligne sur <strong>mashkula.com</strong> reste toujours 100 % gratuite ; les ventes financent la voyellisation et le travail à plein temps sur le site.</p>

    <div class="tier-grid">
      <div class="tier-box">
        <div class="amt">6×9&quot;</div>
        <div class="lang-ar"><strong>طَبْعَةُ الْقِرَاءَةِ الدَّوْلِيَّةُ (Amazon KDP)</strong><br>وَصُولٌ عَالَمِيٌّ بِالْيُورُو وَالدُّولَارِ، وَرَقٌ أَبْيَضُ وَحِبْرٌ أَسْوَدُ صَافٍ مَعَ فِهْرِسٍ وَحَوَاشٍ سُفْلِيَّةٍ.</div>
        <div class="lang-en ltr-prose" hidden><strong>Global Paperback (Amazon KDP)</strong><br>Ships worldwide across Europe, UK &amp; US. Crisp B&amp;W interior, mirrored gutters, bottom footnotes &amp; full TOC.</div>
        <div class="lang-fr ltr-prose" hidden><strong>Format international (Amazon KDP)</strong><br>Livraison en Europe et dans le monde. Intérieur noir et blanc net, notes en bas de page et sommaire complet.</div>
      </div>
      <div class="tier-box">
        <div class="amt">١٧×٢٤</div>
        <div class="lang-ar"><strong>طَبْعَةُ طَالِبِ الْعِلْمِ (الْهَامِشُ الْوَاسِعُ)</strong><br>هَامِشٌ جَانِبِيٌّ وَسُفْلِيٌّ وَاسِعٌ لِكِتَابَةِ الشُّرُوحِ وَالتَّعْلِيقَاتِ فِي الْمَجَالِسِ وَالْمَرَاكِزِ.</div>
        <div class="lang-en ltr-prose" hidden><strong>Student Wide-Margin Edition (17×24 cm)</strong><br>Generous outer &amp; bottom note-taking column (<em>ḥawāshī</em>) built for writing teacher explanations in class.</div>
        <div class="lang-fr ltr-prose" hidden><strong>Édition d’étude à larges marges (17×24 cm)</strong><br>Large colonne extérieure et marge inférieure dédiées aux notes de cours et commentaires.</div>
      </div>
      <div class="tier-box">
        <div class="amt">٢٥+</div>
        <div class="lang-ar"><strong>طَلَبَاتُ الْمَرَاكِزِ وَالْحَلَقَاتِ (مِصْرُ وَالْخَارِجُ)</strong><br>طِبَاعَةٌ بِأَسْعَارٍ مُخَفَّضَةٍ لِلْمَرَاكِزِ الْعَرَبِيَّةِ وَالْمَعَاهِدِ وَحَلَقَاتِ الْعِلْمِ فِي الْقَاهِرَةِ وَغَيْرِهَا.</div>
        <div class="lang-en ltr-prose" hidden><strong>Cairo &amp; Institute Bulk Orders</strong><br>Discounted classroom sets (25–200 copies) printed in Cairo for Arabic institutes, study circles &amp; schools.</div>
        <div class="lang-fr ltr-prose" hidden><strong>Commandes groupées (Le Caire &amp; instituts)</strong><br>Lots à tarif réduit (25 à 200 exemplaires) imprimés au Caire pour les instituts d’arabe et cercles d’étude.</div>
      </div>
    </div>
  </section>

  <section class="print-grid">
{chr(10).join(cards)}
  </section>

  <section class="info-card">
    <h2 class="lang-ar">هَلْ تَدْرُسُ أَوْ تُدَرِّسُ فِي مَرْكَزٍ أَوْ حَلْقَةِ عِلْمٍ؟</h2>
    <h2 class="lang-en" hidden dir="ltr">Teaching an Arabic Class or Study Circle?</h2>
    <h2 class="lang-fr" hidden dir="ltr">Vous enseignez dans un institut ou un cercle d’étude ?</h2>
    <p class="lang-ar">نُجَهِّزُ نُسَخًا مَطْبُوعَةً مَضْبُوطَةً بِالشَّكْلِ الْكَامِلِ لِأَيِّ كِتَابٍ مَشْكُولٍ عَلَى الْمَوْقِعِ (بِالْهَامِشِ الْوَاسِعِ أَوِ الْحَجْمِ الْكِلَاسِيكِيِّ)، مَعَ إِمْكَانِيَّةِ الطِّبَاعَةِ الْمَحَلِّيَّةِ فِي الْقَاهِرَةِ بِتَكْلِفَةٍ مُيَسَّرَةٍ لِطُلَّابِ الْعِلْمِ.</p>
    <p class="lang-en ltr-prose" hidden>We can prepare press-ready wide-margin editions of any vocalized book on <strong>mashkula.com</strong>, including affordable short-run printing in Cairo for students at Arabic institutes and local study circles.</p>
    <p class="lang-fr ltr-prose" hidden>Nous pouvons préparer des éditions à larges marges pour n’importe quel livre voyellisé de <strong>mashkula.com</strong>, avec impression locale abordable au Caire pour les étudiants et instituts.</p>
    <p><a class="btn" href="/support/">
      <span class="lang-ar">دَعْمُ الْمَشْرُوعِ وَالتَّوَاصُلُ</span>
      <span class="lang-en" hidden>Support &amp; Contact</span>
      <span class="lang-fr" hidden>Soutenir &amp; Contacter</span>
    </a></p>
  </section>
</main>
</body>
</html>
'''
    os.makedirs(os.path.join(pub, 'print'), exist_ok=True)
    open(os.path.join(pub, 'print', 'index.html'), 'w', encoding='utf8').write(page)


def write_support_page(root, pub, support, books_data, reading_data, coming_data, info, head_fn, theme_btn):
    goal = max(1, int(support.get('monthly_goal_eur', 400)))
    cur = max(0, int(support.get('monthly_current_eur', 0)))
    pct = min(100, round(cur * 100 / goal))
    tiers = support.get('sponsor_tiers', [
        {'max_pages': 50, 'eur': 15},
        {'max_pages': 150, 'eur': 35},
        {'max_pages': 350, 'eur': 65},
        {'max_pages': 99999, 'eur': 100},
    ])
    pay = support.get('payments', {})

    # Priority slugs from /ibtida/ so foundational unvocalized primers appear first in the Sponsor picker!
    ibtida_order = {}
    idx_counter = 0
    for sh in reading_data.get('shaykhs', []):
        for st in sh.get('steps', []):
            for bk in st.get('books', []):
                sl = bk.get('slug')
                if sl and sl not in ibtida_order:
                    ibtida_order[sl] = idx_counter
                    idx_counter += 1

    candidates = []
    for b in books_data['books']:
        if b.get('harakat') is False:
            pg = info.get(b['slug'], (60,))[0]
            eur = tier_price(pg, tiers)
            prio = ibtida_order.get(b['slug'], 9999)
            candidates.append({
                's': b['slug'],
                't': b['title'],
                'a': b['author'],
                'p': pg,
                'e': eur,
                'k': 'unv',
                'r': prio,
            })
    # Also include coming.json books not yet live
    live_titles = {re.sub('[\u064B-\u065F\u0670]', '', b['title']).strip() for b in books_data['books']}
    for c in coming_data.get('books', []):
        if re.sub('[\u064B-\u065F\u0670]', '', c['title']).strip() not in live_titles:
            candidates.append({
                's': 'coming-' + str(len(candidates)),
                't': c['title'],
                'a': c['author'],
                'p': 0,
                'e': 35,
                'k': 'soon',
                'r': 500,
            })
    candidates.sort(key=lambda x: (x['r'], x['p'] or 9999, x['t']))
    cand_json = json.dumps(
        [{'s': x['s'], 't': x['t'], 'a': x['a'], 'p': x['p'], 'e': x['e'], 'k': x['k']} for x in candidates],
        ensure_ascii=False, separators=(',', ':')
    ).replace('</', '<\\/')

    tier_boxes = []
    for tr in tiers:
        tier_boxes.append(f'''      <div class="tier-box">
        <div class="amt">€{tr['eur']}</div>
        <div class="lang-ar">{esc(tr.get('label_ar', ''))}</div>
        <div class="lang-en ltr-prose" hidden>{esc(tr.get('label_en', ''))}</div>
        <div class="lang-fr ltr-prose" hidden>{esc(tr.get('label_fr', ''))}</div>
      </div>''')

    pay_html = _payment_buttons_html(pay)
    title_meta = 'دَعْمُ الْمَشْرُوعِ وَكَفَالَةُ تَشْكِيلِ الْكُتُبِ — Support Mashkula | كتب مشكولة'
    desc_meta = 'ادْعَمْ مَشْرُوعَ كُتُبٍ مَشْكُولَةٍ أَوِ اكْفُلْ تَشْكِيلَ كِتَابٍ — Support full-harakat Islamic books on mashkula.com via PayPal or Wise.'

    script = r'''<script>
(function () {
  var AR = '٠١٢٣٤٥٦٧٨٩';
  function arN(n) { return String(n).replace(/[0-9]/g, function (d) { return AR[d]; }); }
  function norm(t) { return t.replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase(); }
  function lang() { return (window.KM_I18N && window.KM_I18N.lang()) || 'ar'; }

  // Copy buttons for Wise tag / IBAN / sponsorship reference
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-copy]');
    if (!b) return;
    var val = b.getAttribute('data-copy');
    if (navigator.clipboard) navigator.clipboard.writeText(val).catch(function () {});
    var prev = b.textContent;
    b.textContent = '✓';
    setTimeout(function () { b.textContent = prev; }, 1200);
  });

  var dataEl = document.getElementById('sponsor-data');
  if (!dataEl) return;
  var books = JSON.parse(dataEl.textContent);
  var q = document.getElementById('sp-q');
  var listEl = document.getElementById('sp-list');
  var boxEl = document.getElementById('sp-picked');
  var picked = null;

  function selectBook(bk) {
    picked = bk;
    if (!bk) { boxEl.hidden = true; return; }
    var L = lang();
    var ref = 'Mashkula Sponsor: ' + bk.s + ' (€' + bk.e + ')';
    var pgTxt = bk.p ? (L === 'ar' ? arN(bk.p) + ' صَفْحَةً' : bk.p + ' pages') : (L === 'ar' ? 'قَرِيبًا' : 'Upcoming');
    var hdr = L === 'en' ? 'Selected Book to Sponsor' : L === 'fr' ? 'Livre sélectionné pour parrainage' : 'الْكِتَابُ الْمُخْتَارُ لِلْكَفَالَةِ';
    var noteLbl = L === 'en' ? 'Paste this reference in your PayPal or Wise transfer note:'
      : L === 'fr' ? 'Collez cette référence dans la note PayPal ou Wise :'
      : 'ضَعْ هَذَا الرَّمْزَ فِي مُلَاحَظَةِ التَّحْوِيلِ عَبْرَ PayPal أَوْ Wise:';
    boxEl.innerHTML =
      '<h3>' + hdr + '</h3>' +
      '<p><strong>' + bk.t + '</strong> — ' + bk.a + ' (' + pgTxt + ') · <strong style="color:var(--accent)">€' + bk.e + '</strong></p>' +
      '<p class="meta">' + noteLbl + '</p>' +
      '<div class="pay-row"><span class="copy-chip"><code>' + ref + '</code><button type="button" data-copy="' + ref + '">Copy</button></span></div>';
    boxEl.hidden = false;
    renderList();
  }

  function renderList() {
    var words = norm(q.value).split(/\s+/).filter(Boolean);
    var shown = [];
    for (var i = 0; i < books.length; i++) {
      var b = books[i];
      if (!words.length || words.every(function (w) { return norm(b.t + ' ' + b.a + ' ' + b.s).includes(w); })) {
        shown.push(b);
        if (shown.length >= 60) break;
      }
    }
    listEl.textContent = '';
    var frag = document.createDocumentFragment();
    var L = lang();
    for (var j = 0; j < shown.length; j++) {
      (function (b) {
        var row = document.createElement('div');
        row.className = 'sponsor-item' + (picked && picked.s === b.s ? ' sel' : '');
        var pg = b.p ? (L === 'ar' ? arN(b.p) + ' ص' : b.p + 'p') : (L === 'ar' ? 'قَرِيبًا' : 'Soon');
        row.innerHTML = '<div><strong>' + b.t + '</strong><div class="meta">' + b.a + ' · ' + pg + '</div></div><span class="sp-price">€' + b.e + '</span>';
        row.onclick = function () { selectBook(b); boxEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
        frag.appendChild(row);
      })(shown[j]);
    }
    listEl.appendChild(frag);
  }

  q.addEventListener('input', renderList);
  document.addEventListener('km:lang', function () {
    renderList();
    if (picked) selectBook(picked);
  });

  // Auto-select from ?sponsor=<slug>
  var param = new URLSearchParams(location.search).get('sponsor');
  if (param) {
    for (var k = 0; k < books.length; k++) {
      if (books[k].s === param) { selectBook(books[k]); break; }
    }
  }
  renderList();
})();
</script>'''

    page = head_fn(title_meta, '../', 'support', desc_meta) + f'''<body>
<main>
  <header>
  {theme_btn}
  <a class="home" href="/">كتب مشكولة</a>
  <h1 class="lang-ar">دَعْمُ الْمَشْرُوعِ وَكَفَالَةُ الْكُتُبِ</h1>
  <h1 class="lang-en" hidden dir="ltr">Support Mashkula &amp; Sponsor a Book</h1>
  <h1 class="lang-fr" hidden dir="ltr">Soutenir Mashkula &amp; Parrainer un livre</h1>
  </header>

  <section class="info-card">
    <h2 class="lang-ar">هَدَفُ التَّفَرُّغِ الشَّهْرِيُّ</h2>
    <h2 class="lang-en" hidden dir="ltr">Monthly Sustainability Goal</h2>
    <h2 class="lang-fr" hidden dir="ltr">Objectif mensuel de fonctionnement</h2>

    <p class="lang-ar">جَمِيعُ الْكُتُبِ عَلَى <strong>mashkula.com</strong> مَجَّانِيَّةٌ بِالْكَامِلِ وَدُونَ إِعْلَانَاتٍ، لِتَيْسِيرِ قِرَاءَةِ كُتُبِ أَهْلِ السُّنَّةِ وَالْجَمَاعَةِ عَلَى الْمُبْتَدِئِينَ وَطُلَّابِ الْعِلْمِ. بِفَضْلِ اللَّهِ، يَكْفِي مَبْلَغُ <strong>€{goal} شَهْرِيًّا</strong> لِتَغْطِيَةِ مَصَارِيفِ الْمَعِيشَةِ الْأَسَاسِيَّةِ فِي مِصْرَ وَتَكَالِيفِ تَشْكِيلِ الْكُتُبِ وَمُرَاجَعَتِهَا لِلتَّفَرُّغِ التَّامِّ لِهَذَا الْمَشْرُوعِ.</p>
    <p class="lang-en ltr-prose" hidden>Every book on <strong>mashkula.com</strong> is 100% free to read online with zero ads. Because I live in Egypt, a humble goal of <strong>€{goal}/month</strong> covers basic rent, food, and vocalization costs so I can work full-time on adding full harakat and preparing verified print editions. Just <strong>40 monthly supporters at €10/month</strong> reaches the entire goal.</p>
    <p class="lang-fr ltr-prose" hidden>Tous les livres sur <strong>mashkula.com</strong> sont gratuits en ligne et sans publicité. Vivant en Égypte, un objectif modeste de <strong>€{goal}/mois</strong> suffit à couvrir le loyer, la nourriture et les frais de voyellisation pour me consacrer à plein temps au projet. Seulement <strong>40 soutiens à €10/mois</strong> atteignent l’objectif complet.</p>

    <div class="goal-nums" dir="ltr">
      <span>€{cur} / €{goal}</span>
      <span>{pct}%</span>
    </div>
    <div class="goal-bar"><i style="width:{pct}%"></i></div>

    <div class="tier-grid">
      <div class="tier-box">
        <div class="amt">€5</div>
        <div class="lang-ar">دَعْمٌ شَهْرِيٌّ — يُغَطِّي تَشْكِيلَ عَشَرَاتِ الصَّفَحَاتِ</div>
        <div class="lang-en ltr-prose" hidden>Monthly supporter — funds vocalization each month</div>
        <div class="lang-fr ltr-prose" hidden>Soutien mensuel — finance la voyellisation</div>
      </div>
      <div class="tier-box">
        <div class="amt">€10</div>
        <div class="lang-ar">شَرِيكٌ شَهْرِيٌّ — ٤٠ مُسَاهِمًا يُحَقِّقُونَ الْهَدَفَ كَامِلًا</div>
        <div class="lang-en ltr-prose" hidden>Monthly partner — 40 partners cover the full goal</div>
        <div class="lang-fr ltr-prose" hidden>Partenaire mensuel — 40 partenaires couvrent tout</div>
      </div>
      <div class="tier-box">
        <div class="amt">€25+</div>
        <div class="lang-ar">كَفَالَةُ رِسَالَةٍ أَوْ دَعْمُ الطَّبْعَةِ الْوَرَقِيَّةِ</div>
        <div class="lang-en ltr-prose" hidden>Sponsor a treatise or help fund print editions</div>
        <div class="lang-fr ltr-prose" hidden>Parrainer une épître ou les éditions papier</div>
      </div>
    </div>

    <div id="contact">
      <h3 class="lang-ar">وَسَائِلُ الدَّعْمِ (PayPal وَ Wise)</h3>
      <h3 class="lang-en" hidden dir="ltr">Ways to Support (PayPal &amp; Wise)</h3>
      <h3 class="lang-fr" hidden dir="ltr">Moyens de soutien (PayPal &amp; Wise)</h3>
      {pay_html}
    </div>
  </section>

  <section class="info-card" id="sponsor">
    <h2 class="lang-ar">اكْفُلْ تَشْكِيلَ كِتَابٍ (صَدَقَةٌ جَارِيَةٌ)</h2>
    <h2 class="lang-en" hidden dir="ltr">Sponsor a Book’s Full Harakat (Ṣadaqah Jāriyah)</h2>
    <h2 class="lang-fr" hidden dir="ltr">Parrainer la voyellisation d’un livre (Ṣadaqah Jāriyah)</h2>
    <p class="lang-ar">اخْتَرْ كِتَابًا غَيْرَ مَشْكُولٍ مِنَ الْقَائِمَةِ أَدْنَاهُ لِتَغْطِيَةِ تَكْلِفَةِ ضَبْطِهِ بِالتَّشْكِيلِ الْكَامِلِ وَنَشْرِهِ مَجَّانًا لِجَمِيعِ طُلَّابِ الْعِلْمِ، وَتُعْطَى الْأَوْلَوِيَّةُ لِلْكُتُبِ الْمَكْفُولَةِ فَوْرًا.</p>
    <p class="lang-en ltr-prose" hidden>Choose any unvocalized or upcoming book below to fund its full harakat &amp; review. Sponsored books move straight to the top of our vocalization queue and remain permanently free on <strong>mashkula.com</strong>.</p>
    <p class="lang-fr ltr-prose" hidden>Choisissez ci-dessous un livre non voyellisé ou à venir pour financer ses harakat complètes. Les livres parrainés passent en priorité et restent gratuitement accessibles à tous.</p>

    <div class="tier-grid">
{chr(10).join(tier_boxes)}
    </div>

    <div id="sp-picked" class="info-card" hidden></div>

    <div class="bar" style="position:static;border:0;padding:.3rem 0">
      <input id="sp-q" type="search" placeholder="ابْحَثْ عَنْ كِتَابٍ لِكَفَالَةِ تَشْكِيلِهِ…" aria-label="Search unvocalized books" autocomplete="off">
    </div>
    <div id="sp-list" class="sponsor-list"></div>
  </section>
</main>
<script id="sponsor-data" type="application/json">{cand_json}</script>
{script}
</body>
</html>
'''
    os.makedirs(os.path.join(pub, 'support'), exist_ok=True)
    open(os.path.join(pub, 'support', 'index.html'), 'w', encoding='utf8').write(page)
