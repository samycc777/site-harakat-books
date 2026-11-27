# site-harakat-books

Public static site «كتب مشكولة»: Salafi books with full harakat, grouped by author (each author also has a page `/<author slug>/`, linked from the author buttons and headings), each with a PDF download and its own reading page (`/<slug>/`: title, PDF, source, full text). RTL Arabic, opens light (dark and the other colours only through the moon button's colour circles, remembered per browser; never automatic). Add no text of our own (no taglines, intros, footer); only site title, author headings and quick-jump links, search box («ابحث عن كتاب», «لا توجد نتائج»), moon/sun button labels and the colour names in its pop-up («الألوان», «نهاري», «ليلي», «أخضر», «أزرق ليلي», «أسود», «أخضر ليلي», «Next.js», «Gruvbox», «فحمي ذهبي»), the book's own text on its page, book titles, «تحميل PDF», page count, «المصدر» link, kind headings «كتب» / «مقالات» / «فتاوى وفوائد», the group headings in `groups.json` (Zaid's order, e.g. «الرد على سيد قطب»), view buttons «حسب المؤلف» / «حسب العلم», harakat filter «الكل» / «مشكولة» / «غير مشكولة», subject headings, the «قريبًا» section («كتب» / «المؤلفون»), the home page's «أُضيفت حديثًا» / «شُكِّلت حديثًا» headings, reader accounts (Bilal's order): «متابعة القراءة», «تسجيل الدخول», «تسجيل الخروج», the hidden privacy page `/privacy/` (Google requires it), «أعلى الصفحة», the read share «٤٥٪» / «✓», the «بماذا يبدأ طالب العلم؟» page (button, shaykh names, «كلام الشيخ», the shaykhs' quoted words with «المصدر», science headings). Never link Zaid's other sites.

## Zaid (@mawqi_bot)
- One of Zaid's sites: he asks for changes through @mawqi_bot (`tool-progress-bot/listener.mjs` runs each conversation headless in this folder); treat him as the user for the look and layout: design, CSS, buttons, views, subject names and which subject a book is in (`sciences.json`), and the sections inside an author's list (`groups.json`).
- Adding or removing books (`books.json`), book texts and harakat (media-harakat-books) are done only in Bilal's runs, never in Zaid's. Never write to or ask Bilal from his runs.
- Zaid may add book names and scholar names (even without titles) to the to-do list: append them to `docs/notes/requested-books.md` (skip ones already there), commit, and reply in one short line that they were added to the list of books to be done (e.g. «أضفتُ … إلى قائمة الكتب المطلوبة.»). Don't put them on the site, and never mention Bilal, who does the harakat, or what you can't do (Bilal's order: no reminders).
- Every task that changes the site posts a live card to his Telegram group: `~/dev/tool-progress-bot/progress.sh start "<title>"`, `step "<text>"` as each step begins, `done "<live url>" "<summary>"` after deploying, `fail "<reason>" "<summary>"` if it stops. Reading or answering only: no card. Summary: at most 4 short lines (~400 characters), plain language naming the site; never prompts, paths, code or logs.

## Reference
- How the site is built (files, books.json/sciences.json/coming.json/reading.json, sync.py, reading progress and Google sign-in, the two looks «paper»/«classic», search engines, reader reports): `docs/notes/site-reference.md`. Read the part you need before changing it.
- `public/index.html`, book and author pages and `pdf/` are written by `scripts/sync.py`: never edit them by hand.
- Everyone sees the «paper» look (Zaid's request); Bilal alone uses «classic» (`?look=classic`). Keep both working. Never use Adwa Assalaf (paid font).
- Headless Chromium here paints blank pages after DOM changes; screenshot with Playwright's Firefox.

## Add a book
1. Only finished books (PDF built in media-harakat-books).
- `sources.tsv` titles can span lines: sync.py reads only rows whose 3rd field is a URL.
2. Add an entry to `books.json` (title = first line of the book's `meta.txt`; new author = add to `authors` and `author_slugs` too; `source` = where the original came from, if the book has no `src/sources.tsv`).
3. Add its subject to `sciences.json`.
4. `python3 scripts/sync.py`, check `public/index.html`, commit, push.

## Deploy
Push to main: `.github/workflows/deploy.yml` runs `wrangler pages deploy public --project-name kutub-mashkulah` (secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID). Live: https://mashkula.com (Pages project: https://kutub-mashkulah.pages.dev). Repo: samycc777/site-harakat-books (private). Pages project made with `wrangler pages project create kutub-mashkulah --production-branch main`; no wrangler.jsonc.
- The old project `harakat-books` only holds `_redirects` sending every path to the same path here (301); never deploy the site there.
Repo is public so GitHub Actions minutes are free (the private-repo quota ran out). Deploy by hand only if Actions fails. Cloudflare token: the wrangler OAuth login expires; use `CLOUDFLARE_API_TOKEN` from `~/dev/archive-shaykh-bilal-salimi/.env.local` (never print it).

## Mistakes to avoid
- Every author needs an entry in books.json `author_slugs`: without one the page is `/a<n>/` by position, and each author inserted before it moves the address (old links then show another author). `public/_redirects` sends the old `/a4`…`/a10` to the fixed pages.
