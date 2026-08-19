import { getLanguage } from './i18n.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const compactViewport = window.matchMedia('(max-width: 760px), (pointer: coarse)');
let initialized = false;
let lastSection = 'dashboard';
let introActive = false;
let introEndsAt = 0;
let worldsTimer = null;
let introLeaveTimer = null;
let introCleanupTimer = null;
let worldsCleanupTimer = null;
let worldsCinematicTimer = null;

const COPY = {
  vi: {
    enterEyebrow: 'RIFT META GLOBAL',
    enterTitle: 'ENTER THE RIFT',
    enterSub: 'META • ESPORTS • WORLD CHAMPIONSHIP',
    enterHint: 'WELCOME TO THE RIFT',
    worldsEyebrow: 'LEAGUE OF LEGENDS • WORLD CHAMPIONSHIP',
    worldsTitle: 'HALL OF CHAMPIONS',
    worldsSub: '2011 — 2025 • NHỮNG NHÀ VÔ ĐỊCH THẾ GIỚI',
    worldsHint: 'THE SUMMONER’S CUP AWAITS'
  },
  en: {
    enterEyebrow: 'RIFT META GLOBAL',
    enterTitle: 'ENTER THE RIFT',
    enterSub: 'META • ESPORTS • WORLD CHAMPIONSHIP',
    enterHint: 'WELCOME TO THE RIFT',
    worldsEyebrow: 'LEAGUE OF LEGENDS • WORLD CHAMPIONSHIP',
    worldsTitle: 'HALL OF CHAMPIONS',
    worldsSub: '2011 — 2025 • WORLD CHAMPIONS',
    worldsHint: 'THE SUMMONER’S CUP AWAITS'
  }
};

const text = () => COPY[getLanguage() === 'en' ? 'en' : 'vi'];

function performanceTier() {
  if (reducedMotion.matches) return 'reduced';
  const memory = Number(navigator.deviceMemory || 8);
  const cores = Number(navigator.hardwareConcurrency || 8);
  if (compactViewport.matches || memory <= 4 || cores <= 4) return 'lite';
  return 'full';
}

function ensureCss() {
  if (document.querySelector('link[data-site-effects]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/site-effects.css?v=3.8.1';
  link.dataset.siteEffects = 'true';
  document.head.appendChild(link);
}

function particles(count, gold = false) {
  return Array.from({ length: count }, (_, i) => {
    const x = (i * 47 + 13) % 100;
    const y = (i * 71 + 9) % 100;
    const delay = ((i * 7) % 17) * .045;
    const duration = 1.65 + (i % 6) * .16;
    const size = 1 + (i % 3);
    const drift = -34 - (i % 5) * 9;
    return `<i class="${gold ? 'gold' : ''}" style="--x:${x}%;--y:${y}%;--d:${delay}s;--t:${duration}s;--s:${size}px;--drift:${drift}px"></i>`;
  }).join('');
}

function removeNode(node) {
  try { node?.remove(); } catch {}
}

function setTransitionLoad(active) {
  document.body.classList.toggle('fx-transition-active', Boolean(active));
}

function clearIntroTimers() {
  clearTimeout(introLeaveTimer);
  clearTimeout(introCleanupTimer);
}

function clearWorldsTimers() {
  clearTimeout(worldsTimer);
  clearTimeout(worldsCleanupTimer);
  clearTimeout(worldsCinematicTimer);
}

function playSiteIntro() {
  const tier = performanceTier();
  document.body.dataset.fxTier = tier;
  if (tier === 'reduced' || document.querySelector('[data-rift-entry]')) return;

  clearIntroTimers();
  introActive = true;
  introEndsAt = performance.now() + 3050;
  setTransitionLoad(true);
  document.body.classList.add('rift-site-entering');

  const node = document.createElement('div');
  node.className = `rift-entry-overlay fx-${tier}`;
  node.dataset.riftEntry = 'true';
  node.setAttribute('aria-hidden', 'true');
  const particleCount = tier === 'lite' ? 9 : 17;
  node.innerHTML = `
    <div class="rift-entry-sky"></div>
    <div class="rift-entry-frame"><i></i><i></i><i></i><i></i></div>
    <div class="rift-entry-particles">${particles(particleCount)}</div>
    <div class="rift-entry-gate">
      <span></span><span></span><span></span><b>◇</b>
    </div>
    <div class="rift-entry-copy">
      <small>${text().enterEyebrow}</small>
      <strong>${text().enterTitle}</strong>
      <em>${text().enterSub}</em>
      <i>${text().enterHint}</i>
    </div>
    <div class="rift-entry-scan"></div>`;
  document.body.appendChild(node);

  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('is-active')));
  introLeaveTimer = setTimeout(() => node.classList.add('is-leaving'), 2380);
  introCleanupTimer = setTimeout(() => {
    removeNode(node);
    introActive = false;
    introEndsAt = 0;
    document.body.classList.remove('rift-site-entering');
    if (!document.body.classList.contains('worlds-transitioning')) setTransitionLoad(false);
  }, 3050);
}

