/* ============================================================
   AUTH — sign up, sign in, and linked provider accounts.

     GET  /api/auth/providers   → which sign-in buttons to render
     POST /api/auth/signup      → create an account with email + password
     POST /api/auth/signin      → email + password
     POST /api/auth/forgot      → send a password-reset link
     POST /api/auth/reset       → set a new password from that link
     POST /api/auth/send-code   → email a 6-digit confirmation code
     POST /api/auth/confirm-code→ confirm an address with that code
     POST /api/auth/disconnect  → unlink a provider
     GET  /api/login/:provider  → start OAuth (add ?link=1 to attach it)
     GET  /api/callback/:provider
     GET  /api/me               → the current account
     GET  /api/logout

   Whop is the provider that carries subscriptions, so an account without it
   is perfectly valid — it just cannot see memberships until it is linked.

   Environment:
     SESSION_SECRET     long random string                     (SECRET)
     WHOP_APP_ID        app_...        WHOP_API_KEY   apik_...  (SECRET)
     WHOP_COMPANY_ID    biz_...
     GOOGLE_CLIENT_ID   ...            GOOGLE_CLIENT_SECRET     (SECRET)
     DISCORD_CLIENT_ID  ...            DISCORD_CLIENT_SECRET    (SECRET)
     RESEND_API_KEY     re_...         (optional — enables email)
     SITE_URL           https://kenpachitrades.com  (optional, else derived)
   ============================================================ */

import crypto from 'node:crypto';

import {
  PKCE_COOKIE,
  PKCE_TTL,
  SESSION_COOKIE,
  b64url,
  clearCookie,
  env,
  json,
  readCookie,
  sameOrigin,
  sessionCookieFor,
  sessionPayload,
  setCookie,
  sign,
  siteUrl,
  unsign,
} from '../lib/session.mjs';
import {
  accountIdByEmail,
  accountIdByIdentity,
  blankAccount,
  claimEmail,
  claimIdentity,
  clearFailures,
  emailLooksValid,
  hashPassword,
  isThrottled,
  loginMethodCount,
  noteFailure,
  normalizeEmail,
  passwordProblem,
  readAccount,
  readToken,
  releaseEmail,
  releaseIdentity,
  signToken,
  verifyPassword,
  writeAccount,
} from '../lib/accounts.mjs';
import { avatarUrl, cleanDisplayName } from '../lib/store.mjs';
import { dropCache, fetchMemberships } from '../lib/whop.mjs';
import { CODE_TTL_MS, checkCode, clearCode, issueCode } from '../lib/email-code.mjs';
import { EMAIL_KEY, XP_EMAIL, grant, levelState, readXp } from '../lib/xp.mjs';
import {
  credentials,
  enabledProviders,
  exchangeCode,
  fetchIdentity,
  getProvider,
  isEnabled,
} from '../lib/oauth.mjs';
import { mailEnabled, sendEmailCode, sendPasswordReset } from '../lib/mail.mjs';

export const config = {
  path: ['/api/auth/:action', '/api/login/:provider', '/api/callback/:provider', '/api/me', '/api/logout'],
};

const RESET_TTL = 60 * 60;   // a password-reset link lives an hour

const bad = (message, status = 400, extra = {}) => json({ error: true, message, ...extra }, status);

/* ---------- the shape the front end sees ---------- */

function publicUser(account) {
  return {
    id: account.id,
    name: account.profile.displayName,
    username: account.profile.username,
    email: account.email,
    emailVerified: account.emailVerified,
    picture: avatarUrl(account),
    connections: Object.keys(account.identities || {}),
    hasPassword: Boolean(account.password),
  };
}

/* ---------- helpers ---------- */

function redirect(location, cookies = []) {
  const headers = [['location', location], ['cache-control', 'no-store']];
  cookies.forEach((c) => headers.push(['set-cookie', c]));
  return new Response(null, { status: 302, headers });
}

const safeReturn = (value, fallback = '/profile.html') =>
  value && value.startsWith('/') && !value.startsWith('//') ? value : fallback;

