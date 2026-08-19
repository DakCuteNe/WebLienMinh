import { getLanguage } from './i18n.js';
import { cancelTogetherFinisher, playTogetherFinisher } from './together-finisher.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const compactViewport = window.matchMedia('(max-width: 760px), (pointer: coarse)');
let initialized = false;
let lastSection = 'dashboard';
let introActive = false;
let introEndsAt = 0;
let worldsTimer = null;
let introLeaveTimer = null;
let introCleanupTimer = null;
let worldsRevealTimer = null;

const COPY = {
  vi: {
    enterEyebrow: 'RIFT META GLOBAL',
    enterTitle: 'ENTER THE RIFT',
    enterSub: 'META • ESPORTS • WORLD CHAMPIONSHIP',
    enterHint: 'WELCOME TO THE RIFT'
  },
  en: {
    enterEyebrow: 'RIFT META GLOBAL',
    enterTitle: 'ENTER THE RIFT',
    enterSub: 'META • ESPORTS • WORLD CHAMPIONSHIP',
    enterHint: 'WELCOME TO THE RIFT'
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
  link.href = '/site-effects.css?v=3.12.0';
  link.dataset.siteEffects = 'true';
  document.head.appendChild(link);
}

function particles(count) {
  return Array.from({ length: count }, (_, i) => {
    const x = (i * 47 + 13) % 100;
    const y = (i * 71 + 9) % 100;
    const delay = ((i * 7) % 17) * .045;
    const duration = 1.65 + (i % 6) * .16;
    const size = 1 + (i % 3);
    const drift = -34 - (i % 5) * 9;
    return `<i style="--x:${x}%;--y:${y}%;--d:${delay}s;--t:${duration}s;--s:${size}px;--drift:${drift}px"></i>`;
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

function clearWorldsFlow() {
  clearTimeout(worldsTimer);
  clearTimeout(worldsRevealTimer);
  cancelTogetherFinisher();
  document.body.classList.remove('worlds-finisher-enter');
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
    <div class="rift-entry-gate"><span></span><span></span><span></span><b>◇</b></div>
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
    if (!document.body.classList.contains('together-finisher-active')) setTransitionLoad(false);
  }, 3050);
}

function runWorldsFinisher() {
  clearWorldsFlow();
  const tier = performanceTier();
  document.body.dataset.fxTier = tier;
  setTransitionLoad(true);
  document.body.classList.add('worlds-finisher-enter');

  playTogetherFinisher({
    tier,
    onComplete: () => {
      if (lastSection !== 'worlds') return;
      document.body.classList.remove('worlds-finisher-enter');
      setTransitionLoad(false);
      document.body.classList.add('worlds-finisher-reveal');
      worldsRevealTimer = setTimeout(() => document.body.classList.remove('worlds-finisher-reveal'), 1200);
    }
  });
}

function playWorldsFinisher() {
  clearTimeout(worldsTimer);
  if (introActive) {
    const remaining = Math.max(120, introEndsAt - performance.now() + 90);
    worldsTimer = setTimeout(runWorldsFinisher, remaining);
    return;
  }
  runWorldsFinisher();
}

export function triggerSectionEffect(sectionId) {
  const next = sectionId || 'dashboard';
  if (next === 'worlds' && lastSection !== 'worlds') playWorldsFinisher();
  if (next !== 'worlds') {
    clearWorldsFlow();
    document.body.classList.remove('worlds-finisher-reveal');
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
