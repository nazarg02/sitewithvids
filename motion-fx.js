/* ============================================================
   MOTION-FX.JS — interaction layer, powered by Motion (motion.dev)

   Effects ported by hand from Aceternity UI (ui.aceternity.com),
   which ships React + Tailwind components this static site can't
   consume: card spotlight, 3D tilt, aurora background, moving
   border, infinite moving cards, text reveal.

   Loaded as a module, so it is deferred by default and never
   blocks first paint. Motion comes from the CDN inside a
   try/catch: if that fetch fails the page keeps every static
   style and simply loses the motion, it never breaks.
   ============================================================ */

const MOTION_CDN = 'https://cdn.jsdelivr.net/npm/motion@13.4.0/+esm';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* Cards that get the cursor spotlight, across every page. */
const SPOT_CARDS = [
  '.price-card',
  '.edu-card',
  '.review-card',
  '.pr-feat-card',
  '.tt-edu-card',
  '.firm-card',
  '.pfx-card',
  '.au-panel'
].join(',');

/* ---------- helpers ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* Wrap every word in its own span, walking text nodes only so any
   nested markup (<em>, badges) survives untouched. */
function splitWords(root) {
  const words = [];
  (function walk(node) {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        if (!child.textContent.trim()) return;
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(part));
            return;
          }
          const span = document.createElement('span');
          span.className = 'mfx-word';
          span.textContent = part;
          frag.appendChild(span);
          words.push(span);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    });
  })(root);
  return words;
}

/* ---------- 1. spotlight + glowing border ---------- */

function mountSpotlights() {
  if (!finePointer) return; // touch devices never hover; skip the DOM cost

  $$(SPOT_CARDS).forEach((card) => {
    if (card.dataset.mfxSpot) return;
    card.dataset.mfxSpot = '1';
    card.classList.add('mfx-spot');

    // The wash is absolutely positioned and comes last, so any static
    // sibling would paint underneath it. Lift those to their own layer.
    Array.from(card.children).forEach((child) => {
      if (getComputedStyle(child).position === 'static') {
        child.style.position = 'relative';
        child.style.zIndex = '1';
      }
    });

    const layer = document.createElement('span');
    layer.className = 'mfx-spot-layer';
    layer.setAttribute('aria-hidden', 'true');
    card.appendChild(layer);

    let queued = false;
    let px = 0;
    let py = 0;
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      px = ((e.clientX - r.left) / r.width) * 100;
      py = ((e.clientY - r.top) / r.height) * 100;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        layer.style.setProperty('--mfx-x', px + '%');
        layer.style.setProperty('--mfx-y', py + '%');
        queued = false;
      });
    }, { passive: true });
  });
}

/* ---------- 2. 3D tilt on the pricing cards ---------- */

