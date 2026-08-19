import { getLanguage } from './i18n.js';

export const TOGETHER_FINISHER_DURATION = 5480;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let activeNode = null;
let timers = [];
let runToken = 0;

const COPY = {
  vi: {
    eyebrow: 'WORLD CHAMPIONS • ONE LEGACY',
    title: 'TOGETHER AS 1',
    sub: 'NĂM NGƯỜI ĐỨNG CẠNH NHAU. MỘT DI SẢN ĐƯỢC TẠO NÊN.',
    final: 'VICTORY IS FORGED TOGETHER'
  },
  en: {
    eyebrow: 'WORLD CHAMPIONS • ONE LEGACY',
    title: 'TOGETHER AS 1',
    sub: 'FIVE STAND TOGETHER. ONE LEGACY IS FORGED.',
    final: 'VICTORY IS FORGED TOGETHER'
  }
};

const text = () => COPY[getLanguage() === 'en' ? 'en' : 'vi'];

function ensureCss() {
  if (document.querySelector('link[data-together-finisher]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/together-finisher.css?v=3.11.0';
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

function playerScene() {
  return `
    <g class="ta2-team" aria-hidden="true">
      <g transform="translate(410 355)"><g class="ta2-player ta2-p1">
        <circle class="ta2-head" cx="0" cy="-93" r="28"/>
        <path class="ta2-hair" d="M-27-98c7-25 45-28 57-2l-7 8c-8-13-17-18-31-16-7 2-13 5-19 10z"/>
        <path class="ta2-body" d="M-48-58c18-16 31-21 48-21 19 0 34 6 50 22l20 89-28 5-8-57-8 148h-55l-6-105-15 103h-50l18-149-22 54-28-11z"/>
        <path class="ta2-jacket" d="M-41-48 0-30l42-19 6 36-27 16-21-21-22 21-26-16z"/>
        <path class="ta2-arm" d="M-47-45-96 10l18 16 50-44z"/>
      </g></g>
      <g transform="translate(605 315)"><g class="ta2-player ta2-p2">
        <circle class="ta2-head" cx="0" cy="-102" r="29"/>
        <path class="ta2-hair" d="M-30-108c11-24 46-24 61 0l-8 7c-10-11-20-15-31-13-9 1-16 4-22 10z"/>
        <path class="ta2-body" d="M-51-65c17-17 33-23 52-23 20 0 37 7 53 23l15 93-28 4-9-62-4 163h-58l-4-119-11 118h-53l23-171-30 44-24-17z"/>
        <path class="ta2-jacket" d="M-44-56 0-34l45-22 7 37-30 21-22-23-24 23-27-21z"/>
        <path class="ta2-arm" d="M49-55 96-5 78 14 30-28z"/>
      </g></g>
      <g transform="translate(800 275)"><g class="ta2-player ta2-p3">
        <circle class="ta2-head" cx="0" cy="-112" r="31"/>
        <path class="ta2-hair" d="M-32-119c11-27 50-29 66 0l-7 8c-11-12-22-17-36-15-9 1-16 5-23 11z"/>
        <path class="ta2-body" d="M-56-73c18-18 35-25 57-25 23 0 42 8 59 26l13 103-30 3-9-69-3 174h-63l-2-127-15 125h-56l25-178-34 45-25-20z"/>
        <path class="ta2-jacket" d="M-49-63 0-38l50-25 7 41-32 23L0-24-26 2l-31-24z"/>
        <path class="ta2-arm" d="M-53-62-103-10l22 19 48-45zM52-62l49 52-21 19-49-45z"/>
      </g></g>
      <g transform="translate(995 315)"><g class="ta2-player ta2-p4">
        <circle class="ta2-head" cx="0" cy="-102" r="29"/>
        <path class="ta2-hair" d="M-30-109c10-23 46-26 60 0l-8 8c-8-10-19-15-31-13-8 1-15 5-21 10z"/>
        <path class="ta2-body" d="M-52-65c16-17 33-23 53-23 19 0 36 7 52 23l18 94-29 5-10-64-5 163h-56l-6-119-10 118h-52l21-171-46 34-17-24z"/>
        <path class="ta2-jacket" d="M-45-56 0-34l46-22 6 38L22 2 0-21-23 2l-29-20z"/>
        <path class="ta2-arm" d="M-48-54-96-13-80 10l51-34z"/>
      </g></g>
      <g transform="translate(1190 355)"><g class="ta2-player ta2-p5">
        <circle class="ta2-head" cx="0" cy="-93" r="28"/>
        <path class="ta2-hair" d="M-28-100c10-22 43-25 57 0l-7 8c-10-10-19-14-31-12-7 1-13 4-19 9z"/>
        <path class="ta2-body" d="M-48-58c16-16 31-21 49-21 18 0 34 6 49 22l31 73-27 10-22-46-7 148h-54l-6-105-15 103h-49l18-149-7 57-29-4 16-88z"/>
        <path class="ta2-jacket" d="M-42-48 0-30l43-19 6 36L22 3 0-18-22 3l-27-16z"/>
        <path class="ta2-arm" d="M47-47 93 7 73 25 28-19z"/>
      </g></g>
    </g>`;
}

function starScene() {
  return Array.from({ length: 6 }, (_, index) => {
    const x = 610 + index * 76;
    return `<g transform="translate(${x} 155)"><g class="ta2-star" style="--i:${index}">
      <path d="M0-22 6-7 22-6 10 4 14 20 0 11-14 20-10 4-22-6-6-7Z"/>
      <circle cx="0" cy="0" r="34" class="ta2-star-ring"/>
    </g></g>`;
  }).join('');
}

function sceneSvg() {
  return `<svg class="ta2-scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="presentation" aria-hidden="true">
    <defs>
      <linearGradient id="ta2RedA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f23b4d"/><stop offset=".38" stop-color="#a40d20"/><stop offset="1" stop-color="#32030a"/></linearGradient>
      <linearGradient id="ta2RedB" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5663"/><stop offset=".42" stop-color="#8d0a1c"/><stop offset="1" stop-color="#240207"/></linearGradient>
      <linearGradient id="ta2Gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e4315"/><stop offset=".18" stop-color="#c68b36"/><stop offset=".43" stop-color="#ffe7a4"/><stop offset=".58" stop-color="#f6cd69"/><stop offset=".8" stop-color="#a96822"/><stop offset="1" stop-color="#4a2b0d"/></linearGradient>
      <linearGradient id="ta2GoldVertical" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1bd"/><stop offset=".24" stop-color="#e8b954"/><stop offset=".7" stop-color="#8b531d"/><stop offset="1" stop-color="#4a2b0d"/></linearGradient>
      <linearGradient id="ta2Shadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1215"/><stop offset=".55" stop-color="#090608"/><stop offset="1" stop-color="#020203"/></linearGradient>
      <radialGradient id="ta2Halo"><stop offset="0" stop-color="#ffdf83" stop-opacity=".62"/><stop offset=".28" stop-color="#e84350" stop-opacity=".22"/><stop offset="1" stop-color="#5b0710" stop-opacity="0"/></radialGradient>
      <radialGradient id="ta2Floor"><stop offset="0" stop-color="#d83241" stop-opacity=".23"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>

    <rect width="1600" height="900" fill="#040204"/>
    <ellipse class="ta2-floor" cx="800" cy="660" rx="620" ry="190" fill="url(#ta2Floor)"/>
    <ellipse class="ta2-halo" cx="800" cy="410" rx="400" ry="330" fill="url(#ta2Halo)"/>

    <path class="ta2-ray ray-1" d="M720 0 770 0 835 655 755 655Z"/>
    <path class="ta2-ray ray-2" d="M845 0 885 0 845 655 785 655Z"/>
    <path class="ta2-ray ray-3" d="M570 0 605 0 748 650 695 650Z"/>
    <path class="ta2-ray ray-4" d="M1010 0 1042 0 905 650 855 650Z"/>

    <g class="ta2-cloth-layer cloth-back">
      <path class="ta2-cloth cloth-a" fill="url(#ta2RedA)" d="M-240 140C120 65 330 82 548 184c113 53 243 71 372 30 177-57 361-26 560 106l-52 176c-195-111-359-141-518-89-153 50-313 25-467-47C244 267 69 270-190 342Z"/>
      <path class="ta2-cloth-highlight" d="M-160 170c283-67 485-43 683 51 147 70 289 79 432 31 167-55 322-20 493 83"/>
      <path class="ta2-cloth cloth-b" fill="url(#ta2RedB)" d="M1840 158c-327-66-548-24-753 94-126 73-258 91-394 48-181-57-368-22-563 105l63 170c182-107 352-136 510-85 157 50 315 25 465-58 187-104 374-116 626-64Z"/>
      <path class="ta2-cloth-highlight" d="M1754 192c-287-50-494-11-688 94-153 83-300 95-446 48-169-54-324-17-482 88"/>
    </g>

    <g class="ta2-cloth-layer cloth-front">
      <path class="ta2-cloth cloth-c" fill="url(#ta2RedA)" d="M-260 650c315-129 569-133 789-34 171 77 335 86 493 26 176-67 360-46 576 58l-32 200H-260Z"/>
      <path class="ta2-cloth cloth-d" fill="url(#ta2RedB)" d="M1860 612c-314-93-553-79-757 44-151 91-309 104-474 42-204-76-410-58-652 51l-17 151h1900Z"/>
    </g>

    ${playerScene()}

    <g transform="translate(800 430)"><g class="ta2-trophy">
      <ellipse class="ta2-trophy-aura" cx="0" cy="0" rx="178" ry="220" fill="url(#ta2Halo)"/>
      <path class="ta2-handle left" d="M-78-112C-161-129-177-37-126 15c19 20 43 32 69 39l13-34c-34-9-59-26-72-50-22-42 2-65 43-49Z" fill="none" stroke="url(#ta2Gold)" stroke-width="19" stroke-linecap="round"/>
      <path class="ta2-handle right" d="M78-112C161-129 177-37 126 15c-19 20-43 32-69 39L44 20c34-9 59-26 72-50 22-42-2-65-43-49Z" fill="none" stroke="url(#ta2Gold)" stroke-width="19" stroke-linecap="round"/>
      <path class="ta2-cup-shell" d="M-92-142H92l-9 101C77 24 41 72 0 89-41 72-77 24-83-41Z" fill="url(#ta2Gold)" stroke="#ffe7a4" stroke-opacity=".68" stroke-width="3"/>
      <path class="ta2-cup-inner" d="M-69-122H69l-8 76C56 3 31 42 0 57-31 42-56 3-61-46Z" fill="#5d3510" fill-opacity=".28" stroke="#fff1bd" stroke-opacity=".22" stroke-width="2"/>
      <path class="ta2-cup-rim" d="M-103-143c29-16 177-16 206 0l-10 25c-45 14-141 14-186 0Z" fill="url(#ta2GoldVertical)"/>
      <path class="ta2-cup-facet" d="M-51-118 0 61l51-179-31 177L0 80-20 59Z" fill="#fff2bf" fill-opacity=".16"/>
      <path class="ta2-stem" d="M-19 78H19l13 111h-64Z" fill="url(#ta2GoldVertical)"/>
      <path class="ta2-neck" d="M-45 66H45l-8 34h-74Z" fill="url(#ta2Gold)"/>
      <path class="ta2-base-top" d="M-74 184H74l28 37h-204Z" fill="url(#ta2Gold)"/>
      <path class="ta2-base" d="M-116 218H116l26 48h-284Z" fill="url(#ta2GoldVertical)" stroke="#f7cf72" stroke-opacity=".45" stroke-width="2"/>
      <path class="ta2-metal-sweep" d="M-82-126C-50-36-46 11-7 68" fill="none" stroke="#fff7d7" stroke-width="8" stroke-linecap="round"/>
      <path class="ta2-metal-edge" d="M80-118 70-37C66 13 39 54 3 73" fill="none" stroke="#5b320d" stroke-opacity=".48" stroke-width="6" stroke-linecap="round"/>
    </g></g>

    <g class="ta2-stars">${starScene()}</g>

    <g transform="translate(800 402)"><g class="ta2-crest-svg">
      <path class="ta2-crest-diamond" d="M0-86 86 0 0 86-86 0Z" fill="#8f0d1d" fill-opacity=".82" stroke="url(#ta2Gold)" stroke-width="3"/>
      <path class="ta2-crest-inner" d="M0-64 64 0 0 64-64 0Z" fill="#19070b" fill-opacity=".72" stroke="#f0c66e" stroke-opacity=".5" stroke-width="2"/>
      <path class="ta2-one" d="M-8-40 23-58v113H-5V-16l-25 13v-24Z" fill="url(#ta2GoldVertical)"/>
    </g></g>
  </svg>`;
}

function buildNode(tier) {
  const node = document.createElement('div');
  node.className = `together-finisher-v2 fx-${tier}`;
  node.dataset.togetherFinisher = 'v2';
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = `
    <div class="ta2-vignette"></div>
    <div class="ta2-grain"></div>
    <div class="ta2-letterbox top"></div>
    <div class="ta2-letterbox bottom"></div>
    <div class="ta2-stage">${sceneSvg()}</div>
    <div class="ta2-copy">
      <small>${text().eyebrow}</small>
      <strong>${text().title}</strong>
      <em>${text().sub}</em>
      <i>${text().final}</i>
    </div>
    <div class="ta2-impact-ring ring-a"></div>
    <div class="ta2-impact-ring ring-b"></div>
    <div class="ta2-final-flash"></div>`;
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
  const token = runToken;

  if (reducedMotion.matches || tier === 'reduced') {
    const node = document.createElement('div');
    node.className = 'together-finisher-v2 reduced';
    node.dataset.togetherFinisher = 'v2';
    node.innerHTML = `<div class="ta2-reduced-mark"><small>${text().eyebrow}</small><strong>${text().title}</strong></div>`;
    activeNode = node;
    document.body.appendChild(node);
    document.body.classList.add('together-finisher-active');
    requestAnimationFrame(() => node.classList.add('is-active'));
    later(() => node.classList.add('is-leaving'), 760, token);
    later(() => {
      removeNode(node);
      if (activeNode === node) activeNode = null;
      document.body.classList.remove('together-finisher-active');
      onComplete?.();
    }, 1080, token);
    return 1080;
  }

  const node = buildNode(tier);
  activeNode = node;
  document.body.appendChild(node);
  document.body.classList.add('together-finisher-active');

  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('is-active')));
  later(() => node.classList.add('stage-cloth'), 220, token);
  later(() => node.classList.add('stage-team'), 820, token);
  later(() => node.classList.add('stage-trophy'), 1560, token);
  later(() => node.classList.add('stage-stars'), 2350, token);
  later(() => node.classList.add('stage-crest'), 3070, token);
  later(() => node.classList.add('stage-title'), 3440, token);
  later(() => {
    node.classList.add('stage-impact');
    document.body.classList.add('together-finisher-impact');
  }, 4300, token);
  later(() => document.body.classList.remove('together-finisher-impact'), 4700, token);
  later(() => node.classList.add('is-leaving'), 4890, token);
  later(() => {
    removeNode(node);
    if (activeNode === node) activeNode = null;
    document.body.classList.remove('together-finisher-active', 'together-finisher-impact');
    onComplete?.();
  }, TOGETHER_FINISHER_DURATION, token);

  return TOGETHER_FINISHER_DURATION;
}
