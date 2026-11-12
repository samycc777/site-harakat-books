#!/usr/bin/env python3
"""Copy the PDFs listed in books.json from media-harakat-books/pdf/ into public/pdf/<slug>.pdf,
write one reading page per book (public/<slug>/index.html, text taken from media-harakat-books
books/<slug>/index.html) and regenerate public/index.html and one page per author (public/<author_slugs>/index.html). Read-only on media-harakat-books.
Look: public/site.css + public/theme.js (hand-edited)."""
import json, os, re, shutil, html
from pypdf import PdfReader
from years import years_to_words

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
SRC = os.path.expanduser('~/dev/media-harakat-books/pdf')
BOOKS = os.path.expanduser('~/dev/media-harakat-books/books')
data = json.load(open(os.path.join(ROOT, 'books.json'), encoding='utf8'))
# Subject of each book for the home page's «حسب العلم» view: sciences.json "order" (display order) and
# "books" (slug → subject). A book missing there goes under «أخرى» (sync.py warns).
SCI = json.load(open(os.path.join(ROOT, 'sciences.json'), encoding='utf8'))
OTHER = 'أخرى'
os.makedirs(os.path.join(PUB, 'pdf'), exist_ok=True)

DIG = str.maketrans('0123456789', '٠١٢٣٤٥٦٧٨٩')
def ar(n): return str(n).translate(DIG)
def esc(s): return html.escape(s, quote=True)

MOON = '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
SUN = '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></svg>'
THEME_BTN = f'<button id="theme" type="button" aria-label="الوضع الليلي" title="الوضع الليلي">{MOON}{SUN}</button>'


SITE = 'https://kutub-mashkulah.pages.dev'
NAME = 'كتب مشكولة'
URLS = []  # every page, for sitemap.xml


def plain(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s))).strip()
def bare(s): return re.sub('[\u064B-\u065F\u0670]', '', s)  # no harakat: what people type into a search engine


GOOGLE = '<meta name="google-site-verification" content="tHSDV-91DVQ5bg7mw8HwDJMwUipvEQ37bfjBGJ2HN_E">\n'  # Search Console ownership (home page only)


def head(title, up='', path='', desc='', ld=None):
    """<head> shared by every page; up = '../' for the book pages; path = page folder ('' = home).
    Search engines get the canonical URL, a description (book title, author, the book's own subtitle:
    no text of ours) and, on book pages, schema.org Book data."""
    url = f'{SITE}/{path + "/" if path else ""}'
    title, desc = bare(title), bare(desc)
    URLS.append(url)
    desc = esc(desc or title)
    ld = f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>\n' if ld else ''
    return f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>{esc(title)}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
