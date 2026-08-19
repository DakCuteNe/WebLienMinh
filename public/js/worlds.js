import { esc } from './shared.js';
import { getLanguage, onLanguageChange } from './i18n.js';

const S = (champion, id, skin, player, role = '') => ({ champion, id, skin, player, role });
const X = (champion, id, skin, player, badge, role = '') => ({ champion, id, skin, player, role, badge, special: true });

const WORLDS = [
  { year: 2011, team: 'Fnatic', org: 'Fnatic', short: 'FNC', region: 'EU', accent: '#f1a23c', skins: [
    S('Corki','Corki','Fnatic Corki','Lamia'), S('Gragas','Gragas','Fnatic Gragas','Shushei'),
    S('Janna','Janna','Fnatic Janna','Mellisan'), S('Jarvan IV','JarvanIV','Fnatic Jarvan IV','Cyanide'),
    S('Karthus','Karthus','Fnatic Karthus','xPeke')
  ]},
  { year: 2012, team: 'Taipei Assassins', org: 'Taipei Assassins', short: 'TPA', region: 'TW', accent: '#d4383d', skins: [
    S('Dr. Mundo','DrMundo','TPA Dr. Mundo','Lilballz'), S('Ezreal','Ezreal','TPA Ezreal','Bebe'),
    S('Orianna','Orianna','TPA Orianna','Toyz'), S('Nunu & Willump','Nunu','TPA Nunu','MiSTakE'),
    S('Shen','Shen','TPA Shen','Stanley')
  ]},
  { year: 2013, team: 'SK Telecom T1', org: 'T1', short: 'SKT', region: 'KR', accent: '#e64242', skins: [
    S('Jax','Jax','SKT T1 Jax','Impact','TOP'), S('Lee Sin','LeeSin','SKT T1 Lee Sin','Bengi','JGL'),
    S('Zed','Zed','SKT T1 Zed','Faker','MID'), S('Vayne','Vayne','SKT T1 Vayne','Piglet','BOT'),
    S('Zyra','Zyra','SKT T1 Zyra','PoohManDu','SUP')
  ]},
  { year: 2014, team: 'Samsung White', org: 'Samsung', short: 'SSW', region: 'KR', accent: '#dde8f5', skins: [
    S('Singed','Singed','SSW Singed','Looper','TOP'), S('Rengar','Rengar','SSW Rengar','DanDy','JGL'),
    S('Talon','Talon','SSW Talon','PawN','MID'), S('Twitch','Twitch','SSW Twitch','imp','BOT'),
    S('Thresh','Thresh','SSW Thresh','Mata','SUP')
  ]},
  { year: 2015, team: 'SK Telecom T1', org: 'T1', short: 'SKT', region: 'KR', accent: '#e64242', skins: [
    S('Renekton','Renekton','SKT T1 Renekton','MaRin','TOP'), S('Elise','Elise','SKT T1 Elise','Bengi','JGL'),
    S('Azir','Azir','SKT T1 Azir','Easyhoon','MID'), S('Ryze','Ryze','SKT T1 Ryze','Faker','MID'),
    S('Kalista','Kalista','SKT T1 Kalista','Bang','BOT'), S('Alistar','Alistar','SKT T1 Alistar','Wolf','SUP')
  ]},
  { year: 2016, team: 'SK Telecom T1', org: 'T1', short: 'SKT', region: 'KR', accent: '#e64242', skins: [
    S('Ekko','Ekko','SKT T1 Ekko','Duke','TOP'), S('Olaf','Olaf','SKT T1 Olaf','Bengi','JGL'),
    S('Zac','Zac','SKT T1 Zac','Blank','JGL'), S('Syndra','Syndra','SKT T1 Syndra','Faker','MID'),
    S('Jhin','Jhin','SKT T1 Jhin','Bang','BOT'), S('Nami','Nami','SKT T1 Nami','Wolf','SUP')
  ]},
  { year: 2017, team: 'Samsung Galaxy', org: 'Samsung', short: 'SSG', region: 'KR', accent: '#6d8fd7', skins: [
    S('Gnar','Gnar','SSG Gnar','CuVee','TOP'), S('Jarvan IV','JarvanIV','SSG Jarvan IV','Ambition','JGL'),
    S('Taliyah','Taliyah','SSG Taliyah','Crown','MID'), S('Ezreal','Ezreal','SSG Ezreal','Haru','JGL'),
    S('Xayah','Xayah','SSG Xayah','Ruler','BOT'), S('Rakan','Rakan','SSG Rakan','CoreJJ','SUP')
  ]},
  { year: 2018, team: 'Invictus Gaming', org: 'Invictus Gaming', short: 'IG', region: 'CN', accent: '#e4e8ee', skins: [
    S('Fiora','Fiora','IG Fiora','TheShy','TOP'), S('Irelia','Irelia','IG Irelia','Duke','TOP'),
    S('Camille','Camille','IG Camille','Ning','JGL'), S('LeBlanc','Leblanc','IG LeBlanc','Rookie','MID'),
    S("Kai'Sa",'Kaisa',"IG Kai'Sa",'JackeyLove','BOT'), S('Rakan','Rakan','IG Rakan','Baolan','SUP')
  ]},
  { year: 2019, team: 'FunPlus Phoenix', org: 'FunPlus Phoenix', short: 'FPX', region: 'CN', accent: '#ee7440', skins: [
    S('Gangplank','Gangplank','FPX Gangplank','GimGoon','TOP'), S('Lee Sin','LeeSin','FPX Lee Sin','Tian','JGL'),
    S('Malphite','Malphite','FPX Malphite','Doinb','MID'), S('Vayne','Vayne','FPX Vayne','Lwx','BOT'),
    S('Thresh','Thresh','FPX Thresh','Crisp','SUP')
  ]},
  { year: 2020, team: 'DAMWON Gaming', org: 'DAMWON Gaming', short: 'DWG', region: 'KR', accent: '#55aee8', skins: [
    S('Kennen','Kennen','DWG Kennen','Nuguri','TOP'), S('Nidalee','Nidalee','DWG Nidalee','Canyon','JGL'),
    S('Twisted Fate','TwistedFate','DWG Twisted Fate','ShowMaker','MID'), S('Jhin','Jhin','DWG Jhin','Ghost','BOT'),
    S('Leona','Leona','DWG Leona','BeryL','SUP')
  ]},
  { year: 2021, team: 'Edward Gaming', org: 'Edward Gaming', short: 'EDG', region: 'CN', accent: '#cdd9e9', skins: [
    S('Graves','Graves','EDG Graves','Flandre','TOP'), S('Viego','Viego','EDG Viego','Jiejie','JGL'),
    S('Zoe','Zoe','EDG Zoe','Scout','MID'), S('Aphelios','Aphelios','EDG Aphelios','Viper','BOT'),
    S('Yuumi','Yuumi','EDG Yuumi','Meiko','SUP')
  ]},
  { year: 2022, team: 'DRX', org: 'DRX', short: 'DRX', region: 'KR', accent: '#86b7ff', mvp: 'Kingen', skins: [
    S('Aatrox','Aatrox','DRX Aatrox','Kingen','TOP'), S('Akali','Akali','DRX Akali','Zeka','MID'),
    S('Kindred','Kindred','DRX Kindred','Pyosik','JGL'), S('Caitlyn','Caitlyn','DRX Caitlyn','Deft','BOT'),
    S('Ashe','Ashe','DRX Ashe','BeryL','SUP'), S('Maokai','Maokai','DRX Maokai','Juhan','JGL')
  ], special: X('Aatrox','Aatrox','Prestige DRX Aatrox','Kingen','Finals MVP Prestige','TOP') },
  { year: 2023, team: 'T1', org: 'T1', short: 'T1', region: 'KR', accent: '#e64c4c', mvp: 'Zeus', skins: [
    S('Jayce','Jayce','T1 Jayce','Zeus','TOP'), S('Lee Sin','LeeSin','T1 Lee Sin','Oner','JGL'),
    S('Orianna','Orianna','T1 Orianna','Faker','MID'), S('Jinx','Jinx','T1 Jinx','Gumayusi','BOT'),
    S('Bard','Bard','T1 Bard','Keria','SUP')
  ], special: X('Jayce','Jayce','Prestige T1 Jayce','Zeus','Finals MVP Prestige','TOP') },
  { year: 2024, team: 'T1', org: 'T1', short: 'T1', region: 'KR', accent: '#e64c4c', mvp: 'Faker', skins: [
    S('Gnar','Gnar','T1 Gnar','Zeus','TOP'), S('Vi','Vi','T1 Vi','Oner','JGL'),
    S('Yone','Yone','T1 Yone','Faker','MID'), S('Varus','Varus','T1 Varus','Gumayusi','BOT'),
    S('Pyke','Pyke','T1 Pyke','Keria','SUP')
  ], special: X('Sylas','Sylas','Prestige T1 Sylas','Faker','Worlds MVP Prestige','MID') },
  { year: 2025, team: 'T1', org: 'T1', short: 'T1', region: 'KR', accent: '#f05b5b', mvp: 'Gumayusi', skins: [
    S('Ambessa','Ambessa','T1 Ambessa','Doran','TOP'), S('Xin Zhao','XinZhao','T1 Xin Zhao','Oner','JGL'),
    S('Galio','Galio','T1 Galio','Faker','MID'), S('Yunara','Yunara','T1 Yunara','Gumayusi','BOT'),
    S('Seraphine','Seraphine','T1 Seraphine','Keria','SUP')
  ], special: X('Miss Fortune','MissFortune','MVP T1 Miss Fortune','Gumayusi','Finals MVP Legendary','BOT') }
];

