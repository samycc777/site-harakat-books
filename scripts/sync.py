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
os.makedirs(os.path.join(PUB, 'pdf'), exist_ok=True)

DIG = str.maketrans('0123456789', '٠١٢٣٤٥٦٧٨٩')
def ar(n): return str(n).translate(DIG)
def esc(s): return html.escape(s, quote=True)

MOON = '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
SUN = '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></svg>'
THEME_BTN = f'<button id="theme" type="button" aria-label="الوضع الليلي" title="الوضع الليلي">{MOON}{SUN}</button>'


def head(title, up=''):
    """<head> shared by every page; up = '../' for the book pages."""
    return f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>{esc(title)}</title>
<script src="{up}theme.js"></script>
<link rel="preload" href="{up}fonts/DroidNaskh-Regular.woff2" as="font" type="font/woff2" crossorigin>
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


def write_book_page(b, pages, urls, fname, aslug):
    sub, body = map(years_to_words, book_text(b))  # years in words, website only
    src_links = ' '.join(f'<a class="btn light" href="{esc(u)}" target="_blank" rel="noopener">المصدر{"" if len(urls) == 1 else " " + ar(n)}</a>'
                         for n, u in enumerate(urls, 1))
    page = head(b['title'], '../') + f'''<body>
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
</main>
</body>
</html>
'''
    os.makedirs(os.path.join(PUB, b['slug']), exist_ok=True)
    open(os.path.join(PUB, b['slug'], 'index.html'), 'w', encoding='utf8').write(page)


SEARCH = """<script>
const norm = t => t.replace(/[\\u064B-\\u065F\\u0670\\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
const books = [...document.querySelectorAll('.book')].map(li => [li, norm(li.querySelector('.info h3').textContent)]);
document.getElementById('q').addEventListener('input', e => {
  const words = norm(e.target.value).split(/\\s+/).filter(Boolean);
  for (const [li, t] of books) li.hidden = !words.every(w => t.includes(w));
  for (const g of document.querySelectorAll('.group')) g.hidden = !g.querySelector('.book:not([hidden])');
  let any = false;
  for (const sec of document.querySelectorAll('section')) {
    const shown = sec.querySelector('.book:not([hidden])');
    sec.hidden = !shown; any ||= !!shown;
  }
  document.getElementById('none').hidden = any;
});
</script>"""
BAR = '<div class="bar"><input id="q" type="search" placeholder="ابحث عن كتاب" aria-label="ابحث عن كتاب" autocomplete="off"></div>'


def author_slug(i, author):
    """Folder of the author's own page: books.json "author_slugs", else a<n>."""
    return data.get('author_slugs', {}).get(author) or f'a{i + 1}'


def book_item(b, pages, fname, urls, up=''):
    links = ' '.join(f'<a class="src" href="{esc(u)}" target="_blank" rel="noopener">المصدر{"" if len(urls) == 1 else " " + ar(n)}</a>'
                     for n, u in enumerate(urls, 1))
    return f'''    <li class="book">
      <div class="info"><h3><a href="{up}{b['slug']}/">{esc(b['title'])}</a></h3><span class="meta">{ar(pages)} صفحة · {links}</span></div>
      <a class="btn" href="{up}pdf/{b['slug']}.pdf" download="{fname}">تحميل PDF</a>
    </li>'''


sections, nav = [], []
for i, author in enumerate(data['authors']):
    aslug = author_slug(i, author)
    items, sub_items = [], []
    for b in data['books']:
        if b['author'] != author: continue
        dst = os.path.join(PUB, 'pdf', b['slug'] + '.pdf')
        shutil.copyfile(os.path.join(SRC, b['pdf']), dst)
        pages = len(PdfReader(dst).pages)
        fname = esc(b['title'].replace('؟', '').replace('/', ' ') + '.pdf')
        urls = sources(b)
        write_book_page(b, pages, urls, fname, aslug)
        k = kind(b, urls)
        items.append((k, book_item(b, pages, fname, urls)))
        sub_items.append((k, book_item(b, pages, fname, urls, '../')))
    if items:
        sid = f'a{i + 1}'
        nav.append(f'<a href="{aslug}/">{esc(author)} <span>({ar(len(items))})</span></a>')
        sections.append(f'  <section id="{sid}">\n    <h2><a href="{aslug}/">{esc(author)}</a></h2>\n' + grouped(items, 'sub') + '\n  </section>')
        apage = head(author, '../') + f'''<body>
<main>
  <header>
  {THEME_BTN}
  <a class="home" href="../">كتب مشكولة</a>
  <h1>{esc(author)}</h1>
  </header>
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

page = head('كتب مشكولة') + f'''<body>
<main>
  <header>
  {THEME_BTN}
  <h1>كتب مشكولة</h1>
  </header>
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
print(len(data['books']), 'books')
