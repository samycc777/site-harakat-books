# site-harakat-books

Public static site «كتب مشكولة»: Salafi books with full harakat, grouped by author, each with a PDF download. One RTL Arabic page, light mode only, Droid Arabic Naskh self-hosted. Add no text of our own (no taglines, intros, footer); only site title, author headings, book titles, «تحميل PDF», page count. Never mention or link Zaid's sites.

## Where things live
- `books.json` — published list: `authors` (display order, with «الشيخ») and `books` (slug, title, author, pdf file name in media-harakat-books/pdf/).
- `scripts/sync.py` — copies the listed PDFs from `~/dev/media-harakat-books/pdf/` (read-only) to `public/pdf/<slug>.pdf` and regenerates `public/index.html` (needs `pypdf`).
- `public/` — the deployed folder (index.html, fonts/, pdf/). Don't edit index.html by hand; edit sync.py.

## Add a book
1. Only finished books (PDF built in media-harakat-books). Not in progress: عون الباري, التفسير الميسر, المختصر في التفسير.
2. Add an entry to `books.json` (title = first line of the book's `meta.txt`; new author = add to `authors` too).
3. `python3 scripts/sync.py`, check `public/index.html`, commit, push.

## Deploy
Push to main: `.github/workflows/deploy.yml` runs `wrangler pages deploy public --project-name harakat-books` (secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID). Live: https://harakat-books.pages.dev. Repo: samycc777/site-harakat-books (private). Pages project made with `wrangler pages project create harakat-books --production-branch main`; no wrangler.jsonc.
Cloudflare token: the wrangler OAuth login expires; use `CLOUDFLARE_API_TOKEN` from `~/dev/archive-shaykh-bilal-salimi/.env.local` (never print it).