<meta property="og:site_name" content="{NAME}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:type" content="{'book' if ld else 'website'}">
<meta property="og:locale" content="ar_AR">
{GOOGLE if not path else ''}{ld}<script src="{up}theme.js"></script>
<link rel="icon" href="data:,">
<link rel="preload" href="{up}fonts/Amiri-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{up}site.css">
</head>
'''


def sources(b):
    """Original source links: books.json "source", else the rabee.net posts in the book's src/sources.tsv."""
    if b.get('source'): return b['source']
    tsv = os.path.join(BOOKS, b['slug'], 'src/sources.tsv')
    if os.path.exists(tsv):
        return [f[2] for f in (l.split('\t') for l in open(tsv, encoding='utf8')) if len(f) > 2 and f[2].startswith('http')]  # titles may span lines
    raise SystemExit(f"{b['slug']}: no source link (add \"source\" to books.json)")


KINDS = {'book': 'كتب', 'article': 'مقالات', 'fatwa': 'فتاوى وفوائد'}  # display order


def kind(b, urls):
    """books.json "kind", else from the source: rabee.net fatwas/benefits (or a «فتاوى» title) = fatwa,
    other rabee.net posts and Facebook posts = article, everything else (rabee.net/book PDFs, Shamela,
    printed scans, tafsirs) = book."""
    if b.get('kind'): return b['kind']
    u = urls[0]
    if '/alfatawi/' in u or '/benefits/' in u or 'فتاوى' in b['title'].replace('ٰ', '').translate({c: None for c in range(0x64B, 0x653)}): return 'fatwa'
    if ('rabee.net' in u and '/book/' not in u) or 'facebook.com' in u: return 'article'
    return 'book'


def grouped(entries, cls):
    """entries = [(kind, li)]: one <div class="group"> per kind present, with its heading."""
    out = []
    for k, label in KINDS.items():
        lis = [li for kk, li in entries if kk == k]
        if lis: out.append(f'  <div class="group {cls}">\n    <h3 class="kind">{label} <span>({ar(len(lis))})</span></h3>\n    <ul>\n' + '\n'.join(lis) + '\n    </ul>\n  </div>')
    return '\n'.join(out)


def book_text(b):
    """Subtitle and body of the book's built page in media-harakat-books (scripts/build.py output),
    or, for books with "html" (the tafsirs), of that file in media-harakat-books/pdf/ (their build_pdf.py
    with KEEP_HTML=1): everything after the cover section."""
    slug = b['slug']
    if b.get('html'):
        page = open(os.path.join(SRC, b['html']), encoding='utf8').read()
        body = re.search(r'class="cover".*?</section>\n(.*)\n</body>', page, re.S)
        if not body: raise SystemExit(f"{slug}: no text in {b['html']}")
        return '', body.group(1)
    page = open(os.path.join(BOOKS, slug, 'index.html'), encoding='utf8').read()
    sub = re.search(r'<p class="sub">(.*?)</p>', page)
    body = re.search(r'<section>\n(.*)\n</section>', page, re.S)
    if not body: raise SystemExit(f'{slug}: no text in books/{slug}/index.html (run build.py there)')
    return (sub.group(1) if sub else ''), body.group(1)


# «إبلاغ عن خطأ»: public/report.js shows it once functions/api/report.js has its GitHub token;
# a report becomes an issue in this repo. Words: the button, the box's hint, send/cancel, sent/failed.
REPORT = '''  <div class="report" hidden>
    <button type="button" class="btn light" id="report-open">إبلاغ عن خطأ</button>
    <form id="report-form" hidden>
      <textarea name="text" rows="4" maxlength="3000" required placeholder="ما الخطأ؟"></textarea>
      <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp">
      <div class="row"><button class="btn" type="submit">إرسال</button> <button class="btn light" type="button" id="report-cancel">إلغاء</button></div>
    </form>
    <p class="msg ok" hidden>تم الإرسال</p>
    <p class="msg fail" hidden>تعذر الإرسال</p>
  </div>'''

NOTES_JS = '<script src="../notes.js" defer></script>\n'


def write_book_page(b, pages, urls, fname, aslug):
    sub, body = book_text(b)
    if b.get('harakat') is not False:  # years in words (vowelled), website only; never in an unvowelled book
        sub, body = years_to_words(sub), years_to_words(body)
    src_links = ' '.join(f'<a class="btn light" href="{esc(u)}" target="_blank" rel="noopener">المصدر{"" if len(urls) == 1 else " " + ar(n)}</a>'
                         for n, u in enumerate(urls, 1))
    ld = {'@context': 'https://schema.org', '@type': 'Book', 'name': bare(b['title']), 'alternateName': b['title'], 'inLanguage': 'ar',
          'author': {'@type': 'Person', 'name': b['author']}, 'url': f"{SITE}/{b['slug']}/",
          'numberOfPages': pages, 'isAccessibleForFree': True,
          'workExample': {'@type': 'Book', 'bookFormat': 'https://schema.org/EBook', 'encodingFormat': 'application/pdf',
                          'url': f"{SITE}/pdf/{b['slug']}.pdf"}}
    desc = '، '.join(x for x in (b['title'], b['author'], plain(sub)) if x)
    page = head(f"{b['title']} — {b['author']} | {NAME}", '../', b['slug'], desc, ld) + f'''<body>
