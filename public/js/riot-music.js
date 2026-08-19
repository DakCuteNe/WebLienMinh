import { getLanguage, onLanguageChange } from './i18n.js';

const SETTINGS_KEY = 'rift:riot-youtube-music:v1';
const YOUTUBE_CHANNEL = 'https://www.youtube.com/@leagueoflegends';

const TRACKS = {
  'yt-rise': {
    icon: '⛰',
    title: 'RISE',
    subtitle: 'Worlds 2018 • The Glitch Mob, Mako & The Word Alive',
    videoId: 'fB8TyLTD7EE',
    year: 2018
  },
  'yt-legends': {
    icon: '♜',
    title: 'Legends Never Die',
    subtitle: 'Worlds 2017 • Against The Current',
    videoId: 'r6zIGXun57U',
    year: 2017
  },
  'yt-gods': {
    icon: '⚡',
    title: 'GODS',
    subtitle: 'Worlds 2023 • NewJeans',
    videoId: 'C3GouGa0noM',
    year: 2023
  },
  'yt-heavy': {
    icon: '♛',
    title: 'Heavy Is The Crown',
    subtitle: 'Worlds 2024 • Linkin Park',
    videoId: '5FrhtahQiRc',
    year: 2024
  },
  'yt-sacrifice': {
    icon: '✦',
    title: 'Sacrifice',
    subtitle: 'Worlds 2025 • G.E.M. (鄧紫棋)',
    videoId: 'pzt6SmvGpXk',
    year: 2025
  }
};

const COPY = {
  vi: {
    title: 'YouTube • League of Legends',
    subtitle: 'Nhạc / Worlds anthem từ kênh chính thức',
    enable: 'Phát YouTube Riot Music',
    stop: 'Tắt YouTube Riot Music',
    background: 'Nhạc nền YouTube',
    worlds: 'Nhạc khi vào CKTG',
    autoWorlds: 'Tự đổi anthem khi mở CKTG',
    volume: 'Âm lượng',
    channel: 'Kênh League of Legends',
    openVideo: 'Mở video trên YouTube',
    credit: 'Phát bằng YouTube Embed chính thức • không tải/re-upload file nhạc lên WebLienMinh',
    note: 'YouTube yêu cầu player phải hiển thị khi đang phát. Đóng player = dừng nhạc.',
    loading: 'Đang kết nối YouTube…',
    unavailable: 'YouTube player không khả dụng hoặc video không cho phép nhúng.',
    dock: 'Riot Music • YouTube',
    close: 'Dừng và đóng player',
    session: 'Vì chính sách autoplay, mỗi lần mở lại trang bạn cần bấm Phát một lần.'
  },
  en: {
    title: 'YouTube • League of Legends',
    subtitle: 'Music / Worlds anthems from the official channel',
    enable: 'Play Riot Music on YouTube',
    stop: 'Stop Riot Music',
    background: 'YouTube background track',
    worlds: 'Track when opening Worlds',
    autoWorlds: 'Switch anthem automatically in Worlds',
    volume: 'Volume',
    channel: 'League of Legends channel',
    openVideo: 'Open video on YouTube',
    credit: 'Played through the official YouTube embed • no Riot audio files are re-uploaded to WebLienMinh',
    note: 'YouTube requires the player to stay visible while playing. Closing the player stops playback.',
    loading: 'Connecting to YouTube…',
    unavailable: 'The YouTube player is unavailable or this video cannot be embedded.',
    dock: 'Riot Music • YouTube',
    close: 'Stop and close player',
    session: 'Due to autoplay rules, press Play once again after reopening the page.'
  }
};

let initialized = false;
let currentSection = 'dashboard';
let currentTrackId = null;
let settings = loadSettings();
let player = null;
let playerReady = false;
let playerDock = null;
let playerHost = null;
let observer = null;
let changing = false;
let youtubeApiPromise = null;

