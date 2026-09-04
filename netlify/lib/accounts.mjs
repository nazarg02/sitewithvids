/* ============================================================
   ACCOUNTS — the identity layer.

   A Kenpachi Trades account is its own record. Whop, Google and Discord
   are *identities attached to it*, not the account itself, so one person
   can sign in with a password today and add Whop tomorrow without ending
   up with two profiles.

   Blob stores:
     accounts    <accountId>          → the account record
     emails      <lowercased email>   → accountId
     identities  <provider:subject>   → accountId
     usernames   <username>           → accountId   (lives in store.mjs)
     throttle    <bucket>             → failed sign-in counter
   ============================================================ */

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { getStore } from '@netlify/blobs';

import { cleanDisplayName } from './store.mjs';
import { blankXp } from './xp.mjs';

const scrypt = promisify(crypto.scrypt);

const opts = { consistency: 'strong' };
const accountStore    = () => getStore({ name: 'accounts',   ...opts });
const emailStore      = () => getStore({ name: 'emails',     ...opts });
const identityStore   = () => getStore({ name: 'identities', ...opts });
const throttleStore   = () => getStore({ name: 'throttle',   ...opts });

/* ---------- ids and email ---------- */

export const newAccountId = () => 'acc_' + crypto.randomBytes(16).toString('base64url');

/* Deliberately permissive: the one thing a stricter pattern reliably does
   is reject somebody's real address. Deliverability is what actually
   proves an address, and that's the verification email's job. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normalizeEmail = (raw) => String(raw || '').trim().toLowerCase();
export const emailLooksValid = (raw) => EMAIL_RE.test(normalizeEmail(raw)) && String(raw).length <= 254;

/* ---------- passwords ---------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/* Printable ASCII only. A password typed in another keyboard layout is one
   the owner cannot reliably retype — on a phone, on a borrowed machine, or
   after the layout switches on them — and it locks them out of their own
   account with a password they are certain is correct. */
const ASCII_ONLY = /^[\x20-\x7E]+$/;   // space through tilde

export function passwordProblem(raw) {
  const value = String(raw ?? '');
  if (value.length < 8) return 'Use at least 8 characters.';
  if (value.length > 200) return 'That password is too long.';
  if (!ASCII_ONLY.test(value)) {
    return 'Use English letters, numbers and symbols only — another keyboard layout will not work.';
  }
  // Length is what actually matters; the only thing worth blocking outright
  // is the handful of passwords every credential-stuffing list starts with.
  if (/^(password|12345678|qwertyui|11111111|trading1)$/i.test(value)) {
    return 'That password is too common.';
  }
  return null;
}

export async function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(plain, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, N, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  try {
    const key = await scrypt(plain, Buffer.from(salt, 'base64url'), Buffer.from(hash, 'base64url').length,
      { N: Number(N), r: Number(r), p: Number(p) });
    const a = Buffer.from(hash, 'base64url');
    return a.length === key.length && crypto.timingSafeEqual(a, key);
  } catch {
    return false;
  }
}

/* ---------- throttling ---------- */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

/** True when this bucket (an email, or an IP) has failed too often lately. */
export async function isThrottled(bucket) {
  try {
    const row = await throttleStore().get(bucket, { type: 'json' });
    if (!row) return false;
    if (Date.now() > row.until) return false;
    return row.count >= MAX_FAILURES;
  } catch {
    return false;  // the throttle must never be the reason a login breaks
  }
}

export async function noteFailure(bucket) {
  try {
    const store = throttleStore();
    const row = await store.get(bucket, { type: 'json' });
    const fresh = !row || Date.now() > row.until;
    await store.setJSON(bucket, {
      count: fresh ? 1 : row.count + 1,
      until: fresh ? Date.now() + WINDOW_MS : row.until,
    });
  } catch { /* best effort */ }
}

export async function clearFailures(bucket) {
  try { await throttleStore().delete(bucket); } catch { /* nothing to clear */ }
}

/* ---------- account records ---------- */

export function blankAccount({ email = null, displayName = 'Trader' } = {}) {
  const now = new Date().toISOString();
  return {
    id: newAccountId(),
    email: email ? normalizeEmail(email) : null,
    emailVerified: false,
    password: null,
    // bumped on every password change, which is what silently invalidates
    // any reset link that was already sitting in an inbox
    passwordVersion: 0,
    identities: {},        // provider → subject id
    oauthPicture: null,    // the picture the newest linked provider gave us
    profile: {
      displayName: cleanDisplayName(displayName),
      username: null,
      avatar: { kind: 'auto', src: null },
      avatarVersion: 0,
      bio: '',
      badges: [],
    },
    xp: blankXp(),
    createdAt: now,
    updatedAt: now,
  };
}

export async function readAccount(id) {
  if (!id) return null;
  try {
    return await accountStore().get(id, { type: 'json' });
  } catch (err) {
    console.error('account read failed', err);
    return null;
  }
}

export async function writeAccount(account) {
  account.updatedAt = new Date().toISOString();
  await accountStore().setJSON(account.id, account);
  return account;
}

export async function accountIdByEmail(email) {
  if (!email) return null;
  try {
    return await emailStore().get(normalizeEmail(email), { type: 'text' });
  } catch {
    return null;
  }
}

const identityKey = (provider, subject) => `${provider}:${subject}`;

export async function accountIdByIdentity(provider, subject) {
  if (!provider || !subject) return null;
  try {
    return await identityStore().get(identityKey(provider, subject), { type: 'text' });
  } catch {
    return null;
  }
}

export const claimEmail = (email, accountId) => emailStore().set(normalizeEmail(email), accountId);
export const releaseEmail = (email) => emailStore().delete(normalizeEmail(email));

export const claimIdentity = (provider, subject, accountId) =>
  identityStore().set(identityKey(provider, subject), accountId);
export const releaseIdentity = (provider, subject) =>
  identityStore().delete(identityKey(provider, subject));

/** How many ways this person can still get in. Used to refuse unlinking the
 *  last one, which would lock them out of their own account. */
export function loginMethodCount(account) {
  return (account.password ? 1 : 0) + Object.keys(account.identities || {}).length;
}

/* ---------- signed one-time links ---------- */

/* Verification and password-reset links carry their own state: a signed
   payload with an expiry. Nothing is stored, and a reset link stops working
   the moment the password changes, because passwordVersion is inside the
   signature. */

export function signToken(payload, secret, ttlSeconds) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }))
    .toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function readToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
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