function buildWorldsOverlay(tier) {
  const node = document.createElement('div');
  node.className = `worlds-takeover fx-${tier}`;
  node.dataset.worldsTakeover = 'true';
  node.setAttribute('aria-hidden', 'true');
  const particleCount = tier === 'lite' ? 11 : 21;
  node.innerHTML = `
    <div class="worlds-takeover-vignette"></div>
    <div class="worlds-takeover-frame"><i></i><i></i><i></i><i></i></div>
    <div class="worlds-takeover-beam beam-left"></div>
    <div class="worlds-takeover-beam beam-right"></div>
    <div class="worlds-takeover-particles">${particles(particleCount, true)}</div>
    <div class="worlds-takeover-emblem"><span></span><span></span><span></span><b>✦</b></div>
    <div class="worlds-takeover-copy">
      <small>${text().worldsEyebrow}</small>
      <strong>${text().worldsTitle}</strong>
      <em>${text().worldsSub}</em>
      <i>${text().worldsHint}</i>
    </div>
    <div class="worlds-takeover-line"></div>`;
  return node;
}

function runWorldsTransition() {
  const tier = performanceTier();
  document.body.dataset.fxTier = tier;
  if (tier === 'reduced') {
    document.body.classList.add('worlds-cinematic-enter');
    worldsCinematicTimer = setTimeout(() => document.body.classList.remove('worlds-cinematic-enter'), 650);
    return;
  }

  clearTimeout(worldsCleanupTimer);
  clearTimeout(worldsCinematicTimer);
  document.querySelector('[data-worlds-takeover]')?.remove();
  const node = buildWorldsOverlay(tier);
  document.body.appendChild(node);
  setTransitionLoad(true);
  document.body.classList.add('worlds-transitioning', 'worlds-cinematic-enter');

  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('is-active')));
  setTimeout(() => node.classList.add('is-reveal'), 420);
  setTimeout(() => node.classList.add('is-hold'), 1120);
  setTimeout(() => node.classList.add('is-leaving'), 1880);
  worldsCleanupTimer = setTimeout(() => {
    removeNode(node);
    document.body.classList.remove('worlds-transitioning');
    if (!introActive) setTransitionLoad(false);
  }, 2520);
  worldsCinematicTimer = setTimeout(() => document.body.classList.remove('worlds-cinematic-enter'), 3300);
}

function playWorldsTransition() {
  clearTimeout(worldsTimer);
  if (introActive) {
    const remaining = Math.max(120, introEndsAt - performance.now() + 90);
    worldsTimer = setTimeout(runWorldsTransition, remaining);
    return;
  }
  runWorldsTransition();
}

export function triggerSectionEffect(sectionId) {
  const next = sectionId || 'dashboard';
  if (next === 'worlds' && lastSection !== 'worlds') playWorldsTransition();
  if (next !== 'worlds') {
    clearWorldsTimers();
    document.body.classList.remove('worlds-transitioning', 'worlds-cinematic-enter');
    document.querySelector('[data-worlds-takeover]')?.remove();
    if (!introActive) setTransitionLoad(false);
  }
  lastSection = next;
}

export function initSiteEffects() {
  if (initialized) return;
  initialized = true;
  ensureCss();
  document.body.dataset.fxTier = performanceTier();
  lastSection = document.querySelector('.page-section.active-section')?.id || 'dashboard';
  requestAnimationFrame(playSiteIntro);
}
