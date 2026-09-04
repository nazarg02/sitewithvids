/* ============================================================
   WHOP — reading who owns what.

   Whop's app API keys can read `/api/v5/company/memberships`, which returns
   the whole company and offers no per-user filter: passing user_id changes
   nothing, the count stays at every membership there is. The older v2 route
   does filter, but only with a `list_memberships` permission this key does
   not carry.

   So we pull the company once, index it by user, and cache that. The whole
   set is fifteen pages fetched in parallel — under a second — and the cache
   means one visitor in a minute pays for it rather than every page load.

   The trade is freshness: a change on Whop shows up here within a minute
   rather than instantly. For renewal dates and badges that is invisible.
   ============================================================ */

import { getStore } from '@netlify/blobs';

const WHOP_V5 = 'https://api.whop.com/api/v5';

const MEMBERSHIP_TTL = 60 * 1000;        // company index
const PRODUCT_TTL = 60 * 60 * 1000;      // product titles change rarely
const PAGE_SIZE = 50;                    // the largest page Whop will serve

const cache = () => getStore({ name: 'whopcache', consistency: 'strong' });

function headers() {
  const key = process.env.WHOP_API_KEY;
  if (!key) throw new Error('Missing environment variable: WHOP_API_KEY');
  return { authorization: `Bearer ${key}`, accept: 'application/json' };
}

const companyId = () => process.env.WHOP_COMPANY_ID || '';

/** Whop hands back unix seconds; everything above this line speaks ISO. */
const iso = (seconds) =>
  typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;

/* ---------- products ---------- */

async function fetchProducts() {
  const res = await fetch(`${WHOP_V5}/company/products?per=${PAGE_SIZE}`, { headers: headers() });
  if (!res.ok) {
    console.error('Whop products failed', res.status, await res.text());
    return null;
  }
  const body = await res.json();
  const titles = {};
  for (const p of body.data || []) titles[p.id] = (p.title || '').trim();
  return titles;
}

async function productTitles() {
  try {
    const hit = await cache().get('products', { type: 'json' });
    if (hit && Date.now() - hit.builtAt < PRODUCT_TTL) return hit.titles;
  } catch { /* fall through and refetch */ }

  const titles = await fetchProducts();
  if (!titles) return {};
  try {
    await cache().setJSON('products', { builtAt: Date.now(), titles });
  } catch { /* the cache is an optimisation, not a requirement */ }
  return titles;
}

/* ---------- memberships ---------- */

/* A recurring subscription somebody is actually paying for. `completed` is
   deliberately absent: Whop uses it for any one-time claim, and marks those
   `valid: true`, so trusting `valid` alone hands paid-tier badges to the 250
   people who took a free product. */
const PAYING_STATUSES = new Set(['active', 'trialing', 'past_due']);

/* `completed` is the status Whop gives a one-time claim — which covers both a
   lifetime purchase and somebody taking a free product. Status alone cannot
   tell those apart, so lifetime is decided by product id and nothing else.
   Without that list configured, nobody is lifetime, which is the safe way to
   be wrong: a missing badge, not 250 free members shown as lifetime buyers. */
const idSet = (name) =>
  new Set((process.env[name] || '').split(',').map((s) => s.trim()).filter(Boolean));

export const isLifetimeProduct = (productId) => idSet('WHOP_LIFETIME_PRODUCT_IDS').has(productId);

function shape(row, titles) {
  const product = titles[row.product_id] || 'Membership';
  return {
    id: row.id,
    status: row.status,
    // `valid` is Whop's own answer to "does this entitle them right now" —
    // true for free claims too, so it decides display, never entitlement
    active: row.valid === true || PAYING_STATUSES.has(row.status),
    // what the badges and the tier are actually allowed to look at
    paid: PAYING_STATUSES.has(row.status),
    product,
    productId: row.product_id || null,
    planId: row.plan_id || null,
    lifetime: row.status === 'completed' && isLifetimeProduct(row.product_id),
    createdAt: iso(row.created_at),
    renewsAt: iso(row.renewal_period_end),
    expiresAt: iso(row.expires_at),
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
  };
}

async function page(n) {
  const res = await fetch(
    `${WHOP_V5}/company/memberships?per=${PAGE_SIZE}&page=${n}`,
    { headers: headers() },
  );
  if (!res.ok) {
    console.error('Whop memberships page failed', n, res.status, await res.text());
    return null;
  }
  return res.json();
}

/** Builds the whole company index, keyed by Whop user id. */
async function buildIndex() {
  const first = await page(1);
  if (!first) return null;

  const pages = Math.max(1, first.pagination?.total_pages || 1);
  const rest = pages > 1
    ? await Promise.all(Array.from({ length: pages - 1 }, (_, i) => page(i + 2)))
    : [];

  // One failed page would silently hide somebody's subscription, so a partial
  // read is treated as no read at all.
  if (rest.some((p) => p === null)) return null;

  const titles = await productTitles();
  const byUser = {};
  for (const chunk of [first, ...rest]) {
    for (const row of chunk.data || []) {
      if (!row?.user_id) continue;
      (byUser[row.user_id] ||= []).push(shape(row, titles));
    }
  }
  return byUser;
}

async function companyIndex() {
  try {
    const hit = await cache().get('memberships', { type: 'json' });
    if (hit && Date.now() - hit.builtAt < MEMBERSHIP_TTL) return hit.byUser;
  } catch { /* fall through and rebuild */ }

  const byUser = await buildIndex();
  if (!byUser) return null;

  try {
    await cache().setJSON('memberships', { builtAt: Date.now(), byUser });
  } catch (err) {
    console.error('whop cache write failed', err);  // still usable this request
  }
  return byUser;
}

/** This user's memberships, or null when Whop could not be read.
 *  The two must stay distinguishable: "no subscriptions" and "we could not
 *  ask" look identical to a paying customer otherwise. */
export async function fetchMemberships(whopUserId) {
  if (!whopUserId || !companyId()) return null;
  const byUser = await companyIndex();
  if (!byUser) return null;
  return byUser[whopUserId] || [];
}

/** Forces the next read to rebuild — used right after a Whop account is
 *  linked, so the new subscriptions do not wait out the cache. */
export async function dropCache() {
  try { await cache().delete('memberships'); } catch { /* already gone */ }
}