async function accountFromIdentity(provider, identity) {
  const account = blankAccount({
    email: identity.email,
    displayName: identity.name || 'Trader',
  });
  // The provider already proved the address; asking again would be theatre.
  account.emailVerified = Boolean(identity.email);
  account.identities[provider.id] = identity.subject;
  account.oauthPicture = identity.picture || null;

  await writeAccount(account);
  await claimIdentity(provider.id, identity.subject, account.id);
  if (account.email) await claimEmail(account.email, account.id);
  return account;
}

/* ---------- GET /api/login/:provider ---------- */

async function startOAuth(req, providerId) {
  const provider = getProvider(providerId);
  if (!provider || !isEnabled(provider)) {
    return redirect(`${siteUrl(req)}/login.html?error=provider_off`);
  }

  const url = new URL(req.url);
  const linking = url.searchParams.get('link') === '1';
  const returnTo = safeReturn(url.searchParams.get('return_to'));

  const verifier = b64url(crypto.randomBytes(48));
  const state = b64url(crypto.randomBytes(16));

  const pkce = sign(
    { provider: provider.id, verifier, state, linking, returnTo, exp: Math.floor(Date.now() / 1000) + PKCE_TTL },
    env('SESSION_SECRET'),
  );

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: credentials(provider).clientId,
    redirect_uri: `${siteUrl(req)}/api/callback/${provider.id}`,
    scope: provider.scope,
    state,
  });
  if (provider.pkce) {
    params.set('code_challenge', b64url(crypto.createHash('sha256').update(verifier).digest()));
    params.set('code_challenge_method', 'S256');
  }

  return redirect(`${provider.authorize}?${params}`, [setCookie(req, PKCE_COOKIE, pkce, PKCE_TTL)]);
}

/* ---------- GET /api/callback/:provider ---------- */

function oauthError(req, where, reason) {
  return redirect(`${siteUrl(req)}${where}?error=${encodeURIComponent(reason)}`, [clearCookie(req, PKCE_COOKIE)]);
}

async function finishOAuth(req, providerId) {
  const provider = getProvider(providerId);
  if (!provider || !isEnabled(provider)) return oauthError(req, '/login.html', 'provider_off');

  const url = new URL(req.url);
  const pkce = unsign(readCookie(req, PKCE_COOKIE), env('SESSION_SECRET'));
  const landing = pkce?.linking ? '/profile.html' : '/login.html';

  if (url.searchParams.get('error')) return oauthError(req, landing, url.searchParams.get('error'));
  if (!pkce || pkce.provider !== provider.id) return oauthError(req, landing, 'expired');

  const code = url.searchParams.get('code');
  // CSRF: the state we handed out must be the state coming back
  if (!code || url.searchParams.get('state') !== pkce.state) return oauthError(req, landing, 'bad_state');

  const tokens = await exchangeCode(provider, {
    code,
    redirectUri: `${siteUrl(req)}/api/callback/${provider.id}`,
    verifier: pkce.verifier,
  });
  if (!tokens?.access_token) return oauthError(req, landing, 'token_exchange');

  const identity = await fetchIdentity(provider, tokens.access_token);
  if (!identity) return oauthError(req, landing, 'userinfo');

  const existingId = await accountIdByIdentity(provider.id, identity.subject);

  /* --- linking onto the account that is already signed in --- */
  if (pkce.linking) {
    const session = sessionPayload(req);
    const account = session && await readAccount(session.aid);
    if (!account) return oauthError(req, '/login.html', 'not_signed_in');

    if (existingId && existingId !== account.id) {
      // Somebody else already owns this provider account. Silently moving it
      // would quietly detach their subscriptions, so refuse and say so.
      return oauthError(req, '/profile.html', 'already_linked');
    }

    account.identities[provider.id] = identity.subject;
    if (identity.picture && !account.oauthPicture) account.oauthPicture = identity.picture;
    if (!account.email && identity.email) {
      const clash = await accountIdByEmail(identity.email);
      if (!clash) {
        account.email = normalizeEmail(identity.email);
        account.emailVerified = true;
        await claimEmail(account.email, account.id);
      }
    }
    await writeAccount(account);
    await claimIdentity(provider.id, identity.subject, account.id);
    if (provider.id === 'whop') await dropCache();

    return redirect(`${siteUrl(req)}${safeReturn(pkce.returnTo)}?linked=${provider.id}`, [
      clearCookie(req, PKCE_COOKIE),
    ]);
  }

  /* --- signing in --- */
  let account = existingId ? await readAccount(existingId) : null;

  if (!account && identity.email) {
    // Same verified address as an existing account: attach rather than
    // create a second profile the person did not ask for.
    const byEmail = await accountIdByEmail(identity.email);
    if (byEmail) {
      account = await readAccount(byEmail);
      if (account) {
        account.identities[provider.id] = identity.subject;
        if (identity.picture && !account.oauthPicture) account.oauthPicture = identity.picture;
        await writeAccount(account);
        await claimIdentity(provider.id, identity.subject, account.id);
      }
    }
  }

  if (!account) account = await accountFromIdentity(provider, identity);

  return redirect(`${siteUrl(req)}${safeReturn(pkce.returnTo)}`, [
    sessionCookieFor(req, account.id),
    clearCookie(req, PKCE_COOKIE),
  ]);
}

