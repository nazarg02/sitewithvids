/* ===== ACCOUNT BUTTON IN NAV (Login with Whop) =====
   Kept out of site.js so it can also run on the pages that deliberately
   don't load site.js (prop-firms, indicators-plans).

   Renders only once /api/me answers, so a signed-in visitor never sees a
   "Sign in" button flash before their own avatar. If the API is missing or
   offline, nothing is injected and the nav stays exactly as it is. */
(function () {
  const nav = document.querySelector('.nav-inner');
  if (!nav) return;

  const style = document.createElement('style');
  style.textContent = [
    // Deliberately built on the tt-* light tokens, not --text/--border:
    // indicators.html is the one page without theme-light.css, where --text
    // is still #ffffff and would render this white-on-white.

    // Typography is taken from the nav itself, not from var(--font): that
    // variable is a leftover of the dark theme and still resolves to Syne,
    // while the whole header actually inherits Instrument Sans from body.
    // Fixed 38px height matches .nav-cta exactly, so the two sit on one line.

    // Signed out: solid dark pill. It inherits the visual weight the old
    // "Join Community Free" button had, without competing with the blue CTA.
    '.kt-acct{display:inline-flex;align-items:center;gap:8px;font-family:inherit;font-size:0.875rem;',
    'font-weight:600;letter-spacing:0.01em;line-height:1;color:#fff;background:var(--tt-ink,#2e3440);',
    'border:1px solid transparent;border-radius:var(--radius,8px);height:38px;padding:0 22px;margin-left:10px;',
    'box-sizing:border-box;white-space:nowrap;flex-shrink:0;text-decoration:none;',
    'transition:all 0.18s cubic-bezier(0.16,1,0.3,1);opacity:0;transform:translateY(-4px);}',
    '.kt-acct.kt-in{opacity:1;transform:translateY(0);}',
    '@media (hover:hover){.kt-acct:hover{background:#3c4351;color:#fff;transform:translateY(-1px);}}',

    // Signed in: quiet outline pill. Someone already logged in needs a way
    // into their profile, not a shout.
    '.kt-acct--user{color:var(--tt-ink,#2e3440);background:transparent;border-color:var(--tt-line,#e6e9f3);',
    'padding:0 16px 0 5px;}',
    '@media (hover:hover){.kt-acct--user:hover{background:var(--tt-accent-lt,#eef0fe);color:var(--tt-ink,#2e3440);',
    'border-color:var(--tt-accent,#6274f2);}}',

    '.kt-acct img,.kt-acct .kt-ini{width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;}',
    '.kt-acct .kt-ini{display:grid;place-items:center;font-size:0.75rem;font-weight:700;color:#fff;',
    'letter-spacing:0;background:linear-gradient(135deg,var(--tt-accent,#6274f2),var(--tt-accent-dk,#4d5fe8));}',
    '.kt-acct-name{max-width:110px;overflow:hidden;text-overflow:ellipsis;}',
    '.mobile-menu .kt-acct{display:flex;height:auto;padding:12px 22px;margin:10px 0 0;',
    'justify-content:center;opacity:1;transform:none;}',
    '@media (max-width:900px){.nav-inner>.kt-acct{display:none;}}',
  ].join('');
  document.head.appendChild(style);

  function initials(user) {
    const div = document.createElement('div');
    div.className = 'kt-ini';
    div.textContent = (user.name || '?').trim().charAt(0).toUpperCase();
    return div;
  }

  function build(data) {
    const a = document.createElement('a');
    a.className = 'kt-acct';

    if (data && data.authenticated) {
      const user = data.user || {};
      a.className += ' kt-acct--user';
      a.href = 'profile.html';
      a.setAttribute('aria-label', 'My account');
      if (user.picture) {
        const img = document.createElement('img');
        img.src = user.picture;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.onerror = function () { img.replaceWith(initials(user)); };
        a.appendChild(img);
      } else {
        a.appendChild(initials(user));
      }
      const span = document.createElement('span');
      span.className = 'kt-acct-name';
      span.textContent = (user.name || 'Account').split(' ')[0];
      a.appendChild(span);
    } else {
      // Accounts aren't live yet: the button opens the "coming soon" panel
      // (with the discount game) instead of walking anyone into a dead flow.
      // Swap this branch back to a plain login.html link once auth ships.
      a.href = 'login.html?return_to=' + encodeURIComponent(location.pathname + location.search);
      a.textContent = 'Log in';
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
        e.preventDefault();
        e.stopPropagation();  // site.js turns link clicks into its own navigation
        openComingSoon();
      });
    }
    return a;
  }

  /* The panel lives in its own file so the promo codes are easy to find and
     edit. It's pulled in on the first click, not on every page load. */
  var gamePending = false;
  function openComingSoon() {
    if (window.ktDiscountGame) { window.ktDiscountGame.open(); return; }
    if (gamePending) return;
    gamePending = true;
    var s = document.createElement('script');
    s.src = 'discount-game.js?v=1';
    s.onload = function () {
      gamePending = false;
      if (window.ktDiscountGame) window.ktDiscountGame.open();
    };
    s.onerror = function () {
      gamePending = false;
      // last resort: let them through to the sign-in page
      location.href = 'login.html';
    };
    document.head.appendChild(s);
  }

  /* The button is drawn immediately and corrected once /api/me answers.
     Waiting for the response first meant the nav had nothing on the right
     whenever the API was missing — on a plain static preview, or before the
     functions are deployed — which is worse than a brief wrong label.

     The last known state is cached so a returning signed-in visitor gets
     their own pill straight away instead of a "Log in" flash. */

  const CACHE_KEY = 'kt_auth';

  function cached() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
  }

  function remember(data) {
    try {
      if (data && data.authenticated) {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ authenticated: true, user: data.user }));
      } else {
        localStorage.removeItem(CACHE_KEY);
      }
    } catch (e) { /* private mode — the button still works, just without the cache */ }
  }

  const fingerprint = (d) => (d && d.authenticated)
    ? 'in:' + ((d.user && d.user.name) || '') + '|' + ((d.user && d.user.picture) || '')
    : 'out';

  let desktopEl = null;
  let mobileEl = null;
  let shown = null;

  function render(data) {
    const mark = fingerprint(data);
    if (mark === shown) return;
    shown = mark;

    // Must land before the burger, otherwise it sits to the right of it
    // on the breakpoints where the burger is visible.
    const desktop = build(data);
    if (desktopEl) {
      desktopEl.replaceWith(desktop);
    } else {
      const burger = nav.querySelector('.burger');
      if (burger) nav.insertBefore(desktop, burger);
      else nav.appendChild(desktop);
    }
    desktopEl = desktop;
    requestAnimationFrame(function () { desktop.classList.add('kt-in'); });

    const menu = document.getElementById('mobileMenu');
    if (menu) {
      const mobile = build(data);
      if (mobileEl) mobileEl.replaceWith(mobile);
      else menu.appendChild(mobile);
      mobileEl = mobile;
    }
  }

  render(cached());

  fetch('/api/me?basic=1', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data) return;  // no API here — keep what we already drew
      remember(data);
      render(data);
    })
    .catch(function () {
      /* offline — keep what we already drew */
    });
})();
