/* ============================================================
   BADGE CATALOG — the single source of truth.

   The server validates manual grants against it and the profile page
   renders from it (served by GET /api/badges), so a badge is described
   in exactly one place.

   kind:
     auto   — derived from Whop on every request, never stored
     manual — granted by an admin, stored on the profile blob
     quiz   — granted by passing a Quarterly Theory test (stored the same
              way as manual; the tests themselves come later)
   ============================================================ */

export const BADGES = [
  /* ---- automatic, derived from Whop ---- */
  {
    id: 'recruit',
    kind: 'auto',
    name: 'Recruit',
    xp: 25,
    description: 'Created a Kenpachi Trades account.',
    tone: 'slate',
    icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8',
  },
  {
    id: 'verified-email',
    kind: 'auto',
    name: 'Confirmed',
    xp: 50,
    description: 'Confirmed an email address, so account recovery actually works.',
    tone: 'green',
    icon: 'M22 11.1V12a10 10 0 1 1-5.9-9.1 M9 11l3 3L22 4',
  },
  {
    id: 'trialist',
    kind: 'auto',
    name: 'On Trial',
    xp: 50,
    description: 'Currently running a free trial.',
    tone: 'sky',
    icon: 'M12 6v6l4 2 M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18',
  },
  {
    id: 'indicator',
    kind: 'auto',
    name: 'Indicator Holder',
    xp: 100,
    description: 'Active subscription to the QT Indicator suite.',
    tone: 'accent',
    icon: 'M3 17l5-6 4 4 5-8 4 5 M3 21h18',
  },
  {
    id: 'premium',
    kind: 'auto',
    name: 'Espada Premium',
    xp: 150,
    description: 'Active Espada Premium membership — full education library and live sessions.',
    tone: 'gold',
    icon: 'M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z',
  },
  {
    id: 'lifetime',
    kind: 'auto',
    name: 'Lifetime',
    xp: 250,
    description: 'Owns lifetime access — no renewals, ever.',
    tone: 'violet',
    icon: 'M12 21s-7.5-4.7-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 12c-1.8 4.3-9.3 9-9.3 9z',
  },
  {
    id: 'veteran',
    kind: 'auto',
    name: 'Veteran',
    xp: 200,
    description: 'A year or more with Kenpachi Trades.',
    tone: 'bronze',
    icon: 'M8 21h8 M12 17v4 M17 4h3v3a5 5 0 0 1-5 5 M7 4H4v3a5 5 0 0 0 5 5 M7 3h10v6a5 5 0 0 1-10 0z',
  },

  /* ---- granted by hand ---- */
  {
    id: 'founder',
    kind: 'manual',
    name: 'Founding Member',
    xp: 300,
    description: 'Was here before it was a website.',
    tone: 'gold',
    icon: 'M4 20h16 M6 20V9l6-5 6 5v11 M10 20v-6h4v6',
  },
  {
    id: 'verified',
    kind: 'manual',
    name: 'Verified Trader',
    xp: 200,
    description: 'Verified funded account or track record.',
    tone: 'green',
    icon: 'M9 12l2 2 4-4 M12 2l2.6 1.9 3.2-.1 1 3 2.6 1.9-1 3 1 3-2.6 1.9-1 3-3.2-.1L12 22l-2.6-1.9-3.2.1-1-3L2.6 15.3l1-3-1-3 2.6-1.9 1-3 3.2.1z',
  },
  {
    id: 'mentor',
    kind: 'manual',
    name: 'Mentor',
    xp: 200,
    description: 'Helps other traders in the community.',
    tone: 'teal',
    icon: 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9.5 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  },
  {
    id: 'contributor',
    kind: 'manual',
    name: 'Contributor',
    xp: 150,
    description: 'Contributed setups, ideas or content to the community.',
    tone: 'pink',
    icon: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  },

  /* ---- earned in the Quarterly Theory tests (coming) ---- */
  {
    id: 'qt-basics',
    kind: 'quiz',
    name: 'QT Basics',
    xp: 100,
    description: 'Passed the Quarterly Theory fundamentals test.',
    tone: 'accent',
    icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  },
  {
    id: 'qt-adept',
    kind: 'quiz',
    name: 'QT Adept',
    xp: 150,
    description: 'Passed the intermediate Quarterly Theory test.',
    tone: 'violet',
    icon: 'M12 2l7 4v6c0 4.4-3 8.5-7 10-4-1.5-7-5.6-7-10V6z M9 12l2 2 4-4',
  },
  {
    id: 'qt-master',
    kind: 'quiz',
    name: 'QT Master',
    xp: 300,
    description: 'Aced every Quarterly Theory test on the site.',
    tone: 'gold',
    icon: 'M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10z M5 20h14',
  },
];

