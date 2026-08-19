const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const compactViewport = window.matchMedia('(max-width: 760px), (pointer: coarse)');
let pointerTicking = false;
let scrollTicking = false;
let mx = 0;
let my = 0;
let sy = 0;

function isLiteDevice() {
  const memory = Number(navigator.deviceMemory || 8);
  const cores = Number(navigator.hardwareConcurrency || 8);
  return compactViewport.matches || memory <= 4 || cores <= 4;
}

function ensureCss() {
  if (document.querySelector('link[data-rift-ambient]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/ambient.css?v=3.8.1';
  link.dataset.riftAmbient = 'true';
  document.head.appendChild(link);
}

function makeDust() {
  const count = reducedMotion.matches ? 0 : isLiteDevice() ? 7 : 14;
  return Array.from({ length: count }, (_, i) => {
    const x = (i * 37 + 11) % 100;
    const y = (i * 61 + 7) % 100;
    const size = 1 + (i % 2);
    const delay = -(i % 9) * 1.9;
    const duration = 17 + (i % 7) * 2.4;
    return `<i style="--x:${x}%;--y:${y}%;--s:${size}px;--delay:${delay}s;--duration:${duration}s"></i>`;
  }).join('');
}

function ensureAmbient() {
  if (document.getElementById('riftAmbient')) return;
  const node = document.createElement('div');
  node.id = 'riftAmbient';
  node.className = `rift-ambient ${isLiteDevice() ? 'ambient-lite' : ''}`;
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = `
    <div class="rift-aurora aurora-a"></div>
    <div class="rift-aurora aurora-b"></div>
    <div class="rift-aurora aurora-c"></div>
    <div class="rift-beam beam-a"></div>
    <div class="rift-beam beam-b"></div>
    <div class="rift-rune rune-a"><span></span></div>
    <div class="rift-rune rune-b"><span></span></div>
    <div class="rift-rune rune-c"><span></span></div>
    <div class="rift-horizon"></div>
    <div class="rift-dust">${makeDust()}</div>`;
  document.body.prepend(node);
}

function paintPointer() {
  pointerTicking = false;
  document.documentElement.style.setProperty('--ambient-x', mx.toFixed(3));
  document.documentElement.style.setProperty('--ambient-y', my.toFixed(3));
}

function onPointer(event) {
  if (reducedMotion.matches || !finePointer.matches || isLiteDevice() || document.body.classList.contains('fx-transition-active')) return;
  mx = event.clientX / Math.max(1, window.innerWidth) - .5;
  my = event.clientY / Math.max(1, window.innerHeight) - .5;
  if (pointerTicking) return;
  pointerTicking = true;
  requestAnimationFrame(paintPointer);
}

function paintScroll() {
  scrollTicking = false;
  document.documentElement.style.setProperty('--ambient-scroll', `${sy}px`);
}

function onScroll() {
  if (reducedMotion.matches || document.body.classList.contains('fx-transition-active')) return;
  sy = Math.min(1400, window.scrollY || 0);
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(paintScroll);
}

function onVisibility() {
  document.documentElement.classList.toggle('ambient-page-hidden', document.hidden);
}

export function initAmbient() {
  ensureCss();
  ensureAmbient();
  document.documentElement.style.setProperty('--ambient-x', '0');
  document.documentElement.style.setProperty('--ambient-y', '0');
  document.documentElement.style.setProperty('--ambient-scroll', '0px');
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibility, { passive: true });
  onVisibility();
}
