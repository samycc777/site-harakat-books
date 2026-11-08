// «إبلاغ عن خطأ»: a reader's report on a book page becomes an issue in samycc777/site-harakat-books.
// Secret GITHUB_TOKEN (Cloudflare Pages, production): fine-grained, this repo only, Issues read/write;
// set with scripts/set-report-token.sh. Without it, GET says ready:false and the pages hide the button.
const REPO = 'samycc777/site-harakat-books';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

export const onRequestGet = ({ env }) => json({ ready: !!env.GITHUB_TOKEN });

export async function onRequestPost({ request, env }) {
  if (!env.GITHUB_TOKEN) return json({ ok: false }, 503);
  let d;
  try { d = await request.json(); } catch { return json({ ok: false }, 400); }
  if (d.website) return json({ ok: true });  // hidden field: only bots fill it
  const slug = String(d.slug || ''), text = String(d.text || '').trim(), title = String(d.title || '').trim().slice(0, 200);
  if (!/^[a-z0-9-]{1,120}$/.test(slug) || text.length < 2 || text.length > 3000) return json({ ok: false }, 400);
  const url = `https://harakat-books.pages.dev/${slug}/`;
  const r = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json',
               'user-agent': 'harakat-books-report', 'content-type': 'application/json' },
    body: JSON.stringify({ title: `[بلاغ] ${title || slug}`,
                           body: `${url}\n\n${text.replace(/@/g, '@​')}\n\n<!-- slug: ${slug} -->` }),
  });
  return r.ok ? json({ ok: true }) : json({ ok: false }, 502);
}