const COPY = {
  vi: {
    nav: 'CKTG', eyebrow: 'WORLD CHAMPIONSHIP • HALL OF CHAMPIONS', title: 'Lịch sử <span>nhà vô địch CKTG</span>',
    lead: 'Đi qua từng mùa CKTG, xem đội nâng Summoner’s Cup, tuyển thủ được vinh danh và bộ trang phục vô địch của họ.',
    editions: 'Mùa CKTG', dynasties: 'Tổ chức từng vô địch', record: 'Kỷ lục danh hiệu', skins: 'Skin vinh danh',
    champion: 'Nhà vô địch', titleCount: 'danh hiệu tính đến năm này', region: 'Khu vực', winnerSkins: 'Bộ skin vô địch',
    special: 'Skin đặc biệt', view: 'Xem artwork', loading: 'Đang tải artwork chính thức...', source: 'Artwork được resolve từ Riot Data Dragon theo skin hiện có.',
    threepeat: 'T1 hoàn tất chuỗi 3 chức vô địch liên tiếp 2023–2025.', noArt: 'Không tìm thấy artwork skin trong Data Dragon hiện tại; đang dùng splash tướng.',
    honors: 'Vinh danh tuyển thủ', openPlayer: 'Mở hồ sơ', roster: 'Tuyển thủ được vinh danh', finalsMvp: 'Finals MVP', skinsCount: 'skin'
  },
  en: {
    nav: 'Worlds', eyebrow: 'WORLD CHAMPIONSHIP • HALL OF CHAMPIONS', title: 'Worlds <span>Hall of Champions</span>',
    lead: 'Travel through every World Championship, see who lifted the Summoner’s Cup, the pros honored by each skin, and their commemorative winner set.',
    editions: 'Worlds editions', dynasties: 'Champion organizations', record: 'Title record', skins: 'Winner skins',
    champion: 'World Champion', titleCount: 'titles through this year', region: 'Region', winnerSkins: 'Worlds winner skins',
    special: 'Special skin', view: 'View artwork', loading: 'Loading official artwork...', source: 'Artwork is resolved from Riot Data Dragon using currently available skin data.',
    threepeat: 'T1 completed the first three-peat from 2023–2025.', noArt: 'Skin artwork was not found in the current Data Dragon set; showing the champion splash instead.',
    honors: 'Honors pro player', openPlayer: 'Open profile', roster: 'Honored players', finalsMvp: 'Finals MVP', skinsCount: 'skins'
  }
};

