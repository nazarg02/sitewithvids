/* ============================================================
   OAUTH PROVIDERS

   One table describing every provider we support, so adding another is a
   config entry rather than a new code path. A provider whose credentials
   are not in the environment simply reports itself disabled, and the sign-in
   page never renders its button — that is how the site stays working while
   you are still filling in Netlify's environment variables.
   ============================================================ */

export const PROVIDERS = {
  whop: {
    id: 'whop',
    label: 'Whop',
    // the account that carries subscriptions, so it gets its own treatment
    subscriptions: true,
    envId: 'WHOP_APP_ID',
    envSecret: 'WHOP_API_KEY',
    authorize: 'https://api.whop.com/oauth/authorize',
    token: 'https://api.whop.com/oauth/token',
    tokenFormat: 'json',
    userinfo: 'https://api.whop.com/oauth/userinfo',
    scope: 'openid profile email',
    pkce: true,
    map: (info) => ({
      subject: info.sub,
      email: info.email || null,
      name: info.name || info.username || null,
      picture: info.picture || null,
    }),
  },

  google: {
    id: 'google',
    label: 'Google',
    envId: 'GOOGLE_CLIENT_ID',
    envSecret: 'GOOGLE_CLIENT_SECRET',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    tokenFormat: 'form',
    userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    pkce: true,
    // Google is the one provider that reliably tells us an address is real,
    // so an unverified one is treated as no address at all.
    map: (info) => ({
      subject: info.sub,
      email: info.email_verified ? info.email : null,
      name: info.name || info.given_name || null,
      picture: info.picture || null,
    }),
  },

  discord: {
    id: 'discord',
    label: 'Discord',
    envId: 'DISCORD_CLIENT_ID',
    envSecret: 'DISCORD_CLIENT_SECRET',
    authorize: 'https://discord.com/oauth2/authorize',
    token: 'https://discord.com/api/oauth2/token',
    tokenFormat: 'form',
    userinfo: 'https://discord.com/api/users/@me',
    scope: 'identify email',
    pkce: true,
    map: (info) => ({
      subject: info.id,
      email: info.verified ? info.email : null,
      name: info.global_name || info.username || null,
      picture: info.avatar
        ? `https://cdn.discordapp.com/avatars/${info.id}/${info.avatar}.png?size=128`
        : null,
    }),
  },
};

export const getProvider = (id) => Object.prototype.hasOwnProperty.call(PROVIDERS, id) ? PROVIDERS[id] : null;

export const credentials = (provider) => ({
  clientId: process.env[provider.envId] || '',
  clientSecret: process.env[provider.envSecret] || '',
});

export function isEnabled(provider) {
  const { clientId, clientSecret } = credentials(provider);
  return Boolean(clientId && clientSecret);
}

/** The providers the sign-in page should actually offer. */
export const enabledProviders = () =>
  Object.values(PROVIDERS).filter(isEnabled).map((p) => ({
    id: p.id,
    label: p.label,
    subscriptions: Boolean(p.subscriptions),
  }));

/** Exchanges the authorization code. The two body encodings are the only
 *  thing the providers genuinely disagree about. */
export async function exchangeCode(provider, { code, redirectUri, verifier }) {
  const { clientId, clientSecret } = credentials(provider);
  const fields = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  };
  if (provider.pkce) fields.code_verifier = verifier;

  const res = await fetch(provider.token, {
    method: 'POST',
    headers: provider.tokenFormat === 'form'
      ? { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }
      : { 'content-type': 'application/json', accept: 'application/json' },
    body: provider.tokenFormat === 'form'
      ? new URLSearchParams(fields).toString()
      : JSON.stringify(fields),
  });

  if (!res.ok) {
    console.error(`${provider.id} token exchange failed`, res.status, await res.text());
    return null;
  }
  return res.json();
}

/** The provider's view of the person who just signed in, normalised. */
export async function fetchIdentity(provider, accessToken) {
  const res = await fetch(provider.userinfo, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
  if (!res.ok) {
    console.error(`${provider.id} userinfo failed`, res.status, await res.text());
    return null;
  }
  const info = await res.json();
  const mapped = provider.map(info);
  return mapped.subject ? mapped : null;
}
