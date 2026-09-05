/* Loaded on every page. Three blocks, in order: the pack-panel loader, the
   account button in the nav, and the pack notification.

   Kept out of site.js so it can also run on the pages that deliberately
   don't load site.js (prop-firms, indicators-plans). */

/* ===== PACK PANEL LOADER =====
   The panel lives in its own file so the promo codes are easy to find and
   edit, and it is pulled in on first use rather than on every page load.
   It sits outside the nav block because the notification at the bottom of
   this file needs it too, and that one still has to run on a page with no
   nav to hang a button on. */
(function () {
  var pending = false;
  window.ktOpenPacks = function () {
    if (window.ktDiscountGame) { window.ktDiscountGame.open(); return; }
    if (pending) return;
    pending = true;
    var s = document.createElement('script');
    s.src = 'discount-game.js?v=2';
    s.onload = function () {
      pending = false;
      if (window.ktDiscountGame) window.ktDiscountGame.open();
    };
    s.onerror = function () {
      pending = false;
      // last resort: let them through to the sign-in page
      location.href = 'login.html';
    };
    document.head.appendChild(s);
  };
})();

/* ===== ACCOUNT BUTTON IN NAV (Login with Whop) =====
   Drawn from the cache immediately and corrected once /api/me answers, so a
   returning signed-in visitor never sees a "Log in" flash. If the API is
   missing or offline, the last known state stands. */
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
        window.ktOpenPacks();
      });
    }
    return a;
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

/* ===== PACK NOTIFICATION =====
   A push-style card that slides into the bottom-left corner a few seconds
   into any page and opens the pack panel when tapped.

   It reappears on every page, deliberately — that is what it is for. The only
   things that silence it are closing it (quiet for the rest of the day) and
   having already torn a pack open today. */