/* ---------- POST /api/auth/signup ---------- */

async function signup(req) {
  const body = await req.json().catch(() => null);
  if (!body) return bad('Something went wrong. Please try again.');

  const email = normalizeEmail(body.email);
  if (!emailLooksValid(email)) return bad('That email address does not look right.', 400, { field: 'email' });

  const problem = passwordProblem(body.password);
  if (problem) return bad(problem, 400, { field: 'password' });

  const name = cleanDisplayName(body.name) || email.split('@')[0];

  const taken = await accountIdByEmail(email);
  if (taken) {
    // Deliberately explicit. Hiding it would just move the discovery to the
    // sign-in form, and cost every honest new user a confusing dead end.
    return bad('An account with that email already exists. Try signing in instead.', 409, { field: 'email' });
  }

  const account = blankAccount({ email, displayName: name });
  account.password = await hashPassword(body.password);
  await writeAccount(account);
  await claimEmail(email, account.id);

  // No email is sent here. The address is confirmed from the profile page
  // with a code, which is where the reward for doing it is explained.
  return json({ ok: true, user: publicUser(account) }, 200, {
    'set-cookie': sessionCookieFor(req, account.id),
  });
}

/* ---------- POST /api/auth/signin ---------- */

async function signin(req) {
  const body = await req.json().catch(() => null);
  if (!body) return bad('Something went wrong. Please try again.');

  const email = normalizeEmail(body.email);
  const bucket = `email:${email}`;

  if (await isThrottled(bucket)) {
    return bad('Too many attempts. Please wait 15 minutes and try again.', 429);
  }

  const accountId = await accountIdByEmail(email);
  const account = accountId ? await readAccount(accountId) : null;

  // One message for both "no such account" and "wrong password", so the form
  // is not a way to find out which addresses are registered.
  const wrong = () => bad('That email and password do not match.', 401);

  if (!account || !account.password) {
    await noteFailure(bucket);
    return wrong();
  }
  if (!(await verifyPassword(String(body.password ?? ''), account.password))) {
    await noteFailure(bucket);
    return wrong();
  }

  await clearFailures(bucket);
  return json({ ok: true, user: publicUser(account) }, 200, {
    'set-cookie': sessionCookieFor(req, account.id),
  });
}

/* ---------- POST /api/auth/forgot ---------- */

async function forgotPassword(req) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  if (!emailLooksValid(email)) return bad('That email address does not look right.');
  if (!mailEnabled()) return bad('Password reset is not switched on for this site yet.', 503);

  const accountId = await accountIdByEmail(email);
  const account = accountId ? await readAccount(accountId) : null;

  if (account) {
    // passwordVersion inside the token is what makes the link single-use:
    // changing the password invalidates any copy still sitting in an inbox.
    const token = signToken(
      { kind: 'reset', aid: account.id, pv: account.passwordVersion || 0 },
      env('SESSION_SECRET'),
      RESET_TTL,
    );
    await sendPasswordReset(email, `${siteUrl(req)}/login.html?reset=${encodeURIComponent(token)}`);
  }

  // Always the same answer — otherwise this endpoint enumerates our users.
  return json({ ok: true });
}

