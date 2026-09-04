/* ============================================================
   PROFILE STORAGE — validation, avatars and the username index.

   The account records themselves live in accounts.mjs; this file owns the
   parts of a profile that are about presentation: what a username may be,
   which avatar sources we accept, and the bytes of an uploaded picture.

   Blob stores:
     usernames  <username>  → accountId
     avatars    <accountId> → the raw bytes of an uploaded avatar

   Strong consistency is on: somebody who saves a username and reloads must
   see the new one, and the uniqueness check must not read a stale index.
   ============================================================ */

import { getStore } from '@netlify/blobs';

const opts = { consistency: 'strong' };

const usernames = () => getStore({ name: 'usernames', ...opts });
const avatars   = () => getStore({ name: 'avatars',   ...opts });

/* ---------- validation ---------- */

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

// Names that would let somebody impersonate the site or its staff.
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'staff', 'team', 'mod', 'mods', 'moderator',
  'support', 'help', 'official', 'kenpachi', 'kenpachitrades', 'kenpachi_qt',
  'soulsociety', 'soul_society', 'espada', 'system', 'null', 'undefined',
  'me', 'you', 'profile', 'account', 'login', 'logout', 'signup', 'signin',
  'api', 'www', 'whop',
]);

/** null when fine, otherwise a human-readable reason. */
export function usernameProblem(raw) {
  const name = String(raw || '').trim().toLowerCase();
  if (!name) return 'Pick a username.';
  if (name.length < 3) return 'At least 3 characters.';
  if (name.length > 20) return 'At most 20 characters.';
  if (!USERNAME_RE.test(name)) return 'Letters, numbers and underscores only.';
  if (RESERVED.has(name)) return 'That username is reserved.';
  return null;
}

export const normalizeUsername = (raw) => String(raw || '').trim().toLowerCase();

const DISPLAY_MAX = 32;
const BIO_MAX = 160;

/** Strips control and zero-width characters, then clamps length. Everything
 *  is rendered with textContent on the client, so this is about tidiness and
 *  invisible-character impersonation, not escaping. */
export function cleanText(raw, max) {
  const out = [];
  for (const ch of String(raw ?? '')) {
    const code = ch.codePointAt(0);
    const invisible =
      code < 0x20 || code === 0x7f ||         // C0 controls and DEL
      (code >= 0x200b && code <= 0x200f) ||   // zero-width and bidi marks
      (code >= 0x202a && code <= 0x202e) ||   // bidi overrides
      code === 0xfeff;                        // BOM
    out.push(invisible ? ' ' : ch);
  }
  return out.join('').replace(/\s+/g, ' ').trim().slice(0, max);
}

export const cleanDisplayName = (raw) => cleanText(raw, DISPLAY_MAX);
export const cleanBio = (raw) => cleanText(raw, BIO_MAX);

/* ---------- avatars ---------- */

export const AVATAR_MAX_BYTES = 1.5 * 1024 * 1024;

/* SVG is deliberately absent: it executes script, and these files are
   served from our own origin. Types are sniffed from the bytes rather than
   trusted from the upload's Content-Type. */
const SIGNATURES = [
  { type: 'image/png',  test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/gif',  test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  {
    type: 'image/webp',
    test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
                 b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

export function sniffImageType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const match = SIGNATURES.find((s) => s.test(bytes));
  return match ? match.type : null;
}

export async function putAvatar(accountId, bytes, contentType) {
  await avatars().set(accountId, bytes, { metadata: { contentType } });
}

export async function getAvatar(accountId) {
  const res = await avatars().getWithMetadata(accountId, { type: 'arrayBuffer' });
  if (!res) return null;
  return { bytes: res.data, contentType: res.metadata?.contentType || 'image/png' };
}

export async function deleteAvatar(accountId) {
  await avatars().delete(accountId);
}

/* ---------- avatar selection ---------- */

/* A site avatar is any file under images/avatars/ — the generated presets in
   presets/, plus whatever gets dropped into the folder later. The pattern is
   what stops a saved "avatar" from pointing at an arbitrary path or host. */
const SITE_AVATAR_RE = /^images\/avatars\/(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:svg|png|jpe?g|webp|gif)$/;

/** Returns a storable avatar object, or null if the input is not one we
 *  are willing to keep. */
export function sanitizeAvatar(input) {
  if (!input || typeof input !== 'object') return null;
  // 'auto' = whatever picture the linked provider gave us, else initials
  if (input.kind === 'auto') return { kind: 'auto', src: null };
  if (input.kind === 'upload') return { kind: 'upload', src: null };
  if (input.kind === 'site' && SITE_AVATAR_RE.test(String(input.src || ''))) {
    return { kind: 'site', src: String(input.src) };
  }
  return null;
}

/** The URL the nav and the profile page should actually render, or null to
 *  fall back to the initial. */
export function avatarUrl(account) {
  const avatar = account?.profile?.avatar;
  if (avatar?.kind === 'upload') {
    return `/api/avatar/${encodeURIComponent(account.id)}?v=${account.profile.avatarVersion || 0}`;
  }
  if (avatar?.kind === 'site' && avatar.src) return '/' + avatar.src;
  return account?.oauthPicture || null;
}

/* ---------- username index ---------- */

/** Who holds this username, or null. */
export async function usernameOwner(username) {
  try {
    return await usernames().get(username, { type: 'text' });
  } catch (err) {
    console.error('username lookup failed', err);
    return null;
  }
}

/** Moves `username` to `accountId`, releasing whatever they held before.
 *  Returns false if somebody else already has it.
 *
 *  Blobs has no compare-and-set, so two people claiming the same free name
 *  in the same instant could both pass the check. At this site's traffic
 *  that is not a real risk, and the loser simply renames. */
export async function claimUsername(accountId, username, previous) {
  const owner = await usernameOwner(username);
  if (owner && owner !== accountId) return false;
  if (owner !== accountId) await usernames().set(username, accountId);
  if (previous && previous !== username) {
    try { await usernames().delete(previous); } catch { /* already gone */ }
  }
  return true;
}