(function () {
  var TOAST_KEY = 'kt_pack_toast';
  var PLAY_KEY = 'kt_discount_game';
  var SHOW_AFTER = 5200;   // long enough that it does not fight the page load
  var LIFETIME = 15000;    // slides back out on its own if nobody touches it

  // login.html opens the panel by itself; a notification about it would be daft
  if (/login\.html$/.test(location.pathname)) return;

  function today() { return new Date().toISOString().slice(0, 10); }
  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  /* ?packtoast=1 forces it through every rule below and shows it straight
     away. Once you have opened a pack or closed the card, the notification
     goes quiet for the rest of the day, which makes it near impossible to
     look at while working on it. */
  var force = /[?&]packtoast=1\b/.test(location.search);
  if (force) SHOW_AFTER = 600;

  if (!force) {
    var play = read(PLAY_KEY);
    if (play && play.day === today() && !play.open) return;   // already had their pack

    var quiet = read(TOAST_KEY);
    if (quiet && quiet.day === today() && quiet.closed) return;
  }

  var CSS = [
    // Dark on purpose: the site is light everywhere, so a black card reads as
    // a system notification laid over the page rather than part of it.
    '.ktp-toast{position:fixed;left:18px;bottom:18px;z-index:9990;width:330px;max-width:calc(100vw - 32px);',
    'display:flex;align-items:flex-start;gap:11px;padding:12px 13px;box-sizing:border-box;',
    'background:linear-gradient(168deg,#1c2030,#111422);border-radius:15px;cursor:pointer;text-align:left;',
    'font-family:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;',
    '-webkit-font-smoothing:antialiased;',
    'box-shadow:inset 0 0 0 1px rgba(255,255,255,.09),inset 0 1px 0 rgba(255,255,255,.11),',
    '0 20px 44px -14px rgba(8,10,20,.6);',
    'opacity:0;transform:translateY(14px) scale(.97);',
    'transition:opacity .38s ease,transform .38s cubic-bezier(.22,.68,.36,1),box-shadow .22s ease;}',
    '.ktp-toast.ktp-in{opacity:1;transform:none;}',
    '.ktp-toast:hover{box-shadow:inset 0 0 0 1px rgba(255,255,255,.15),',
    'inset 0 1px 0 rgba(255,255,255,.14),0 26px 52px -14px rgba(8,10,20,.68);}',

    // the app icon, carrying the same quarters dial the packs use
    '.ktp-icon{flex-shrink:0;width:38px;height:38px;border-radius:11px;display:grid;place-items:center;',
    'color:#fff;background:linear-gradient(158deg,#9aa5ee,#7180d9 46%,#5764b8);',
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 3px 10px -2px rgba(87,100,184,.7);}',
    '.ktp-icon svg{width:22px;height:22px;}',

    '.ktp-body{flex:1;min-width:0;}',
    // the right padding keeps the timestamp clear of the close button
    '.ktp-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;',
    'margin-bottom:2px;padding-right:20px;}',
    '.ktp-head b{font-size:.6rem;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:#8f95ab;}',
    '.ktp-head span{font-size:.6rem;font-weight:600;color:#6c7288;}',
    '.ktp-title{font-size:.86rem;font-weight:800;letter-spacing:-.015em;color:#fff;margin:0 0 2px;}',
    '.ktp-sub{font-size:.74rem;line-height:1.45;color:#9ba1b5;margin:0;}',

    '.ktp-x{position:absolute;top:7px;right:7px;width:22px;height:22px;display:grid;place-items:center;',
    'border:none;background:transparent;color:#6c7288;font-size:12px;line-height:1;border-radius:7px;',
    'cursor:pointer;transition:background .16s ease,color .16s ease;}',
    '.ktp-x:hover{background:rgba(255,255,255,.1);color:#fff;}',

    '@media (max-width:520px){.ktp-toast{left:12px;right:12px;bottom:12px;width:auto;}}',
    '@media (prefers-reduced-motion:reduce){.ktp-toast{transition:none;transform:none;}}'
  ].join('');

  function dialMark() {
    var NS = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 100 100');
    s.setAttribute('fill', 'none');

    // two rings, quartered, with the live quarter picked out — the pack glyph
    // trimmed down to what still reads at 22px
    [{ r: 40, w: 13 }, { r: 21, w: 12 }].forEach(function (ring) {
      [[6, 84], [96, 174], [186, 264], [276, 354]].forEach(function (sp, qi) {
        var a0 = (sp[0] - 90) * Math.PI / 180, a1 = (sp[1] - 90) * Math.PI / 180;
        var p = document.createElementNS(NS, 'path');
        p.setAttribute('d',
          'M' + (50 + ring.r * Math.cos(a0)).toFixed(1) + ' ' + (50 + ring.r * Math.sin(a0)).toFixed(1) +
          'A' + ring.r + ' ' + ring.r + ' 0 0 1 ' +
          (50 + ring.r * Math.cos(a1)).toFixed(1) + ' ' + (50 + ring.r * Math.sin(a1)).toFixed(1));
        p.setAttribute('stroke', 'currentColor');
        p.setAttribute('stroke-width', ring.w);
        p.setAttribute('stroke-opacity', qi === 2 ? '1' : '.42');
        s.appendChild(p);
      });
    });
    return s;
  }

  var style = document.createElement('style');
  style.textContent = CSS;

  var toast = document.createElement('div');
  toast.className = 'ktp-toast';
  toast.setAttribute('role', 'status');
  toast.style.position = 'fixed';   // the close button is absolute inside it

  var icon = document.createElement('span');
  icon.className = 'ktp-icon';
  icon.appendChild(dialMark());

  var body = document.createElement('div');
  body.className = 'ktp-body';
  body.innerHTML =
    '<div class="ktp-head"><b>Kenpachi Trades</b><span>now</span></div>' +
    '<p class="ktp-title">Open a pack</p>' +
    '<p class="ktp-sub">One a day. Some of them are holding a discount code.</p>';

  var close = document.createElement('button');
  close.className = 'ktp-x';
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '✕';

  toast.appendChild(icon);
  toast.appendChild(body);
  toast.appendChild(close);

  var timer = null;
  function hide(remember) {
    if (timer) { clearTimeout(timer); timer = null; }
    toast.classList.remove('ktp-in');
    setTimeout(function () { toast.remove(); }, 420);
    if (remember) {
      try {
        localStorage.setItem(TOAST_KEY, JSON.stringify({ day: today(), closed: true }));
      } catch (e) { /* private mode — it will simply show again */ }
    }
  }

  close.addEventListener('click', function (e) {
    e.stopPropagation();
    hide(true);
  });

  toast.addEventListener('click', function () {
    hide(false);
    window.ktOpenPacks();
  });

  /* Never slide in behind something else. prop-firms.html opens its own
     giveaway popup on load, the nav can open the pack panel, and the mobile
     menu locks the page the same way — in all three cases this waits rather
     than stacking a second card on top of the first. */
  function blocked() {
    if (document.querySelector('.ktg-back')) return true;
    var gw = document.getElementById('giveawayOverlay');
    if (gw && gw.classList.contains('gw-in')) return true;
    // any other modal that has locked the page behind it
    return getComputedStyle(document.documentElement).overflowY === 'hidden' ||
           getComputedStyle(document.body).overflowY === 'hidden';
  }

  function show() {
    document.head.appendChild(style);
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('ktp-in'); });
    timer = setTimeout(function () { hide(false); }, LIFETIME);
  }

  var waits = 0;
  function attempt() {
    if (!blocked()) { show(); return; }
    if (++waits > 12) return;   // ~20s of waiting, then leave this page alone
    setTimeout(attempt, 1600);
  }

  setTimeout(attempt, SHOW_AFTER);
})();
