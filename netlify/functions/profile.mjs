/* ============================================================
   PROFILE — everything on the account page that isn't signing in.

     GET    /api/profile         → account + badges + subscriptions
     PATCH  /api/profile         → display name, username, bio, avatar choice
     GET    /api/username?u=x    → is this username free?
     POST   /api/profile/avatar  → upload a custom avatar (raw image body)
     DELETE /api/profile/avatar  → drop it, back to the provider picture
     GET    /api/avatar/:id      → serve an uploaded avatar
     GET    /api/badges          → the badge catalog (for rendering)
     POST   /api/admin/badge     → grant or revoke a manual badge
     POST   /api/test/complete   → record a passed test: badge + one-off XP

   Subscriptions and the automatic badges come from Whop, so they appear
   only once a Whop account is linked. Everything else — avatar, username,
   bio, manual badges — works from the moment the account exists.

   Extra environment variables beyond the ones auth.mjs needs:
     ADMIN_KEY                   secret for /api/admin/badge (required to use it)
     WHOP_PREMIUM_PRODUCT_IDS    optional, comma-separated — exact product match
     WHOP_INDICATOR_PRODUCT_IDS  optional, same
   ============================================================ */

import crypto from 'node:crypto';

import { json, sameOrigin, sessionPayload } from '../lib/session.mjs';
import { fetchMemberships } from '../lib/whop.mjs';
import { BADGES, GRANTABLE, autoBadges, tierOf } from '../lib/badges.mjs';
import { accountIdByEmail, normalizeEmail, readAccount, writeAccount } from '../lib/accounts.mjs';
import { pendingFor } from '../lib/email-code.mjs';
import { getTest } from '../lib/tests.mjs';
import {
  XP_PER_TEST,
  grant,
  grantBadges,
  levelState,
  readXp,
  testKey,
} from '../lib/xp.mjs';
import {
  AVATAR_MAX_BYTES,
  avatarUrl,
  claimUsername,
  cleanBio,
  cleanDisplayName,
  deleteAvatar,
  getAvatar,
  normalizeUsername,
  putAvatar,
  sanitizeAvatar,
  sniffImageType,
  usernameOwner,
  usernameProblem,
} from '../lib/store.mjs';

export const config = {
  path: [
    '/api/test/complete',
    '/api/profile',
    '/api/profile/avatar',
    '/api/username',
    '/api/avatar/:id',
    '/api/badges',
    '/api/admin/badge',
  ],
};

const unauthorized = () => json({ error: 'not_authenticated', message: 'Please sign in first.' }, 401);

/** The account behind the session cookie, or null. */
async function currentAccount(req) {
  const session = sessionPayload(req);
  return session ? readAccount(session.aid) : null;
}

/** Whop is the only source of subscriptions, so an account without it gets
 *  an empty list that is explicitly *not* an error. */
async function membershipsFor(account) {
  const whopId = account.identities?.whop;
  if (!whopId) return { memberships: null, connected: false };
  try {
    return { memberships: await fetchMemberships(whopId), connected: true };
  } catch (err) {
    console.error('memberships lookup threw', err);
    return { memberships: null, connected: true };
  }
}

function accountView(account, memberships, level) {
  return {
    level,
    id: account.id,
    name: account.profile.displayName,
    username: account.profile.username,
    email: account.email,
    emailVerified: account.emailVerified,
    avatar: avatarUrl(account),
    avatarChoice: account.profile.avatar || { kind: 'auto', src: null },
    bio: account.profile.bio || '',
    joinedAt: account.createdAt,
    connections: Object.keys(account.identities || {}),
    hasPassword: Boolean(account.password),
    tier: tierOf(memberships),
  };
}

/* ---------- GET /api/profile ---------- */

async function getProfile(req) {
  const account = await currentAccount(req);
  if (!account) return json({ authenticated: false });

  const { memberships, connected } = await membershipsFor(account);

  const earned = new Set([
    ...autoBadges(memberships, account),
    ...(Array.isArray(account.profile.badges) ? account.profile.badges : []),
  ]);

  /* Badge XP is settled here rather than at the moment a badge is earned,
     because the automatic ones are never "earned" at a moment — they are
     recomputed from Whop on every request. The awards map makes this
     idempotent, and we only write when something actually paid out. */
  const xp = readXp(account);
  if (grantBadges(xp, earned, BADGES)) {
    account.xp = xp;
    await writeAccount(account);
  }

  return json({
    authenticated: true,
    user: accountView(account, memberships, levelState(xp.total)),
    whopConnected: connected,
    email: {
      address: account.email,
      verified: Boolean(account.emailVerified),
      pending: await pendingFor(account.id),
    },
    xp: { total: xp.total, awards: xp.awards },
    badges: [...earned],
    memberships: memberships || [],
    // "unavailable" means Whop did not answer; not connected is a different
    // thing entirely, and the page says something different for each.
    membershipsAvailable: connected ? memberships !== null : true,
  });
}

