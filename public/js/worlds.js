import { esc } from './shared.js';
import { getLanguage, onLanguageChange } from './i18n.js';

const WORLDS = [
  { year: 2011, team: 'Fnatic', org: 'Fnatic', short: 'FNC', region: 'EU', accent: '#f1a23c', skins: [
    ['Corki','Corki','Fnatic Corki'],['Gragas','Gragas','Fnatic Gragas'],['Janna','Janna','Fnatic Janna'],['Jarvan IV','JarvanIV','Fnatic Jarvan IV'],['Karthus','Karthus','Fnatic Karthus']
  ]},
  { year: 2012, team: 'Taipei Assassins', org: 'Taipei Assassins', short: 'TPA', region: 'TW', accent: '#d4383d', skins: [
    ['Dr. Mundo','DrMundo','TPA Dr. Mundo'],['Ezreal','Ezreal','TPA Ezreal'],['Orianna','Orianna','TPA Orianna'],['Nunu & Willump','Nunu','TPA Nunu'],['Shen','Shen','TPA Shen']
  ]},
  { year: 2013, team: 'SK Telecom T1', org: 'T1', short: 'SKT', region: 'KR', accent: '#e64242', skins: [
    ['Jax','Jax','SKT T1 Jax'],['Lee Sin','LeeSin','SKT T1 Lee Sin'],['Zed','Zed','SKT T1 Zed'],['Vayne','Vayne','SKT T1 Vayne'],['Zyra','Zyra','SKT T1 Zyra']
  ]},
  { year: 2014, team: 'Samsung White', org: 'Samsung', short: 'SSW', region: 'KR', accent: '#dde8f5', skins: [
    ['Singed','Singed','SSW Singed'],['Rengar','Rengar','SSW Rengar'],['Talon','Talon','SSW Talon'],['Twitch','Twitch','SSW Twitch'],['Thresh','Thresh','SSW Thresh']
  ]},
  { year: 2015, team: 'SK Telecom T1', org: 'T1', short: 'SKT', region: 'KR', accent: '#e64242', skins: [
    ['Renekton','Renekton','SKT T1 Renekton'],['Elise','Elise','SKT T1 Elise'],['Azir','Azir','SKT T1 Azir'],['Ryze','Ryze','SKT T1 Ryze'],['Kalista','Kalista','SKT T1 Kalista'],['Alistar','Alistar','SKT T1 Alistar']
  ]},
  { year: 2016, team: 'SK Telecom T1', org: 'T1', short: 'SKT', region: 'KR', accent: '#e64242', skins: [
    ['Ekko','Ekko','SKT T1 Ekko'],['Olaf','Olaf','SKT T1 Olaf'],['Zac','Zac','SKT T1 Zac'],['Syndra','Syndra','SKT T1 Syndra'],['Jhin','Jhin','SKT T1 Jhin'],['Nami','Nami','SKT T1 Nami']
  ]},
  { year: 2017, team: 'Samsung Galaxy', org: 'Samsung', short: 'SSG', region: 'KR', accent: '#6d8fd7', skins: [
    ['Gnar','Gnar','SSG Gnar'],['Jarvan IV','JarvanIV','SSG Jarvan IV'],['Taliyah','Taliyah','SSG Taliyah'],['Ezreal','Ezreal','SSG Ezreal'],['Xayah','Xayah','SSG Xayah'],['Rakan','Rakan','SSG Rakan']
  ]},
  { year: 2018, team: 'Invictus Gaming', org: 'Invictus Gaming', short: 'IG', region: 'CN', accent: '#e4e8ee', skins: [
    ['Fiora','Fiora','IG Fiora'],['Irelia','Irelia','IG Irelia'],['Camille','Camille','IG Camille'],['LeBlanc','Leblanc','IG LeBlanc'],["Kai'Sa",'Kaisa',"IG Kai'Sa"],['Rakan','Rakan','IG Rakan']
  ]},
  { year: 2019, team: 'FunPlus Phoenix', org: 'FunPlus Phoenix', short: 'FPX', region: 'CN', accent: '#ee7440', skins: [
    ['Gangplank','Gangplank','FPX Gangplank'],['Lee Sin','LeeSin','FPX Lee Sin'],['Malphite','Malphite','FPX Malphite'],['Vayne','Vayne','FPX Vayne'],['Thresh','Thresh','FPX Thresh']
  ]},
  { year: 2020, team: 'DAMWON Gaming', org: 'DAMWON Gaming', short: 'DWG', region: 'KR', accent: '#55aee8', skins: [
    ['Kennen','Kennen','DWG Kennen'],['Nidalee','Nidalee','DWG Nidalee'],['Twisted Fate','TwistedFate','DWG Twisted Fate'],['Jhin','Jhin','DWG Jhin'],['Leona','Leona','DWG Leona']
  ]},
  { year: 2021, team: 'Edward Gaming', org: 'Edward Gaming', short: 'EDG', region: 'CN', accent: '#cdd9e9', skins: [
    ['Graves','Graves','EDG Graves'],['Viego','Viego','EDG Viego'],['Zoe','Zoe','EDG Zoe'],['Aphelios','Aphelios','EDG Aphelios'],['Yuumi','Yuumi','EDG Yuumi']
  ]},
  { year: 2022, team: 'DRX', org: 'DRX', short: 'DRX', region: 'KR', accent: '#86b7ff', skins: [
    ['Aatrox','Aatrox','DRX Aatrox'],['Akali','Akali','DRX Akali'],['Kindred','Kindred','DRX Kindred'],['Caitlyn','Caitlyn','DRX Caitlyn'],['Ashe','Ashe','DRX Ashe'],['Maokai','Maokai','DRX Maokai']
  ], special: ['Aatrox','Aatrox','Prestige DRX Aatrox','Finals MVP Prestige'] },
  { year: 2023, team: 'T1', org: 'T1', short: 'T1', region: 'KR', accent: '#e64c4c', skins: [
    ['Jayce','Jayce','T1 Jayce'],['Lee Sin','LeeSin','T1 Lee Sin'],['Orianna','Orianna','T1 Orianna'],['Jinx','Jinx','T1 Jinx'],['Bard','Bard','T1 Bard']
  ], special: ['Jayce','Jayce','Prestige T1 Jayce','Finals MVP Prestige'] },
  { year: 2024, team: 'T1', org: 'T1', short: 'T1', region: 'KR', accent: '#e64c4c', skins: [
    ['Gnar','Gnar','T1 Gnar'],['Vi','Vi','T1 Vi'],['Yone','Yone','T1 Yone'],['Varus','Varus','T1 Varus'],['Pyke','Pyke','T1 Pyke']
  ], special: ['Sylas','Sylas','Prestige T1 Sylas','Worlds MVP Prestige'] },
  { year: 2025, team: 'T1', org: 'T1', short: 'T1', region: 'KR', accent: '#f05b5b', skins: [
    ['Ambessa','Ambessa','T1 Ambessa'],['Xin Zhao','XinZhao','T1 Xin Zhao'],['Galio','Galio','T1 Galio'],['Yunara','Yunara','T1 Yunara'],['Seraphine','Seraphine','T1 Seraphine']
  ], special: ['Miss Fortune','MissFortune','MVP T1 Miss Fortune','MVP Legendary'] }
];