function mountTilt() {
  if (!finePointer || reduced) return;

  $$('.ind-pricing .price-card').forEach((card) => {
    card.classList.add('mfx-tilt');
    const MAX = 5; // degrees — past this it stops reading as paper
    let queued = false;
    let rx = 0;
    let ry = 0;

    card.addEventListener('pointerenter', () => card.classList.add('is-tilting'));

    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      ry = (((e.clientX - r.left) / r.width) - 0.5) * (MAX * 2);
      rx = (0.5 - ((e.clientY - r.top) / r.height)) * (MAX * 2);
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        card.style.transform =
          `perspective(1100px) translateY(-7px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
        queued = false;
      });
    }, { passive: true });

    card.addEventListener('pointerleave', () => {
      card.classList.remove('is-tilting');
      card.style.transform = ''; // hand the card back to the CSS hover rule
    });
  });
}

/* ---------- 3. aurora behind the hero ---------- */

function mountAurora() {
  const hero = $('.tt-hero') || $('.pr-hero') || $('.hero');
  if (!hero || $('.mfx-aurora', hero)) return;

  // The blooms are bigger than the hero on purpose. Only mount where
  // the hero can actually contain them, or they would spill down the
  // page and add a horizontal scrollbar.
  const cs = getComputedStyle(hero);
  if (cs.position === 'static' || cs.overflow === 'visible') return;

  const aurora = document.createElement('div');
  aurora.className = 'mfx-aurora';
  aurora.setAttribute('aria-hidden', 'true');
  aurora.innerHTML = '<span></span><span></span><span></span>';
  hero.insertBefore(aurora, hero.firstChild);
  return aurora;
}

/* ---------- 4. static decorations that need no Motion ---------- */

function mountStaticFx() {
  // Moving border on the primary CTAs
  $$('.tt-btn-primary, .ind-pricing .btn-primary, .btn-try-free').forEach((btn) => {
    btn.classList.add('mfx-border-move');
  });

  // Shimmer on the hero's accent word
  const heroEm = $('.tt-hero h1 em');
  if (heroEm) heroEm.classList.add('mfx-shimmer');

  // Aceternity "Infinite Moving Cards" pauses under the cursor so a
  // review can actually be read — the marquee here never did.
  $$('.reviews-marquee').forEach((m) => {
    const track = $('.reviews-track', m);
    if (!track) return;
    m.addEventListener('pointerenter', () => { track.style.animationPlayState = 'paused'; });
    m.addEventListener('pointerleave', () => { track.style.animationPlayState = 'running'; });
  });
}

/* ---------- boot ---------- */

mountStaticFx();
mountSpotlights();
mountTilt();
const aurora = mountAurora();

if (!reduced) {
  try {
    const { animate, inView, scroll, stagger, press } = await import(MOTION_CDN);

    /* Scroll progress bar */
    const bar = document.createElement('div');
    bar.className = 'mfx-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    scroll(animate(bar, { scaleX: [0, 1] }, { ease: 'linear' }));

    /* Hero headline — word by word */
    const h1 = $('.tt-hero h1');
    if (h1) {
      const words = splitWords(h1);
      if (words.length) {
        h1.classList.add('mfx-split');

        // background-clip:text only clips to text in the same inline
        // run, so a shimmer left on <em> would paint nothing now that
        // each word is its own inline-block. Move it onto the words.
        const shimmerHost = $('.mfx-shimmer', h1);
        if (shimmerHost) {
          shimmerHost.classList.remove('mfx-shimmer');
          words
            .filter((w) => shimmerHost.contains(w))
            .forEach((w) => w.classList.add('mfx-shimmer'));
        }

        animate(
          words,
          { opacity: [0, 1], y: [16, 0], filter: ['blur(5px)', 'blur(0px)'] },
          { duration: 0.65, delay: stagger(0.04), ease: [0.16, 1, 0.3, 1] }
        );
      }
    }

    /* Hero stats — stagger in once the row is on screen */
    const stats = $$('.tt-stats .tt-stat');
    if (stats.length) {
      stats.forEach((s) => { s.style.opacity = '0'; });
      inView('.tt-stats', () => {
        animate(
          stats,
          { opacity: [0, 1], y: [14, 0] },
          { duration: 0.5, delay: stagger(0.07), ease: [0.16, 1, 0.3, 1] }
        );
      }, { amount: 0.3 });
    }

    /* Feature bullets inside the pricing cards */
    $$('.ind-pricing .price-features').forEach((list) => {
      const items = $$('li', list);
      items.forEach((li) => { li.style.opacity = '0'; });
      inView(list, () => {
        animate(
          items,
          { opacity: [0, 1], x: [-8, 0] },
          { duration: 0.45, delay: stagger(0.06), ease: [0.16, 1, 0.3, 1] }
        );
      }, { amount: 0.2 });
    });

    /* Aurora drifts slightly against the scroll */
    if (aurora) {
      scroll(animate(aurora, { y: [0, 120] }, { ease: 'linear' }), {
        target: aurora.parentElement,
        offset: ['start start', 'end start']
      });
    }

    /* ---------- sign-in page ----------
       The left panel is the only place on the site with a drawn chart, so it
       gets its own sequence: the line reads, the rows arrive, then the
       quarters build from the baseline. Total is about two seconds, and the
       form on the right is already usable through all of it. */
    const auAside = $('.au-aside');
    if (auAside) {
      const display = $('.au-display', auAside);
      if (display) {
        const words = splitWords(display);
        if (words.length) {
          display.classList.add('mfx-split');
          animate(
            words,
            { opacity: [0, 1], y: [20, 0], filter: ['blur(6px)', 'blur(0px)'] },
            { duration: 0.7, delay: stagger(0.045), ease: [0.16, 1, 0.3, 1] }
          );
        }
      }

      const rows = $$('.au-points li', auAside);
      if (rows.length) {
        animate(
          rows,
          { opacity: [0, 1], x: [-16, 0] },
          { duration: 0.55, delay: stagger(0.09, { startDelay: 0.24 }), ease: [0.16, 1, 0.3, 1] }
        );
      }

      /* Candles grow out of their own baseline, which is what transform-box
         and a bottom origin buy us in the stylesheet. */
      const candles = $$('.au-chart .au-candle', auAside);
      if (candles.length) {
        animate(
          candles,
          { opacity: [0, 1], scaleY: [0.15, 1] },
          { duration: 0.5, delay: stagger(0.05, { startDelay: 0.5 }), ease: [0.16, 1, 0.3, 1] }
        );
      }

      /* pathLength is a framer-motion nicety the vanilla package does not
         carry, so the dash offset is walked by hand instead. */
      const line = $('.au-chart-line', auAside);
      if (line && typeof line.getTotalLength === 'function') {
        const len = line.getTotalLength();
        line.style.strokeDasharray = String(len);
        animate(
          line,
          { strokeDashoffset: [len, 0], opacity: [0, 1] },
          { duration: 1.25, delay: 0.66, ease: [0.16, 1, 0.3, 1] }
        );
      }

      const dot = $('.au-chart-dot', auAside);
      if (dot) {
        animate(dot, { opacity: [0, 1], scale: [0, 1] }, { type: 'spring', stiffness: 420, damping: 17, delay: 1.72 })
          .finished
          .then(() => animate(
            dot,
            { opacity: [1, 0.4, 1], scale: [1, 1.45, 1] },
            { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }
          ))
          .catch(() => {});
      }
    }

    /* The form column settles in behind the panel it sits next to. */
    const auPanel = $('.au-panel');
    if (auPanel) {
      const parts = ['.au-mark', '.au-head', '#auForm', '#auProviderBlock', '.au-swap']
        .map((sel) => $(sel, auPanel))
        .filter(Boolean);
      if (parts.length) {
        animate(
          parts,
          { opacity: [0, 1], y: [14, 0] },
          { duration: 0.55, delay: stagger(0.07), ease: [0.16, 1, 0.3, 1] }
        );
      }
    }

    /* Tactile press on every CTA. Motion leaves an inline transform
       behind, which would outrank the buttons' own :hover lift — so
       hand the element back to CSS once the spring settles. */
    press('.tt-btn, .btn-block, .btn, .au-submit, .au-oauth', (el) => {
      animate(el, { scale: 0.97 }, { type: 'spring', stiffness: 700, damping: 30 });
      return () => {
        animate(el, { scale: 1 }, { type: 'spring', stiffness: 500, damping: 26 })
          .finished.then(() => { el.style.transform = ''; el.style.scale = ''; })
          .catch(() => {});
      };
    });
  } catch (err) {
    // CDN blocked or offline: the CSS effects above already stand on
    // their own, so there is nothing to undo.
    console.warn('[motion-fx] Motion unavailable, using static styling only.', err);
  }
}
