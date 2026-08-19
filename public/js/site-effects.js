import { getLanguage } from './i18n.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let initialized = false;
let lastSection = 'dashboard';
let introActive = false;
let worldsTimer = null;
let introTimer = null;

const COPY = {
  vi: {
    enterEyebrow: 'RIFT META GLOBAL',
    enterTitle: 'ENTER THE RIFT',
    enterSub: 'Meta • Esports • Worlds',
    worldsEyebrow: 'WORLD CHAMPIONSHIP',
    worldsTitle: 'HALL OF CHAMPIONS',
    worldsSub: '2011 — 2025 • Nhà vô địch CKTG'
  },
  en: {
    enterEyebrow: 'RIFT META GLOBAL',
    enterTitle: 'ENTER THE RIFT',
    enterSub: 'Meta • Esports • Worlds',
    worldsEyebrow: 'WORLD CHAMPIONSHIP',
    worldsTitle: 'HALL OF CHAMPIONS',
    worldsSub: '2011 — 2025 • Worlds Champions'
  }
};

const text = () => COPY[getLanguage() === 'en' ? 'en' : 'vi'];

function ensureCss() {
  if (document.querySelector('link[data-site-effects]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/site-effects.css?v=3.8.0';
  link.dataset.siteEffects = 'true';
  document.head.appendChild(link);
}

function particles(count, gold = false) {
  return Array.from({ length: count }, (_, i) => {
    const x = (i * 47 + 13) % 100;
    const y = (i * 71 + 9) % 100;
    const delay = -((i * 7) % 19) * .11;
    const duration = 1.8 + (i % 7) * .22;
    const size = 2 + (i % 3);
    return `<i class="${gold ? 'gold' : ''}" style="--x:${x}%;--y:${y}%;--d:${delay}s;--t:${duration}s;--s:${size}px"></i>`;
  }).join('');
}

function removeNode(node) {
  try { node?.remove(); } catch {}
}

function playSiteIntro() {
  if (reducedMotion.matches || document.querySelector('[data-rift-entry]')) return;
  introActive = true;
  document.body.classList.add('rift-site-entering');
  const node = document.createElement('div');
  node.className = 'rift-entry-overlay';
  node.dataset.riftEntry = 'true';
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = `
    <div class="rift-entry-sky"></div>
    <div class="rift-entry-particles">${particles(34)}</div>
    <div class="rift-entry-gate">
      <span></span><span></span><span></span><b>◇</b>
    </div>
    <div class="rift-entry-copy">
      <small>${text().enterEyebrow}</small>
      <strong>${text().enterTitle}</strong>
      <em>${text().enterSub}</em>
    </div>
    <div class="rift-entry-scan"></div>`;
  document.body.appendChild(node);
  requestAnimationFrame(() => node.classList.add('is-active'));
  clearTimeout(introTimer);
  introTimer = setTimeout(() => node.classList.add('is-leaving'), 1250);
  setTimeout(() => {
    removeNode(node);
    introActive = false;
    document.body.classList.remove('rift-site-entering');
  }, 1900);
}

function buildWorldsOverlay() {
  const node = document.createElement('div');
  node.className = 'worlds-takeover';
  node.dataset.worldsTakeover = 'true';
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = `
    <div class="worlds-takeover-vignette"></div>
    <div class="worlds-takeover-beam beam-left"></div>
    <div class="worlds-takeover-beam beam-right"></div>
    <div class="worlds-takeover-particles">${particles(42, true)}</div>
    <div class="worlds-takeover-emblem"><span></span><span></span><span></span><b>✦</b></div>
    <div class="worlds-takeover-copy">
      <small>${text().worldsEyebrow}</small>
      <strong>${text().worldsTitle}</strong>
      <em>${text().worldsSub}</em>
    </div>
    <div class="worlds-takeover-line"></div>`;
  return node;
}

function runWorldsTransition() {
  if (reducedMotion.matches) {
    document.body.classList.add('worlds-cinematic-enter');
    setTimeout(() => document.body.classList.remove('worlds-cinematic-enter'), 450);
    return;
  }
  document.querySelector('[data-worlds-takeover]')?.remove();
  const node = buildWorldsOverlay();
  document.body.appendChild(node);
  document.body.classList.add('worlds-transitioning', 'worlds-cinematic-enter');
  requestAnimationFrame(() => node.classList.add('is-active'));
  setTimeout(() => node.classList.add('is-reveal'), 360);
  setTimeout(() => node.classList.add('is-leaving'), 880);
  setTimeout(() => {
    removeNode(node);
    document.body.classList.remove('worlds-transitioning');
  }, 1250);
  setTimeout(() => document.body.classList.remove('worlds-cinematic-enter'), 1750);
}

function playWorldsTransition() {
  clearTimeout(worldsTimer);
  if (introActive) {
    worldsTimer = setTimeout(runWorldsTransition, 1250);
    return;
  }
  runWorldsTransition();
}

export function triggerSectionEffect(sectionId) {
  const next = sectionId || 'dashboard';
  if (next === 'worlds' && lastSection !== 'worlds') playWorldsTransition();
  if (next !== 'worlds') {
    document.body.classList.remove('worlds-transitioning', 'worlds-cinematic-enter');
    document.querySelector('[data-worlds-takeover]')?.remove();
  }
  lastSection = next;
}

export function initSiteEffects() {
  if (initialized) return;
  initialized = true;
  ensureCss();
  lastSection = document.querySelector('.page-section.active-section')?.id || 'dashboard';
  requestAnimationFrame(playSiteIntro);
}
