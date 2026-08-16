/* ═══════════════════════════════════════════
   EBEVON — MAIN JS
═══════════════════════════════════════════ */

// ── Navbar scroll effect
const navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  });
}

// ── Hamburger menu
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('navLinks');
if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    hamburger.classList.toggle('open');
  });
}

// ── Intersection Observer for fade-in animations
const animEls = document.querySelectorAll('[data-anim]');
if (animEls.length) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  animEls.forEach(el => observer.observe(el));
}

// ── Counter animation
function animateCounter(el) {
  const target = parseInt(el.dataset.target, 10);
  const duration = 2000;
  const step = target / (duration / 16);
  let current = 0;
  const timer = setInterval(() => {
    current += step;
    if (current >= target) { current = target; clearInterval(timer); }
    el.textContent = Math.floor(current).toLocaleString();
  }, 16);
}

const statEls = document.querySelectorAll('.stat-num');
if (statEls.length) {
  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { animateCounter(e.target); statObserver.unobserve(e.target); }
    });
  }, { threshold: 0.3 });
  statEls.forEach(el => statObserver.observe(el));
}

// ── Health bar color helper (used across pages)
function getHealthColor(pct) {
  if (pct >= 85) return '#22c55e';
  if (pct >= 60) return '#84cc16';
  if (pct >= 40) return '#f59e0b';
  if (pct >= 20) return '#f97316';
  return '#ef4444';
}

function getHealthLabel(pct) {
  if (pct === 100) return 'Brand New';
  if (pct >= 85)   return 'Excellent';
  if (pct >= 70)   return 'Very Good';
  if (pct >= 55)   return 'Good';
  if (pct >= 40)   return 'Fair';
  if (pct >= 20)   return 'Poor';
  return 'Critical';
}

// Expose to global
window.getHealthColor = getHealthColor;
window.getHealthLabel = getHealthLabel;

// ── Flash messages
function showFlash(msg, type = 'success') {
  const flash = document.createElement('div');
  flash.className = `flash flash-${type}`;
  flash.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${msg}`;
  document.body.appendChild(flash);
  setTimeout(() => flash.classList.add('show'), 10);
  setTimeout(() => { flash.classList.remove('show'); setTimeout(() => flash.remove(), 400); }, 3500);
}
window.showFlash = showFlash;
