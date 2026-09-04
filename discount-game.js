/* ===== "WIN A DISCOUNT" — placeholder for the login flow =====
   Accounts aren't live yet, so the nav "Log in" button and the sign-in page
   open this instead: a short note that login is coming, plus a pack-opening
   game that hands out promo codes.

   Loaded on demand by account.js, and directly by login.html.
   Exposes window.ktDiscountGame.open().

   ─────────────────────────────────────────────────────────────────────────
   >>> EDIT THE PRIZES HERE — add a line per code you want in rotation. <<<

   weight = relative chance. They don't have to add up to anything;
   a weight of 40 is simply twice as likely as a weight of 20.
   A prize with no `code` is a losing pack, so its weight sets how often
   someone walks away empty-handed. `cta` is the button under the result —
   point it at whatever the code actually discounts.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var PRIZES = [
    {
      code: 'ataq0k', label: '15%', note: 'Quarterly Theory Indicator', weight: 24,
      cta: { text: 'See the indicator plans', href: 'indicators.html#pricing' }
    },
    {
      code: 'fnl8ge', label: '15%', note: 'Premium Access · Espada', weight: 24,
      cta: { text: 'See Espada Premium', href: 'premium.html#pricing' }
    },
    {
      code: 'sjxwna', label: '35%', note: 'Espada Lifetime', weight: 8,
      cta: { text: 'See Espada Lifetime', href: 'premium.html#pricing' }
    },
    { code: null, label: 'Empty', note: '', weight: 44 }
  ];

  // One try per calendar day (UTC). Set to false while testing.
  var ONE_TRY_PER_DAY = true;

  // Where the button at the bottom points when nobody won anything.
  var DEFAULT_CTA = { text: 'See the indicator plans', href: 'indicators.html#pricing' };

  var STORE_KEY = 'kt_discount_game';

  if (window.ktDiscountGame) return;

  /* ── storage ─────────────────────────────────────────────────────────── */

  function today() {
    return new Date().toISOString().slice(0, 10);
  }
  function readPlay() {
    try {
      var v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      return (v && v.day === today()) ? v : null;
    } catch (e) { return null; }
  }
  function savePlay(prize, pickedIdx) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        day: today(), code: prize.code, label: prize.label, note: prize.note, picked: pickedIdx
      }));
    } catch (e) { /* private mode — the game still plays, it just won't remember */ }
  }

  // Labels used to be stored as "15% off"; they're "15%" now and the word is
  // added by the view. Strip it so a play saved under the old shape still reads.
  function amount(label) {
    return String(label || '').replace(/\s*off\s*$/i, '');
  }

  function prizeByCode(code) {
    for (var i = 0; i < PRIZES.length; i++) {
      if (PRIZES[i].code && PRIZES[i].code === code) return PRIZES[i];
    }
    return null;
  }

  function draw() {
    var total = 0, i;
    for (i = 0; i < PRIZES.length; i++) total += PRIZES[i].weight;
    var roll = Math.random() * total;
    for (i = 0; i < PRIZES.length; i++) {
      roll -= PRIZES[i].weight;
      if (roll <= 0) return PRIZES[i];
    }
    return PRIZES[PRIZES.length - 1];
  }

  /* ── styles ──────────────────────────────────────────────────────────── */

  var CSS = [
    // ── shell ──
    '.ktg-back{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;',
    'background:rgba(14,17,30,0.58);backdrop-filter:blur(7px) saturate(1.1);',
    '-webkit-backdrop-filter:blur(7px) saturate(1.1);opacity:0;transition:opacity .24s ease;',
    'font-family:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;',
    '-webkit-font-smoothing:antialiased;}',
    '.ktg-back.ktg-in{opacity:1;}',

    '.ktg-modal{position:relative;width:min(482px,100%);max-height:calc(100vh - 40px);',
    'overflow-y:auto;overflow-x:hidden;background:#fff;border-radius:26px;',
    'box-shadow:0 2px 4px rgba(17,20,34,.04),0 40px 90px -22px rgba(17,20,34,.42),',
    '0 0 0 1px rgba(17,20,34,.05);',
    'transform:translateY(18px) scale(.965);transition:transform .34s cubic-bezier(.22,.68,.36,1);}',
    '.ktg-back.ktg-in .ktg-modal{transform:translateY(0) scale(1);}',
    // light wash from the top, warm hint bottom-right — same language as the site's heroes
    '.ktg-modal::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;',
    'background:radial-gradient(ellipse 78% 46% at 50% -6%,rgba(98,116,242,.15),transparent 64%),',
    'radial-gradient(ellipse 50% 40% at 108% 106%,rgba(250,69,22,.07),transparent 62%);}',
    // faint dot grid, faded out below the header
    '.ktg-modal::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;',
    'background-image:radial-gradient(rgba(17,20,34,.07) 1px,transparent 1px);background-size:17px 17px;',
    '-webkit-mask-image:linear-gradient(180deg,#000,transparent 42%);',
    'mask-image:linear-gradient(180deg,#000,transparent 42%);}',
    '.ktg-inner{position:relative;z-index:1;padding:34px 30px 26px;text-align:center;}',

    '.ktg-x{position:absolute;top:15px;right:15px;z-index:2;width:34px;height:34px;display:grid;',
    'place-items:center;border:1px solid transparent;background:transparent;color:#9aa0b2;',
    'font-size:17px;line-height:1;border-radius:11px;cursor:pointer;',
    'transition:background .18s ease,color .18s ease,border-color .18s ease;}',
    '.ktg-x:hover{background:#fff;border-color:#e6e9f3;color:#111422;}',

    // ── header ──
    '.ktg-badge{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.75);',
    'border:1px solid #d9dffb;color:#4d5fe8;font-size:.6rem;font-weight:800;letter-spacing:.14em;',
    'text-transform:uppercase;padding:6px 13px;border-radius:999px;margin-bottom:16px;',
    'box-shadow:0 2px 8px rgba(98,116,242,.10);}',
    '.ktg-badge::before{content:"";width:6px;height:6px;border-radius:50%;background:#6274f2;',
    'box-shadow:0 0 0 3px rgba(98,116,242,.18);animation:ktgPulse 1.5s ease-in-out infinite;}',
    '@keyframes ktgPulse{0%,100%{opacity:1;}50%{opacity:.2;}}',

    '.ktg-modal h2{font-size:1.42rem;font-weight:800;letter-spacing:-.028em;line-height:1.2;',
    'color:#111422;margin:0 0 9px;}',
    '.ktg-lead{font-size:.855rem;line-height:1.62;color:#5b6172;margin:0 auto 24px;max-width:33ch;}',

    // ── the packs ──
    '.ktg-cards{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;',
    'margin-bottom:22px;perspective:1000px;}',
    '.ktg-card{position:relative;aspect-ratio:3/4.15;border:none;padding:0;background:transparent;',
    'cursor:pointer;transform-style:preserve-3d;',
    'transition:transform .58s cubic-bezier(.22,.68,.36,1);}',
    '.ktg-card.is-flipped{transform:rotateY(180deg);}',
    '.ktg-cards.is-done .ktg-card{cursor:default;}',
    '.ktg-face{position:absolute;inset:0;border-radius:15px;overflow:hidden;',
    'backface-visibility:hidden;-webkit-backface-visibility:hidden;}',

    // foil front
    '.ktg-front{background:linear-gradient(158deg,#8290f8 0%,#6274f2 42%,#4453d8 100%);color:#fff;',
    'box-shadow:inset 0 0 0 1px rgba(255,255,255,.26),inset 0 1px 0 rgba(255,255,255,.45),',
    '0 10px 22px -6px rgba(68,83,216,.5);',
    'transition:transform .3s cubic-bezier(.34,1.4,.64,1),box-shadow .3s ease,filter .3s ease;}',
    // woven foil texture
    '.ktg-front::before{content:"";position:absolute;inset:0;',
    'background:repeating-linear-gradient(118deg,rgba(255,255,255,.09) 0 7px,transparent 7px 17px),',
    'radial-gradient(ellipse 70% 50% at 22% 12%,rgba(255,255,255,.3),transparent 62%);}',
    // sheen that keeps sweeping so the row never sits dead
    '.ktg-front::after{content:"";position:absolute;top:-60%;left:-130%;width:58%;height:220%;',
    'background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);',
    'transform:rotate(17deg);animation:ktgSheen 3.6s ease-in-out infinite;}',
    '@keyframes ktgSheen{0%{left:-130%;}58%,100%{left:160%;}}',
    '.ktg-cards:not(.is-done) .ktg-card:hover .ktg-front{transform:translateY(-6px);filter:brightness(1.06);',
    'box-shadow:inset 0 0 0 1px rgba(255,255,255,.36),inset 0 1px 0 rgba(255,255,255,.5),',
    '0 20px 34px -8px rgba(68,83,216,.62);}',
    '.ktg-cards:not(.is-done) .ktg-card:active .ktg-front{transform:translateY(-2px) scale(.985);}',

    // die-cut tear strip along the top of the pack
    '.ktg-tear{position:absolute;top:0;left:0;right:0;height:23px;z-index:2;',
    'background:rgba(255,255,255,.14);border-bottom:1px dashed rgba(255,255,255,.55);}',
    '.ktg-tear::before,.ktg-tear::after{content:"";position:absolute;bottom:-5px;width:9px;height:9px;',
    'border-radius:50%;background:#fff;}',
    '.ktg-tear::before{left:-4px;}.ktg-tear::after{right:-4px;}',

    // quarters mark + pack number
    '.ktg-mark{position:absolute;left:0;right:0;top:52%;transform:translateY(-50%);z-index:2;',
    'display:grid;place-items:center;color:#fff;filter:drop-shadow(0 3px 8px rgba(23,30,90,.4));}',
    '.ktg-mark svg{width:46%;max-width:52px;height:auto;opacity:.96;}',
    '.ktg-num{position:absolute;left:0;right:0;bottom:11px;z-index:2;font-size:.53rem;font-weight:800;',
    'letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.72);}',

    // revealed faces
    '.ktg-back-face{transform:rotateY(180deg);display:flex;flex-direction:column;align-items:center;',
    'justify-content:center;gap:5px;padding:10px;text-align:center;background:#fafbfe;',
    'box-shadow:inset 0 0 0 1px #e9edf8;color:#111422;}',
    '.ktg-back-face b{font-size:1.02rem;font-weight:800;letter-spacing:-.02em;line-height:1.1;}',
    '.ktg-back-face svg{opacity:.9;}',
    '.ktg-back-face.is-win{background:linear-gradient(170deg,#f2f5ff,#e8ecfe);',
    'box-shadow:inset 0 0 0 1px #c9d3f9;color:#4453d8;}',
    '.ktg-back-face.is-empty{background:linear-gradient(170deg,#fff5f5,#fee9e9);',
    'box-shadow:inset 0 0 0 1px #fbc9c9;color:#d92c2c;}',
    '.ktg-back-face.is-miss{color:#c2c8d6;}',

    // ── opening: the pack rattles, then bursts ──
    '.ktg-card.is-opening{animation:ktgShake .44s ease-in-out;z-index:3;}',
    '@keyframes ktgShake{0%,100%{transform:rotate(0) scale(1);}',
    '18%{transform:rotate(-4deg) scale(1.04);}38%{transform:rotate(4deg) scale(1.06);}',
    '58%{transform:rotate(-5deg) scale(1.08);}78%{transform:rotate(4deg) scale(1.1);}',
    '92%{transform:rotate(0) scale(1.14);}}',
    '.ktg-burst{position:absolute;pointer-events:none;z-index:5;}',
    '.ktg-flash{position:absolute;inset:0;border-radius:15px;background:#fff;',
    'animation:ktgFlash .34s ease-out forwards;}',
    '.ktg-ring{position:absolute;inset:0;border-radius:15px;border:3px solid #6274f2;',
    'animation:ktgRing .62s cubic-bezier(.2,.7,.3,1) forwards;}',
    '.ktg-burst.is-miss .ktg-ring{border-color:#ef4444;}',
    '@keyframes ktgFlash{0%{opacity:.7;}100%{opacity:0;}}',
    '@keyframes ktgRing{0%{transform:scale(.9);opacity:1;}100%{transform:scale(1.6);opacity:0;}}',
    '.ktg-burst i{position:absolute;left:50%;top:50%;width:9px;height:9px;border-radius:2px;',
    'background:#4d5fe8;box-shadow:0 1px 3px rgba(17,20,34,.18);',
    'animation:ktgPop .74s cubic-bezier(.15,.7,.3,1) forwards;}',
    '.ktg-burst i:nth-child(3n){background:#fbbf24;border-radius:50%;}',
    '.ktg-burst i:nth-child(4n){width:6px;height:12px;background:#8b98f6;}',
    '.ktg-burst.is-miss i{background:#dc2626;}',
    '.ktg-burst.is-miss i:nth-child(3n){background:#f87171;}',
    '.ktg-burst.is-miss i:nth-child(4n){background:#ef4444;}',
    '@keyframes ktgPop{0%{transform:translate(-50%,-50%) scale(.35) rotate(0deg);opacity:1;}',
    '100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(.85) rotate(240deg);opacity:0;}}',

    // ── the reward, built like a coupon ──
    '.ktg-ticket{position:relative;border-radius:18px;padding:20px 20px 18px;margin-bottom:16px;',
    'text-align:center;background:linear-gradient(172deg,#f5f7ff,#eceffe);',
    'box-shadow:inset 0 0 0 1px #d5dcfa;animation:ktgTicket .45s cubic-bezier(.22,.68,.36,1) both;}',
    '@keyframes ktgTicket{0%{opacity:0;transform:translateY(10px) scale(.97);}',
    '100%{opacity:1;transform:none;}}',
    '.ktg-ticket.is-miss{background:linear-gradient(172deg,#fff6f6,#fdeaea);',
    'box-shadow:inset 0 0 0 1px #fbcaca;}',

    '.ktg-kicker{font-size:.6rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;',
    'color:#7d84f0;margin:0 0 10px;}',
    '.ktg-ticket.is-miss .ktg-kicker{color:#e06767;}',
    '.ktg-prize{display:flex;align-items:baseline;justify-content:center;gap:7px;margin:0 0 9px;}',
    '.ktg-prize b{font-size:2.5rem;font-weight:800;letter-spacing:-.045em;line-height:.95;',
    'color:#2c3ac4;}',
    '.ktg-prize span{font-size:.95rem;font-weight:700;color:#5b6172;}',
    '.ktg-ticket.is-miss .ktg-prize b{font-size:1.55rem;letter-spacing:-.03em;color:#d92c2c;}',
    '.ktg-for{display:inline-block;font-size:.72rem;font-weight:700;color:#4453d8;',
    'background:rgba(255,255,255,.8);border:1px solid #d5dcfa;padding:5px 12px;border-radius:999px;',
    'margin:0 0 15px;}',

    // code + copy as one segmented coupon field
    '.ktg-code-row{display:flex;align-items:stretch;background:#fff;border:1px dashed #b9c4f6;',
    'border-radius:13px;overflow:hidden;box-shadow:0 3px 10px rgba(68,83,216,.07);}',
    '.ktg-code{flex:1;display:flex;align-items:center;justify-content:center;padding:13px 10px;',
    'font-size:1.06rem;font-weight:800;letter-spacing:.17em;color:#111422;user-select:all;}',
    '.ktg-copy{flex-shrink:0;border:none;background:linear-gradient(135deg,#6274f2,#4453d8);',
    'color:#fff;font-family:inherit;font-size:.76rem;font-weight:800;letter-spacing:.04em;',
    'padding:0 21px;cursor:pointer;transition:filter .18s ease,background .18s ease;}',
    '.ktg-copy:hover{filter:brightness(1.09);}',
    '.ktg-copy:active{filter:brightness(.95);}',
    '.ktg-copy.is-done{background:#16a34a;}',
    '.ktg-hint{font-size:.71rem;color:#7c8296;margin:11px 0 0;line-height:1.5;}',
    '.ktg-ticket.is-miss .ktg-hint{color:#b06a6a;}',

    // ── footer ──
    '.ktg-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;',
    'box-sizing:border-box;height:47px;border:none;border-radius:13px;cursor:pointer;',
    'font-family:inherit;font-size:.88rem;font-weight:700;color:#fff;text-decoration:none;',
    'background:linear-gradient(135deg,#6274f2,#4453d8);',
    'box-shadow:0 10px 24px -6px rgba(68,83,216,.5);',
    'transition:transform .18s cubic-bezier(.16,1,.3,1),box-shadow .18s ease,filter .18s ease;}',
    '.ktg-cta:hover{transform:translateY(-2px);filter:brightness(1.06);',
    'box-shadow:0 16px 32px -8px rgba(68,83,216,.6);}',
    '.ktg-cta:active{transform:translateY(0) scale(.99);}',
    // nothing has been opened yet — don't outshout the packs
    '.ktg-cta.is-quiet{background:#fff;color:#4a5060;box-shadow:inset 0 0 0 1px #e2e6f3;}',
    '.ktg-cta.is-quiet:hover{background:#f7f8fd;color:#111422;filter:none;',
    'box-shadow:inset 0 0 0 1px #cdd5f2;}',
    '.ktg-foot{font-size:.7rem;color:#9aa0b2;margin:13px 0 0;letter-spacing:.01em;}',

    // ── small screens ──
    '@media (max-width:430px){.ktg-inner{padding:28px 18px 20px;}',
    '.ktg-modal{border-radius:22px;}.ktg-modal h2{font-size:1.2rem;}',
    '.ktg-lead{font-size:.81rem;margin-bottom:20px;}.ktg-cards{gap:9px;}',
    '.ktg-prize b{font-size:2.1rem;}.ktg-code{font-size:.94rem;letter-spacing:.13em;}',
    '.ktg-copy{padding:0 15px;}.ktg-num{font-size:.48rem;}}',

    '@media (prefers-reduced-motion:reduce){.ktg-back,.ktg-modal,.ktg-card,.ktg-front{transition:none;}',
    '.ktg-front::after,.ktg-badge::before,.ktg-card.is-opening,.ktg-ticket{animation:none;}',
    '.ktg-burst{display:none;}}'
  ].join('');

  // Instrument Sans is the site's UI face but a couple of pages only pull Syne.
  // Without this the modal would silently change typeface page to page.
  function ensureFont() {
    var links = document.querySelectorAll('link[href*="fonts.googleapis.com"]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].href.indexOf('Instrument+Sans') !== -1) return;
    }
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(l);
  }

  var stylesAdded = false;
  function addStyles() {
    if (stylesAdded) return;
    stylesAdded = true;
    ensureFont();
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ── little bits of markup ───────────────────────────────────────────── */

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svg(viewBox, w) {
    var n = document.createElementNS(SVG_NS, 'svg');
    n.setAttribute('viewBox', viewBox);
    n.setAttribute('fill', 'none');
    if (w) { n.setAttribute('width', w); n.setAttribute('height', w); }
    return n;
  }
  function svgNode(tag, attrs) {
    var n = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    return n;
  }

  // The quarters mark: two rings each broken into four arcs, plus a hand.
  // Same dial idea the brand already uses for Quarterly Theory.
  function quartersMark() {
    var s = svg('0 0 48 48');
    s.appendChild(svgNode('circle', {
      cx: 24, cy: 24, r: 18, stroke: 'currentColor', 'stroke-width': 3,
      'stroke-dasharray': '22.3 5.9', 'stroke-linecap': 'round', 'stroke-opacity': '.9'
    }));
    s.appendChild(svgNode('circle', {
      cx: 24, cy: 24, r: 11, stroke: 'currentColor', 'stroke-width': 2.6,
      'stroke-dasharray': '13.3 4', 'stroke-linecap': 'round', 'stroke-opacity': '.62'
    }));
    s.appendChild(svgNode('path', {
      d: 'M24 24 L31 17', stroke: 'currentColor', 'stroke-width': 2.6, 'stroke-linecap': 'round'
    }));
    s.appendChild(svgNode('circle', { cx: 24, cy: 24, r: 2.6, fill: 'currentColor' }));
    return s;
  }

  function sparkMark() {
    var s = svg('0 0 24 24', 17);
    s.appendChild(svgNode('path', {
      d: 'M12 3l2.2 5.9L20 11l-5.8 2.1L12 19l-2.2-5.9L4 11l5.8-2.1L12 3z',
      fill: 'currentColor'
    }));
    return s;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ── modal ───────────────────────────────────────────────────────────── */

  var backdrop = null;
  var lastFocus = null;

  function close() {
    if (!backdrop) return;
    var node = backdrop;
    backdrop = null;
    node.classList.remove('ktg-in');
    document.removeEventListener('keydown', onKey);
    document.documentElement.style.overflow = '';
    setTimeout(function () { node.remove(); }, 260);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  function buildTicket(prize) {
    var win = !!prize.code;
    var wrap = el('div', 'ktg-ticket' + (win ? '' : ' is-miss'));

    wrap.appendChild(el('p', 'ktg-kicker', win ? 'You pulled a code' : 'Empty pack'));

    var prizeRow = el('div', 'ktg-prize');
    if (win) {
      prizeRow.appendChild(el('b', null, amount(prize.label)));
      prizeRow.appendChild(el('span', null, 'off'));
    } else {
      prizeRow.appendChild(el('b', null, 'Nothing inside'));
    }
    wrap.appendChild(prizeRow);

    if (!win) {
      wrap.appendChild(el('p', 'ktg-hint', ONE_TRY_PER_DAY
        ? 'This one was sealed empty. A fresh pack drops tomorrow.'
        : 'This one was sealed empty. Give it another go.'));
      return wrap;
    }

    if (prize.note) wrap.appendChild(el('span', 'ktg-for', prize.note));

    var row = el('div', 'ktg-code-row');
    row.appendChild(el('span', 'ktg-code', prize.code));

    var copy = el('button', 'ktg-copy', 'Copy');
    copy.type = 'button';
    copy.addEventListener('click', function () {
      var done = function () {
        copy.textContent = 'Copied';
        copy.classList.add('is-done');
        setTimeout(function () {
          copy.textContent = 'Copy';
          copy.classList.remove('is-done');
        }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(prize.code).then(done, done);
      } else {
        done();
      }
    });
    row.appendChild(copy);
    wrap.appendChild(row);

    wrap.appendChild(el('p', 'ktg-hint', 'Paste it at checkout on Whop.'));
    return wrap;
  }

  function open() {
    if (backdrop) return;
    addStyles();
    lastFocus = document.activeElement;

    backdrop = el('div', 'ktg-back');
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Log in coming soon');
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });

    var modal = el('div', 'ktg-modal');
    var inner = el('div', 'ktg-inner');

    var x = el('button', 'ktg-x', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    modal.appendChild(x);

    inner.appendChild(el('span', 'ktg-badge', 'Coming soon'));
    inner.appendChild(el('h2', null, 'Log in will be available soon'));

    var previous = ONE_TRY_PER_DAY ? readPlay() : null;

    inner.appendChild(el('p', 'ktg-lead', previous
      ? 'Accounts are still being built. You already tore one open today — here’s what was inside.'
      : 'Accounts are still being built. While you wait, tear open a pack. Some of them are holding a discount code.'));

    var cards = el('div', 'ktg-cards');
    var faces = [];
    for (var i = 0; i < 3; i++) {
      var card = el('button', 'ktg-card');
      card.type = 'button';
      card.setAttribute('aria-label', 'Open pack ' + (i + 1));

      var front = el('div', 'ktg-face ktg-front');
      front.appendChild(el('span', 'ktg-tear'));
      var mark = el('span', 'ktg-mark');
      mark.appendChild(quartersMark());
      front.appendChild(mark);
      front.appendChild(el('span', 'ktg-num', 'Pack 0' + (i + 1)));

      var back = el('div', 'ktg-face ktg-back-face');

      card.appendChild(front);
      card.appendChild(back);
      cards.appendChild(card);
      faces.push({ card: card, back: back });
    }
    inner.appendChild(cards);

    var resultSlot = el('div');
    inner.appendChild(resultSlot);

    var cta = el('a', 'ktg-cta is-quiet', DEFAULT_CTA.text);
    cta.href = DEFAULT_CTA.href;
    inner.appendChild(cta);

    inner.appendChild(el('p', 'ktg-foot', ONE_TRY_PER_DAY
      ? 'One pack a day · codes are applied at checkout'
      : 'Codes are applied at checkout'));

    /* Confetti out of the pack that was just torn open. Lives in .ktg-cards
       rather than inside the card: the card is a 3D flip context, so anything
       parented to it would rotate away with the flip. */
    function burst(card, win) {
      var wrap = el('div', 'ktg-burst' + (win ? ' is-win' : ' is-miss'));
      wrap.style.left = card.offsetLeft + 'px';
      wrap.style.top = card.offsetTop + 'px';
      wrap.style.width = card.offsetWidth + 'px';
      wrap.style.height = card.offsetHeight + 'px';

      wrap.appendChild(el('span', 'ktg-flash'));
      wrap.appendChild(el('span', 'ktg-ring'));

      for (var i = 0; i < 16; i++) {
        var bit = document.createElement('i');
        var angle = (Math.PI * 2 * i) / 16 + (Math.random() - 0.5) * 0.5;
        var dist = 58 + Math.random() * 62;
        bit.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
        bit.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
        bit.style.animationDelay = Math.round(Math.random() * 80) + 'ms';
        wrap.appendChild(bit);
      }

      cards.appendChild(wrap);
      setTimeout(function () { wrap.remove(); }, 1200);
    }

    function reveal(prize, pickedIdx, animate) {
      cards.classList.add('is-done');

      // send a winner to the thing their code is actually for
      var target = (prizeByCode(prize.code) || {}).cta || DEFAULT_CTA;
      cta.textContent = target.text;
      cta.href = target.href;
      if (prize.code) cta.classList.remove('is-quiet');

      var win = !!prize.code;

      faces.forEach(function (f, idx) {
        var mine = idx === pickedIdx;
        f.back.className = 'ktg-face ktg-back-face ' +
          (mine ? (win ? 'is-win' : 'is-empty') : 'is-miss');
        f.back.textContent = '';
        if (mine && win) f.back.appendChild(sparkMark());
        f.back.appendChild(el('b', null,
          mine ? (win ? amount(prize.label) + ' off' : 'Empty') : '—'));
      });

      var picked = faces[pickedIdx].card;

      function flipRest() {
        faces.forEach(function (f, idx) {
          if (idx === pickedIdx) return;
          setTimeout(function () { f.card.classList.add('is-flipped'); }, idx * 90);
        });
      }
      function showResult() { resultSlot.appendChild(buildTicket(prize)); }

      if (!animate) {
        faces.forEach(function (f) { f.card.classList.add('is-flipped'); });
        showResult();
        return;
      }

      // rattle the pack, tear it open, then let the other two fall over
      picked.classList.add('is-opening');
      setTimeout(function () {
        picked.classList.remove('is-opening');
        burst(picked, win);
        picked.classList.add('is-flipped');
      }, 440);
      setTimeout(flipRest, 720);
      setTimeout(showResult, 940);
    }

    if (previous) {
      reveal({ code: previous.code, label: previous.label, note: previous.note }, previous.picked, false);
    } else {
      faces.forEach(function (f, idx) {
        f.card.addEventListener('click', function () {
          if (cards.classList.contains('is-done')) return;
          var prize = draw();
          if (ONE_TRY_PER_DAY) savePlay(prize, idx);
          reveal(prize, idx, true);
        });
      });
    }

    modal.appendChild(inner);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(function () {
      backdrop.classList.add('ktg-in');
      x.focus();
    });
  }

  window.ktDiscountGame = { open: open, close: close };
})();
