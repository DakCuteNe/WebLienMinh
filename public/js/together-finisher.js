import { getLanguage } from './i18n.js';

export const TOGETHER_FINISHER_DURATION = 6200;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let activeNode = null;
let timers = [];
let runToken = 0;

const COPY = {
  vi: {
    eyebrow: 'WORLD CHAMPIONS • ONE LEGACY',
    title: 'TOGETHER AS 1',
    sub: 'NĂM NGƯỜI • MỘT Ý CHÍ • MỘT DI SẢN',
    final: 'VICTORY IS FORGED TOGETHER'
  },
  en: {
    eyebrow: 'WORLD CHAMPIONS • ONE LEGACY',
    title: 'TOGETHER AS 1',
    sub: 'FIVE PLAYERS • ONE WILL • ONE LEGACY',
    final: 'VICTORY IS FORGED TOGETHER'
  }
};

const text = () => COPY[getLanguage() === 'en' ? 'en' : 'vi'];

function ensureCss() {
  if (document.querySelector('link[data-together-finisher]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/together-finisher.css?v=3.12.0';
  link.dataset.togetherFinisher = 'true';
  document.head.appendChild(link);
}

function later(fn, ms, token) {
  const id = setTimeout(() => {
    if (token !== runToken) return;
    fn();
  }, ms);
  timers.push(id);
  return id;
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function removeNode(node) {
  try { node?.remove(); } catch {}
}

function starScene() {
  return Array.from({ length: 6 }, (_, index) => {
    const x = 610 + index * 76;
    return `
      <g transform="translate(${x} 151)">
        <g class="ta3-star" style="--i:${index}">
          <circle class="ta3-star-orbit" r="31" />
          <path class="ta3-star-burst" d="M0-43V-31M0 31v12M-43 0h12M31 0h12M-30-30l9 9M21 21l9 9M30-30l-9 9M-21 21l-9 9" />
          <path class="ta3-star-core" d="M0-23 6.3-7.5 23-6.2 10.1 4.2 14.1 20.5 0 11.8-14.1 20.5-10.1 4.2-23-6.2-6.3-7.5Z" />
        </g>
      </g>`;
  }).join('');
}

function playerScene() {
  const players = [
    { x: 420, y: 458, scale: .88, body: 'M-47-71C-28-91 28-91 48-70L76 22 47 31 29-30 24 124H-25L-31-30-48 31-77 22Z', hair: 'M-29-109c8-30 48-34 61-5l-8 9c-11-13-22-17-34-14-8 2-14 5-19 10Z', arm: 'M-45-65-102-5l20 21 57-52Z' },
    { x: 610, y: 432, scale: .98, body: 'M-52-78C-29-99 30-99 53-77L72 28 43 34 31-38 26 139H-29L-35-37-48 137H-101L-71-39-102 7-25 26Z', hair: 'M-31-117c9-28 48-33 64-4l-8 9c-10-11-21-16-34-14-9 1-16 5-22 9Z', arm: 'M48-70 101-13 81 8 29-40Z' },
    { x: 800, y: 405, scale: 1.08, body: 'M-58-86C-32-109 34-109 59-85L79 34 47 39 34-44 29 153H-34L-40-43-53 151H-112L-78-42-111 5-28 29Z', hair: 'M-34-128c11-31 53-34 70-3l-8 10c-12-14-24-18-38-15-10 2-17 6-24 11Z', arm: 'M-55-77-112-17l23 23 58-52ZM52-78l58 61-23 23-57-53Z' },
    { x: 990, y: 432, scale: .98, body: 'M-53-78C-29-99 30-99 53-77L74 27 45 34 31-39 26 138H-29L-35-38-48 137H-100L-72-39-105-10-19-22Z', hair: 'M-32-118c12-27 49-31 64-3l-8 9c-11-12-22-16-34-14-8 2-15 5-22 10Z', arm: 'M-48-69-101-20-83 4-28-40Z' },
    { x: 1180, y: 458, scale: .88, body: 'M-48-71C-28-91 28-91 48-70L78 18 50 29 30-30 24 124H-25L-31-30-48 31-77 22Z', hair: 'M-29-109c9-27 47-32 61-4l-8 9c-10-11-20-16-33-13-8 1-15 5-20 9Z', arm: 'M45-64 99-8 78 14 26-36Z' }
  ];

  return players.map((p, index) => `
    <g transform="translate(${p.x} ${p.y}) scale(${p.scale})">
      <g class="ta3-player ta3-p${index + 1}" style="--p:${index}">
        <ellipse class="ta3-player-shadow" cx="0" cy="130" rx="69" ry="13" />
        <circle class="ta3-head" cx="0" cy="-96" r="30" />
        <path class="ta3-hair" d="${p.hair}" />
        <path class="ta3-body" d="${p.body}" />
        <path class="ta3-jacket-line" d="M-42-66 0-38l42-28M0-38V24M-31 9 0 25 32 9" />
        <path class="ta3-arm" d="${p.arm}" />
        <path class="ta3-rim" d="M-52-70C-28-98 28-98 53-70" />
      </g>
    </g>`).join('');
}

function trophyScene() {
  return `
    <g transform="translate(800 426)">
      <g class="ta3-trophy">
        <ellipse class="ta3-trophy-halo" rx="205" ry="245" />
        <circle class="ta3-trophy-ring ring-a" r="196" />
        <circle class="ta3-trophy-ring ring-b" r="158" />
        <path class="ta3-handle handle-left" d="M-91-126C-181-150-201-53-147 15c23 29 53 45 87 52l13-38c-37-10-63-29-77-53-24-43 3-71 47-52Z" />
        <path class="ta3-handle handle-right" d="M91-126C181-150 201-53 147 15c-23 29-53 45-87 52L47 29c37-10 63-29 77-53 24-43-3-71-47-52Z" />
        <path class="ta3-cup-shell" d="M-103-151H103l-12 108C84 33 45 89 0 109-45 89-84 33-91-43Z" />
        <path class="ta3-cup-inner" d="M-77-127H77l-10 81C62 10 34 52 0 69-34 52-62 10-67-46Z" />
        <path class="ta3-cup-rim" d="M-116-153c34-18 198-18 232 0l-11 29c-51 17-159 17-210 0Z" />
        <path class="ta3-cup-facet facet-l" d="M-86-118-15-124-28 74C-57 46-74 5-79-47Z" />
        <path class="ta3-cup-facet facet-r" d="M17-124 85-118 78-48C73 4 55 45 27 74Z" />
        <path class="ta3-neck" d="M-23 89H23l10 67h-66Z" />
        <path class="ta3-stem" d="M-31 149H31l19 47h-100Z" />
        <path class="ta3-base-top" d="M-82 193H82l20 28h-204Z" />
        <path class="ta3-base" d="M-108 216H108l30 54h-276Z" />
        <path class="ta3-base-line" d="M-101 232H101" />
        <path class="ta3-trophy-shine" d="M-84-139h39L4 95h-32Z" />
      </g>
    </g>`;
}

function sceneSvg() {
  return `
  <svg class="ta3-scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="presentation" aria-hidden="true">
    <defs>
      <linearGradient id="ta3Bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#020102"/><stop offset=".45" stop-color="#110307"/><stop offset="1" stop-color="#020102"/></linearGradient>
      <linearGradient id="ta3RedA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4c59"/><stop offset=".23" stop-color="#cf1b31"/><stop offset=".62" stop-color="#780716"/><stop offset="1" stop-color="#230106"/></linearGradient>
      <linearGradient id="ta3RedB" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6871"/><stop offset=".3" stop-color="#b71327"/><stop offset=".7" stop-color="#650411"/><stop offset="1" stop-color="#1f0105"/></linearGradient>
      <linearGradient id="ta3Gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4d2b0b"/><stop offset=".12" stop-color="#95601d"/><stop offset=".33" stop-color="#e4ad46"/><stop offset=".49" stop-color="#fff0ba"/><stop offset=".62" stop-color="#e2ad43"/><stop offset=".85" stop-color="#815018"/><stop offset="1" stop-color="#3e2208"/></linearGradient>
      <linearGradient id="ta3GoldVertical" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c6"/><stop offset=".18" stop-color="#e6b34d"/><stop offset=".58" stop-color="#9a611d"/><stop offset="1" stop-color="#432509"/></linearGradient>
      <linearGradient id="ta3Shadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#241519"/><stop offset=".55" stop-color="#090608"/><stop offset="1" stop-color="#020102"/></linearGradient>
      <radialGradient id="ta3Halo"><stop offset="0" stop-color="#ffe39a" stop-opacity=".7"/><stop offset=".19" stop-color="#e74752" stop-opacity=".25"/><stop offset=".6" stop-color="#7b0815" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <radialGradient id="ta3Floor"><stop offset="0" stop-color="#d22539" stop-opacity=".3"/><stop offset=".45" stop-color="#7d0715" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>

    <rect class="ta3-bg" width="1600" height="900" fill="url(#ta3Bg)" />
    <ellipse class="ta3-floor" cx="800" cy="697" rx="690" ry="195" fill="url(#ta3Floor)" />
    <ellipse class="ta3-center-halo" cx="800" cy="410" rx="470" ry="355" fill="url(#ta3Halo)" />

    <g class="ta3-rays"><path d="M640-80h45l137 730h-76Z"/><path d="M750-80h31l43 730h-57Z"/><path d="M885-80h35L850 650h-56Z"/><path d="M1004-80h42L889 650h-72Z"/></g>

    <g class="ta3-crest-back"><path class="ta3-crest-diamond outer" d="M800 170 1038 404 800 638 562 404Z" /><path class="ta3-crest-diamond inner" d="M800 221 985 404 800 587 615 404Z" /><circle class="ta3-crest-circle" cx="800" cy="404" r="151" /></g>

    <g class="ta3-cloth-back"><path class="ta3-cloth ta3-cloth-a" fill="url(#ta3RedA)" d="M-300 128C35 50 296 74 514 180c173 84 326 91 468 35 186-73 399-39 647 115l-67 190c-228-130-425-167-594-104-168 62-351 45-548-48C233 280 51 279-240 355Z" /><path class="ta3-cloth ta3-cloth-b" fill="url(#ta3RedB)" d="M1900 109c-344-70-612-31-838 102-156 92-307 110-454 61-197-65-405-25-632 120l72 189c207-124 401-158 574-101 175 58 345 30 511-66 210-122 423-133 705-70Z" /><path class="ta3-cloth-line line-a" d="M-218 170c286-65 496-40 702 59 180 86 341 90 494 33 181-67 366-32 579 91" /><path class="ta3-cloth-line line-b" d="M1824 151c-295-55-520-17-730 101-170 95-333 108-490 56-180-60-353-22-548 94" /></g>

    <g class="ta3-energy-lines"><path d="M119 534C393 439 548 448 711 506"/><path d="M1481 534c-274-95-429-86-592-28"/><path d="M184 600c239-67 383-56 532-5"/><path d="M1416 600c-239-67-383-56-532-5"/></g>

    <g class="ta3-players">${playerScene()}</g>
    ${trophyScene()}
    <g class="ta3-stars">${starScene()}</g>

    <g class="ta3-number-crest" transform="translate(800 410)"><path class="ta3-number-crest-frame" d="M0-105 91-52 91 53 0 106-91 53-91-52Z" /><path class="ta3-number-crest-frame inner" d="M0-82 70-41 70 42 0 83-70 42-70-41Z" /><path class="ta3-one" d="M-19-46 18-68h27V62H4V-19l-23 13Z" /></g>

    <g class="ta3-cloth-front"><path class="ta3-cloth ta3-cloth-c" fill="url(#ta3RedA)" d="M-300 691c302-139 563-154 805-55 190 78 367 86 535 23 188-71 386-55 623 51l-29 190H-300Z" /><path class="ta3-cloth ta3-cloth-d" fill="url(#ta3RedB)" d="M1900 650c-311-107-566-99-790 29-167 95-339 112-516 48-215-77-438-61-704 53l-31 120h2041Z" /></g>

    <g class="ta3-sparks">${Array.from({ length: 18 }, (_, i) => { const angle = (i * 20) * Math.PI / 180; const x1 = 800 + Math.cos(angle) * 74; const y1 = 410 + Math.sin(angle) * 74; const x2 = 800 + Math.cos(angle) * (145 + (i % 3) * 28); const y2 = 410 + Math.sin(angle) * (145 + (i % 3) * 28); return `<path style="--s:${i}" d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" />`; }).join('')}</g>
  </svg>`;
}

function buildOverlay(tier) {
  const c = text();
  const node = document.createElement('div');
  node.className = `together-finisher-v3 fx-${tier}`;
  node.dataset.togetherFinisher = 'v3';
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = `
    <div class="ta3-letterbox ta3-letterbox-top"></div>
    <div class="ta3-letterbox ta3-letterbox-bottom"></div>
    <div class="ta3-vignette"></div>
    ${sceneSvg()}
    <div class="ta3-title-wrap"><small>${c.eyebrow}</small><div class="ta3-title-mask"><strong>${c.title}</strong></div><em>${c.sub}</em><i>${c.final}</i></div>
    <div class="ta3-impact-ring ring-one"></div><div class="ta3-impact-ring ring-two"></div>
    <div class="ta3-impact-cross"><span></span><span></span></div>
    <div class="ta3-flash"></div><div class="ta3-grain"></div>`;
  return node;
}

export function cancelTogetherFinisher() {
  runToken += 1;
  clearTimers();
  const node = activeNode;
  activeNode = null;
  if (node) {
    node.classList.add('is-cancelled');
    setTimeout(() => removeNode(node), 180);
  }
  document.body.classList.remove('together-finisher-active', 'together-finisher-impact');
}

export function playTogetherFinisher({ tier = 'full', onComplete } = {}) {
  ensureCss();
  cancelTogetherFinisher();
  const token = ++runToken;

  if (reducedMotion.matches || tier === 'reduced') {
    document.body.classList.add('together-finisher-reduced');
    later(() => document.body.classList.remove('together-finisher-reduced'), 520, token);
    later(() => onComplete?.(), 560, token);
    return 560;
  }

  const node = buildOverlay(tier);
  activeNode = node;
  document.body.appendChild(node);
  document.body.classList.add('together-finisher-active');

  requestAnimationFrame(() => requestAnimationFrame(() => { if (token === runToken) node.classList.add('is-active'); }));

  later(() => node.classList.add('phase-cloth'), 240, token);
  later(() => node.classList.add('phase-team'), 1040, token);
  later(() => node.classList.add('phase-cup'), 1860, token);
  later(() => node.classList.add('phase-stars'), 2740, token);
  later(() => node.classList.add('phase-crest'), 3380, token);
  later(() => node.classList.add('phase-title'), 3780, token);
  later(() => { node.classList.add('phase-impact'); document.body.classList.add('together-finisher-impact'); }, 4720, token);
  later(() => document.body.classList.remove('together-finisher-impact'), 5140, token);
  later(() => node.classList.add('phase-exit'), 5420, token);
  later(() => {
    if (activeNode === node) activeNode = null;
    removeNode(node);
    document.body.classList.remove('together-finisher-active', 'together-finisher-impact');
    onComplete?.();
  }, TOGETHER_FINISHER_DURATION, token);

  return TOGETHER_FINISHER_DURATION;
}
