const revealSelector = [
  '.section-intro', '.intel-card', '.feature-card', '.table-wrap', '.counter-search',
  '.player-card', '.profile-card', '.patch-card', '.analysis-card', '.matchup-box',
  '.asset-card', '.rift-profile-strip', '.meta-scope-bar'
].join(',');
const tiltSelector = '.feature-card,.player-card,.intel-card,.profile-card,.patch-card';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const tiltBound = new WeakSet();
const revealBound = new WeakSet();
let revealObserver = null;
let scrollTicking = false;

function ensureProgress() {
  if (document.getElementById('uxScrollProgress')) return;
  const progress = document.createElement('div');
  progress.id = 'uxScrollProgress';
  progress.setAttribute('aria-hidden', 'true');
  progress.innerHTML = '<span></span>';
  document.body.prepend(progress);
}

function ensureBackToTop() {
  if (document.querySelector('.ux-to-top')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ux-to-top';
  button.innerHTML = '↑';
  button.setAttribute('aria-label', 'Back to top');
  button.title = 'Back to top';
  button.onclick = () => window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  document.body.appendChild(button);
}

function ensureMobileMenu() {
  const topbar = document.querySelector('.topbar');
  const nav = document.getElementById('nav');
  if (!topbar || !nav || document.querySelector('.ux-menu-btn')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ux-menu-btn';
  button.setAttribute('aria-label', 'Menu');
  button.setAttribute('aria-controls', 'nav');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<span></span><span></span><span></span>';
  const preferences = document.getElementById('preferencesBtn');
  topbar.insertBefore(button, preferences || document.getElementById('statusBadge'));
  button.onclick = event => {
    event.stopPropagation();
    const open = topbar.classList.toggle('nav-open');
    button.setAttribute('aria-expanded', String(open));
  };
  nav.addEventListener('click', event => {
    if (!event.target.closest('.nav-btn')) return;
    topbar.classList.remove('nav-open');
    button.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('click', event => {
    if (!topbar.classList.contains('nav-open') || topbar.contains(event.target)) return;
    topbar.classList.remove('nav-open');
    button.setAttribute('aria-expanded', 'false');
  });
}

function updateScrollUi() {
  scrollTicking = false;
  const topbar = document.querySelector('.topbar');
  const progress = document.querySelector('#uxScrollProgress > span');
  const toTop = document.querySelector('.ux-to-top');
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  if (topbar) topbar.classList.toggle('is-scrolled', y > 18);
  if (progress) progress.style.setProperty('--progress', `${Math.min(100, (y / max) * 100)}%`);
  if (toTop) toTop.classList.toggle('visible', y > Math.min(650, window.innerHeight * .75));
}

function requestScrollUi() {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(updateScrollUi);
}

function initRevealObserver() {
  if (reducedMotion.matches || !('IntersectionObserver' in window)) return;
  revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('ux-visible');
      revealObserver.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: .08 });
}

function bindReveal(node, index = 0) {
  if (!(node instanceof Element) || revealBound.has(node)) return;
  revealBound.add(node);
  if (reducedMotion.matches || !revealObserver) {
    node.classList.add('ux-visible');
    return;
  }
  node.classList.add('ux-reveal');
  node.style.setProperty('--ux-delay', `${Math.min(220, (index % 6) * 36)}ms`);
  revealObserver.observe(node);
}

function bindTilt(node) {
  if (!(node instanceof Element) || tiltBound.has(node) || reducedMotion.matches || !finePointer.matches) return;
  tiltBound.add(node);
  node.classList.add('ux-tilt');
  node.addEventListener('pointermove', event => {
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const rx = (0.5 - py) * 3.6;
    const ry = (px - 0.5) * 4.6;
    node.style.setProperty('--ux-rx', `${rx.toFixed(2)}deg`);
    node.style.setProperty('--ux-ry', `${ry.toFixed(2)}deg`);
    node.style.setProperty('--ux-px', `${(px * 100).toFixed(1)}%`);
    node.style.setProperty('--ux-py', `${(py * 100).toFixed(1)}%`);
  }, { passive: true });
  node.addEventListener('pointerleave', () => {
    node.style.setProperty('--ux-rx', '0deg');
    node.style.setProperty('--ux-ry', '0deg');
    node.style.setProperty('--ux-px', '50%');
    node.style.setProperty('--ux-py', '50%');
  });
}

function enhanceTree(root = document) {
  const nodes = [];
  if (root instanceof Element && root.matches(revealSelector)) nodes.push(root);
  if (root.querySelectorAll) nodes.push(...root.querySelectorAll(revealSelector));
  nodes.forEach((node, index) => {
    bindReveal(node, index);
    if (node.matches(tiltSelector)) bindTilt(node);
  });
}

function initDynamicEnhancements() {
  enhanceTree(document);
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) enhanceTree(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function initRipple() {
  document.addEventListener('pointerdown', event => {
    if (reducedMotion.matches) return;
    const button = event.target.closest('button,.primary,.secondary,.detail-btn');
    if (!button || button.disabled || button.classList.contains('ux-menu-btn')) return;
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ux-ripple';
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    button.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  }, { passive: true });
}

function initHeroParallax() {
  const hero = document.querySelector('.hero');
  if (!hero || reducedMotion.matches || !finePointer.matches) return;
  hero.addEventListener('pointermove', event => {
    const rect = hero.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width) - .5) * 2;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height) - .5) * 2;
    hero.style.setProperty('--hero-x', x.toFixed(3));
    hero.style.setProperty('--hero-y', y.toFixed(3));
  }, { passive: true });
  hero.addEventListener('pointerleave', () => {
    hero.style.setProperty('--hero-x', '0');
    hero.style.setProperty('--hero-y', '0');
  });
}

