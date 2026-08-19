import { getLanguage } from './i18n.js';

export const TOGETHER_FINISHER_DURATION = 3600;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let activeNode = null;
let timers = [];

const COPY = {
  vi: {
    eyebrow: 'WORLD CHAMPIONS • DYNASTY',
    title: 'TOGETHER AS 1',
    sub: '5 NGƯỜI • 6 SAO • 1 TRIỀU ĐẠI',
    final: 'VICTORY IS FORGED TOGETHER'
  },
  en: {
    eyebrow: 'WORLD CHAMPIONS • DYNASTY',
    title: 'TOGETHER AS 1',
    sub: '5 PLAYERS • 6 STARS • 1 DYNASTY',
    final: 'VICTORY IS FORGED TOGETHER'
  }
};

const text = () => COPY[getLanguage() === 'en' ? 'en' : 'vi'];

function ensureCss() {
  if (document.querySelector('link[data-together-finisher]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/together-finisher.css?v=3.10.0';
  link.dataset.togetherFinisher = 'true';
  document.head.appendChild(link);
}

function later(fn, ms) {
  const id = setTimeout(fn, ms);
  timers.push(id);
  return id;
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function removeActive() {
  try { activeNode?.remove(); } catch {}
  activeNode = null;
}

function silhouettes() {
  return Array.from({ length: 5 }, (_, index) => `
    <i class="ta1-player p${index + 1}" aria-hidden="true">
      <span></span><b></b>
    </i>`).join('');
}

function stars() {
  return Array.from({ length: 6 }, (_, index) => `<i style="--star:${index}" aria-hidden="true">★</i>`).join('');
}

export function cancelTogetherFinisher() {
  clearTimers();
  if (activeNode) {
    activeNode.classList.add('is-leaving');
    const old = activeNode;
    activeNode = null;
    setTimeout(() => { try { old.remove(); } catch {} }, 220);
  }
  document.body.classList.remove('together-finisher-active');
}

export function playTogetherFinisher({ tier = 'full', onComplete } = {}) {
  ensureCss();
  cancelTogetherFinisher();

  if (reducedMotion.matches || tier === 'reduced') {
    document.body.classList.add('together-finisher-flash');
    later(() => document.body.classList.remove('together-finisher-flash'), 420);
    later(() => onComplete?.(), 460);
    return 460;
  }

  const node = document.createElement('div');
  node.className = `together-finisher fx-${tier}`;
  node.dataset.togetherFinisher = 'true';
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = `
    <div class="ta1-backdrop"></div>
    <div class="ta1-ribbon ribbon-a"></div>
    <div class="ta1-ribbon ribbon-b"></div>
    <div class="ta1-ribbon ribbon-c"></div>
    <div class="ta1-ribbon ribbon-d"></div>
    <div class="ta1-stage-glow"></div>
    <div class="ta1-players">${silhouettes()}</div>
    <div class="ta1-trophy" aria-hidden="true">
      <span class="ta1-cup"><i></i><b></b></span>
      <span class="ta1-pedestal"></span>
    </div>
    <div class="ta1-stars">${stars()}</div>
    <div class="ta1-crest" aria-hidden="true"><span>1</span></div>
    <div class="ta1-copy">
      <small>${text().eyebrow}</small>
      <strong>${text().title}</strong>
      <em>${text().sub}</em>
      <i>${text().final}</i>
    </div>
    <div class="ta1-impact-ring"></div>
    <div class="ta1-flash"></div>`;

  activeNode = node;
  document.body.appendChild(node);
  document.body.classList.add('together-finisher-active');

  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('is-active')));
  later(() => node.classList.add('show-team'), 520);
  later(() => node.classList.add('show-cup'), 980);
  later(() => node.classList.add('show-stars'), 1420);
  later(() => node.classList.add('show-title'), 1940);
  later(() => node.classList.add('impact'), 2440);
  later(() => node.classList.add('is-leaving'), 3060);
  later(() => {
    removeActive();
    document.body.classList.remove('together-finisher-active');
    onComplete?.();
  }, TOGETHER_FINISHER_DURATION);

  return TOGETHER_FINISHER_DURATION;
}