/* ---------- POST /api/auth/reset ---------- */

async function resetPassword(req) {
  const body = await req.json().catch(() => null);
  const payload = readToken(body?.token, env('SESSION_SECRET'));
  if (!payload || payload.kind !== 'reset') {
    return bad('That reset link has expired. Please request a new one.', 400);
  }

  const problem = passwordProblem(body?.password);
  if (problem) return bad(problem, 400, { field: 'password' });

  const account = await readAccount(payload.aid);
  if (!account || (account.passwordVersion || 0) !== payload.pv) {
    return bad('That reset link has already been used. Please request a new one.', 400);
  }

  account.password = await hashPassword(body.password);
  account.passwordVersion = (account.passwordVersion || 0) + 1;
  await writeAccount(account);
  if (account.email) await clearFailures(`email:${account.email}`);

  return json({ ok: true, user: publicUser(account) }, 200, {
    'set-cookie': sessionCookieFor(req, account.id),
  });
}

/* ---------- POST /api/auth/send-code ---------- */

/* Serves both jobs the profile page needs: confirming the address already on
   the account, and attaching one to an account that has none (Whop does not
   always hand over an email). */
async function sendCode(req) {
  const session = sessionPayload(req);
  const account = session && await readAccount(session.aid);
  if (!account) return bad('Please sign in first.', 401);
  if (!mailEnabled()) return bad('Email is not switched on for this site yet.', 503);

  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body?.email || account.email);
  if (!emailLooksValid(email)) return bad('That email address does not look right.', 400, { field: 'email' });

  if (account.emailVerified && email === account.email) {
    return json({ ok: true, alreadyVerified: true });
  }

  const owner = await accountIdByEmail(email);
  if (owner && owner !== account.id) {
    return bad('That email is already on another account.', 409, { field: 'email' });
  }

  const issued = await issueCode(account.id, email);
  if (issued.error === 'cooldown') {
    return bad(`Please wait ${issued.retryAfter} seconds before asking for another code.`, 429);
  }
  if (issued.error === 'too_many') {
    return bad('Too many codes requested. Please try again later.', 429);
  }

  const sent = await sendEmailCode(email, issued.code);
  if (!sent) {
    // Do not leave a live code behind for a mail that never went out.
    await clearCode(account.id);
    return bad('That email could not be sent. Please try again shortly.', 502);
  }

  return json({ ok: true, email, expiresIn: Math.round(CODE_TTL_MS / 1000) });
}

/* ---------- POST /api/auth/confirm-code ---------- */

async function confirmCode(req) {
  const session = sessionPayload(req);
  const account = session && await readAccount(session.aid);
  if (!account) return bad('Please sign in first.', 401);

  const body = await req.json().catch(() => ({}));
  const result = await checkCode(account.id, body?.code);

  if (result.error === 'no_code') return bad('Ask for a code first.', 400);
  if (result.error === 'expired') return bad('That code has expired. Send yourself a new one.', 400);
  if (result.error === 'too_many_attempts') {
    return bad('Too many wrong codes. Send yourself a new one.', 429);
  }
  if (result.error === 'wrong') {
    return bad(result.left > 0
      ? `That code is not right. ${result.left} ${result.left === 1 ? 'try' : 'tries'} left.`
      : 'That code is not right. Send yourself a new one.', 400);
  }

  // Checked again on the way in: somebody else could have claimed this
  // address in the fifteen minutes since the code was sent.
  const owner = await accountIdByEmail(result.email);
  if (owner && owner !== account.id) {
    await clearCode(account.id);
    return bad('That email is already on another account.', 409);
  }

  const previous = account.email;
  account.email = result.email;
  account.emailVerified = true;

  const xp = readXp(account);
  const awarded = grant(xp, EMAIL_KEY, XP_EMAIL);
  account.xp = xp;

  await writeAccount(account);
  await claimEmail(result.email, account.id);
  if (previous && previous !== result.email) await releaseEmail(previous);
  await clearCode(account.id);

  return json({
    ok: true,
    user: publicUser(account),
    xpAwarded: awarded ? XP_EMAIL : 0,
    level: levelState(xp.total),
  });
}