<main class="read">
  <header>
  {THEME_BTN}
  <a class="home" href="../">كتب مشكولة</a>
  </header>
  <h1>{esc(b['title'])}</h1>
  <p class="sub">{sub}</p>
  <div class="actions">
    <a class="btn" href="../pdf/{b['slug']}.pdf" download="{fname}">تحميل PDF</a>
    {src_links}
    <span class="meta"><a class="src" href="../{aslug}/">{esc(b['author'])}</a>، {ar(pages)} صفحة</span>
  </div>
  <article class="text">
{body}
  </article>
{REPORT}
</main>
{NOTES_JS}<script src="../report.js" defer></script>
</body>
</html>
'''
    os.makedirs(os.path.join(PUB, b['slug']), exist_ok=True)
    open(os.path.join(PUB, b['slug'], 'index.html'), 'w', encoding='utf8').write(page)


SEARCH = """<script>
const norm = t => t.replace(/[\\u064B-\\u065F\\u0670\\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
const books = [...document.querySelectorAll('.book')].map(li => [li, norm(li.querySelector('.info h3').textContent), li.classList.contains('nh')]);
const q = document.getElementById('q'), hb = [...document.querySelectorAll('.harakat button')];
// harakat filter («الكل» / «مشكولة» / «غير مشكولة»), remembered in this browser; li.nh = book without harakat
let hv = 'all';
try { if (hb.length) hv = localStorage.getItem('harakat') || 'all'; } catch (e) {}
const okH = nh => hv === 'all' || (hv === '1') !== nh;
const arN = n => '(' + String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]) + ')';
const count = (el, n) => { const s = el && el.querySelector(':scope > span'); if (s) s.textContent = arN(n); };
function apply() {
  const words = norm(q.value).split(/\\s+/).filter(Boolean);
  for (const [li, t, nh] of books) li.hidden = !okH(nh) || !words.every(w => t.includes(w));
  for (const g of document.querySelectorAll('section:not(#soon) .group')) {
    const n = g.querySelectorAll('.book:not([hidden])').length;
    g.hidden = !n; count(g.querySelector('h3.kind'), n);
  }
  let any = false;
  for (const sec of document.querySelectorAll('section')) {
    if (sec.id === 'soon' || !sec.querySelector('.book')) { sec.hidden = words.length > 0 || hv !== 'all'; continue; }
    const shown = sec.querySelector('.book:not([hidden])');
    sec.hidden = !shown; any ||= !!shown;
  }
  for (const a of document.querySelectorAll('nav.authors a[data-s]')) {
    const n = [...document.querySelectorAll('#' + a.dataset.s + ' .book')].filter(li => okH(li.classList.contains('nh'))).length;
    a.hidden = !n; count(a, n);
  }
  for (const a of document.querySelectorAll('nav.authors a:not([data-s])')) a.hidden = hv !== 'all';  // «قريبًا» and authors still to come
  for (const b of hb) b.setAttribute('aria-pressed', b.dataset.h === hv);
  document.getElementById('none').hidden = any;
}
q.addEventListener('input', apply);
for (const b of hb) b.addEventListener('click', () => {
  hv = b.dataset.h;
  try { if (hv === 'all') localStorage.removeItem('harakat'); else localStorage.setItem('harakat', hv); } catch (e) {}
  apply();
});
if (hb.length) apply();
</script>"""
FILTER = '<div class="views harakat" role="group"><button type="button" data-h="all">الكل</button><button type="button" data-h="1">مشكولة</button><button type="button" data-h="0">غير مشكولة</button></div>'
BAR = '<div class="bar"><input id="q" type="search" placeholder="ابحث عن كتاب" aria-label="ابحث عن كتاب" autocomplete="off"></div>'


def author_slug(i, author):
    """Folder of the author's own page: books.json "author_slugs", else a<n>."""
    return data.get('author_slugs', {}).get(author) or f'a{i + 1}'


def book_item(b, pages, fname, urls, up=''):
    links = ' '.join(f'<a class="src" href="{esc(u)}" target="_blank" rel="noopener">المصدر{"" if len(urls) == 1 else " " + ar(n)}</a>'
                     for n, u in enumerate(urls, 1))
    nh = ' nh' if b.get('harakat') is False else ''
    return f'''    <li class="book{nh}">
      <div class="info"><h3><a href="{up}{b['slug']}/">{esc(b['title'])}</a></h3><span class="meta">{ar(pages)} صفحة · {links}</span></div>
      <a class="btn" href="{up}pdf/{b['slug']}.pdf" download="{fname}">تحميل PDF</a>
    </li>'''


sections, nav = [], []
by_sci = {}  # subject → [(author, li)]
for i, author in enumerate(data['authors']):
    aslug = author_slug(i, author)
    items, sub_items = [], []
    mine_b = []
    for b in data['books']:
        if b['author'] != author: continue
        dst = os.path.join(PUB, 'pdf', b['slug'] + '.pdf')
        shutil.copyfile(os.path.join(SRC, b['pdf']), dst)
        mine_b.append((len(PdfReader(dst).pages), b))
    mine_b.sort(key=lambda x: x[0])  # shortest to longest
    for pages, b in mine_b:
        fname = esc(b['title'].replace('؟', '').replace('/', ' ') + '.pdf')
        urls = sources(b)
        write_book_page(b, pages, urls, fname, aslug)
        k = kind(b, urls)
        items.append((k, book_item(b, pages, fname, urls)))
        sub_items.append((k, book_item(b, pages, fname, urls, '../')))
        sci = SCI['books'].get(b['slug'])
        if sci not in SCI['order']:
            print(f"warning: {b['slug']} has no subject in sciences.json: listed under «{OTHER}»"); sci = OTHER
        by_sci.setdefault(sci, []).append((author, items[-1][1]))
    if items:
        sid = f'a{i + 1}'
        nav.append(f'<a class="v-author" data-s="{sid}" href="{aslug}/">{esc(author)} <span>({ar(len(items))})</span></a>')
        sections.append(f'  <section class="v-author" id="{sid}">\n    <h2><a href="{aslug}/">{esc(author)}</a></h2>\n' + grouped(items, 'sub') + '\n  </section>')
        apage = head(f'{author} | {NAME}', '../', aslug, f"{NAME}: {author}") + f'''<body>
