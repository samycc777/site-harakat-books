// Reading progress of a signed-in reader (public/account.js keeps the same data in localStorage "reading").
// D1 (binding DB): one row per reader, reading(sub, data, t), data = JSON {slug: {s, p, d, t}}, so a
// sync is always 2 queries (the free plan allows 50 per request). Per book the newest t wins.
// GET → {items}. POST {items} (text body, also from keepalive on page close) → merged into the row.
// DELETE → the reader's row is removed (button on the hidden /privacy/ page).
import { json, readUser } from '../lib/session.js';
import { ensureExercisesTable } from './exercises.js';

let made = false;  // table made on first use (scripts/progress-schema.sql), once per worker
async function table(env) {
  if (made) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS reading (sub TEXT PRIMARY KEY, data TEXT NOT NULL, t INTEGER NOT NULL)').run();
  made = true;
}
async function load(env, sub) {
  await table(env);
  const r = await env.DB.prepare('SELECT data FROM reading WHERE sub = ?').bind(sub).first();
  try { return r ? JSON.parse(r.data) : {}; } catch { return {}; }
}

export async function onRequestGet({ request, env }) {
  const u = await readUser(request, env);
  if (!u) return json({ ok: false }, 401);
  return json({ ok: true, items: await load(env, u.sub) });
}

export async function onRequestPost({ request, env }) {
  const u = await readUser(request, env);
  if (!u) return json({ ok: false }, 401);
  const body = await request.text();
  if (body.length > 400e3) return json({ ok: false }, 413);
  let d;
  try { d = JSON.parse(body); } catch { return json({ ok: false }, 400); }
  const now = Date.now() + 60e3, data = await load(env, u.sub);
  let n = 0;
  for (const [slug, e] of Object.entries(d.items || {}).slice(0, 3000)) {
    if (!/^[a-z0-9-]{1,120}$/.test(slug) || !e || !Number.isFinite(+e.t)) continue;
    const t = Math.min(Math.floor(+e.t), now);
    if (data[slug] && data[slug].t >= t) continue;
    data[slug] = { s: /^\d+:[\d.]+$/.test(e.s) ? e.s : '',
                   p: e.p == null || !Number.isFinite(+e.p) ? null : Math.max(0, Math.min(1, +e.p)),
                   d: e.d ? 1 : 0, t };
    n++;
  }
  if (n) await env.DB.prepare('INSERT INTO reading (sub, data, t) VALUES (?, ?, ?) ON CONFLICT (sub) DO UPDATE SET data = excluded.data, t = excluded.t')
    .bind(u.sub, JSON.stringify(data), Date.now()).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const u = await readUser(request, env);
  if (!u) return json({ ok: false }, 401);
  await table(env);
  await ensureExercisesTable(env);
  await env.DB.prepare('DELETE FROM reading WHERE sub = ?').bind(u.sub).run();
  await env.DB.prepare('DELETE FROM exercises WHERE sub = ?').bind(u.sub).run();
  return json({ ok: true });
}
