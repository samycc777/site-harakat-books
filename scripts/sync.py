#!/usr/bin/env python3
"""Copy the PDFs listed in books.json from media-harakat-books/pdf/ into public/pdf/<slug>.pdf,
write one reading page per book (public/<slug>/index.html, text taken from media-harakat-books
books/<slug>/index.html) and regenerate public/index.html. Read-only on media-harakat-books.
Look: public/site.css + public/theme.js (hand-edited)."""
import json, os, re, shutil, html
from pypdf import PdfReader

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
        return [l.split('\t')[2] for l in open(tsv, encoding='utf8') if l.strip()]
    raise SystemExit(f"{b['slug']}: no source link (add \"source\" to books.json)")


def book_text(slug):
    """Subtitle and body of the book's built page in media-harakat-books (scripts/build.py output)."""
    page = open(os.path.join(BOOKS, slug, 'index.html'), encoding='utf8').read()
    sub = re.search(r'<p class="sub">(.*?)</p>', page)
    body = re.search(r'<section>\n(.*)\n</section>', page, re.S)
    if not body: raise SystemExit(f'{slug}: no text in books/{slug}/index.html (run build.py there)')
    return (sub.group(1) if sub else ''), body.group(1)


def write_book_page(b, pages, urls, fname):
    sub, body = book_text(b['slug'])
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
    <span class="meta">{esc(b['author'])}، {ar(pages)} صفحة</span>
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


sections, nav = [], []
for i, author in enumerate(data['authors']):
    items = []
    for b in data['books']:
        if b['author'] != author: continue
        dst = os.path.join(PUB, 'pdf', b['slug'] + '.pdf')
        shutil.copyfile(os.path.join(SRC, b['pdf']), dst)
        pages = len(PdfReader(dst).pages)
        fname = esc(b['title'].replace('؟', '').replace('/', ' ') + '.pdf')
        urls = sources(b)
        write_book_page(b, pages, urls, fname)
        links = ' '.join(f'<a class="src" href="{esc(u)}" target="_blank" rel="noopener">المصدر{"" if len(urls) == 1 else " " + ar(n)}</a>'
                         for n, u in enumerate(urls, 1))
        items.append(f'''    <li class="book">
      <div class="info"><h3><a href="{b['slug']}/">{esc(b['title'])}</a></h3><span class="meta">{ar(pages)} صفحة · {links}</span></div>
      <a class="btn" href="pdf/{b['slug']}.pdf" download="{fname}">تحميل PDF</a>
    </li>''')
    if items:
        sid = f'a{i + 1}'
        nav.append(f'<a href="#{sid}">{esc(author)} <span>({ar(len(items))})</span></a>')
        sections.append(f'  <section id="{sid}">\n    <h2>{esc(author)}</h2>\n    <ul>\n' + '\n'.join(items) + '\n    </ul>\n  </section>')

page = head('كتب مشكولة') + f'''<body>
<main>
  <header>
  {THEME_BTN}
  <h1>كتب مشكولة</h1>
  </header>
  <nav class="authors">{''.join(nav)}</nav>
  <div class="bar"><input id="q" type="search" placeholder="ابحث عن كتاب" aria-label="ابحث عن كتاب" autocomplete="off"></div>
{chr(10).join(sections)}
  <p id="none" hidden>لا توجد نتائج</p>
</main>
<script>
const norm = t => t.replace(/[\\u064B-\\u065F\\u0670\\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
const books = [...document.querySelectorAll('.book')].map(li => [li, norm(li.querySelector('h3').textContent)]);
document.getElementById('q').addEventListener('input', e => {{
  const words = norm(e.target.value).split(/\\s+/).filter(Boolean);
  for (const [li, t] of books) li.hidden = !words.every(w => t.includes(w));
  let any = false;
  for (const sec of document.querySelectorAll('section')) {{
    const shown = sec.querySelector('.book:not([hidden])');
    sec.hidden = !shown; any ||= !!shown;
  }}
  document.getElementById('none').hidden = any;
}});
</script>
</body>
</html>
'''
open(os.path.join(PUB, 'index.html'), 'w', encoding='utf8').write(page)
print(len(data['books']), 'books')
