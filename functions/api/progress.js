// Reading progress of a signed-in reader (public/account.js keeps the same data in localStorage "reading").
// D1 table (scripts/progress-schema.sql): progress(sub, slug, place, p, done, t). Newest t wins.
// GET → {items: {slug: {s, p, d, t}}}. POST {items: {slug: {s, p, d, t}}} → saves those newer than stored.
import { json, readUser } from '../lib/session.js';

export async function onRequestGet({ request, env }) {
  const u = await readUser(request, env);
  if (!u) return json({ ok: false }, 401);
  const { results } = await env.DB.prepare('SELECT slug, place, p, done, t FROM progress WHERE sub = ?').bind(u.sub).all();
  const items = {};
  for (const r of results) items[r.slug] = { s: r.place, p: r.p, d: r.done, t: r.t };
  return json({ ok: true, items });
}

export async function onRequestPost({ request, env }) {
  const u = await readUser(request, env);
  if (!u) return json({ ok: false }, 401);
  let d;
  try { d = JSON.parse(await request.text()); } catch { return json({ ok: false }, 400); }  // text: also sendBeacon
  const rows = Object.entries(d.items || {}).slice(0, 3000).filter(([slug, e]) =>
    /^[a-z0-9-]{1,120}$/.test(slug) && e && Number.isFinite(+e.t));
  if (!rows.length) return json({ ok: true });
  const st = env.DB.prepare(`INSERT INTO progress (sub, slug, place, p, done, t) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (sub, slug) DO UPDATE SET place = excluded.place, p = excluded.p, done = excluded.done, t = excluded.t
    WHERE excluded.t > progress.t`);
  const now = Date.now() + 60e3;
  await env.DB.batch(rows.map(([slug, e]) => st.bind(u.sub, slug,
    /^\d+:[\d.]+$/.test(e.s) ? e.s : '',
    e.p == null || !Number.isFinite(+e.p) ? null : Math.max(0, Math.min(1, +e.p)),
    e.d ? 1 : 0, Math.min(Math.floor(+e.t), now))));
  return json({ ok: true });
}