<main>
  <header>
  {THEME_BTN}
  <a class="home" href="../">كتب مشكولة</a>
  <h1>{esc(author)}</h1>
  </header>
  {FILTER if len({b.get('harakat') is False for b in data['books'] if b['author'] == author}) > 1 else ''}
  {BAR}
  <section>
''' + grouped(sub_items, 'top') + f'''
  </section>
  <p id="none" hidden>لا توجد نتائج</p>
</main>
{SEARCH}
</body>
</html>
'''
        os.makedirs(os.path.join(PUB, aslug), exist_ok=True)
        open(os.path.join(PUB, aslug, 'index.html'), 'w', encoding='utf8').write(apage)

for j, sci in enumerate(SCI['order'] + [OTHER]):
    if sci not in by_sci and sci == OTHER: continue
    sid, lis = f's{j + 1}', by_sci.get(sci, [])
    nav.append(f'<a class="v-science" data-s="{sid}" href="#{sid}">{esc(sci)} <span>({ar(len(lis))})</span></a>')
    groups = []
    for author in data['authors']:
        mine = [li for a, li in lis if a == author]
        if mine: groups.append(f'  <div class="group sub">\n    <h3 class="kind">{esc(author)} <span>({ar(len(mine))})</span></h3>\n    <ul>\n' + '\n'.join(mine) + '\n    </ul>\n  </div>')
    sections.append(f'  <section class="v-science" id="{sid}">\n    <h2>{esc(sci)}</h2>\n' + '\n'.join(groups) + '\n  </section>')
# «قريبًا»: books and authors on the way (coming.json, hand-edited; drop an entry once its book is live)
COMING = json.load(open(os.path.join(ROOT, 'coming.json'), encoding='utf8'))
live = {bare(plain(b['title'])) for b in data['books']}
soon = [c for c in COMING['books'] if bare(c['title']) not in live]
if soon or COMING['authors']:
    nav.append('<a href="#soon">قريبًا</a>')
    lis = '\n'.join(f'    <li class="soon-book"><span class="t">{esc(c["title"])}</span><span class="meta">{esc(c["author"])}</span></li>' for c in soon)
    chips = ''.join(f'<span>{esc(a)}</span>' for a in COMING['authors'])
    sections.append(f'''  <section id="soon">
    <h2>قريبًا</h2>
