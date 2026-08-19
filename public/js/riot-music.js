import { getLanguage, onLanguageChange } from './i18n.js';

const SETTINGS_KEY = 'rift:riot-official-music:v1';
const RIOT_PLAYLIST = 'https://soundcloud.com/leagueoflegends/sets/riot-games-creator-safe';
const RIOT_GUIDELINES = 'https://www.riotgames.com/en/riot-music-creator-safe-guidelines';

const TRACKS = {
  'riot-sett': { icon: '🥊', title: 'Sett, the Boss', url: 'https://soundcloud.com/leagueoflegends/sett-the-boss' },
  'riot-aphelios': { icon: '🌙', title: 'Aphelios, The Weapon of the Faithful', url: 'https://soundcloud.com/leagueoflegends/aphelios-the-weapon-of-the-faithful' },
  'riot-senna': { icon: '✦', title: 'Senna, the Redeemer', url: 'https://soundcloud.com/leagueoflegends/senna-the-redeemer-ft-the-crystal-method' },
  'riot-lightbringer': { icon: '⚔', title: 'Lightbringer', url: 'https://soundcloud.com/leagueoflegends/lightbringer' },
  'riot-deathfire': { icon: '🔥', title: 'Deathfire Grasp', url: 'https://soundcloud.com/leagueoflegends/deathfire-grasp' }
};

const COPY = {
  vi: {
    title: 'Riot / League of Legends', subtitle: 'Creator-Safe chính thức', enable: 'Phát Riot Music', stop: 'Tắt Riot Music',
    background: 'Nhạc Riot nền', worlds: 'Nhạc Riot khi vào CKTG', autoWorlds: 'Đổi bài Riot riêng khi mở CKTG',
    source: 'Nguồn chính thức', guidelines: 'Quy định Creator-Safe', credit: 'Courtesy of Riot Games • phát từ SoundCloud chính thức',
    note: 'Worlds anthem/K/DA không nằm trong creator-safe list sẽ không được bundle tự động.', loading: 'Đang kết nối SoundCloud…'
  },
  en: {
    title: 'Riot / League of Legends', subtitle: 'Official Creator-Safe', enable: 'Play Riot Music', stop: 'Stop Riot Music',
    background: 'Riot background track', worlds: 'Riot track for Worlds', autoWorlds: 'Use a dedicated Riot track in Worlds',
    source: 'Official source', guidelines: 'Creator-Safe guidelines', credit: 'Courtesy of Riot Games • streamed from official SoundCloud',
    note: 'Worlds anthems/K/DA tracks outside the creator-safe list are not bundled automatically.', loading: 'Connecting to SoundCloud…'
  }
};

let initialized = false;
let settings = loadSettings();
let currentSection = 'dashboard';
let currentTrackId = null;
let iframe = null;
let widget = null;
let widgetReady = false;
let playerHost = null;
let observer = null;
let changing = false;

const lang = () => getLanguage() === 'en' ? 'en' : 'vi';
const text = () => COPY[lang()];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function defaults() {
  return { enabled: false, track: 'riot-sett', worldsTrack: 'riot-lightbringer', autoWorlds: true, volume: 22 };
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') || {};
    return { ...defaults(), ...stored, volume: clamp(Number(stored.volume ?? 22), 0, 100) };
  } catch { return defaults(); }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