let activeYear = 2025;
let section = null;
let navButton = null;
let ddVersion = null;
const championCache = new Map();
let renderToken = 0;
let sectionObserver = null;

function lang() { return getLanguage() === 'en' ? 'en' : 'vi'; }
function c() { return COPY[lang()]; }
function normalize(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function words(value) { return String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }
function baseSplash(id) { return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${encodeURIComponent(id)}_0.jpg`; }
function initials(player) {
  const parts = String(player || '?').replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, 2).map(x => x[0]).join('') : String(player || '?').slice(0, 2)).toUpperCase();
}

async function getVersion() {
  if (ddVersion) return ddVersion;
  try {
    const response = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', { cache: 'force-cache' });
    const versions = await response.json();
    ddVersion = versions?.[0] || '16.16.1';
  } catch { ddVersion = '16.16.1'; }
  return ddVersion;
}

async function getChampion(id) {
  if (championCache.has(id)) return championCache.get(id);
  const promise = (async () => {
    const version = await getVersion();
    const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${encodeURIComponent(id)}.json`, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Data Dragon ${response.status}`);
    const body = await response.json();
    return body.data?.[id] || Object.values(body.data || {})[0] || null;
  })();
  championCache.set(id, promise);
  return promise;
}

function matchesSkinTheme(skinName, wanted, champion) {
  const skinNormalized = normalize(skinName);
  const wantedNormalized = normalize(wanted);
  if (skinNormalized === wantedNormalized || skinNormalized.includes(wantedNormalized) || wantedNormalized.includes(skinNormalized)) return true;
  const theme = wanted.replace(champion, '').trim();
  const themeWords = words(theme);
  if (!themeWords.length) return false;
  const skinWords = new Set(words(skinName));
  return themeWords.every(word => skinWords.has(word));
}

async function resolveSkin(entry) {
  try {
    const data = await getChampion(entry.id);
    const skins = data?.skins || [];
    const match = skins.find(skin => matchesSkinTheme(skin.name, entry.skin, entry.champion));
    if (!match) return { url: baseSplash(entry.id), found: false, actual: entry.skin };
    return {
      url: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${encodeURIComponent(entry.id)}_${match.num}.jpg`,
      found: true,
      actual: match.name
    };
  } catch {
    return { url: baseSplash(entry.id), found: false, actual: entry.skin };
  }
}

