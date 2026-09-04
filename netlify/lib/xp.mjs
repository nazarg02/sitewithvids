/* ============================================================
   XP AND LEVELS

   Every award is stored under a key, never as a bare number:

     xp: { awards: { 'email': 100, 'test:qt-basics': 200, 'badge:premium': 150 },
           total: 450 }

   That single decision is what makes "one payout per thing, ever" true by
   construction. Re-running the same test, or losing and re-earning a badge,
   finds the key already there and pays nothing. `total` is always the sum of
   the map, recomputed rather than incremented, so it cannot drift.
   ============================================================ */

/* ---------- what pays, and how much ---------- */

export const XP_PER_TEST = 200;   // once per test, not per attempt
export const XP_EMAIL = 100;      // confirming an email address

export const testKey = (testId) => `test:${testId}`;
export const badgeKey = (badgeId) => `badge:${badgeId}`;
export const EMAIL_KEY = 'email';

/* ---------- the curve ---------- */

export const MAX_LEVEL = 99;

/* Cumulative XP needed to reach a level. The exponent is under 1.5 on
   purpose: the first levels arrive quickly enough to feel like the site is
   responding to you, and the climb only really bites much later.

     level  2 →     100      level 20 →   5,690
     level  3 →     260      level 30 →   9,740
     level  5 →     700      level 50 →  18,700
     level 10 →   2,160      level 99 →  40,560 */
export function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.round((100 * Math.pow(level - 1, 1.4)) / 10) * 10;
}

/* Rank tiers. Deliberately only seven: a name that changes every other level
   stops meaning anything. The top two are the dark red the site owner asked
   for; everything below stays quiet so the jump reads as an event. */
const TIERS = [
  { from: 1,  id: 'recruit',  name: 'Recruit'  },
  { from: 5,  id: 'adept',    name: 'Adept'    },
  { from: 15, id: 'veteran',  name: 'Veteran'  },
  { from: 30, id: 'elite',    name: 'Elite'    },
  { from: 50, id: 'master',   name: 'Master'   },
  { from: 75, id: 'legend',   name: 'Legend'   },
  { from: 99, id: 'ascended', name: 'Ascended' },
];

export const tierForLevel = (level) =>
  TIERS.slice().reverse().find((t) => level >= t.from) || TIERS[0];

/** Everything the profile page needs to draw the rank, in one object. */
export function levelState(total) {
  const xp = Math.max(0, Number(total) || 0);

  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;

  const floor = xpForLevel(level);
  const ceiling = level >= MAX_LEVEL ? floor : xpForLevel(level + 1);
  const span = Math.max(1, ceiling - floor);

  return {
    level,
    xp,
    tier: tierForLevel(level),
    into: xp - floor,                       // XP earned inside this level
    span,                                   // XP this level is worth
    toNext: level >= MAX_LEVEL ? 0 : ceiling - xp,
    percent: level >= MAX_LEVEL ? 100 : Math.min(100, Math.round(((xp - floor) / span) * 100)),
    maxed: level >= MAX_LEVEL,
  };
}

/* ---------- the ledger ---------- */

export function blankXp() {
  return { awards: {}, total: 0 };
}

/** Normalises whatever is on the account, including nothing at all. */
export function readXp(account) {
  const xp = account?.xp;
  if (!xp || typeof xp !== 'object' || typeof xp.awards !== 'object') return blankXp();
  return { awards: { ...xp.awards }, total: sum(xp.awards) };
}

const sum = (awards) =>
  Object.values(awards).reduce((n, v) => n + (Number(v) || 0), 0);

/** Adds an award if that key has never paid out before.
 *  Returns true when something was actually granted. */
export function grant(xp, key, amount) {
  if (!key || Object.prototype.hasOwnProperty.call(xp.awards, key)) return false;
  xp.awards[key] = Math.max(0, Math.round(Number(amount) || 0));
  xp.total = sum(xp.awards);
  return true;
}

/** Pays for every badge held that has not paid yet.
 *  Badges lost later keep their XP — taking it back would mean somebody's
 *  level drops because a subscription lapsed, which reads as a punishment
 *  for something they already did. */
export function grantBadges(xp, heldBadgeIds, catalog) {
  let changed = false;
  for (const id of heldBadgeIds) {
    const def = catalog.find((b) => b.id === id);
    if (!def || !def.xp) continue;
    if (grant(xp, badgeKey(id), def.xp)) changed = true;
  }
  return changed;
}