function ensureCss() {
  if (document.querySelector('link[data-riot-music]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/riot-music.css?v=3.4.0';
  link.dataset.riotMusic = 'true';
  document.head.appendChild(link);
}

function ensureSoundCloudApi() {
  return new Promise(resolve => {
    if (window.SC?.Widget) return resolve(true);
    const existing = document.querySelector('script[data-soundcloud-widget]');
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.SC?.Widget)), { once: true });
      setTimeout(() => resolve(Boolean(window.SC?.Widget)), 3500);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://w.soundcloud.com/player/api.js';
    script.async = true;
    script.dataset.soundcloudWidget = 'true';
    script.onload = () => resolve(Boolean(window.SC?.Widget));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

function effectiveTrackId() {
  return settings.autoWorlds && currentSection === 'worlds' ? settings.worldsTrack : settings.track;
}

function track(id) { return TRACKS[id] || TRACKS['riot-sett']; }

function optionHtml(selected) {
  return Object.entries(TRACKS).map(([id, item]) => `<option value="${id}" ${selected === id ? 'selected' : ''}>${item.icon} ${item.title}</option>`).join('');
}

function updateBodyState() {
  document.body.classList.toggle('riot-music-playing', settings.enabled && Boolean(currentTrackId));
  document.body.classList.toggle('riot-music-worlds', settings.enabled && settings.autoWorlds && currentSection === 'worlds');
}

function stopOfficial() {
  settings.enabled = false;
  saveSettings();
  currentTrackId = null;
  widgetReady = false;
  try { widget?.pause(); } catch {}
  if (iframe) iframe.remove();
  iframe = null;
  widget = null;
  updateBodyState();
  injectSection();
}

function stopBuiltinMusic() {
  const active = document.querySelector('.music-play-toggle.active[data-music-play]');
  if (active) active.click();
}

async function playOfficial() {
  if (!settings.enabled || changing) return;
  changing = true;
  stopBuiltinMusic();
  const id = effectiveTrackId();
  const item = track(id);

  if (currentTrackId === id && widget && widgetReady) {
    try { widget.setVolume(settings.volume); widget.play(); } catch {}
    changing = false;
    updateBodyState();
    injectSection();
    return;
  }

  currentTrackId = id;
  widgetReady = false;
  try { widget?.pause(); } catch {}
  if (iframe) iframe.remove();

  if (!playerHost) {
    playerHost = document.createElement('div');
    playerHost.className = 'riot-soundcloud-host';
    playerHost.setAttribute('aria-hidden', 'true');
    document.body.appendChild(playerHost);
  }

  iframe = document.createElement('iframe');
  iframe.allow = 'autoplay';
  iframe.title = item.title;
  iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(item.url)}&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false`;
  playerHost.replaceChildren(iframe);
  injectSection(text().loading);

  const apiReady = await ensureSoundCloudApi();
  if (apiReady && iframe?.isConnected) {
    try {
      widget = window.SC.Widget(iframe);
      widget.bind(window.SC.Widget.Events.READY, () => {
        widgetReady = true;
        try { widget.setVolume(settings.volume); widget.play(); } catch {}
        updateBodyState();
        injectSection();
      });
      widget.bind(window.SC.Widget.Events.FINISH, () => {
        try { widget.seekTo(0); widget.play(); } catch {}
      });
    } catch {}
  }

  updateBodyState();
  changing = false;
  injectSection();
}

function setVolume(value) {
  settings.volume = clamp(Number(value), 0, 100);
  saveSettings();
  try { widget?.setVolume(settings.volume); } catch {}
}

function sectionMarkup(status = '') {
  const active = track(effectiveTrackId());
  return `<section class="riot-music-section" data-riot-music-section>
    <div class="riot-music-head"><div><span>R</span><div><b>${text().title}</b><small>${text().subtitle}</small></div></div><em>${settings.enabled ? `♫ ${active.title}` : 'OFF'}</em></div>
    <button type="button" class="riot-music-toggle ${settings.enabled ? 'active' : ''}" data-riot-music-toggle>${settings.enabled ? '■' : '▶'} <span>${settings.enabled ? text().stop : text().enable}</span></button>
    <label class="riot-music-field"><span>${text().background}</span><select data-riot-track>${optionHtml(settings.track)}</select></label>
    <label class="riot-music-field"><span>${text().worlds}</span><select data-riot-worlds-track>${optionHtml(settings.worldsTrack)}</select></label>
    <label class="riot-music-switch"><input type="checkbox" data-riot-auto-worlds ${settings.autoWorlds ? 'checked' : ''}><span></span><b>${text().autoWorlds}</b></label>
    <label class="riot-music-volume"><span>Volume</span><input type="range" min="0" max="100" step="1" value="${settings.volume}" data-riot-volume><b>${settings.volume}%</b></label>
    <div class="riot-music-links"><a href="${RIOT_PLAYLIST}" target="_blank" rel="noreferrer">${text().source} ↗</a><a href="${RIOT_GUIDELINES}" target="_blank" rel="noreferrer">${text().guidelines} ↗</a></div>
    <p class="riot-music-credit">${text().credit}</p><p class="riot-music-note">${text().note}</p>${status ? `<div class="riot-music-status">${status}</div>` : ''}
  </section>`;
}

function injectSection(status = '') {
  const panel = document.querySelector('[data-music-center-panel]');
  if (!panel) return;
  const section = panel.querySelector('[data-riot-music-section]');
  const holder = document.createElement('div');
  holder.innerHTML = sectionMarkup(status);
  const next = holder.firstElementChild;
  if (section) section.replaceWith(next);
  else {
    const privacy = panel.querySelector('.music-privacy');
    if (privacy) privacy.before(next);
    else panel.appendChild(next);
  }
  bindSection(next);
}

function bindSection(section) {
  section.querySelector('[data-riot-music-toggle]')?.addEventListener('click', async () => {
    settings.enabled = !settings.enabled;
    saveSettings();
    if (settings.enabled) await playOfficial(); else stopOfficial();
    injectSection();
  });
  section.querySelector('[data-riot-track]')?.addEventListener('change', async event => {
    settings.track = event.target.value; saveSettings();
    if (settings.enabled && currentSection !== 'worlds') await playOfficial();
    injectSection();
  });
  section.querySelector('[data-riot-worlds-track]')?.addEventListener('change', async event => {
    settings.worldsTrack = event.target.value; saveSettings();
    if (settings.enabled && currentSection === 'worlds' && settings.autoWorlds) await playOfficial();
    injectSection();
  });
  section.querySelector('[data-riot-auto-worlds]')?.addEventListener('change', async event => {
    settings.autoWorlds = event.target.checked; saveSettings();
    if (settings.enabled) await playOfficial();
    injectSection();
  });
  section.querySelector('[data-riot-volume]')?.addEventListener('input', event => {
    setVolume(event.target.value);
    const value = section.querySelector('.riot-music-volume>b');
    if (value) value.textContent = `${settings.volume}%`;
  });
}

function watchMusicPanel() {
  observer = new MutationObserver(() => {
    const panel = document.querySelector('[data-music-center-panel]');
    if (panel && !panel.querySelector('[data-riot-music-section]')) injectSection();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function bindNavigation() {
  document.addEventListener('rift:navigate', async event => {
    const before = effectiveTrackId();
    currentSection = event.detail || 'dashboard';
    const after = effectiveTrackId();
    updateBodyState();
    if (settings.enabled && before !== after) await playOfficial();
    injectSection();
  });
}

function bindBaseMusicConflict() {
  document.addEventListener('click', event => {
    const control = event.target.closest?.('[data-music-play]');
    if (!control || !settings.enabled) return;
    stopOfficial();
  }, true);
}

export function initRiotMusic() {
  if (initialized) return;
  initialized = true;
  ensureCss();
  currentSection = document.querySelector('.page-section.active-section')?.id || 'dashboard';
  watchMusicPanel();
  bindNavigation();
  bindBaseMusicConflict();
  onLanguageChange(() => injectSection());
  requestAnimationFrame(() => injectSection());
}