const lang = () => getLanguage() === 'en' ? 'en' : 'vi';
const text = () => COPY[lang()];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function defaults() {
  return {
    enabled: false,
    track: 'yt-rise',
    worldsTrack: 'yt-sacrifice',
    autoWorlds: true,
    volume: 35
  };
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') || {};
    const merged = {
      ...defaults(),
      ...saved,
      volume: clamp(Number(saved.volume ?? 35), 0, 100)
    };
    // Playback never resumes automatically after a full page reload.
    merged.enabled = false;
    return merged;
  } catch {
    return defaults();
  }
}

function saveSettings() {
  try {
    const { enabled: _enabled, ...persistent } = settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(persistent));
  } catch {}
}

function ensureCss() {
  if (document.querySelector('link[data-riot-music]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/riot-music.css?v=3.5.0';
  link.dataset.riotMusic = 'true';
  document.head.appendChild(link);
}

function effectiveTrackId() {
  return settings.autoWorlds && currentSection === 'worlds' ? settings.worldsTrack : settings.track;
}

function track(id) {
  return TRACKS[id] || TRACKS['yt-rise'];
}

function youtubeUrl(id) {
  return `https://www.youtube.com/watch?v=${track(id).videoId}`;
}

function options(selected) {
  return Object.entries(TRACKS)
    .sort((a, b) => Number(b[1].year || 0) - Number(a[1].year || 0))
    .map(([id, item]) => `<option value="${id}" ${selected === id ? 'selected' : ''}>${item.icon} ${item.title} • ${item.year}</option>`)
    .join('');
}

function updateBody() {
  document.body.classList.toggle('riot-music-playing', settings.enabled && Boolean(currentTrackId));
  document.body.classList.toggle('riot-music-worlds', settings.enabled && settings.autoWorlds && currentSection === 'worlds');
}

function ensureYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(true);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise(resolve => {
    const previousReady = window.onYouTubeIframeAPIReady;
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      resolve(Boolean(ok));
    };

    window.onYouTubeIframeAPIReady = () => {
      try { previousReady?.(); } catch {}
      finish(Boolean(window.YT?.Player));
    };

    const existing = document.querySelector('script[data-youtube-iframe-api]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.youtubeIframeApi = 'true';
      script.onerror = () => finish(false);
      document.head.appendChild(script);
    }

    const poll = setInterval(() => {
      if (window.YT?.Player) {
        clearInterval(poll);
        finish(true);
      }
    }, 120);
    setTimeout(() => {
      clearInterval(poll);
      finish(Boolean(window.YT?.Player));
    }, 6000);
  });

  return youtubeApiPromise;
}

function ensureDock() {
  if (playerDock?.isConnected) return playerDock;

  playerDock = document.createElement('aside');
  playerDock.className = 'riot-youtube-dock';
  playerDock.dataset.riotYoutubeDock = 'true';
  playerDock.innerHTML = `
    <div class="riot-youtube-dock-head">
      <div><span>▶</span><div><b>${text().dock}</b><small data-riot-youtube-now>—</small></div></div>
      <div class="riot-youtube-dock-actions">
        <a data-riot-youtube-open target="_blank" rel="noreferrer" aria-label="${text().openVideo}">↗</a>
        <button type="button" data-riot-youtube-close aria-label="${text().close}">×</button>
      </div>
    </div>
    <div class="riot-youtube-player-shell"><div id="riotYoutubePlayer"></div></div>`;
  document.body.appendChild(playerDock);
  playerHost = playerDock.querySelector('#riotYoutubePlayer');
  playerDock.querySelector('[data-riot-youtube-close]')?.addEventListener('click', stopOfficial);
  updateDock();
  return playerDock;
}

