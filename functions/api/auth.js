// Reader sign-in with Google (public/account.js). GET: is sign-in set up (Pages var GOOGLE_CLIENT_ID,
// secret SESSION_SECRET, D1 binding DB) + who is signed in. POST {credential}: Google ID token → session
// cookie. DELETE: sign out. Nothing is stored about the reader but Google's account number (sub) in D1.
import { json, ready, readUser, makeCookie, clearCookie, checkGoogleToken } from '../lib/session.js';

export async function onRequestGet({ request, env }) {
  if (!ready(env)) return json({ ready: false });
  const u = await readUser(request, env);
  return json({ ready: true, clientId: env.GOOGLE_CLIENT_ID, user: u && { name: u.name, pic: u.pic } });
}

export async function onRequestPost({ request, env }) {
  if (!ready(env)) return json({ ok: false }, 503);
  let d;
  try { d = await request.json(); } catch { return json({ ok: false }, 400); }
  let u = null;
  try { u = await checkGoogleToken(d.credential, env.GOOGLE_CLIENT_ID); } catch {}
  if (!u) return json({ ok: false }, 401);
  return json({ ok: true, user: { name: u.name, pic: u.pic } }, 200, { 'set-cookie': await makeCookie(env, u) });
}

export const onRequestDelete = () => json({ ok: true }, 200, { 'set-cookie': clearCookie });
