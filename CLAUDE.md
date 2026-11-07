# site-harakat-books

Public static site «كتب مشكولة»: Salafi books with full harakat, grouped by author (each author also has a page `/<author slug>/`, linked from the author buttons and headings), each with a PDF download and its own reading page (`/<slug>/`: title, PDF, source, full text). RTL Arabic, opens light (dark only through the moon button, remembered per browser; never automatic), Droid Arabic Naskh self-hosted. Add no text of our own (no taglines, intros, footer); only site title, author headings and quick-jump links, search box («ابحث عن كتاب», «لا توجد نتائج»), moon/sun button labels, the book's own text on its page, book titles, «تحميل PDF», page count, «المصدر» link. Never mention or link Zaid's sites.

## Where things live
- `books.json` — published list (the tafsirs: one entry per PDF volume, `html` = media-harakat-books `pdf/<name>.html` from their `build_pdf.py` with `KEEP_HTML=1`, used for the reading page): `authors` (display order, with «الشيخ») `author_slugs` (author → folder of the author's page; missing = `a<n>`) and `books` (slug, title, author, pdf file name in media-harakat-books/pdf/, optional `source` = list of original URLs).
- `scripts/sync.py` — copies the listed PDFs from `~/dev/media-harakat-books/pdf/` (read-only) to `public/pdf/<slug>.pdf` and regenerates `public/index.html` (needs `pypdf`). Every book needs a source link: `source` in books.json, else the URLs in media-harakat-books `books/<slug>/src/sources.tsv` (rabee.net books); sync.py stops if neither.
- `public/` — the deployed folder. `site.css` and `theme.js` are hand-edited (shared look, dark button); `index.html`, `<slug>/index.html`, the author pages and `pdf/` are written by sync.py: never edit them by hand.
- Book page text comes from media-harakat-books `books/<slug>/index.html` (its build.py output), so rebuild the book there before syncing after a text fix.

## Add a book
1. Only finished books (PDF built in media-harakat-books). Not in progress: عون الباري.
- `sources.tsv` titles can span lines: sync.py reads only rows whose 3rd field is a URL.
2. Add an entry to `books.json` (title = first line of the book's `meta.txt`; new author = add to `authors` and `author_slugs` too; `source` = where the original came from, if the book has no `src/sources.tsv`).
3. `python3 scripts/sync.py`, check `public/index.html`, commit, push.

## Deploy
Push to main: `.github/workflows/deploy.yml` runs `wrangler pages deploy public --project-name harakat-books` (secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID). Live: https://harakat-books.pages.dev. Repo: samycc777/site-harakat-books (private). Pages project made with `wrangler pages project create harakat-books --production-branch main`; no wrangler.jsonc.
Repo is public so GitHub Actions minutes are free (the private-repo quota ran out). Deploy by hand only if Actions fails. Cloudflare token: the wrangler OAuth login expires; use `CLOUDFLARE_API_TOKEN` from `~/dev/archive-shaykh-bilal-salimi/.env.local` (never print it).