function updateDock() {
  if (!playerDock?.isConnected) return;
  const item = track(effectiveTrackId());
  const now = playerDock.querySelector('[data-riot-youtube-now]');
  const open = playerDock.querySelector('[data-riot-youtube-open]');
  if (now) now.textContent = `${item.title} • ${item.subtitle}`;
  if (open) {
    open.href = youtubeUrl(effectiveTrackId());
    open.title = text().openVideo;
  }
  const title = playerDock.querySelector('.riot-youtube-dock-head b');
  if (title) title.textContent = text().dock;
  const close = playerDock.querySelector('[data-riot-youtube-close]');
  if (close) close.setAttribute('aria-label', text().close);
}

function destroyPlayer() {
  playerReady = false;
  try { player?.stopVideo?.(); } catch {}
  try { player?.destroy?.(); } catch {}
  player = null;
  playerHost = null;
  playerDock?.remove();
  playerDock = null;
}

function stopOfficial() {
  settings.enabled = false;
  currentTrackId = null;
  destroyPlayer();
  updateBody();
  inject();
}

function stopBuiltin() {
  const active = document.querySelector('.music-play-toggle.active[data-music-play]');
  if (!active) return;
  active.click();
}

function onPlayerStateChange(event) {
  if (!window.YT || !settings.enabled) return;
  if (event.data === window.YT.PlayerState.ENDED) {
    try {
      event.target.seekTo(0, true);
      event.target.playVideo();
    } catch {}
  }
}

function onPlayerError() {
  currentTrackId = null;
  updateBody();
  inject(text().unavailable);
}

async function createPlayer(videoId) {
  ensureDock();
  const ready = await ensureYouTubeApi();
  if (!ready || !playerHost?.isConnected || !settings.enabled) return false;

  return new Promise(resolve => {
    try {
      player = new window.YT.Player('riotYoutubePlayer', {
        width: '100%',
        height: '220',
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          playsinline: 1,
          origin: window.location.origin
        },
        events: {
          onReady: event => {
            playerReady = true;
            try {
              event.target.setVolume(settings.volume);
              event.target.playVideo();
            } catch {}
            resolve(true);
          },
          onStateChange: onPlayerStateChange,
          onError: () => {
            onPlayerError();
            resolve(false);
          }
        }
      });
    } catch {
      resolve(false);
    }
  });
}

async function playOfficial() {
  if (!settings.enabled || changing) return;
  changing = true;
  stopBuiltin();
  const id = effectiveTrackId();
  const item = track(id);
  ensureDock();
  updateDock();
  inject(text().loading);

  let ok = true;
  if (player && playerReady) {
    try {
      player.setVolume(settings.volume);
      if (currentTrackId !== id) player.loadVideoById(item.videoId);
      else player.playVideo();
    } catch {
      ok = false;
    }
  } else {
    destroyPlayer();
    ensureDock();
    ok = await createPlayer(item.videoId);
  }

  currentTrackId = ok ? id : null;
  changing = false;
  updateDock();
  updateBody();
  inject(ok ? '' : text().unavailable);
}

function setVolume(value) {
  settings.volume = clamp(Number(value), 0, 100);
  saveSettings();
  try { player?.setVolume?.(settings.volume); } catch {}
}

