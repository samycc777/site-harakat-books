// Shared by functions/api/auth.js and progress.js (no route of its own: it exports no onRequest).
// Reader accounts: «Sign in with Google» on the page gives a Google ID token; auth.js checks it here
// and answers with a session cookie "ks" = base64url(JSON {sub, name, pic, exp}) + "." + HMAC-SHA256
// with the Pages secret SESSION_SECRET. Progress rows in D1 (binding DB) are keyed by Google's "sub".
export const json = (o, status = 200, headers = {}) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

export const ready = env => !!(env.GOOGLE_CLIENT_ID && env.SESSION_SECRET && env.DB);

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const hmacKey = secret => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

const YEAR = 365 * 86400;
export async function makeCookie(env, user) {
  const body = b64u(enc.encode(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + YEAR })));
  const sig = b64u(await crypto.subtle.sign('HMAC', await hmacKey(env.SESSION_SECRET), enc.encode(body)));
  return `ks=${body}.${sig}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`;
}
export const clearCookie = 'ks=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';

export async function readUser(request, env) {
  if (!ready(env)) return null;
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)ks=([\w-]+)\.([\w-]+)/);
  if (!m) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env.SESSION_SECRET), unb64u(m[2]), enc.encode(m[1]));
    if (!ok) return null;
    const u = JSON.parse(new TextDecoder().decode(unb64u(m[1])));
    return u.exp > Date.now() / 1000 && u.sub ? u : null;
  } catch { return null; }
}

// Google ID token (RS256 JWT) checked against Google's public keys: signature, audience, issuer, expiry.
let keys = null, keysAt = 0;
async function googleKeys() {
  if (!keys || Date.now() - keysAt > 3600e3) {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    keys = (await r.json()).keys; keysAt = Date.now();
  }
  return keys;
}
export async function checkGoogleToken(token, clientId) {
  const [h, p, s] = String(token).split('.');
  if (!s) return null;
  const head = JSON.parse(new TextDecoder().decode(unb64u(h)));
  const jwk = (await googleKeys()).find(k => k.kid === head.kid);
  if (!jwk || head.alg !== 'RS256') return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64u(s), enc.encode(h + '.' + p)))) return null;
  const c = JSON.parse(new TextDecoder().decode(unb64u(p)));
  const now = Date.now() / 1000;
  if (c.aud !== clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(c.iss) || c.exp < now) return null;
  return { sub: String(c.sub), name: String(c.name || c.given_name || '').slice(0, 80), pic: String(c.picture || '').slice(0, 300) };
}