function initModalUx() {
  const modal = document.getElementById('modal');
  if (!modal) return;
  const sync = () => document.body.classList.toggle('ux-modal-open', !modal.classList.contains('hidden'));
  new MutationObserver(sync).observe(modal, { attributes: true, attributeFilter: ['class'] });
  sync();
}

function focusActiveSearch() {
  const active = document.querySelector('.page-section.active-section')?.id;
  const selectors = {
    meta: '#search',
    counter: '#counterInput',
    assets: '#assetSearch',
    esports: '#playerSearch'
  };
  const input = document.querySelector(selectors[active]);
  if (!input) return false;
  input.focus();
  if ('select' in input) input.select();
  return true;
}

function initKeyboardUx() {
  document.addEventListener('keydown', event => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
    if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (focusActiveSearch()) event.preventDefault();
    }
    if (event.key !== 'Escape') return;
    const topbar = document.querySelector('.topbar');
    const menu = document.querySelector('.ux-menu-btn');
    if (topbar?.classList.contains('nav-open')) {
      topbar.classList.remove('nav-open');
      menu?.setAttribute('aria-expanded', 'false');
    }
    const modal = document.getElementById('modal');
    if (modal && !modal.classList.contains('hidden')) document.getElementById('closeModal')?.click();
  });
}

function initNavigationUx() {
  document.addEventListener('rift:navigate', () => {
    const topbar = document.querySelector('.topbar');
    topbar?.classList.remove('nav-open');
    document.querySelector('.ux-menu-btn')?.setAttribute('aria-expanded', 'false');
    requestAnimationFrame(() => enhanceTree(document.querySelector('.page-section.active-section') || document));
  });
}

export function initUX() {
  document.documentElement.classList.add('ux-ready');
  ensureProgress();
  ensureBackToTop();
  ensureMobileMenu();
  initRevealObserver();
  initDynamicEnhancements();
  initRipple();
  initHeroParallax();
  initModalUx();
  initKeyboardUx();
  initNavigationUx();
  window.addEventListener('scroll', requestScrollUi, { passive: true });
  window.addEventListener('resize', requestScrollUi, { passive: true });
  updateScrollUi();
}