const COPY = {
  vi: {
    nav: 'CKTG', eyebrow: 'WORLD CHAMPIONSHIP • HALL OF CHAMPIONS', title: 'Lịch sử <span>nhà vô địch CKTG</span>',
    lead: 'Đi qua từng mùa CKTG, xem đội nâng Summoner’s Cup và bộ trang phục vinh danh được tạo cho nhà vô địch.',
    editions: 'Mùa CKTG', dynasties: 'Tổ chức từng vô địch', record: 'Kỷ lục danh hiệu', skins: 'Skin vinh danh',
    champion: 'Nhà vô địch', titleCount: 'danh hiệu tính đến năm này', region: 'Khu vực', winnerSkins: 'Bộ skin vô địch',
    special: 'Skin đặc biệt', view: 'Xem artwork', loading: 'Đang tải artwork chính thức...', source: 'Artwork được resolve từ Riot Data Dragon theo skin hiện có.',
    threepeat: 'T1 hoàn tất chuỗi 3 chức vô địch liên tiếp 2023–2025.', noArt: 'Không tìm thấy artwork skin trong Data Dragon hiện tại; đang dùng splash tướng.'
  },
  en: {
    nav: 'Worlds', eyebrow: 'WORLD CHAMPIONSHIP • HALL OF CHAMPIONS', title: 'Worlds <span>Hall of Champions</span>',
    lead: 'Travel through every World Championship, see who lifted the Summoner’s Cup, and explore the commemorative winner skins created for each champion.',
    editions: 'Worlds editions', dynasties: 'Champion organizations', record: 'Title record', skins: 'Winner skins',
    champion: 'World Champion', titleCount: 'titles through this year', region: 'Region', winnerSkins: 'Worlds winner skins',
    special: 'Special skin', view: 'View artwork', loading: 'Loading official artwork...', source: 'Artwork is resolved from Riot Data Dragon using currently available skin data.',
    threepeat: 'T1 completed the first three-peat from 2023–2025.', noArt: 'Skin artwork was not found in the current Data Dragon set; showing the champion splash instead.'
  }
};

let activeYear = 2025;
let section = null;
let navButton = null;
let ddVersion = null;
const championCache = new Map();
let renderToken = 0;

