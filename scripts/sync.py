#!/usr/bin/env python3
"""Copy the PDFs listed in books.json from media-harakat-books/pdf/ into public/pdf/<slug>.pdf
and regenerate public/index.html. Read-only on media-harakat-books."""
import json, os, shutil, html
from pypdf import PdfReader

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.expanduser('~/dev/media-harakat-books/pdf')
BOOKS = os.path.expanduser('~/dev/media-harakat-books/books')
data = json.load(open(os.path.join(ROOT, 'books.json'), encoding='utf8'))
os.makedirs(os.path.join(ROOT, 'public/pdf'), exist_ok=True)

DIG = str.maketrans('0123456789', '٠١٢٣٤٥٦٧٨٩')
def ar(n): return str(n).translate(DIG)

def info(path):
    pages = len(PdfReader(path).pages)
    return pages

def sources(b):
    """Original source links: books.json "source", else the rabee.net posts in the book's src/sources.tsv."""
    if b.get('source'): return b['source']
    tsv = os.path.join(BOOKS, b['slug'], 'src/sources.tsv')
    if os.path.exists(tsv):
        return [l.split('\t')[2] for l in open(tsv, encoding='utf8') if l.strip()]
    raise SystemExit(f"{b['slug']}: no source link (add \"source\" to books.json)")

sections, nav = [], []
for i, author in enumerate(data['authors']):
    items = []
    for b in data['books']:
        if b['author'] != author: continue
        src = os.path.join(SRC, b['pdf'])
        dst = os.path.join(ROOT, 'public/pdf', b['slug'] + '.pdf')
        shutil.copyfile(src, dst)
        pages = info(dst)
        title = html.escape(b['title'])
        fname = html.escape(b['title'].replace('؟', '').replace('/', ' ') + '.pdf', quote=True)
        urls = sources(b)
        links = ' '.join(f'<a class="src" href="{html.escape(u, quote=True)}" target="_blank" rel="noopener">المصدر{"" if len(urls) == 1 else " " + ar(n)}</a>'
                         for n, u in enumerate(urls, 1))
        items.append(f'''    <li class="book">
      <div class="info"><h3>{title}</h3><span class="meta">{ar(pages)} صفحة · {links}</span></div>
      <a class="btn" href="pdf/{b['slug']}.pdf" download="{fname}">تحميل PDF</a>
    </li>''')
    if items:
        sid = f'a{i + 1}'
        nav.append(f'<a href="#{sid}">{html.escape(author)} <span>({ar(len(items))})</span></a>')
        sections.append(f'  <section id="{sid}">\n    <h2>{html.escape(author)}</h2>\n    <ul>\n' + '\n'.join(items) + '\n    </ul>\n  </section>')

page = f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>كتب مشكولة</title>
<link rel="preload" href="fonts/DroidNaskh-Regular.woff2" as="font" type="font/woff2" crossorigin>
<style>
@font-face{{font-family:"Droid Arabic Naskh";src:url(fonts/DroidNaskh-Regular.woff2) format("woff2");font-weight:400;font-display:swap}}
@font-face{{font-family:"Droid Arabic Naskh";src:url(fonts/DroidNaskh-Bold.woff2) format("woff2");font-weight:700;font-display:swap}}
:root{{color-scheme:light}}
*{{box-sizing:border-box}}
body{{margin:0;background:#fbf8f1;color:#1d1d1b;font-family:"Droid Arabic Naskh",serif;font-size:1.25rem;line-height:2.1}}
main{{max-width:820px;margin:0 auto;padding:1.5rem 1rem 4rem}}
h1{{text-align:center;font-size:2.4rem;margin:1.5rem 0 2rem}}
h2{{font-size:1.6rem;margin:2.5rem 0 .8rem;padding-bottom:.3rem;border-bottom:2px solid #8a6d3b;color:#5a4420}}
ul{{list-style:none;margin:0;padding:0}}
.book{{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.9rem 0;border-bottom:1px solid #e3dac6}}
h3{{margin:0;font-size:1.3rem;font-weight:700;line-height:2}}
.meta{{color:#6b6556;font-size:1.05rem}}
.src{{color:#5a4420}}
.src:hover,.src:focus{{color:#3f2f13}}
nav.authors{{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:center;margin:0 0 1rem}}
nav.authors a{{border:1px solid #c9b88f;border-radius:2rem;padding:.2rem .9rem;color:#5a4420;text-decoration:none;font-size:1.05rem;background:#fff}}
nav.authors a:hover,nav.authors a:focus{{background:#f1e8d4}}
nav.authors span{{color:#6b6556}}
.bar{{position:sticky;top:0;z-index:5;background:#fbf8f1;padding:.6rem 0;border-bottom:1px solid #e3dac6}}
.bar input{{width:100%;font:inherit;font-size:1.15rem;padding:.4rem .9rem;border:1px solid #c9b88f;border-radius:.5rem;background:#fff;color:inherit}}
.bar input:focus{{outline:2px solid #8a6d3b;outline-offset:0}}
section{{scroll-margin-top:4.5rem}}
#none{{text-align:center;color:#6b6556;margin:2rem 0}}
[hidden]{{display:none!important}}
.btn{{flex:none;background:#5a4420;color:#fff;text-decoration:none;padding:.5rem 1.2rem;border-radius:.5rem;font-weight:700;font-size:1.1rem;line-height:1.8}}
.btn:hover,.btn:focus{{background:#3f2f13}}
@media(max-width:560px){{
 body{{font-size:1.2rem}}
 h1{{font-size:2rem}}
 .book{{flex-direction:column;align-items:stretch;gap:.4rem}}
 .btn{{text-align:center;padding:.6rem 1rem}}
}}
</style>
</head>
<body>
<main>
  <h1>كتب مشكولة</h1>
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
open(os.path.join(ROOT, 'public/index.html'), 'w', encoding='utf8').write(page)
print(len(data['books']), 'books')