export const BADGE_IDS = new Set(BADGES.map((b) => b.id));

/** Only these can be handed out by an admin or a test result. Auto badges
 *  are recomputed from Whop every request, so storing one would be a lie
 *  that outlives the subscription that earned it. */
export const GRANTABLE = new Set(BADGES.filter((b) => b.kind !== 'auto').map((b) => b.id));

/* Product matching. Whop product ids differ per site, so the default is a
   title match and the env vars are the precise override once they're known. */
const idList = (name) =>
  (process.env[name] || '').split(',').map((s) => s.trim()).filter(Boolean);

function matches(membership, envName, pattern) {
  const ids = idList(envName);
  if (ids.length) return ids.includes(membership.productId) || ids.includes(membership.planId);
  return pattern.test(membership.product || '');
}

export const isPremium   = (m) => matches(m, 'WHOP_PREMIUM_PRODUCT_IDS', /premium|espada/i);
export const isIndicator = (m) => matches(m, 'WHOP_INDICATOR_PRODUCT_IDS', /indicator|quarterly theory|qt\b/i);

const YEAR = 365 * 24 * 60 * 60 * 1000;

/** Auto badge ids for this user, from their live memberships.
 *  `memberships` may be null (Whop unreachable) — then we award nothing
 *  automatic rather than guessing. */
export function autoBadges(memberships, account) {
  const ids = ['recruit'];
  // Independent of Whop: this one is about the address, not a subscription
  if (account?.emailVerified) ids.push('verified-email');
  if (!Array.isArray(memberships)) return ids;

  // Paid, not merely valid — a free product must not earn a paid-tier badge.
  const paid = memberships.filter((m) => m.paid);

  if (paid.some((m) => m.status === 'trialing')) ids.push('trialist');
  if (paid.some(isIndicator)) ids.push('indicator');
  if (paid.some(isPremium)) ids.push('premium');
  if (memberships.some((m) => m.lifetime)) ids.push('lifetime');

  const stamps = memberships
    .map((m) => Date.parse(m.createdAt || ''))
    .filter((n) => !Number.isNaN(n));
  if (account?.createdAt) {
    const own = Date.parse(account.createdAt);
    if (!Number.isNaN(own)) stamps.push(own);
  }
  if (stamps.length && Date.now() - Math.min(...stamps) >= YEAR) ids.push('veteran');

  return ids;
}

/** What the profile page shows at the top: the highest-ranking status the
 *  user actually holds right now. */
export function tierOf(memberships) {
  if (!Array.isArray(memberships)) return null;
  const paid = memberships.filter((m) => m.paid);
  if (memberships.some((m) => m.lifetime)) return { id: 'lifetime', label: 'Lifetime' };
  if (paid.some(isPremium)) return { id: 'premium', label: 'Premium' };
  if (paid.some(isIndicator)) return { id: 'indicator', label: 'Indicator' };
  if (paid.some((m) => m.status === 'trialing')) return { id: 'trialist', label: 'Free trial' };
  // Everything left is a free product: still a member, just not a paying one.
  if (memberships.length) return { id: 'member', label: 'Member' };
  return { id: 'free', label: 'Free' };
}