/* ---------- POST /api/auth/disconnect ---------- */

async function disconnect(req) {
  const session = sessionPayload(req);
  const account = session && await readAccount(session.aid);
  if (!account) return bad('Please sign in first.', 401);

  const body = await req.json().catch(() => null);
  const providerId = String(body?.provider || '');
  if (!getProvider(providerId) || !account.identities[providerId]) {
    return bad('That account is not connected.', 400);
  }

  // Never leave someone with no way back in.
  if (loginMethodCount(account) <= 1) {
    return bad('That is your only way to sign in. Set a password first.', 400);
  }

  const subject = account.identities[providerId];
  delete account.identities[providerId];
  await writeAccount(account);
  await releaseIdentity(providerId, subject);

  return json({ ok: true, user: publicUser(account) });
}

/* ---------- GET /api/me ---------- */

async function me(req) {
  const session = sessionPayload(req);
  const account = session && await readAccount(session.aid);
  if (!account) return json({ authenticated: false });

  const user = publicUser(account);

  // ?basic=1 — identity only, no Whop round-trip. Used by the nav widget,
  // which fires on every page load and only needs a name and an avatar.
  if (new URL(req.url).searchParams.get('basic') === '1') {
    return json({ authenticated: true, user });
  }

  const whopId = account.identities.whop;
  if (!whopId) {
    return json({ authenticated: true, user, whopConnected: false, memberships: [], membershipsAvailable: true });
  }

  let memberships = null;
  try {
    memberships = await fetchMemberships(whopId);
  } catch (err) {
    console.error('memberships lookup threw', err);
  }

  // memberships === null means Whop did not answer. Say so, rather than
  // rendering "no subscriptions" at a paying customer.
  return json({
    authenticated: true,
    user,
    whopConnected: true,
    memberships: memberships || [],
    membershipsAvailable: memberships !== null,
  });
}

/* ---------- entry ---------- */

/* `netlify dev` retries a non-2xx function response as a static lookup and
   comes back with "/index.htm" glued onto the path, which would otherwise
   turn every 403 into a puzzling 404 locally. Production never does this;
   normalising here just keeps the two environments honest. */
const normalize = (pathname) =>
  pathname.replace(/\/index\.html?$/, '').replace(/\/+$/, '') || '/';

// POST handlers, all of which must refuse a request from another origin.
const POSTS = {
  signup,
  signin,
  forgot: forgotPassword,
  reset: resetPassword,
  'send-code': sendCode,
  'confirm-code': confirmCode,
  disconnect,
};

export default async function handler(req) {
  const path = normalize(new URL(req.url).pathname);
  const method = req.method.toUpperCase();
  const segments = path.split('/').filter(Boolean);   // ['api', ...]

  try {
    if (path === '/api/me' && method === 'GET') return await me(req);

    if (path === '/api/logout') {
      return redirect(`${siteUrl(req)}/`, [clearCookie(req, SESSION_COOKIE)]);
    }

    if (segments[1] === 'login' && method === 'GET') {
      // /api/login with no provider is the old entry point; send it to the
      // sign-in page rather than 404ing a link somebody may have bookmarked.
      if (!segments[2]) return redirect(`${siteUrl(req)}/login.html`);
      return await startOAuth(req, segments[2]);
    }

    if (segments[1] === 'callback' && method === 'GET' && segments[2]) {
      return await finishOAuth(req, segments[2]);
    }

    if (segments[1] === 'auth') {
      const action = segments[2];
      if (action === 'providers' && method === 'GET') {
        return json({ providers: enabledProviders(), mail: mailEnabled() });
      }
      if (POSTS[action] && method === 'POST') {
        if (!sameOrigin(req)) return bad('Request blocked.', 403);
        return await POSTS[action](req);
      }
    }

    return json({ error: 'not_found' }, 404);
  } catch (err) {
    console.error('auth handler error', err);
    // A missing env var must not blank the page — /api/me degrades to
    // logged-out rather than throwing at the nav widget on every page.
    if (path === '/api/me') return json({ authenticated: false, error: 'server_error' });
    return json({ error: 'server_error', message: 'Something went wrong on our side.' }, 500);
  }
}
