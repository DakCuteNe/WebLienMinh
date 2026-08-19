const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
let ticking = false;
let mx = 0;
let my = 0;

function ensureCss() {
  if (document.querySelector('link[data-rift-ambient]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/ambient.css';
  link.dataset.riftAmbient = 'true';
  document.head.appendChild(link);
}

function makeDust() {
  return Array.from({ length: 28 }, (_, i) => {
    const x = (i * 37 + 11) % 100;
    const y = (i * 61 + 7) % 100;
    const size = 1 + (i % 3);
    const delay = -(i % 11) * 1.7;
    const duration = 13 + (i % 9) * 2.1;
    return `<i style="--x:${x}%;--y:${y}%;--s:${size}px;--delay:${delay}s;--duration:${duration}s"></i>`;
  }).join('');
}

function ensureAmbient() {
  if (document.getElementById('riftAmbient')) return;
  const node = document.createElement('div');
  node.id = 'riftAmbient';
  node.className = 'rift-ambient';
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
  ticking = false;
  document.documentElement.style.setProperty('--ambient-x', mx.toFixed(3));
  document.documentElement.style.setProperty('--ambient-y', my.toFixed(3));
}

function onPointer(event) {
  if (reducedMotion.matches || !finePointer.matches) return;
  mx = event.clientX / Math.max(1, window.innerWidth) - .5;
  my = event.clientY / Math.max(1, window.innerHeight) - .5;
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(paintPointer);
}

function onScroll() {
  if (reducedMotion.matches) return;
  const y = Math.min(1600, window.scrollY || 0);
  document.documentElement.style.setProperty('--ambient-scroll', `${y}px`);
}

export function initAmbient() {
  ensureCss();
  ensureAmbient();
  document.documentElement.style.setProperty('--ambient-x', '0');
  document.documentElement.style.setProperty('--ambient-y', '0');
  document.documentElement.style.setProperty('--ambient-scroll', '0px');
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
}
