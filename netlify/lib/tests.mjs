/* ============================================================
   QUARTERLY THEORY TESTS — the registry.

   The tests themselves are still to be written; this is the list the XP
   endpoint checks against. It exists from the start for one reason: without
   it, `POST /api/test/complete` accepts any id at all, and a signed-in user
   can mint 200 XP per made-up string from the browser console.

   Each entry also owns the badge its test hands out, so the badge cannot be
   chosen by the caller either.

   ────────────────────────────────────────────────────────────
   WHEN THE TESTS ARE BUILT, MOVE THE SCORING HERE.

   Right now the endpoint trusts `passed: true` from the page, which any
   signed-in person can send by hand. That is acceptable while nothing but
   pride is at stake, and must not survive the moment a test result unlocks
   anything real. The fix is for the browser to submit answers and for the
   server to mark them against a key that never leaves this file.
   ────────────────────────────────────────────────────────────
   ============================================================ */

export const TESTS = [
  {
    id: 'qt-basics',
    name: 'QT Basics',
    badge: 'qt-basics',
    blurb: 'The fundamentals: quarters, true opens, and how a session divides.',
  },
  {
    id: 'qt-adept',
    name: 'QT Adept',
    badge: 'qt-adept',
    blurb: 'Sequences, SMT and reading a profile in real time.',
  },
  {
    id: 'qt-master',
    name: 'QT Master',
    badge: 'qt-master',
    blurb: 'Everything above, under time pressure.',
  },
];

export const getTest = (id) =>
  TESTS.find((t) => t.id === id) || null;