function titleCount(row) {
  return WORLDS.filter(x => x.year <= row.year && x.org === row.org).length;
}

function uniqueChampions() { return new Set(WORLDS.map(x => x.org)).size; }
function totalSkins() { return WORLDS.reduce((sum, x) => sum + x.skins.length + (x.special ? 1 : 0), 0); }

function honoredPlayers(row) {
  const seen = new Set();
  return [...row.skins, ...(row.special ? [row.special] : [])].filter(entry => {
    const key = normalize(entry.player);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ensureCss() {
  const sheets = [
    ['/worlds.css', 'base'],
    ['/worlds-effects.css', 'effects']
  ];
  for (const [href, layer] of sheets) {
    if (document.querySelector(`link[data-worlds-hall="${layer}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.worldsHall = layer;
    document.head.appendChild(link);
  }
}

function ensureStructure() {
  ensureCss();
  const nav = document.getElementById('nav');
  if (nav && !document.querySelector('.nav-btn[data-section="worlds"]')) {
    navButton = document.createElement('button');
    navButton.className = 'nav-btn';
    navButton.dataset.section = 'worlds';
    const patch = nav.querySelector('[data-section="patch"]');
    nav.insertBefore(navButton, patch || null);
  } else navButton = document.querySelector('.nav-btn[data-section="worlds"]');

  const main = document.querySelector('main');
  if (main && !document.getElementById('worlds')) {
    section = document.createElement('section');
    section.id = 'worlds';
    section.className = 'page-section worlds-section';
    main.appendChild(section);
  } else section = document.getElementById('worlds');

  if (section && !sectionObserver) {
    const sync = () => document.body.classList.toggle('worlds-active', section.classList.contains('active-section'));
    sectionObserver = new MutationObserver(sync);
    sectionObserver.observe(section, { attributes: true, attributeFilter: ['class'] });
    sync();
  }
}

function timelineHtml() {
  return `<div class="worlds-years" role="tablist" aria-label="World Championship years">${[...WORLDS].reverse().map(row => `
    <button type="button" role="tab" aria-selected="${row.year === activeYear}" class="world-year ${row.year === activeYear ? 'active' : ''}" data-world-year="${row.year}" style="--team-accent:${row.accent}">
      <span>${row.year}</span><b>${esc(row.short)}</b>
    </button>`).join('')}</div>`;
}

function skinCard(entry) {
  const special = Boolean(entry.special);
  return `<article class="world-skin ${special ? 'special' : ''}" data-skin-id="${esc(entry.id)}" data-skin-name="${esc(entry.skin)}" data-player="${esc(entry.player)}">
    <div class="world-skin-art">
      <img src="${baseSplash(entry.id)}" alt="${esc(entry.skin)}" loading="lazy">
      <div class="skin-shine"></div>
      <div class="skin-player-watermark" aria-hidden="true">${esc(initials(entry.player))}</div>
      ${special ? `<span class="skin-special-badge">✦ ${esc(entry.badge || c().special)}</span>` : ''}
    </div>
    <div class="world-skin-copy">
      <small>${esc(entry.champion)}</small>
      <b>${esc(entry.skin)}</b>
      <div class="world-skin-honoree">
        <span class="honoree-mark">${esc(initials(entry.player))}</span>
        <div><small>${esc(c().honors)}</small><strong>${esc(entry.player)}</strong>${entry.role ? `<em>${esc(entry.role)}</em>` : ''}</div>
        <button type="button" class="world-player-open" data-world-player="${esc(entry.player)}" title="${esc(c().openPlayer)}">↗</button>
      </div>
      <span class="skin-resolution">${esc(c().loading)}</span>
      <button type="button" class="world-skin-view">↗ ${esc(c().view)}</button>
    </div>
  </article>`;
}

function rosterHtml(row) {
  return `<div class="worlds-roster-strip"><small>${esc(c().roster)}</small><div>${honoredPlayers(row).map(entry => `
    <button type="button" class="worlds-roster-player ${row.mvp === entry.player ? 'mvp' : ''}" data-world-player="${esc(entry.player)}">
      <span>${esc(initials(entry.player))}</span><b>${esc(entry.player)}</b>${entry.role ? `<em>${esc(entry.role)}</em>` : ''}${row.mvp === entry.player ? `<i>★ ${esc(c().finalsMvp)}</i>` : ''}
    </button>`).join('')}</div></div>`;
}

function selectedHtml(row) {
  const count = titleCount(row);
  const entries = [...row.skins, ...(row.special ? [row.special] : [])];
  return `<div class="worlds-selected" style="--world-accent:${row.accent}">
    <div class="worlds-stage-fx" aria-hidden="true"><span></span><span></span><span></span><b></b></div>
    <div class="worlds-champion-card">
      <div class="worlds-trophy-mark"><span>✦</span><b>${row.year}</b><i></i></div>
      <div class="worlds-champion-copy"><small>${esc(c().champion)}</small><h2>${esc(row.team)}</h2><div class="worlds-champion-meta"><span>🏆 ${count} ${esc(c().titleCount)}</span><span>◎ ${esc(row.region)} • ${esc(c().region)}</span>${row.mvp ? `<span class="worlds-mvp-meta">★ ${esc(c().finalsMvp)} • ${esc(row.mvp)}</span>` : ''}</div></div>
      ${row.year === 2025 ? `<div class="threepeat-chip">Ⅲ ${esc(c().threepeat)}</div>` : ''}
    </div>
    ${rosterHtml(row)}
    <div class="worlds-skins-head"><div><small>${esc(c().skins)}</small><h3>${esc(c().winnerSkins)} • ${row.year}</h3></div><span>${entries.length} ${esc(c().skinsCount)}</span></div>
    <div class="world-skin-grid">${entries.map(skinCard).join('')}</div>
    <p class="worlds-source">ⓘ ${esc(c().source)}</p>
  </div>`;
}

function updateWorldsAccent(row) {
  document.documentElement.style.setProperty('--worlds-accent', row.accent);
}

function playYearBurst() {
  const selected = section?.querySelector('.worlds-selected');
  if (!selected || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const burst = document.createElement('div');
  burst.className = 'worlds-burst';
  burst.setAttribute('aria-hidden', 'true');
  burst.innerHTML = Array.from({ length: 14 }, (_, i) => `<i style="--i:${i};--a:${(i * 360 / 14).toFixed(2)}deg"></i>`).join('');
  selected.prepend(burst);
  burst.addEventListener('animationend', () => burst.remove(), { once: true });
  setTimeout(() => burst.remove(), 1100);
}

function navigateToPlayer(player) {
  if (!player) return;
  document.dispatchEvent(new CustomEvent('rift:navigate', { detail: 'esports' }));
  let tries = 0;
  const timer = setInterval(() => {
    const input = document.getElementById('playerSearch');
    if (input) {
      input.value = player;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      clearInterval(timer);
      return;
    }
    if (++tries > 16) clearInterval(timer);
  }, 80);
}

function bindPlayerLinks() {
  section?.querySelectorAll('[data-world-player]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      navigateToPlayer(button.dataset.worldPlayer);
    });
  });
}

function render({ burst = false } = {}) {
  if (!section) return;
  const copy = c();
  if (navButton) navButton.textContent = copy.nav;
  const row = WORLDS.find(x => x.year === activeYear) || WORLDS[WORLDS.length - 1];
  updateWorldsAccent(row);
  section.innerHTML = `<div class="worlds-hero">
    <div class="worlds-crown" aria-hidden="true"><span></span><span></span><span></span><b>W</b><i></i></div>
    <div><div class="eyebrow">${esc(copy.eyebrow)}</div><h1>${copy.title}</h1><p>${esc(copy.lead)}</p></div>
    <div class="worlds-stats"><div><small>${esc(copy.editions)}</small><b>${WORLDS.length}</b></div><div><small>${esc(copy.dynasties)}</small><b>${uniqueChampions()}</b></div><div><small>${esc(copy.record)}</small><b>T1 • 6</b></div><div><small>${esc(copy.skins)}</small><b>${totalSkins()}</b></div></div>
  </div>${timelineHtml()}${selectedHtml(row)}`;

  section.querySelectorAll('[data-world-year]').forEach(button => button.addEventListener('click', () => {
    if (Number(button.dataset.worldYear) === activeYear) return;
    activeYear = Number(button.dataset.worldYear);
    render({ burst: true });
    section.querySelector('.worlds-selected')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }));
  bindPlayerLinks();
  if (burst) requestAnimationFrame(playYearBurst);
  resolveVisibleSkins(row);
}

async function resolveVisibleSkins(row) {
  const token = ++renderToken;
  const entries = [...row.skins, ...(row.special ? [row.special] : [])];
  const results = await Promise.all(entries.map(resolveSkin));
  if (token !== renderToken || !section) return;
  const cards = [...section.querySelectorAll('.world-skin')];
  cards.forEach((card, index) => {
    const result = results[index];
    if (!result) return;
    const image = card.querySelector('img');
    const resolution = card.querySelector('.skin-resolution');
    if (image) image.src = result.url;
    if (resolution) resolution.textContent = result.found ? result.actual : c().noArt;
    card.classList.toggle('fallback-art', !result.found);
    card.querySelector('.world-skin-view')?.addEventListener('click', () => {
      window.open(result.url, '_blank', 'noopener,noreferrer');
    });
  });
}

export function initWorlds() {
  ensureStructure();
  render();
  onLanguageChange(() => render());
}