''' + (f'''  <div class="group top">
    <h3 class="kind">كتب <span>({ar(len(soon))})</span></h3>
    <ul>
{lis}
    </ul>
  </div>
''' if soon else '') + (f'''  <div class="group top">
    <h3 class="kind">المؤلفون <span>({ar(len(COMING['authors']))})</span></h3>
    <p class="soon-authors">{chips}</p>
  </div>
''' if COMING['authors'] else '') + '  </section>')
# author view also lists authors whose books are still to come
_have = {a for a in data['authors'] if any(b['author'] == a for b in data['books'])}
_extra = [a for a in COMING['authors'] if a not in _have] + [a for a in dict.fromkeys(c['author'] for c in soon) if a not in _have and a not in COMING['authors']]
_base = sum(1 for x in sections if 'class="v-author"' in x)
for k, a in enumerate(_extra):
    mine = [c for c in soon if c['author'] == a]
    lis = '\n'.join(f'    <li class="soon-book"><span class="t">{esc(c["title"])}</span></li>' for c in mine)
    body = f'\n    <ul>\n{lis}\n    </ul>' if mine else ''
    nav.insert(0, f'<a class="v-author" href="#x{k + 1}">{esc(a)}</a>') if False else None
    nav.insert(_base + k, f'<a class="v-author" href="#x{k + 1}">{esc(a)}</a>')
    sections.insert(_base + k, f'  <section class="v-author" id="x{k + 1}">\n    <h2>{esc(a)}</h2>{body}\n  </section>')
VIEWS = '<div class="views" role="group"><button type="button" data-view="author">حسب المؤلف</button><button type="button" data-view="science">حسب العلم</button></div>'

page = head(NAME, '', '', f"{NAME}: " + '، '.join(a for a in data['authors'] if any(b['author'] == a for b in data['books']))) + f'''<body>
<main>
  <header>
  {THEME_BTN}
  <h1>كتب مشكولة</h1>
  </header>
  {VIEWS}
  {FILTER}
  <nav class="authors">{''.join(nav)}</nav>
  {BAR}
{chr(10).join(sections)}
  <p id="none" hidden>لا توجد نتائج</p>
</main>
{SEARCH}
</body>
</html>
'''
open(os.path.join(PUB, 'index.html'), 'w', encoding='utf8').write(page)
open(os.path.join(PUB, 'sitemap.xml'), 'w', encoding='utf8').write(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + ''.join(f'<url><loc>{u}</loc></url>\n' for u in sorted(set(URLS))) + '</urlset>\n')
open(os.path.join(PUB, 'robots.txt'), 'w').write(f'User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n')
print(len(data['books']), 'books,', len(set(URLS)), 'pages in sitemap.xml')