function lang() { return getLanguage() === 'en' ? 'en' : 'vi'; }
function c() { return COPY[lang()]; }
function normalize(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function words(value) { return String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }
function baseSplash(id) { return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${encodeURIComponent(id)}_0.jpg`; }

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
  const [champion, id, wanted] = entry;
  try {
    const data = await getChampion(id);
    const skins = data?.skins || [];
    const match = skins.find(skin => matchesSkinTheme(skin.name, wanted, champion));
    if (!match) return { url: baseSplash(id), found: false, actual: wanted };
    return {
      url: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${encodeURIComponent(id)}_${match.num}.jpg`,
      found: true,
      actual: match.name
    };
  } catch {
    return { url: baseSplash(id), found: false, actual: wanted };
  }
}

function titleCount(row) {
  return WORLDS.filter(x => x.year <= row.year && x.org === row.org).length;
}

function uniqueChampions() { return new Set(WORLDS.map(x => x.org)).size; }
function totalSkins() { return WORLDS.reduce((sum, x) => sum + x.skins.length + (x.special ? 1 : 0), 0); }

function ensureCss() {
  if (document.querySelector('link[data-worlds-hall]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/worlds.css';
  link.dataset.worldsHall = 'true';
  document.head.appendChild(link);
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
}

function timelineHtml() {
  return `<div class="worlds-years" role="tablist" aria-label="World Championship years">${[...WORLDS].reverse().map(row => `
    <button type="button" role="tab" aria-selected="${row.year === activeYear}" class="world-year ${row.year === activeYear ? 'active' : ''}" data-world-year="${row.year}" style="--team-accent:${row.accent}">
      <span>${row.year}</span><b>${esc(row.short)}</b>
    </button>`).join('')}</div>`;
}

function skinCard(entry, special = false) {
  const [champion, id, skin, badge] = entry;
  return `<article class="world-skin ${special ? 'special' : ''}" data-skin-id="${esc(id)}" data-skin-name="${esc(skin)}">
    <div class="world-skin-art"><img src="${baseSplash(id)}" alt="${esc(skin)}" loading="lazy"><div class="skin-shine"></div>${special ? `<span class="skin-special-badge">✦ ${esc(badge || c().special)}</span>` : ''}</div>
    <div class="world-skin-copy"><small>${esc(champion)}</small><b>${esc(skin)}</b><span class="skin-resolution">${esc(c().loading)}</span><button type="button" class="world-skin-view">↗ ${esc(c().view)}</button></div>
  </article>`;
}

function selectedHtml(row) {
  const count = titleCount(row);
  return `<div class="worlds-selected" style="--world-accent:${row.accent}">
    <div class="worlds-champion-card">
      <div class="worlds-trophy-mark"><span>✦</span><b>${row.year}</b></div>
      <div class="worlds-champion-copy"><small>${esc(c().champion)}</small><h2>${esc(row.team)}</h2><div class="worlds-champion-meta"><span>🏆 ${count} ${esc(c().titleCount)}</span><span>◎ ${esc(row.region)} • ${esc(c().region)}</span></div></div>
      ${row.year === 2025 ? `<div class="threepeat-chip">Ⅲ ${esc(c().threepeat)}</div>` : ''}
    </div>
    <div class="worlds-skins-head"><div><small>${esc(c().skins)}</small><h3>${esc(c().winnerSkins)} • ${row.year}</h3></div><span>${row.skins.length + (row.special ? 1 : 0)} skins</span></div>
    <div class="world-skin-grid">${row.skins.map(x => skinCard(x)).join('')}${row.special ? skinCard(row.special, true) : ''}</div>
    <p class="worlds-source">ⓘ ${esc(c().source)}</p>
  </div>`;
}

function render() {
  if (!section) return;
  const copy = c();
  if (navButton) navButton.textContent = copy.nav;
  const row = WORLDS.find(x => x.year === activeYear) || WORLDS[WORLDS.length - 1];
  section.innerHTML = `<div class="worlds-hero">
    <div class="worlds-crown" aria-hidden="true"><span></span><span></span><span></span><b>W</b></div>
    <div><div class="eyebrow">${esc(copy.eyebrow)}</div><h1>${copy.title}</h1><p>${esc(copy.lead)}</p></div>
    <div class="worlds-stats"><div><small>${esc(copy.editions)}</small><b>${WORLDS.length}</b></div><div><small>${esc(copy.dynasties)}</small><b>${uniqueChampions()}</b></div><div><small>${esc(copy.record)}</small><b>T1 • 6</b></div><div><small>${esc(copy.skins)}</small><b>${totalSkins()}</b></div></div>
  </div>${timelineHtml()}${selectedHtml(row)}`;

  section.querySelectorAll('[data-world-year]').forEach(button => button.addEventListener('click', () => {
    activeYear = Number(button.dataset.worldYear);
    render();
    document.querySelector('.worlds-selected')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }));
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
  onLanguageChange(render);
}
