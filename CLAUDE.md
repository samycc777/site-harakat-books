# site-harakat-books

Public static site «كتب مشكولة»: Salafi books with full harakat, grouped by author (each author also has a page `/<author slug>/`, linked from the author buttons and headings), each with a PDF download and its own reading page (`/<slug>/`: title, PDF, source, full text). RTL Arabic, opens light (dark only through the moon button, remembered per browser; never automatic). Add no text of our own (no taglines, intros, footer); only site title, author headings and quick-jump links, search box («ابحث عن كتاب», «لا توجد نتائج»), moon/sun button labels, the book's own text on its page, book titles, «تحميل PDF», page count, «المصدر» link, kind headings «كتب» / «مقالات» / «فتاوى وفوائد», view buttons «حسب المؤلف» / «حسب العلم», subject headings. Never link Zaid's other sites.

## Zaid (@mawqi_bot)
- One of Zaid's sites: he asks for changes through @mawqi_bot (`tool-progress-bot/listener.mjs` runs each conversation headless in this folder); treat him as the user for the look and layout: design, CSS, buttons, views, subject names and which subject a book is in (`sciences.json`).
- Adding or removing books (`books.json`), book texts and harakat (media-harakat-books) are done only in Bilal's runs, never in Zaid's. Never write to or ask Bilal from his runs.
- Zaid may add book names and scholar names (even without titles) to the to-do list: append them to `docs/notes/requested-books.md` (skip ones already there), commit, and reply in one short line that they were added to the list of books to be done (e.g. «أضفتُ … إلى قائمة الكتب المطلوبة.»). Don't put them on the site, and never mention Bilal, who does the harakat, or what you can't do (Bilal's order: no reminders).
- Every task that changes the site posts a live card to his Telegram group: `~/dev/tool-progress-bot/progress.sh start "<title>"`, `step "<text>"` as each step begins, `done "<live url>" "<summary>"` after deploying, `fail "<reason>" "<summary>"` if it stops. Reading or answering only: no card. Summary: at most 4 short lines (~400 characters), plain language naming the site; never prompts, paths, code or logs.

## Two looks (`public/site.css`, `public/theme.js`)
- Everyone: «paper» look (Zaid's request): like the المقالات الواضحات videos: white page in a pink-and-red double frame on black, Amiri text (OFL), Thuluth Decorated titles (fontstatic.com, licence not stated), red accents; dark = cream on navy. CSS rules under `:root:not([data-look=classic])` at the end of site.css.
- Bilal only: the older «classic» look (cream, brown, Droid Arabic Naskh). Any page opened with `?look=classic` remembers it in that browser; `?look=paper` undoes it. Keep both working when changing the look.
- Fonts in `public/fonts/` are woff2 subsets (pyftsubset, Arabic + Latin). Never use Adwa Assalaf here: paid font.

## Where things live
- `books.json` — published list (the tafsirs: one entry per PDF volume, `html` = media-harakat-books `pdf/<name>.html` from their `build_pdf.py` with `KEEP_HTML=1`, used for the reading page): `authors` (display order, with «الشيخ») `author_slugs` (author → folder of the author's page; missing = `a<n>`) and `books` (slug, title, author, pdf file name in media-harakat-books/pdf/, optional `source` = list of original URLs, optional `kind` = book|article|fatwa when sync.py's guess is wrong).
- `sciences.json` — subject of each book (`order` = display order, `books` = slug → subject; Zaid may send corrections): the home page's «حسب العلم» view (buttons in sync.py `VIEWS`, choice remembered by `theme.js`, CSS `.views`/`.v-author`/`.v-science`). A book missing there shows under «أخرى» and sync.py warns.
- Under each author, books are grouped by kind (sync.py `kind()`): rabee.net/book PDFs, Shamela, printed scans, tafsirs = «كتب»; other rabee.net posts and Facebook posts = «مقالات»; rabee.net fatwas/benefits or a «فتاوى» title = «فتاوى وفوائد».
- `scripts/sync.py` — copies the listed PDFs from `~/dev/media-harakat-books/pdf/` (read-only) to `public/pdf/<slug>.pdf` and regenerates `public/index.html` (needs `pypdf`). Every book needs a source link: `source` in books.json, else the URLs in media-harakat-books `books/<slug>/src/sources.tsv` (rabee.net books); sync.py stops if neither.
- `public/` — the deployed folder. `site.css` and `theme.js` are hand-edited (shared look, dark button); `index.html`, `<slug>/index.html`, the author pages and `pdf/` are written by sync.py: never edit them by hand.
- `public/notes.js` (hand-edited, CSS in site.css): on every book page, footnote numbers become buttons that open the note in a pop-up; notes it cannot pair (lettered lists, «(*)», «(١، ٢)») stay printed under the page.
- `scripts/years.py` (called by sync.py): on the website only, years (with هـ/م, after سَنَة/عَام/a month/«ت») are written in vowelled words, printed digits after them in brackets: «عَامِ أَلْفٍ وَأَرْبَعِمِائَةٍ وَسَبْعَةٍ وَعِشْرِينَ (١٤٢٧)». Dates with slashes/dashes stay digits. `python3 scripts/years.py` prints samples.
- Book page text comes from media-harakat-books `books/<slug>/index.html` (its build.py output), so rebuild the book there before syncing after a text fix.

## Add a book
1. Only finished books (PDF built in media-harakat-books).
- `sources.tsv` titles can span lines: sync.py reads only rows whose 3rd field is a URL.
2. Add an entry to `books.json` (title = first line of the book's `meta.txt`; new author = add to `authors` and `author_slugs` too; `source` = where the original came from, if the book has no `src/sources.tsv`).
3. Add its subject to `sciences.json`.
4. `python3 scripts/sync.py`, check `public/index.html`, commit, push.

## Search engines
- sync.py writes into every page's `<head>`: canonical URL, description and og tags (book title, author, the book's own subtitle, harakat stripped because people search without them; no text of ours), schema.org Book data on book pages; plus `public/sitemap.xml` and `public/robots.txt`. Tab title: «<title> — <author> | كتب مشكولة».
- Bing/Yandex: `scripts/indexnow.py` (key file `public/<key>.txt`); deploy.yml sends the changed pages after each push; `indexnow.py all` sends every page. Google reads the sitemap (Search Console, Bilal's Google account).

## «إبلاغ عن خطأ» (reader reports)
- Button + box under each book's text (`REPORT` in sync.py, `public/report.js`): it posts to `functions/api/report.js` (Pages Function), which opens an issue «[بلاغ] <title>» in this repo; `report.yml` then comments @samycc777 so GitHub emails Bilal (own-token issues send no notice).
- The button shows only when the Pages secret `GITHUB_TOKEN` exists (fine-grained token: this repo only, Issues read/write). Set/renew: `bash scripts/set-report-token.sh` (asks for the token, saves it, redeploys).
- Fix reports: `gh issue list -R samycc777/site-harakat-books --search "[بلاغ] in:title"`; fix the text in media-harakat-books, rebuild, sync here, close the issue.
- Headless Chromium on this laptop paints blank pages after DOM changes; screenshot with Playwright's Firefox.

## Deploy
Push to main: `.github/workflows/deploy.yml` runs `wrangler pages deploy public --project-name kutub-mashkulah` (secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID). Live: https://kutub-mashkulah.pages.dev. Repo: samycc777/site-harakat-books (private). Pages project made with `wrangler pages project create kutub-mashkulah --production-branch main`; no wrangler.jsonc.
- The old project `harakat-books` only holds `_redirects` sending every path to the same path here (301); never deploy the site there.
Repo is public so GitHub Actions minutes are free (the private-repo quota ran out). Deploy by hand only if Actions fails. Cloudflare token: the wrangler OAuth login expires; use `CLOUDFLARE_API_TOKEN` from `~/dev/archive-shaykh-bilal-salimi/.env.local` (never print it).