function markup(status = '') {
  const active = track(effectiveTrackId());
  return `<section class="riot-music-section" data-riot-music-section>
    <div class="riot-music-head">
      <div><span>▶</span><div><b>${text().title}</b><small>${text().subtitle}</small></div></div>
      <em>${settings.enabled ? `♫ ${active.title}` : 'OFF'}</em>
    </div>
    <button type="button" class="riot-music-toggle ${settings.enabled ? 'active' : ''}" data-riot-music-toggle>${settings.enabled ? '■' : '▶'} <span>${settings.enabled ? text().stop : text().enable}</span></button>
    <label class="riot-music-field"><span>${text().background}</span><select data-riot-track>${options(settings.track)}</select></label>
    <label class="riot-music-field"><span>${text().worlds}</span><select data-riot-worlds-track>${options(settings.worldsTrack)}</select></label>
    <label class="riot-music-switch"><input type="checkbox" data-riot-auto-worlds ${settings.autoWorlds ? 'checked' : ''}><span></span><b>${text().autoWorlds}</b></label>
    <label class="riot-music-volume"><span>${text().volume}</span><input type="range" min="0" max="100" step="1" value="${settings.volume}" data-riot-volume><b>${settings.volume}%</b></label>
    <div class="riot-music-track-preview"><b>${active.icon} ${active.title}</b><small>${active.subtitle}</small></div>
    <div class="riot-music-links">
      <a href="${youtubeUrl(effectiveTrackId())}" target="_blank" rel="noreferrer">${text().openVideo} ↗</a>
      <a href="${YOUTUBE_CHANNEL}" target="_blank" rel="noreferrer">${text().channel} ↗</a>
    </div>
    <p class="riot-music-credit">${text().credit}</p>
    <p class="riot-music-note">${text().note}</p>
    <p class="riot-music-session">${text().session}</p>
    ${status ? `<div class="riot-music-status">${status}</div>` : ''}
  </section>`;
}

function inject(status = '') {
  const panel = document.querySelector('[data-music-center-panel]');
  if (!panel) return;
  const old = panel.querySelector('[data-riot-music-section]');
  const box = document.createElement('div');
  box.innerHTML = markup(status);
  const next = box.firstElementChild;
  if (old) old.replaceWith(next);
  else {
    const privacy = panel.querySelector('.music-privacy');
    privacy ? privacy.before(next) : panel.appendChild(next);
  }
  bind(next);
}

function bind(section) {
  section.querySelector('[data-riot-music-toggle]')?.addEventListener('click', async () => {
    settings.enabled = !settings.enabled;
    if (settings.enabled) await playOfficial();
    else stopOfficial();
    inject();
  });

  section.querySelector('[data-riot-track]')?.addEventListener('change', async event => {
    settings.track = event.target.value;
    saveSettings();
    if (settings.enabled && currentSection !== 'worlds') await playOfficial();
    inject();
  });

  section.querySelector('[data-riot-worlds-track]')?.addEventListener('change', async event => {
    settings.worldsTrack = event.target.value;
    saveSettings();
    if (settings.enabled && currentSection === 'worlds' && settings.autoWorlds) await playOfficial();
    inject();
  });

  section.querySelector('[data-riot-auto-worlds]')?.addEventListener('change', async event => {
    settings.autoWorlds = event.target.checked;
    saveSettings();
    if (settings.enabled) await playOfficial();
    inject();
  });

  section.querySelector('[data-riot-volume]')?.addEventListener('input', event => {
    setVolume(event.target.value);
    const value = section.querySelector('.riot-music-volume>b');
    if (value) value.textContent = `${settings.volume}%`;
  });
}

function watchPanel() {
  observer = new MutationObserver(() => {
    const panel = document.querySelector('[data-music-center-panel]');
    if (panel && !panel.querySelector('[data-riot-music-section]')) inject();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function bindNavigation() {
  document.addEventListener('rift:navigate', async event => {
    const before = effectiveTrackId();
    currentSection = event.detail || 'dashboard';
    const after = effectiveTrackId();
    updateBody();
    if (settings.enabled && before !== after) await playOfficial();
    updateDock();
    inject();
  });
}

function bindConflict() {
  document.addEventListener('click', event => {
    const control = event.target.closest?.('[data-music-play]');
    if (!control || !settings.enabled || changing) return;
    stopOfficial();
  }, true);
}

export function initRiotMusic() {
  if (initialized) return;
  initialized = true;
  ensureCss();
  currentSection = document.querySelector('.page-section.active-section')?.id || 'dashboard';
  watchPanel();
  bindNavigation();
  bindConflict();
  onLanguageChange(() => {
    updateDock();
    inject();
  });
  requestAnimationFrame(() => inject());
}
