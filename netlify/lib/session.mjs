/* ============================================================
   Shared session helpers.

   Lives outside netlify/functions/ on purpose: anything inside that
   directory is deployed as its own endpoint, and this file is a library,
   not a route. Both auth.mjs and profile.mjs import from here.
   ============================================================ */

import crypto from 'node:crypto';

export const SESSION_COOKIE = 'kt_session';
export const PKCE_COOKIE    = 'kt_pkce';
export const SESSION_TTL    = 60 * 60 * 24 * 30;  // 30 days
export const PKCE_TTL       = 60 * 10;            // 10 minutes

export const WHOP_AUTHORIZE = 'https://api.whop.com/oauth/authorize';
export const WHOP_TOKEN     = 'https://api.whop.com/oauth/token';
export const WHOP_USERINFO  = 'https://api.whop.com/oauth/userinfo';

export const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function sign(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function unsign(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  // constant-time compare — lengths must match first or timingSafeEqual throws
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch { return null; }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function readCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

// Secure is dropped only for plain-http localhost, so `netlify dev` works in
// every browser. Anything served over https — i.e. production — keeps it.
export const isLocal = (req) => new URL(req.url).protocol === 'http:';

export function setCookie(req, name, value, maxAge) {
  const bits = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (!isLocal(req)) bits.push('Secure');
  return bits.join('; ');
}

export const clearCookie = (req, name) =>
  `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` + (isLocal(req) ? '' : '; Secure');

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  return new URL(req.url).origin;
}

/** The signed-in session payload ({ aid }), or null. Never throws — a
 *  missing SESSION_SECRET means nobody is signed in, not a 500. */
export function sessionPayload(req) {
  try {
    return unsign(readCookie(req, SESSION_COOKIE), env('SESSION_SECRET'));
  } catch {
    return null;
  }
}

/** A signed session cookie for this account id. */
export function sessionCookieFor(req, accountId) {
  const token = sign(
    { aid: accountId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL },
    env('SESSION_SECRET'),
  );
  return setCookie(req, SESSION_COOKIE, token, SESSION_TTL);
}

/** Blocks a state-changing request that did not come from our own pages.
 *  SameSite=Lax already stops cross-site form posts; this closes the gap for
 *  anything that reaches us with an Origin we don't recognise. */
export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return true;  // same-origin fetches often omit it entirely
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
