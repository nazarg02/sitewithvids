/* ===== PAGE TRANSITIONS ===== */
(function () {
  const overlay = document.createElement('div');
  overlay.className = 'page-transition';
  document.body.appendChild(overlay);

  window.addEventListener('pageshow', () => {
    overlay.classList.remove('fade-in');
  });

  document.addEventListener('click', function (e) {
    const link = e.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href) return;
    if (link.target === '_blank') return;
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('http')) return;

    e.preventDefault();
    overlay.classList.add('fade-in');
    setTimeout(() => { window.location.href = href; }, 300);
  });
})();

/* ===== SCROLL REVEAL (IntersectionObserver) ===== */
(function () {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -32px 0px' });

  function observeAll() {
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale, .section-fade').forEach(el => {
      if (!el.classList.contains('visible')) io.observe(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeAll);
  } else {
    observeAll();
  }
})();

/* ===== EDU CARD STAGGER ON SCROLL ===== */
(function () {
  function staggerCards() {
    const grid = document.getElementById('eduGrid');
    if (!grid) return;

    const cards = grid.querySelectorAll('.edu-card');
    cards.forEach((card, i) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(24px)';
      card.style.transition = `opacity 0.5s ease ${i * 0.04}s, transform 0.55s cubic-bezier(0.16,1,0.3,1) ${i * 0.04}s`;
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.style.opacity = '1';
          e.target.style.transform = 'translateY(0)';
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -20px 0px' });

    cards.forEach(card => io.observe(card));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', staggerCards);
  } else {
    staggerCards();
  }
})();

/* ===== NAV SCROLL SHADOW ===== */
(function () {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        if (window.scrollY > 20) {
          nav.style.boxShadow = '0 4px 32px rgba(0,0,0,0.5)';
          nav.style.borderBottomColor = 'rgba(255,255,255,0.06)';
        } else {
          nav.style.boxShadow = '';
          nav.style.borderBottomColor = '';
        }
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
})();

/* ===== WHOP SUPPORT BUTTON ===== */
(function () {
  var btn = document.createElement('a');
  btn.href = 'https://whop.com/soul-society-division';
  btn.target = '_blank';
  btn.rel = 'noopener';
  btn.title = 'Join Community';
  btn.style.cssText = [
    'position:fixed',
    'bottom:calc(24px + env(safe-area-inset-bottom, 0px))',
    'right:calc(24px + env(safe-area-inset-right, 0px))',
    'width:56px',
    'height:56px',
    'border-radius:50%',
    'background:#1c1c1e',
    'box-shadow:0 4px 20px rgba(0,0,0,0.45)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'z-index:9000',
    'transition:transform 0.2s,box-shadow 0.2s',
    'cursor:pointer',
    'text-decoration:none',
  ].join(';');
  btn.innerHTML = '<svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 4C9.477 4 5 8.253 5 13.5c0 2.674 1.18 5.087 3.09 6.82L7 26l5.82-2.19A11.04 11.04 0 0 0 15 24c5.523 0 10-4.253 10-9.5S20.523 4 15 4Z" fill="white"/></svg>';
  btn.addEventListener('mouseenter', function () {
    btn.style.transform = 'scale(1.1)';
    btn.style.boxShadow = '0 8px 28px rgba(0,0,0,0.55)';
  });
  btn.addEventListener('mouseleave', function () {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 20px rgba(0,0,0,0.45)';
  });
  document.body.appendChild(btn);
})();

/* ===== VIDEO AUTOPLAY FALLBACK ===== */
(function () {
  const video = document.getElementById('heroVideo');
  if (!video) return;
  video.play().catch(() => {});
})();
