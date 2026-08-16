/* ═══════════════════════════════════════════
   EBEVON — AUTO HERO SLIDER
═══════════════════════════════════════════ */
(function () {
  const slides      = document.querySelectorAll('.slide');
  const dotsWrap    = document.getElementById('sliderDots');
  const progressBar = document.getElementById('progressBar');
  const prevBtn     = document.getElementById('prevBtn');
  const nextBtn     = document.getElementById('nextBtn');

  if (!slides.length) return;

  const INTERVAL  = 5000; // ms per slide
  let   current   = 0;
  let   timer     = null;
  let   progTimer = null;

  // Build dots
  slides.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'slider-dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', () => goTo(i));
    dotsWrap.appendChild(dot);
  });

  function getDots() { return dotsWrap.querySelectorAll('.slider-dot'); }

  function goTo(index) {
    slides[current].classList.remove('active');
    getDots()[current].classList.remove('active');

    current = (index + slides.length) % slides.length;

    slides[current].classList.add('active');
    getDots()[current].classList.add('active');

    resetProgress();
  }

  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  function resetProgress() {
    clearTimeout(progTimer);
    if (progressBar) {
      progressBar.style.transition = 'none';
      progressBar.style.width = '0%';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          progressBar.style.transition = `width ${INTERVAL}ms linear`;
          progressBar.style.width = '100%';
        });
      });
    }
    clearInterval(timer);
    timer = setInterval(next, INTERVAL);
  }

  // Controls
  if (prevBtn) prevBtn.addEventListener('click', () => { prev(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { next(); });

  // Touch / swipe
  let touchStartX = 0;
  const slider = document.getElementById('heroSlider');
  if (slider) {
    slider.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    slider.addEventListener('touchend', e => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) { diff > 0 ? next() : prev(); }
    });
  }

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft')  prev();
    if (e.key === 'ArrowRight') next();
  });

  // Pause on hover
  if (slider) {
    slider.addEventListener('mouseenter', () => clearInterval(timer));
    slider.addEventListener('mouseleave', resetProgress);
  }

  // Start
  resetProgress();
})();