/* ---------- PATCH /api/profile ---------- */

async function patchProfile(req) {
  const account = await currentAccount(req);
  if (!account) return unauthorized();
  if (!sameOrigin(req)) return json({ error: 'blocked', message: 'Request blocked.' }, 403);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json', message: 'Something went wrong. Please try again.' }, 400);
  }

  const profile = account.profile;

  if ('displayName' in body) {
    const name = cleanDisplayName(body.displayName);
    if (!name) return json({ error: 'bad_display_name', message: 'Your name cannot be empty.' }, 400);
    profile.displayName = name;
  }

  if ('bio' in body) profile.bio = cleanBio(body.bio);

  if ('avatar' in body) {
    const avatar = sanitizeAvatar(body.avatar);
    if (!avatar) return json({ error: 'bad_avatar', message: "That avatar isn't available." }, 400);
    // "upload" is only legitimate once bytes actually exist for this account
    if (avatar.kind === 'upload' && !(await getAvatar(account.id))) {
      return json({ error: 'no_upload', message: 'Upload an image first.' }, 400);
    }
    profile.avatar = avatar;
  }

  if ('username' in body) {
    const username = normalizeUsername(body.username);
    if (username !== profile.username) {
      const problem = usernameProblem(username);
      if (problem) return json({ error: 'bad_username', message: problem }, 400);
      const claimed = await claimUsername(account.id, username, profile.username);
      if (!claimed) return json({ error: 'username_taken', message: 'That username is taken.' }, 409);
      profile.username = username;
    }
  }

  await writeAccount(account);

  return json({
    ok: true,
    user: {
      name: profile.displayName,
      username: profile.username,
      bio: profile.bio,
      avatar: avatarUrl(account),
      avatarChoice: profile.avatar,
    },
  });
}

/* ---------- GET /api/username?u=x ---------- */

async function checkUsername(req) {
  const account = await currentAccount(req);
  if (!account) return unauthorized();

  const username = normalizeUsername(new URL(req.url).searchParams.get('u'));
  const problem = usernameProblem(username);
  if (problem) return json({ available: false, message: problem });

  const owner = await usernameOwner(username);
  if (owner && owner !== account.id) {
    return json({ available: false, message: 'That username is taken.' });
  }
  return json({ available: true, message: 'Available.' });
}

/* ---------- POST/DELETE /api/profile/avatar ---------- */

async function uploadAvatar(req) {
  const account = await currentAccount(req);
  if (!account) return unauthorized();
  if (!sameOrigin(req)) return json({ error: 'blocked', message: 'Request blocked.' }, 403);

  // Reject on the declared length before reading a huge body into memory.
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > AVATAR_MAX_BYTES) {
    return json({ error: 'too_large', message: 'Images must be under 1.5 MB.' }, 413);
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > AVATAR_MAX_BYTES) {
    return json({ error: 'too_large', message: 'Images must be under 1.5 MB.' }, 413);
  }

  // Sniffed, never trusted from the header: these bytes get served back from
  // our own origin, and an SVG there would be a script execution primitive.
  const contentType = sniffImageType(bytes);
  if (!contentType) {
    return json({ error: 'bad_image', message: 'Use a PNG, JPG, GIF or WebP image.' }, 415);
  }

  await putAvatar(account.id, bytes, contentType);

  account.profile.avatar = { kind: 'upload', src: null };
  account.profile.avatarVersion = (account.profile.avatarVersion || 0) + 1;
  await writeAccount(account);

  return json({ ok: true, avatar: avatarUrl(account) });
}

async function removeAvatar(req) {
  const account = await currentAccount(req);
  if (!account) return unauthorized();
  if (!sameOrigin(req)) return json({ error: 'blocked', message: 'Request blocked.' }, 403);

  await deleteAvatar(account.id);
  if (account.profile.avatar?.kind === 'upload') account.profile.avatar = { kind: 'auto', src: null };
  await writeAccount(account);

  return json({ ok: true, avatar: avatarUrl(account) });
}

/* ---------- GET /api/avatar/:id ---------- */

async function serveAvatar(req) {
  const id = decodeURIComponent(new URL(req.url).pathname.split('/').pop() || '');
  if (!id) return json({ error: 'not_found' }, 404);

  const file = await getAvatar(id);
  if (!file) return json({ error: 'not_found' }, 404);

  return new Response(file.bytes, {
    headers: {
      'content-type': file.contentType,
      // every save bumps ?v=, so the bytes behind a given URL never change
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
    },
  });
}

/* ---------- POST /api/admin/badge ---------- */

/** Constant-time key compare — a plain === leaks the key one byte at a time
 *  to anyone patient enough to measure. */
