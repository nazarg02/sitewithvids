/* ===== PAGE TRANSITIONS ===== */
(function () {
  // Create overlay element
  const overlay = document.createElement('div');
  overlay.className = 'page-transition';
  document.body.appendChild(overlay);

  // Fade in on load
  window.addEventListener('pageshow', () => {
    overlay.classList.remove('fade-in');
  });

  // Intercept internal link clicks
  document.addEventListener('click', function (e) {
    const link = e.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href) return;
    // Skip external links, anchors, mailto, tel
    if (link.target === '_blank') return;
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('http')) return;

    e.preventDefault();
    overlay.classList.add('fade-in');
    setTimeout(() => { window.location.href = href; }, 300);
  });
})();

/* ===== WHOP SUPPORT BUTTON ===== */
(function () {
  var btn = document.createElement('a');
  btn.href = 'https://whop.com/soul-society-division';
  btn.target = '_blank';
  btn.rel = 'noopener';
  btn.title = 'Support';
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
