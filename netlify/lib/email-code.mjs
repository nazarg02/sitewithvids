/* ============================================================
   EMAIL CONFIRMATION BY CODE

   A six-digit code, not a link. People read their mail on a phone and sign
   up on a laptop; a link opened in the other browser has no session and
   dies. A code moves between devices by eye.

   Blob store `emailcodes`, keyed by account id:
     { email, codeHash, expiresAt, attempts, sentAt, sends, windowStart }

   The code is stored as a SHA-256 hash. Six digits is a million options,
   which is only safe because `attempts` caps guessing at five — without that
   counter the code would be brute-forced in minutes.
   ============================================================ */

import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

const codes = () => getStore({ name: 'emailcodes', consistency: 'strong' });

export const CODE_TTL_MS      = 15 * 60 * 1000;   // a code lives 15 minutes
export const MAX_ATTEMPTS     = 5;                // wrong guesses per code
export const RESEND_COOLDOWN  = 60 * 1000;        // between two sends
export const MAX_SENDS        = 5;                // per hour, per account
export const SEND_WINDOW_MS   = 60 * 60 * 1000;

const hash = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

/** Six digits, uniformly random. Math.random() would be predictable enough
 *  to matter for something that guards an identity. */
const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

export const normalizeCode = (raw) => String(raw ?? '').replace(/\D/g, '');

async function read(accountId) {
  try {
    return await codes().get(accountId, { type: 'json' });
  } catch (err) {
    console.error('email code read failed', err);
    return null;
  }
}

/** Creates and stores a code, or explains why it will not.
 *  Returns { code } on success, or { error, retryAfter? }. */
export async function issueCode(accountId, email) {
  const now = Date.now();
  const previous = await read(accountId);

  // Rate limits protect the address, not us: without them this endpoint is a
  // button that mails somebody else's inbox as often as you can click it.
  if (previous) {
    const since = now - (previous.sentAt || 0);
    if (since < RESEND_COOLDOWN) {
      return { error: 'cooldown', retryAfter: Math.ceil((RESEND_COOLDOWN - since) / 1000) };
    }
    const windowOpen = now - (previous.windowStart || 0) < SEND_WINDOW_MS;
    if (windowOpen && (previous.sends || 0) >= MAX_SENDS) {
      return { error: 'too_many', retryAfter: Math.ceil((SEND_WINDOW_MS - (now - previous.windowStart)) / 1000) };
    }
  }

  const fresh = !previous || now - (previous.windowStart || 0) >= SEND_WINDOW_MS;
  const code = newCode();

  await codes().setJSON(accountId, {
    email,
    codeHash: hash(code),
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
    sentAt: now,
    sends: fresh ? 1 : (previous.sends || 0) + 1,
    windowStart: fresh ? now : previous.windowStart,
  });

  return { code };
}

/** Checks a code. Returns { email } on success, or { error }.
 *  A wrong guess is counted before anything else, so retrying is bounded. */
export async function checkCode(accountId, raw) {
  const entry = await read(accountId);
  if (!entry) return { error: 'no_code' };

  if (Date.now() > entry.expiresAt) {
    await clearCode(accountId);
    return { error: 'expired' };
  }
  if ((entry.attempts || 0) >= MAX_ATTEMPTS) return { error: 'too_many_attempts' };

  const given = normalizeCode(raw);
  if (given.length !== 6) {
    await bumpAttempts(accountId, entry);
    return { error: 'wrong', left: MAX_ATTEMPTS - (entry.attempts || 0) - 1 };
  }

  const a = Buffer.from(hash(given));
  const b = Buffer.from(entry.codeHash);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) {
    await bumpAttempts(accountId, entry);
    return { error: 'wrong', left: MAX_ATTEMPTS - (entry.attempts || 0) - 1 };
  }

  return { email: entry.email };
}

async function bumpAttempts(accountId, entry) {
  try {
    await codes().setJSON(accountId, { ...entry, attempts: (entry.attempts || 0) + 1 });
  } catch { /* best effort — a lost increment is not worth failing the request */ }
}

export async function clearCode(accountId) {
  try { await codes().delete(accountId); } catch { /* already gone */ }
}

/** What the profile page shows without revealing the code itself. */
export async function pendingFor(accountId) {
  const entry = await read(accountId);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return {
    email: entry.email,
    expiresAt: entry.expiresAt,
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - (entry.attempts || 0)),
  };
}
