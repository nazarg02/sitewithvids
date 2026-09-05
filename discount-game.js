/* ===== "OPEN A PACK" — placeholder for the login flow =====
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

   `tier` only decides how the pull is dressed: the word on the card that
   rides out of the pack, and the colour of the confetti.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var PRIZES = [
    {
      code: 'ataq0k', label: '15%', note: 'Quarterly Theory Indicator', weight: 36,
      tier: 'standard',
      cta: { text: 'See the indicator plans', href: 'indicators.html#pricing' }
    },
    {
      code: 'fnl8ge', label: '15%', note: 'Premium Access · Espada', weight: 36,
      tier: 'standard',
      cta: { text: 'See Espada Premium', href: 'premium.html#pricing' }
    },
    {
      code: 'sjxwna', label: '35%', note: 'Espada Lifetime', weight: 14,
      tier: 'rare',
      cta: { text: 'See Espada Lifetime', href: 'premium.html#pricing' }
    },
    { code: null, label: 'Empty', note: '', weight: 14, tier: 'empty' }
  ];

  var TIERS = [
    { key: 'rare',     label: 'Rare',   slip: 'is-rare' },
    { key: 'standard', label: 'Common', slip: 'is-win' },
    { key: 'empty',    label: 'Empty',  slip: 'is-empty' }
  ];

  // Three foil colourways. Purely cosmetic — see the note under the rail:
  // whichever one you tear, the odds are identical.
  // The middle pack is the one the eye lands on, so the brand foil goes there.
  var FOILS = [
    { f1: '#e9c795', f2: '#cfa268', f3: '#ae7f47' },
    { f1: '#9aa5ee', f2: '#7180d9', f3: '#5764b8' },
    { f1: '#a5abbb', f2: '#767e92', f3: '#545b6d' }
  ];

  /* An empty pack can be re-rolled once a day by visiting all three of
     these. Nothing here can verify a follow or a join — opening the link is
     what ticks the box — so the copy in the panel promises exactly that and
     no more. */
  var SOCIALS = [
    { key: 'x',  name: 'Follow on X',          href: 'https://x.com/kenpachi_qt' },
    { key: 'yt', name: 'Subscribe on YouTube', href: 'https://youtube.com/@kenpachi_qt' },
    { key: 'dc', name: 'Join the Discord',     href: 'https://discord.com/invite/soulsocietydivision' }
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
  /* One record per day. `open:true` means the board is still playable — the
     record is only there to carry which links have been ticked and whether
     the re-roll has already been spent. Anything else is a finished play. */
  function readRecord() {
    try {
      var v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      return (v && v.day === today()) ? v : null;
    } catch (e) { return null; }
  }
  function writeRecord(rec) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(rec));
    } catch (e) { /* private mode — the game still plays, it just won't remember */ }
  }
  // A finished play: what open() replays instead of dealing a fresh board.
  function readPlay() {
    var rec = readRecord();
    return (rec && !rec.open) ? rec : null;
  }
  function savePlay(prize, pickedIdx) {
    var rec = readRecord() || {};
    writeRecord({
      day: today(), code: prize.code, label: prize.label, note: prize.note,
      tier: prize.tier, picked: pickedIdx,
      tasks: rec.tasks || {}, retried: rec.retried === true,
      kept: rec.kept || [], open: false
    });
  }
  function markTask(key) {
    var rec = readRecord() || { day: today(), open: true };
    rec.day = today();
    rec.tasks = rec.tasks || {};
    rec.tasks[key] = true;
    writeRecord(rec);
  }
  /* Spend the re-roll: keep the ticks, re-arm the board, and move any code
     that was already pulled into `kept` first. Dropping the result outright
     would take a code someone had just won off the screen along with it. */
  function grantRetry() {
    var rec = readRecord() || {};
    var kept = (rec.kept || []).slice();
    if (rec.code) {
      kept.push({ code: rec.code, label: rec.label, note: rec.note, tier: rec.tier });
    }
    writeRecord({
      day: today(), tasks: rec.tasks || {}, retried: true, open: true, kept: kept
    });
  }
  function keptCodes() {
    return (readRecord() || {}).kept || [];
  }
  function retryAvailable() {
    var rec = readRecord();
    return ONE_TRY_PER_DAY && !(rec && rec.retried);
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

  // A play saved before tiers existed only kept the code, so fall back to
  // looking the prize back up rather than trusting the stored field.
  function tierOf(prize) {
    if (!prize.code) return TIERS[TIERS.length - 1];
    var key = prize.tier || (prizeByCode(prize.code) || {}).tier;
    for (var i = 0; i < TIERS.length; i++) {
      if (TIERS[i].key === key) return TIERS[i];
    }
    return TIERS[1];
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
    '.ktg-lead{font-size:.855rem;line-height:1.62;color:#5b6172;margin:0 auto 14px;max-width:33ch;}',

    // ── the pack rail ──────────────────────────────────────────────────
    '.ktg-rail{position:relative;margin:0 -4px 20px;padding:26px 4px 6px;}',

    '.ktg-cards{position:relative;z-index:1;display:grid;grid-template-columns:repeat(3,1fr);',
    'gap:13px;perspective:1150px;}',

    // coverflow — the outer two hang back and turn in toward the middle
    '.ktg-card{position:relative;aspect-ratio:3/4.15;border:none;padding:0;background:transparent;',
    'cursor:pointer;outline-offset:6px;transform-style:preserve-3d;',
    'transition:transform .62s cubic-bezier(.24,.62,.28,1),opacity .5s ease,filter .5s ease;}',
    '.ktg-card:nth-child(1){transform:rotateY(23deg) scale(.9) translateZ(-38px);}',
    '.ktg-card:nth-child(3){transform:rotateY(-23deg) scale(.9) translateZ(-38px);}',
    '.ktg-cards:not(.is-done) .ktg-card:hover{transform:rotateY(0) scale(1.05) translateZ(34px);z-index:4;}',
    '.ktg-cards:not(.is-done) .ktg-card:active{transform:rotateY(0) scale(1.01) translateZ(16px);}',
    '.ktg-cards.is-done .ktg-card{cursor:default;}',
    // the two nobody chose fall back out of the way
    '.ktg-card.is-dim{opacity:.32;filter:saturate(.45);transform:scale(.84) translateZ(-80px);}',
    '.ktg-card.is-live{z-index:5;transform:rotateY(0) scale(1.06) translateZ(42px);}',

    // ── the pouch ──────────────────────────────────────────────────────
    // Lid and base are separate elements so the lid can tear off on its own.
    // Each carries the same foil gradient sized to the whole pack, so the
    // seam lines up until the moment it rips.
    '.ktg-pack{position:absolute;inset:0;transform-style:preserve-3d;',
    'animation:ktgFloat 7.2s ease-in-out infinite;}',
    '.ktg-card:nth-child(2) .ktg-pack{animation-delay:-1.9s;}',
    '.ktg-card:nth-child(3) .ktg-pack{animation-delay:-3.6s;}',
    '@keyframes ktgFloat{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}',
    '.ktg-pack.is-rattling{animation:ktgRattle .6s cubic-bezier(.36,.07,.3,1);}',
    '@keyframes ktgRattle{0%,100%{transform:translate(0,0) rotate(0) scale(1);}',
    '18%{transform:translate(-2px,1px) rotate(-2deg) scale(1.03);}',
    '38%{transform:translate(2px,-1px) rotate(2.2deg) scale(1.05);}',
    '58%{transform:translate(-2.5px,1px) rotate(-2.6deg) scale(1.07);}',
    '78%{transform:translate(2px,-1px) rotate(2deg) scale(1.09);}',
    '92%{transform:translate(-1px,0) rotate(-1deg) scale(1.1);}}',

    '.ktg-lid,.ktg-base{position:absolute;left:0;right:0;color:#fff;background-repeat:no-repeat;',
    'background-image:linear-gradient(158deg,var(--f1) 0%,var(--f2) 46%,var(--f3) 100%);',
    'filter:drop-shadow(0 9px 16px rgba(30,38,110,.26));}',
    // crimped top edge, dashed tear line along the bottom
    '.ktg-lid{top:0;height:27%;z-index:3;background-size:100% 370%;background-position:top left;',
    'transform-origin:50% 100%;border-bottom:1px dashed rgba(255,255,255,.6);',
    'transition:transform .32s cubic-bezier(.34,1.4,.64,1);',
    '-webkit-mask:conic-gradient(from 135deg at top,#0000,#000 1deg 89deg,#0000 90deg) 50% 0/9px 100% repeat-x;',
    'mask:conic-gradient(from 135deg at top,#0000,#000 1deg 89deg,#0000 90deg) 50% 0/9px 100% repeat-x;}',
    // crimped bottom edge
    '.ktg-base{top:27%;bottom:0;z-index:2;overflow:hidden;',
    'background-size:100% 137%;background-position:bottom left;',
    '-webkit-mask:conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) 50% 100%/9px 100% repeat-x;',
    'mask:conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) 50% 100%/9px 100% repeat-x;}',
    // woven foil texture, plus a sheen that keeps sweeping so the row never sits dead
    '.ktg-lid::before,.ktg-base::before{content:"";position:absolute;inset:0;pointer-events:none;',
    'background:repeating-linear-gradient(118deg,rgba(255,255,255,.10) 0 7px,transparent 7px 18px),',
    'radial-gradient(ellipse 70% 60% at 22% 8%,rgba(255,255,255,.26),transparent 64%);}',
    '.ktg-base::before{background:repeating-linear-gradient(118deg,',
    'rgba(255,255,255,.10) 0 7px,transparent 7px 18px),',
    'radial-gradient(ellipse 62% 46% at 50% 34%,rgba(255,255,255,.16),transparent 66%),',
    'radial-gradient(ellipse 70% 60% at 22% 8%,rgba(255,255,255,.24),transparent 64%);}',
    '.ktg-base::after{content:"";position:absolute;top:-40%;left:-140%;width:52%;height:200%;',
    'pointer-events:none;transform:rotate(17deg);',
    'background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);',
    'animation:ktgSheen 5.4s ease-in-out infinite;}',
    '.ktg-card:nth-child(2) .ktg-base::after{animation-delay:-1.3s;}',
    '.ktg-card:nth-child(3) .ktg-base::after{animation-delay:-2.6s;}',
    '@keyframes ktgSheen{0%{left:-140%;}56%,100%{left:170%;}}',
    // hovering lifts the lid a hair, like the pack is already half-open
    '.ktg-cards:not(.is-done) .ktg-card:hover .ktg-lid{transform:translateY(-3px) rotate(-1.5deg);}',

    // The mark and the pack number ride on the pack rather than on a face,
    // so they stay put once the lid flies off.
    // The motif is the only thing on the pack: no plate, no caption.
    '.ktg-mark{position:absolute;left:0;right:0;top:56%;transform:translateY(-50%);z-index:4;',
    'display:grid;place-items:center;color:#fff;pointer-events:none;',
    'filter:drop-shadow(0 3px 9px rgba(20,26,80,.32));}',
    '.ktg-mark svg{width:56%;max-width:66px;height:auto;opacity:.94;}',

    // ── opening: rattle, tear, light out of the mouth, card rides up ────
    '.ktg-lid.is-torn{animation:ktgTear .78s cubic-bezier(.32,.7,.28,1) forwards;}',
    '@keyframes ktgTear{0%{transform:none;opacity:1;}',
    '28%{transform:translate(-4px,-13px) rotate(-5deg) rotateX(10deg);opacity:1;}',
    '100%{transform:translate(-27px,-76px) rotate(-30deg) rotateX(38deg) scale(1.06);opacity:0;}}',

    '.ktg-beam{position:absolute;left:7%;right:7%;top:4%;height:44%;z-index:1;pointer-events:none;',
    'transform-origin:50% 100%;',
    'background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.5) 56%,rgba(255,255,255,.8));',
    '-webkit-mask:linear-gradient(180deg,transparent,#000 58%);',
    'mask:linear-gradient(180deg,transparent,#000 58%);',
    'animation:ktgBeam .92s cubic-bezier(.2,.76,.28,1) forwards;}',
    '@keyframes ktgBeam{0%{transform:scale(.6,.15);opacity:0;}',
    '26%{opacity:.7;}100%{transform:scale(1.15,1.35);opacity:0;}}',

    // The card itself starts sunk inside the pouch, behind the base, and
    // rides up until it is standing proud of the torn mouth.
    '.ktg-slip{position:absolute;left:9%;right:9%;top:10%;bottom:30%;z-index:1;',
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;',
    'padding:8px;border-radius:11px;text-align:center;background:#fff;',
    'box-shadow:0 0 0 1px #dfe4f7,0 10px 20px -8px rgba(28,36,100,.35);',
    'opacity:0;transform:translateY(40%) scale(.85);}',
    '.ktg-slip.is-up{animation:ktgSlip .74s cubic-bezier(.18,.9,.28,1) forwards;}',
    '@keyframes ktgSlip{0%{opacity:0;transform:translateY(40%) scale(.85);}',
    '52%{opacity:1;}100%{opacity:1;transform:translateY(-40%) scale(1);}}',
    '.ktg-slip small{font-size:.47rem;font-weight:800;letter-spacing:.15em;text-transform:uppercase;',
    'color:#9aa0b2;}',
    '.ktg-slip b{font-size:1.2rem;font-weight:800;letter-spacing:-.035em;line-height:1;color:#2c3ac4;}',
    '.ktg-slip.is-win{background:linear-gradient(172deg,#fdfdff,#f3f5fd);',
    'box-shadow:0 0 0 1px #dde2f4,0 10px 20px -10px rgba(45,58,190,.22);}',
    '.ktg-slip.is-win b{color:#3f4cbe;}',
    '.ktg-slip.is-win small{color:#9aa1c8;}',
    '.ktg-slip.is-rare{background:linear-gradient(172deg,#fefdfa,#f7f2e7);',
    'box-shadow:0 0 0 1px #e8ddc5,0 10px 20px -10px rgba(150,105,30,.22);}',
    '.ktg-slip.is-rare b{color:#94682a;}',
    '.ktg-slip.is-rare small{color:#b39a6f;}',
    '.ktg-slip.is-empty{background:linear-gradient(172deg,#fbfaf9,#f2f1ee);',
    'box-shadow:0 0 0 1px #e3e0da,0 10px 20px -10px rgba(60,55,45,.18);}',
    '.ktg-slip.is-empty b{font-size:.85rem;color:#6f6a60;}',
    '.ktg-slip.is-empty small{color:#a9a49a;}',

    // confetti out of the torn pack
    '.ktg-burst{position:absolute;pointer-events:none;z-index:6;}',
    '.ktg-burst i{position:absolute;left:50%;top:34%;width:9px;height:9px;border-radius:2px;',
    'background:#7b88e0;box-shadow:0 1px 3px rgba(17,20,34,.14);',
    'animation:ktgPop .78s cubic-bezier(.15,.7,.3,1) forwards;}',
    '.ktg-burst i:nth-child(3n){background:#e2c891;border-radius:50%;}',
    '.ktg-burst i:nth-child(4n){width:6px;height:12px;background:#aab3ea;}',
    '.ktg-burst.is-rare i{background:#c8a262;}',
    '.ktg-burst.is-rare i:nth-child(3n){background:#e8d7ac;}',
    '.ktg-burst.is-rare i:nth-child(4n){background:#d5b478;}',
    '.ktg-burst.is-miss i{background:#b4aea3;}',
    '.ktg-burst.is-miss i:nth-child(3n){background:#cdc8bf;}',
    '.ktg-burst.is-miss i:nth-child(4n){background:#a8a196;}',
    '@keyframes ktgPop{0%{transform:translate(-50%,-50%) scale(.35) rotate(0deg);opacity:1;}',
    '100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(.85) rotate(240deg);opacity:0;}}',

    // ── the reward, built like a coupon ──
    '.ktg-ticket{position:relative;border-radius:18px;padding:20px 20px 18px;margin-bottom:16px;',
    'text-align:center;background:linear-gradient(172deg,#f5f7ff,#eceffe);',
    'box-shadow:inset 0 0 0 1px #d5dcfa;animation:ktgTicket .45s cubic-bezier(.22,.68,.36,1) both;}',
    '@keyframes ktgTicket{0%{opacity:0;transform:translateY(10px) scale(.97);}',
    '100%{opacity:1;transform:none;}}',
    '.ktg-ticket.is-miss{background:linear-gradient(172deg,#fbfaf9,#f3f1ee);',
    'box-shadow:inset 0 0 0 1px #e5e2dc;}',

    '.ktg-kicker{font-size:.6rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;',
    'color:#7d84f0;margin:0 0 10px;}',
    '.ktg-ticket.is-miss .ktg-kicker{color:#a09889;}',
    '.ktg-prize{display:flex;align-items:baseline;justify-content:center;gap:7px;margin:0 0 9px;}',
    '.ktg-prize b{font-size:2.5rem;font-weight:800;letter-spacing:-.045em;line-height:.95;',
    'color:#2c3ac4;}',
    '.ktg-prize span{font-size:.95rem;font-weight:700;color:#5b6172;}',
    '.ktg-ticket.is-miss .ktg-prize b{font-size:1.55rem;letter-spacing:-.03em;color:#6f6a60;}',
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
    '.ktg-ticket.is-miss .ktg-hint{color:#9c958a;}',

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

    // ── codes pulled earlier today, carried across a re-roll ─────────
    '.ktg-kept{margin-bottom:14px;padding:11px 13px;border-radius:14px;text-align:left;',
    'background:rgba(255,255,255,.72);box-shadow:inset 0 0 0 1px #e4e7f2;}',
    '.ktg-kept-h{font-size:.57rem;font-weight:800;letter-spacing:.15em;text-transform:uppercase;',
    'color:#9aa0b2;margin:0 0 8px;}',
    '.ktg-kept-row{display:flex;align-items:center;gap:9px;}',
    '.ktg-kept-row+.ktg-kept-row{margin-top:7px;}',
    '.ktg-kept-v{flex-shrink:0;font-size:.76rem;font-weight:800;color:#3f4cbe;}',
    '.ktg-kept-n{flex:1;min-width:0;font-size:.67rem;color:#8b90a2;',
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.ktg-kept-c{flex-shrink:0;font-size:.7rem;font-weight:800;letter-spacing:.11em;color:#111422;',
    'background:#fff;border:1px dashed #ccd4ee;border-radius:8px;padding:5px 9px;user-select:all;}',
    '.ktg-kept-b{flex-shrink:0;border:none;background:#eceffb;color:#4453d8;font-family:inherit;',
    'font-size:.65rem;font-weight:800;border-radius:8px;padding:6px 10px;cursor:pointer;',
    'transition:background .16s ease,color .16s ease;}',
    '.ktg-kept-b:hover{background:#e0e5f7;}',
    '.ktg-kept-b.is-done{background:#e7efe7;color:#4a7a4a;}',

    // ── one more pack, in exchange for three visits ─────────────────
    '.ktg-retry{margin-top:15px;padding-top:14px;border-top:1px solid #e6e3dd;text-align:center;}',
    '.ktg-retry.is-onwin{border-top-color:#d9e0f6;}',
    '.ktg-retry.is-onwin .ktg-retry-h{color:#5b6172;}',
    '.ktg-retry.is-onwin .ktg-retry-s{color:#8b90a2;}',
    '.ktg-retry.is-onwin .ktg-task{box-shadow:inset 0 0 0 1px #e0e5f4;}',
    '.ktg-retry.is-onwin .ktg-task:hover{box-shadow:inset 0 0 0 1px #c8d1ee;}',
    '.ktg-retry.is-onwin .ktg-again{background:#5f6cc4;}',
    '.ktg-retry.is-onwin .ktg-again:disabled{background:#e9ecf7;color:#a4a9bd;}',
    '.ktg-retry-h{font-size:.62rem;font-weight:800;letter-spacing:.15em;text-transform:uppercase;',
    'color:#6f6a60;margin:0 0 5px;}',
    '.ktg-retry-s{font-size:.68rem;line-height:1.5;color:#9c958a;margin:0 auto 11px;max-width:32ch;}',
    '.ktg-tasks{display:flex;flex-direction:column;gap:7px;margin-bottom:12px;}',
    '.ktg-task{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:11px;',
    'background:#fff;box-shadow:inset 0 0 0 1px #e6e3dd;text-decoration:none;',
    'font-size:.78rem;font-weight:700;color:#4a5060;',
    'transition:box-shadow .18s ease,transform .18s ease,background .18s ease;}',
    '.ktg-task:hover{transform:translateY(-1px);box-shadow:inset 0 0 0 1px #d3cec5;}',
    '.ktg-task-i{flex-shrink:0;display:grid;place-items:center;width:22px;height:22px;color:#6f6a60;}',
    '.ktg-task-n{flex:1;text-align:left;}',
    // the tick sits on the right and only gets drawn once the link is opened
    '.ktg-task-c{flex-shrink:0;width:17px;height:17px;border-radius:50%;',
    'box-shadow:inset 0 0 0 1.5px #ddd8d0;position:relative;}',
    '.ktg-task.is-done{background:#f7f6f3;color:#6f6a60;}',
    '.ktg-task.is-done .ktg-task-c{background:#7f8a6b;box-shadow:none;}',
    '.ktg-task.is-done .ktg-task-c::after{content:"";position:absolute;left:5px;top:3.5px;',
    'width:4px;height:8px;border:solid #fff;border-width:0 1.8px 1.8px 0;transform:rotate(42deg);}',
    '.ktg-again{width:100%;box-sizing:border-box;height:42px;border:none;border-radius:12px;',
    'font-family:inherit;font-size:.82rem;font-weight:700;cursor:pointer;color:#fff;',
    'background:#6f7a5c;transition:filter .18s ease,opacity .18s ease;}',
    '.ktg-again:hover:not(:disabled){filter:brightness(1.07);}',
    '.ktg-again:disabled{cursor:default;background:#eceae5;color:#a9a49a;}',

    // ── small screens ──
    '@media (max-width:430px){.ktg-inner{padding:28px 18px 20px;}',
    '.ktg-modal{border-radius:22px;}.ktg-modal h2{font-size:1.2rem;}',
    '.ktg-lead{font-size:.81rem;margin-bottom:20px;}.ktg-cards{gap:9px;}',
    '.ktg-prize b{font-size:2.1rem;}.ktg-code{font-size:.94rem;letter-spacing:.13em;}',
    '.ktg-copy{padding:0 15px;}',
    '.ktg-slip b{font-size:1rem;}.ktg-slip.is-empty b{font-size:.74rem;}',
    '.ktg-slip small{font-size:.42rem;}',
    '.ktg-task{padding:8px 10px;font-size:.73rem;gap:8px;}',
    '.ktg-retry-s{font-size:.64rem;}',
    '.ktg-kept-n{display:none;}.ktg-kept-c{font-size:.65rem;padding:5px 7px;}}',

    // Everything decorative stops; the reveal still resolves, it just cuts
    // straight to the finished state instead of playing out.
    '@media (prefers-reduced-motion:reduce){',
    '.ktg-back,.ktg-modal,.ktg-card,.ktg-lid{transition:none;}',
    '.ktg-pack,.ktg-base::after,.ktg-badge::before,',
    '.ktg-pack.is-rattling,.ktg-ticket{animation:none;}',
    '.ktg-beam,.ktg-burst{display:none;}',
    '.ktg-card:nth-child(1),.ktg-card:nth-child(3){transform:none;}',
    '.ktg-lid.is-torn{animation:none;opacity:0;}',
    '.ktg-slip.is-up{animation:none;opacity:1;transform:translateY(-40%);}}'
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

  /* ── pack art ────────────────────────────────────────────────────────
     Three Quarterly Theory motifs, one per pack, all drawn on the same
     0 0 100 100 field so they sit at matching optical weight. They are
     stroked in currentColor and inherit the foil's white, so the same
     mark works on every colourway. */

  // 0deg points at 12 o'clock and angles run clockwise, which is how the
  // quarters are actually counted.
  function polar(r, deg) {
    var a = (deg - 90) * Math.PI / 180;
    return (50 + r * Math.cos(a)).toFixed(2) + ' ' + (50 + r * Math.sin(a)).toFixed(2);
  }
  function arc(r, a0, a1) {
    return 'M' + polar(r, a0) + 'A' + r + ' ' + r + ' 0 ' +
      ((a1 - a0) > 180 ? 1 : 0) + ' 1 ' + polar(r, a1);
  }
  function stroked(d, w, o, cap) {
    return svgNode('path', {
      d: d, stroke: 'currentColor', 'stroke-width': w, fill: 'none',
      'stroke-linecap': cap || 'butt', 'stroke-linejoin': 'round',
      'stroke-opacity': o == null ? 1 : o
    });
  }

  /* The sequence clock: three nested rings, each cut into four quarters,
     with the quarter the market is currently in picked out on every ring —
     the same dial that runs on the Quarterly Theory pages. */
  function seqClockMark() {
    var s = svg('0 0 100 100');
    var rings = [
      { r: 42.5, w: 8.6 },
      { r: 30.5, w: 8.6 },
      { r: 18.5, w: 8.6 }
    ];
    /* Butt caps, not round: a round cap adds half a stroke width past each
       end, which at this scale is wider than the gap itself and welds the
       four quarters back into a solid ring. */
    var spans = [[4, 86], [94, 176], [184, 266], [274, 356]];

    rings.forEach(function (ring, ri) {
      spans.forEach(function (sp, qi) {
        // quarter three, bottom left — the live one on every ring
        var live = qi === 2;
        s.appendChild(stroked(arc(ring.r, sp[0], sp[1]), ring.w,
          live ? 1 : 0.38 - ri * 0.05));
      });
    });

    s.appendChild(svgNode('circle', { cx: 50, cy: 50, r: 10.5, fill: 'currentColor', 'fill-opacity': '.95' }));
    // the hand, parked at the open of the live quarter
    s.appendChild(svgNode('path', {
      d: 'M50 50 L57 41.5', stroke: 'currentColor', 'stroke-width': 2.4,
      'stroke-linecap': 'round', 'stroke-opacity': '.34'
    }));
    return s;
  }

  /* The quarter box: one range split in four, with accumulation and the
     manipulation leg drawn in — the A-M-D-R shape in its shortest form. */
  function quarterBoxMark() {
    var s = svg('0 0 100 100');
    s.appendChild(svgNode('rect', {
      x: 10, y: 14, width: 80, height: 72, rx: 9,
      stroke: 'currentColor', 'stroke-width': 4.5, fill: 'none', 'stroke-opacity': '.45'
    }));
    // the three dividers that make four quarters
    [30, 50, 70].forEach(function (x) {
      s.appendChild(stroked('M' + x + ' 14 L' + x + ' 86', 2.6, x === 50 ? 0.5 : 0.26));
    });
    // Q2 filled — the manipulation quarter
    s.appendChild(svgNode('rect', {
      x: 30, y: 14, width: 20, height: 72, fill: 'currentColor', 'fill-opacity': '.16'
    }));
    // accumulate flat, sweep down, expand up, retrace
    s.appendChild(stroked('M16 56 L28 56 L38 74 L48 40 L62 33 L74 44 L84 38', 5, 1, 'round'));
    s.appendChild(svgNode('circle', { cx: 38, cy: 74, r: 4.6, fill: 'currentColor' }));
    return s;
  }

  /* True open: the level a quarter opens at, with price diverging either
     side of it — the setup the opens and SMT lessons keep coming back to. */
  function trueOpenMark() {
    var s = svg('0 0 100 100');
    // the open itself
    s.appendChild(svgNode('path', {
      d: 'M8 50 L92 50', stroke: 'currentColor', 'stroke-width': 3.4,
      'stroke-dasharray': '9 7', 'stroke-linecap': 'round', 'stroke-opacity': '.55'
    }));
    // two legs pulling apart across it
    var candles = [
      { x: 28, top: 20, bot: 62, o: 30, c: 52 },
      { x: 50, top: 34, bot: 80, o: 44, c: 70 },
      { x: 72, top: 14, bot: 58, o: 24, c: 46 }
    ];
    candles.forEach(function (c, i) {
      s.appendChild(stroked('M' + c.x + ' ' + c.top + ' L' + c.x + ' ' + c.bot, 2.6,
        i === 1 ? 0.5 : 0.9, 'round'));
      s.appendChild(svgNode('rect', {
        x: c.x - 7.5, y: c.o, width: 15, height: c.c - c.o, rx: 3,
        fill: 'currentColor', 'fill-opacity': i === 1 ? '.35' : '.95'
      }));
    });
    return s;
  }

  var ART = [quarterBoxMark, seqClockMark, trueOpenMark];

  /* Platform marks for the re-roll list. Drawn rather than loaded so the
     panel stays one file with no network of its own. */
  function xMark() {
    var n = svg('0 0 24 24', 15);
    n.appendChild(svgNode('path', {
      d: 'M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.22-6.82-5.97 6.82H1.66l7.73-8.84L1.24 2.25h6.83l4.71 6.23 5.46-6.23z',
      fill: 'currentColor'
    }));
    return n;
  }
  function ytMark() {
    var n = svg('0 0 24 24', 15);
    n.appendChild(svgNode('rect', {
      x: 1.6, y: 4.6, width: 20.8, height: 14.8, rx: 4.6, fill: 'currentColor'
    }));
    n.appendChild(svgNode('path', { d: 'M10 8.6 L16 12 L10 15.4 Z', fill: '#fff' }));
    return n;
  }
  function dcMark() {
    var n = svg('0 0 24 24', 15);
    n.appendChild(svgNode('path', {
      d: 'M20.3 4.5A18.5 18.5 0 0 0 15.7 3l-.3.6a17 17 0 0 1 4 1.3 14 14 0 0 0-10.9 0 17 17 0 0 1 4-1.3L12.3 3a18.5 18.5 0 0 0-4.6 1.5C4.6 9 3.8 13.4 4.2 17.7a18.7 18.7 0 0 0 5.7 2.9l.9-1.5c-.9-.3-1.7-.8-2.5-1.3l.6-.4a13.4 13.4 0 0 0 11.4 0l.6.4c-.8.5-1.6 1-2.5 1.3l.9 1.5a18.7 18.7 0 0 0 5.7-2.9c.5-5-.8-9.4-3.9-13.2zM9.7 15.2c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3zm4.6 0c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3z',
      fill: 'currentColor'
    }));
    return n;
  }
  var SOCIAL_MARKS = { x: xMark, yt: ytMark, dc: dcMark };

  /* The site header is fixed, so a plain scrollIntoView tucks the first 68px
     of the section underneath it. Offset by the real header height. */
  function scrollUnderNav(target) {
    var navH = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--nav-h'), 10);
    if (!navH) {
      var bar = document.querySelector('.nav-inner');
      navH = bar ? bar.getBoundingClientRect().height : 68;
    }
    var top = target.getBoundingClientRect().top + window.pageYOffset - navH - 14;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
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

  function copyButton(code, cls) {
    var b = el('button', cls, 'Copy');
    b.type = 'button';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var done = function () {
        b.textContent = 'Copied';
        b.classList.add('is-done');
        setTimeout(function () {
          b.textContent = 'Copy';
          b.classList.remove('is-done');
        }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done, done);
      } else {
        done();
      }
    });
    return b;
  }

  /* Codes pulled earlier today, carried across a re-roll so a second pack
     never costs someone the first one. */
  function buildKept(list) {
    var box = el('div', 'ktg-kept');
    box.appendChild(el('p', 'ktg-kept-h', 'Already pulled today'));

    list.forEach(function (item) {
      var row = el('div', 'ktg-kept-row');
      row.appendChild(el('span', 'ktg-kept-v', amount(item.label) + ' off'));
      row.appendChild(el('span', 'ktg-kept-n', item.note || ''));
      row.appendChild(el('span', 'ktg-kept-c', item.code));
      row.appendChild(copyButton(item.code, 'ktg-kept-b'));
      box.appendChild(row);
    });
    return box;
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
        ? (retryAvailable()
            ? 'This one was sealed empty. There is one more pack in it for you.'
            : 'This one was sealed empty. A fresh pack drops tomorrow.')
        : 'This one was sealed empty. Give it another go.'));
    } else {
      if (prize.note) wrap.appendChild(el('span', 'ktg-for', prize.note));

      var row = el('div', 'ktg-code-row');
      row.appendChild(el('span', 'ktg-code', prize.code));
      row.appendChild(copyButton(prize.code, 'ktg-copy'));
      wrap.appendChild(row);

      wrap.appendChild(el('p', 'ktg-hint', 'Paste it at checkout on Whop.'));
    }

    // Offered whichever way the pack went: a code in hand is no reason to be
    // shut out of the second one.
    if (retryAvailable()) wrap.appendChild(buildRetry(win));
    return wrap;
  }

  /* Three links, each ticked by opening it. When all three are ticked the
     button below them re-arms the board for one more pack. Only offered once
     a day, and only after a pack came up empty. */
  function buildRetry(won) {
    var rec = readRecord() || {};
    var ticks = rec.tasks || {};

    var box = el('div', 'ktg-retry' + (won ? ' is-onwin' : ''));
    box.appendChild(el('p', 'ktg-retry-h', 'Unlock one more pack'));
    box.appendChild(el('p', 'ktg-retry-s', won
      ? 'Open all three and you can pull a second pack today. The code above is kept either way.'
      : 'Open all three. They tick off as you go. Nothing here checks a follow, so the extra pack is on trust.'));

    var list = el('div', 'ktg-tasks');
    var again = el('button', 'ktg-again', 'Open one more pack');
    again.type = 'button';

    function refresh() {
      var done = 0;
      for (var i = 0; i < SOCIALS.length; i++) if (ticks[SOCIALS[i].key]) done++;
      again.disabled = done < SOCIALS.length;
      again.textContent = done < SOCIALS.length
        ? 'Open one more pack (' + done + '/' + SOCIALS.length + ')'
        : 'Open one more pack';
    }

    SOCIALS.forEach(function (item) {
      var row = el('a', 'ktg-task' + (ticks[item.key] ? ' is-done' : ''));
      row.href = item.href;
      row.target = '_blank';
      row.rel = 'noopener noreferrer';

      var mark = el('span', 'ktg-task-i');
      mark.appendChild(SOCIAL_MARKS[item.key]());
      row.appendChild(mark);
      row.appendChild(el('span', 'ktg-task-n', item.name));
      row.appendChild(el('span', 'ktg-task-c'));

      row.addEventListener('click', function (e) {
        e.stopPropagation();   // site.js would otherwise hijack the click
        ticks[item.key] = true;
        markTask(item.key);
        row.classList.add('is-done');
        refresh();
      });
      list.appendChild(row);
    });
    box.appendChild(list);

    again.addEventListener('click', function () {
      if (again.disabled) return;
      grantRetry();
      close();
      setTimeout(open, 320);
    });
    box.appendChild(again);

    refresh();
    return box;
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
    var extra = !!(readRecord() || {}).retried;

    inner.appendChild(el('p', 'ktg-lead', previous
      ? 'Accounts are still being built. You already tore one open today. Here’s what was inside.'
      : extra
        ? 'That is your extra pack unlocked. One more go: tear whichever one you like.'
        : 'Accounts are still being built. While you wait, tear open a pack. Some of them are holding a discount code.'));

    /* Each pack is a foil pouch built from a lid and a base, so the lid can
       be torn off on its own, with the prize card already sitting inside,
       sunk behind the base. */
    var rail = el('div', 'ktg-rail');
    var cards = el('div', 'ktg-cards');
    var packs = [];
    for (var i = 0; i < 3; i++) {
      var card = el('button', 'ktg-card');
      card.type = 'button';
      card.setAttribute('aria-label', 'Tear open pack ' + (i + 1));

      var pack = el('span', 'ktg-pack');
      pack.style.setProperty('--f1', FOILS[i].f1);
      pack.style.setProperty('--f2', FOILS[i].f2);
      pack.style.setProperty('--f3', FOILS[i].f3);

      var slip = el('span', 'ktg-slip');
      var base = el('span', 'ktg-base');
      var lid = el('span', 'ktg-lid');

      var mark = el('span', 'ktg-mark');
      mark.appendChild(ART[i]());

      pack.appendChild(slip);
      pack.appendChild(base);
      pack.appendChild(lid);
      pack.appendChild(mark);

      card.appendChild(pack);
      cards.appendChild(card);
      packs.push({ card: card, pack: pack, lid: lid, slip: slip });
    }
    rail.appendChild(cards);
    inner.appendChild(rail);

    var earlier = keptCodes();
    if (earlier.length) inner.appendChild(buildKept(earlier));

    var resultSlot = el('div');
    inner.appendChild(resultSlot);

    var cta = el('a', 'ktg-cta is-quiet', DEFAULT_CTA.text);
    cta.href = DEFAULT_CTA.href;
    /* The panel locks page scroll while it is open. Following the link without
       closing it first left the reader stuck behind a modal on a frozen page —
       and when the target is the page they are already on, there is nothing to
       navigate to at all, so scroll to the section instead. */
    cta.addEventListener('click', function (e) {
      var href = cta.getAttribute('href') || '';
      var cut = href.indexOf('#');
      var hash = cut > -1 ? href.slice(cut) : '';
      var file = cut > -1 ? href.slice(0, cut) : href;
      var here = location.pathname.split('/').pop() || 'index.html';

      if (hash && (!file || file === here)) {
        e.preventDefault();
        e.stopPropagation();   // site.js would otherwise fade out and navigate
        var target = document.querySelector(hash);
        close();
        if (target) {
          setTimeout(function () { scrollUnderNav(target); }, 180);
        }
        return;
      }
      close();   // leaving for another page — unlock scroll on the way out
    });

    /* Straight after a re-roll the board is sealed again but a code is still
       in hand, so the button points at that rather than sitting quiet until
       the extra pack is torn. */
    if (!previous && earlier.length) {
      var held = (prizeByCode(earlier[earlier.length - 1].code) || {}).cta;
      if (held) {
        cta.textContent = held.text;
        cta.href = held.href;
        cta.classList.remove('is-quiet');
      }
    }
    inner.appendChild(cta);

    inner.appendChild(el('p', 'ktg-foot', ONE_TRY_PER_DAY
      ? 'One pack a day · codes are applied at checkout'
      : 'Codes are applied at checkout'));

    /* Confetti out of the mouth of the pack that was just torn open. Lives in
       .ktg-cards rather than inside the card: the card is a 3D context, so
       anything parented to it would be carried along by the tilt. */
    function burst(card, tier) {
      var wrap = el('div', 'ktg-burst is-' + (tier.key === 'standard' ? 'win' : tier.key === 'rare' ? 'rare' : 'miss'));
      wrap.style.left = card.offsetLeft + 'px';
      wrap.style.top = card.offsetTop + 'px';
      wrap.style.width = card.offsetWidth + 'px';
      wrap.style.height = card.offsetHeight + 'px';

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

      /* Send them to whatever their code is actually for. If this pack came
         up empty but an earlier one didn't, the earlier code still decides
         where the button goes. */
      var holding = prize.code ? prize : (earlier.length ? earlier[earlier.length - 1] : null);
      var target = (holding && (prizeByCode(holding.code) || {}).cta) || DEFAULT_CTA;
      cta.textContent = target.text;
      cta.href = target.href;
      if (holding) cta.classList.remove('is-quiet');

      var win = !!prize.code;
      var tier = tierOf(prize);
      var me = packs[pickedIdx];

      // dress the card waiting inside the pouch
      me.slip.classList.add(tier.slip);
      me.slip.appendChild(el('small', null, tier.label));
      me.slip.appendChild(el('b', null, win ? amount(prize.label) + ' off' : 'Nothing inside'));

      function showResult() { resultSlot.appendChild(buildTicket(prize)); }

      if (!animate) {
        me.card.classList.add('is-live');
        me.lid.classList.add('is-torn');
        me.slip.classList.add('is-up');
        packs.forEach(function (p, idx) {
          if (idx !== pickedIdx) p.card.classList.add('is-dim');
        });
        showResult();
        return;
      }

      /* Rattle the pouch, rip the lid off, throw a beam and some confetti out
         of the mouth, then let the card ride up out of the pack. The two
         nobody chose fall back at the same moment the lid goes. */
      me.card.classList.add('is-live');
      me.pack.classList.add('is-rattling');

      setTimeout(function () {
        me.pack.classList.remove('is-rattling');
        me.lid.classList.add('is-torn');
        me.pack.appendChild(el('span', 'ktg-beam'));
        burst(me.card, tier);
        packs.forEach(function (p, idx) {
          if (idx !== pickedIdx) p.card.classList.add('is-dim');
        });
      }, 560);

      setTimeout(function () { me.slip.classList.add('is-up'); }, 810);
      setTimeout(showResult, 1320);
    }

    if (previous) {
      reveal({
        code: previous.code, label: previous.label,
        note: previous.note, tier: previous.tier
      }, previous.picked, false);
    } else {
      packs.forEach(function (p, idx) {
        p.card.addEventListener('click', function () {
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
