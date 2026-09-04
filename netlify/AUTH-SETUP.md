# Accounts, sign-in and profiles — setup

The site is hosted on **Netlify** (Cloudflare sits in front as DNS/proxy), so
the whole account system lives in two Netlify Functions plus a small library.
No `_redirects` entry is needed — each function's `config.path` export
registers its routes at deploy time.

## How the model works

A Kenpachi Trades account is **its own record**. Whop, Google and Discord are
*identities attached to it*, not the account itself. So somebody can sign up
with a password today, connect Whop tomorrow, and still have one profile.

**Whop is the account that carries subscriptions.** Everything else on the
profile — avatar, username, bio, manual badges — works without it. Until Whop
is linked, the profile shows a "Connect Whop" banner and the subscriptions
section explains why it is empty.

| File | What it is |
|---|---|
| `netlify/functions/auth.mjs` | sign up, sign in, OAuth, linking, `/api/me` |
| `netlify/functions/profile.mjs` | profile edits, avatars, badges, subscriptions |
| `netlify/lib/accounts.mjs` | account records, password hashing, throttling |
| `netlify/lib/oauth.mjs` | the provider table — add a provider here |
| `netlify/lib/store.mjs` | usernames, avatar bytes, validation |
| `netlify/lib/badges.mjs` | the badge catalog and what earns each one |
| `netlify/lib/session.mjs` | cookies, signing, Whop memberships |
| `netlify/lib/mail.mjs` | verification and reset email (optional) |
| `login.html` | sign in / sign up / forgot / reset, all in one card |
| `profile.html` | the account page |
| `account.js` | the account button injected into every nav |

Data lives in **Netlify Blobs** — stores `accounts`, `emails`, `identities`,
`usernames`, `avatars`, `throttle`. Nothing to provision; they appear on first
write.

## 1. Environment variables

Netlify → Site configuration → Environment variables.

**Required**

| Variable | Value | Secret? |
|---|---|---|
| `SESSION_SECRET` | a long random string — signs the session cookie | **yes** |
| `WHOP_APP_ID` | `app_G1INbw2euqbmqD` | no |
| `WHOP_API_KEY` | the `apik_…` key from the Whop app dashboard | **yes** |
| `WHOP_COMPANY_ID` | the `biz_…` id of the Soul Society company | no |

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Optional — each one switches a feature on when present, and nothing breaks
while it is missing**

| Variable | Effect |
|---|---|
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | shows the "Continue with Google" button |
| `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` | shows the "Continue with Discord" button |
| `RESEND_API_KEY` | enables email verification and password reset |
| `MAIL_FROM` | e.g. `Kenpachi Trades <no-reply@kenpachitrades.com>` |
| `ADMIN_KEY` | required before `/api/admin/badge` will do anything |
| `SITE_URL` | e.g. `https://kenpachitrades.com`; leave unset and the origin is derived from the request, which is what you want for deploy previews |
| `WHOP_PREMIUM_PRODUCT_IDS` | comma-separated product/plan ids that count as Premium. Without it, products are matched on their title (`/premium\|espada/i`) |
| `WHOP_INDICATOR_PRODUCT_IDS` | same, for the indicator suite |

Without `RESEND_API_KEY`, sign-up still works — it just does not ask for email
confirmation, and "Forgot password?" says so plainly instead of pretending to
send something.

## 2. Redirect URIs

Each provider needs its own callback registered, exactly:

| Provider | Redirect URI |
|---|---|
| Whop | `https://kenpachitrades.com/api/callback/whop` |
| Google | `https://kenpachitrades.com/api/callback/google` |
| Discord | `https://kenpachitrades.com/api/callback/discord` |

- **Whop** → app dashboard → OAuth → Redirect URIs. Permissions: enable
  `oauth:token_exchange` and `member:basic:read` (add `member:email:read` for
  emails).
- **Google** → Google Cloud Console → APIs & Services → Credentials → OAuth
  client ID (Web application) → Authorised redirect URIs.
- **Discord** → Developer Portal → your app → OAuth2 → Redirects.

The staging site is `https://kaleidoscopic-caramel-158fb3.netlify.app`, so
each provider needs its callback registered there too, alongside production:

| Provider | Redirect URI (staging) |
|---|---|
| Whop | `https://kaleidoscopic-caramel-158fb3.netlify.app/api/callback/whop` |
| Google | `https://kaleidoscopic-caramel-158fb3.netlify.app/api/callback/google` |
| Discord | `https://kaleidoscopic-caramel-158fb3.netlify.app/api/callback/discord` |

For local testing with `netlify dev`, add the same paths on
`http://localhost:8888`.

Registering several callbacks only works while `SITE_URL` is unset, because
that is what lets the origin follow the request. Set it and every login lands
back on that one domain, whichever site the visitor started from. Deploy
previews (`deploy-preview-12--...`) get a fresh hostname per pull request and
cannot be registered in advance — test on the staging URL above instead.

## 3. Avatars

- `images/avatars/presets/` — twelve generated SVG avatars, listed in
  `presets/manifest.json`. Edit the SVGs freely; keep the ids stable, since
  that is what a profile stores.
- `images/avatars/` — drop your own PNG/JPG in here and add a line to
  `manifest.json`. The "Gallery" tab appears by itself once that list is not
  empty, and stays hidden while it is.
- Uploads are cropped to a centred square and shrunk to 320px in the browser
  before they are sent, then re-checked server side: 1.5 MB cap, and the type
  is sniffed from the bytes. SVG uploads are refused on purpose — they would
  be script execution on our own origin.

## 4. Badges

`netlify/lib/badges.mjs` is the single source of truth; `/api/badges` serves it
to the page, so a badge is described in one place only.

- **auto** — recomputed from Whop on every request, never stored, so a
  cancelled subscription drops its badge immediately.
- **manual** — you grant these:

```bash
curl -X POST https://kenpachitrades.com/api/admin/badge \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "content-type: application/json" \
  -d '{"username":"zaraki","badge":"founder"}'
```

Target with `username`, `email` or `accountId`; add `"action":"revoke"` to take
one back. Auto badges are refused — they come from Whop.

- **quiz** — same storage as manual, granted by the Quarterly Theory tests
  once those exist.

## Notes on how it behaves

- The session cookie holds **an account id and nothing else**. Everything the
  page shows is read fresh, so a rename or a cancelled plan takes effect at
  once instead of living on for the 30-day cookie lifetime.
- `/api/me?basic=1` skips the Whop round-trip. The nav widget uses it, since it
  only needs a name and an avatar.
- If Whop is unreachable, the profile says so rather than telling a paying
  customer they have no subscriptions.
- Memberships are filtered by user id in the API query *and* again in our own
  code, so a change in Whop's filtering could never render one customer's
  subscriptions on another's profile.
- Signing in with a provider whose **verified** email already has an account
  attaches to that account instead of creating a second one.
- You cannot unlink your only way back in — the last provider stays until a
  password is set.
- Sign-in failures are throttled per email: 8 in 15 minutes and it stops
  answering. Wrong password and unknown address give the same message, so the
  form cannot be used to discover who is registered.
- `account.js` is cached `immutable` by `_headers`, so bump the `?v=` query on
  its `<script>` tags whenever you edit it.