function keyMatches(given) {
  const expected = process.env.ADMIN_KEY;
  if (!expected || !given) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function adminBadge(req) {
  if (!keyMatches(req.headers.get('x-admin-key'))) return json({ error: 'forbidden' }, 403);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  const { badge, action = 'grant' } = body;

  // The target can be given any way round — an id is exact, but a username
  // or an email is what you actually know when somebody asks in Discord.
  let accountId = body.accountId || null;
  if (!accountId && body.username) accountId = await usernameOwner(normalizeUsername(body.username));
  if (!accountId && body.email) accountId = await accountIdByEmail(normalizeEmail(body.email));
  if (!accountId) return json({ error: 'no_such_user' }, 404);

  if (!GRANTABLE.has(badge)) {
    return json({ error: 'bad_badge', message: 'Auto badges come from Whop and cannot be granted.' }, 400);
  }

  const account = await readAccount(accountId);
  if (!account) return json({ error: 'no_such_user' }, 404);

  const held = new Set(Array.isArray(account.profile.badges) ? account.profile.badges : []);
  if (action === 'revoke') held.delete(badge);
  else held.add(badge);
  account.profile.badges = [...held];

  await writeAccount(account);
  return json({ ok: true, accountId, badges: account.profile.badges });
}

/* ---------- POST /api/test/complete ---------- */

/* The Quarterly Theory tests are still to come; this is the door they will
   knock on. XP is keyed by test id, so a second pass at the same test pays
   nothing — the next 200 has to come from a different test. */
async function completeTest(req) {
  const account = await currentAccount(req);
  if (!account) return unauthorized();
  if (!sameOrigin(req)) return json({ error: 'blocked', message: 'Request blocked.' }, 403);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json', message: 'Something went wrong. Please try again.' }, 400);
  }

  // Checked against the registry, not just the shape of the string: any
  // signed-in person can call this endpoint, and an unchecked id would be
  // 200 XP per word they can invent.
  const test = getTest(String(body?.testId || '').trim().toLowerCase());
  if (!test) return json({ error: 'bad_test', message: 'Unknown test.' }, 400);

  if (body?.passed !== true) {
    return json({ ok: true, xpAwarded: 0, passed: false });
  }

  const xp = readXp(account);
  const awarded = grant(xp, testKey(test.id), XP_PER_TEST);

  // The badge comes from the test definition, never from the request —
  // otherwise passing the easiest test would let you ask for any badge.
  const badge = test.badge;
  let badgeAdded = false;
  if (badge && GRANTABLE.has(badge)) {
    const held = new Set(Array.isArray(account.profile.badges) ? account.profile.badges : []);
    if (!held.has(badge)) {
      held.add(badge);
      account.profile.badges = [...held];
      badgeAdded = true;
    }
  }

  if (awarded || badgeAdded) {
    account.xp = xp;
    await writeAccount(account);
  }

  return json({
    ok: true,
    passed: true,
    xpAwarded: awarded ? XP_PER_TEST : 0,
    alreadyDone: !awarded,
    level: levelState(xp.total),
  });
}

/* ---------- entry ---------- */

/* `netlify dev` retries a non-2xx function response as a static lookup and
   comes back with "/index.htm" glued onto the path, which would otherwise
   turn every 403 into a puzzling 404 locally. Production never does this;
   normalising here just keeps the two environments honest. */
const normalize = (pathname) =>
  pathname.replace(/\/index\.html?$/, '').replace(/\/+$/, '') || '/';

export default async function handler(req) {
  const path = normalize(new URL(req.url).pathname);
  const method = req.method.toUpperCase();

  try {
    if (path === '/api/badges' && method === 'GET') {
      return json({ badges: BADGES }, 200, { 'cache-control': 'public, max-age=600' });
    }
    if (path === '/api/profile') {
      if (method === 'GET') return await getProfile(req);
      if (method === 'PATCH' || method === 'POST') return await patchProfile(req);
    }
    if (path === '/api/profile/avatar') {
      if (method === 'POST') return await uploadAvatar(req);
      if (method === 'DELETE') return await removeAvatar(req);
    }
    if (path === '/api/username' && method === 'GET') return await checkUsername(req);
    if (path.startsWith('/api/avatar/') && method === 'GET') return await serveAvatar(req);
    if (path === '/api/admin/badge' && method === 'POST') return await adminBadge(req);
    if (path === '/api/test/complete' && method === 'POST') return await completeTest(req);

    return json({ error: 'not_found' }, 404);
  } catch (err) {
    console.error('profile handler error', err);
    // A missing env var must not blank the account page — it degrades to
    // logged-out, exactly like /api/me does.
    if (path === '/api/profile' && method === 'GET') {
      return json({ authenticated: false, error: 'server_error' });
    }
    return json({ error: 'server_error', message: 'Something went wrong on our side.' }, 500);
  }
}
