// Interactive exercise answers of a signed-in reader (public/exercises.js keeps the same data in localStorage "ex:<slug>").
// D1 (binding DB): one row per (reader, book), exercises(sub, slug, data, t), data = JSON {fieldId: {v, t}}.
// Per field the newest t wins, so answers filled on different devices merge cleanly.
// GET ?slug=<slug> → {ok, items}. POST {slug, items} (text body, also from keepalive on page close) → merged into the row.
import { json, readUser } from '../lib/session.js';

const SLUG_RE = /^[a-z0-9-]{1,120}$/;
const KEY_RE = /^[a-z0-9_-]{1,48}$/;

let made = false;
export async function ensureExercisesTable(env) {
  if (made) return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS exercises (sub TEXT NOT NULL, slug TEXT NOT NULL, data TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (sub, slug))'
  ).run();
  made = true;
}

async function load(env, sub, slug) {
  await ensureExercisesTable(env);
  const r = await env.DB.prepare('SELECT data FROM exercises WHERE sub = ? AND slug = ?').bind(sub, slug).first();
  try { return r ? JSON.parse(r.data) : {}; } catch { return {}; }
}

function cleanVal(v) {
  if (typeof v === 'string') return v.slice(0, 4000);
  if (Array.isArray(v)) {
    const out = [];
    for (const x of v.slice(0, 200)) {
      if (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < 10000) out.push(x);
      else if (typeof x === 'string' && x.length <= 200) out.push(x);
    }
    return out;
  }
  return '';
}

export async function onRequestGet({ request, env }) {
  const u = await readUser(request, env);
  if (!u) return json({ ok: false }, 401);
  const slug = new URL(request.url).searchParams.get('slug') || '';
  if (!SLUG_RE.test(slug)) return json({ ok: false }, 400);
  return json({ ok: true, items: await load(env, u.sub, slug) });
}

export async function onRequestPost({ request, env }) {
  const u = await readUser(request, env);
  if (!u) return json({ ok: false }, 401);
  const body = await request.text();
  if (body.length > 250e3) return json({ ok: false }, 413);
  let d;
  try { d = JSON.parse(body); } catch { return json({ ok: false }, 400); }
  const slug = String(d && d.slug || '');
  if (!SLUG_RE.test(slug)) return json({ ok: false }, 400);
  const now = Date.now() + 60e3, data = await load(env, u.sub, slug);
  let n = 0;
  for (const [k, e] of Object.entries(d.items || {}).slice(0, 2000)) {
    if (!KEY_RE.test(k) || !e || !Number.isFinite(+e.t)) continue;
    const t = Math.min(Math.floor(+e.t), now);
    if (data[k] && data[k].t >= t) continue;
    data[k] = { v: cleanVal(e.v), t };
    n++;
  }
  if (n) {
    await env.DB.prepare(
      'INSERT INTO exercises (sub, slug, data, t) VALUES (?, ?, ?, ?) ON CONFLICT (sub, slug) DO UPDATE SET data = excluded.data, t = excluded.t'
    ).bind(u.sub, slug, JSON.stringify(data), Date.now()).run();
  }
  return json({ ok: true });
}
