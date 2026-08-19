import { getLanguage, onLanguageChange } from './i18n.js';

const SETTINGS_KEY = 'rift:riot-youtube-music:v2';
const YOUTUBE_CHANNEL = 'https://www.youtube.com/@leagueoflegends';

const TRACKS = {
  'yt-warriors-2014': { icon: '⚔', title: 'Warriors', subtitle: 'Worlds 2014 • Imagine Dragons', videoId: 'fmI_Ndrxy14', year: 2014, group: 'worlds' },
  'yt-worlds-collide': { icon: '✧', title: 'Worlds Collide', subtitle: 'Worlds 2015 • Nicki Taylor', videoId: '4Twd965VzX4', year: 2015, group: 'worlds' },
  'yt-ignite': { icon: '🔥', title: 'Ignite', subtitle: 'Worlds 2016 • Zedd', videoId: 'Zasx9hjo4WY', year: 2016, group: 'worlds' },
  'yt-legends': { icon: '♜', title: 'Legends Never Die', subtitle: 'Worlds 2017 • Against The Current', videoId: 'r6zIGXun57U', year: 2017, group: 'worlds' },
  'yt-rise': { icon: '⛰', title: 'RISE', subtitle: 'Worlds 2018 • The Glitch Mob, Mako & The Word Alive', videoId: 'fB8TyLTD7EE', year: 2018, group: 'worlds' },
  'yt-phoenix': { icon: '🜂', title: 'Phoenix', subtitle: 'Worlds 2019 • Cailin Russo & Chrissy Costanza', videoId: 'i1IKnWDecwA', year: 2019, group: 'worlds' },
  'yt-take-over': { icon: '👑', title: 'Take Over', subtitle: 'Worlds 2020 • Jeremy McKinnon, MAX & Henry', videoId: 'KbNL9ZyB49c', year: 2020, group: 'worlds' },
  'yt-burn-it-all-down': { icon: '♨', title: 'Burn It All Down', subtitle: 'Worlds 2021 • PVRIS', videoId: '1Z6CHioIn3s', year: 2021, group: 'worlds' },
  'yt-star-walkin': { icon: '★', title: "STAR WALKIN'", subtitle: 'Worlds 2022 • Lil Nas X', videoId: 'HYsz1hP0BFo', year: 2022, group: 'worlds' },
  'yt-gods': { icon: '⚡', title: 'GODS', subtitle: 'Worlds 2023 • NewJeans', videoId: 'C3GouGa0noM', year: 2023, group: 'worlds' },
  'yt-heavy': { icon: '♛', title: 'Heavy Is The Crown', subtitle: 'Worlds 2024 • Linkin Park', videoId: '5FrhtahQiRc', year: 2024, group: 'worlds' },
  'yt-sacrifice': { icon: '✦', title: 'Sacrifice', subtitle: 'Worlds 2025 • G.E.M. (鄧紫棋)', videoId: 'pzt6SmvGpXk', year: 2025, group: 'worlds' },

  'yt-pop-stars': { icon: '◆', title: 'POP/STARS', subtitle: 'K/DA • Madison Beer, (G)I-DLE & Jaira Burns', videoId: 'UOxkGD8qRB4', year: 2018, group: 'music' },
  'yt-giants': { icon: '⬢', title: 'GIANTS', subtitle: 'True Damage • Becky G, Keke Palmer, SOYEON, DUCKWRTH & Thutmose', videoId: 'sVZpHFXcFJw', year: 2019, group: 'music' },
  'yt-more': { icon: '◇', title: 'MORE', subtitle: 'K/DA • Madison Beer, (G)I-DLE, Lexie Liu, Jaira Burns & Seraphine', videoId: '3VTkBuxU4yk', year: 2020, group: 'music' },
  'yt-get-jinxed': { icon: '💥', title: 'Get Jinxed', subtitle: 'Jinx Music Video • Agnete Kjølsrud', videoId: '0nlJuwO0GDs', year: 2013, group: 'music' },

  'yt-awaken': { icon: '◉', title: 'Awaken', subtitle: 'Season 2019 Cinematic • Valerie Broussard', videoId: 'zF5Ddo9JdpY', year: 2019, group: 'cinematic' },
  'yt-warriors-2020': { icon: '🛡', title: 'Warriors', subtitle: 'Season 2020 Cinematic • 2WEI & Edda Hayes', videoId: 'aR-KAldshAE', year: 2020, group: 'cinematic' },
  'yt-the-call': { icon: '📯', title: 'The Call', subtitle: 'Season 2022 Cinematic • 2WEI, Louis Leibfried & Edda Hayes', videoId: 'mDYqT0_9VR4', year: 2022, group: 'cinematic' },
  'yt-still-here': { icon: '∞', title: 'Still Here', subtitle: 'Season 2024 Cinematic • Forts, Tiffany Aris & 2WEI', videoId: 'ZHhqwBwmRkI', year: 2024, group: 'cinematic' }
};

const COPY = {
  vi: {
    title: 'Riot Music', subtitle: 'YouTube chính thức • League of Legends', playing: 'Đang phát', stopped: 'Đã tắt',
    enable: 'Phát Riot Music', stop: 'Tắt Riot Music', background: 'Nhạc mặc định', worlds: 'Nhạc khi vào CKTG',
    autoWorlds: 'Tự đổi anthem khi mở CKTG', volume: 'Âm lượng', channel: 'Kênh League of Legends',
    openVideo: 'Mở video trên YouTube', credit: 'YouTube Embed chính thức • không tải/re-upload file Riot lên WebLienMinh',
    autoplay: 'Tự phát khi vào web', muted: 'Trình duyệt chặn autoplay có tiếng • nhạc đang chạy muted và sẽ tự bật tiếng ở lần click/tap đầu tiên.',
    loading: 'Đang kết nối YouTube…', unavailable: 'YouTube player không khả dụng hoặc video không cho phép nhúng.',
    dock: 'Riot Music • YouTube', close: 'Dừng Riot Music', panelClose: 'Đóng', openPanel: 'Mở Riot Music',
    autoplayInfo: 'Riot Music tự khởi động khi vào web. Nếu browser chặn âm thanh, player sẽ chạy muted trước rồi tự unmute sau tương tác đầu tiên.',
    groupWorlds: '🏆 Worlds / CKTG 2014–2025', groupMusic: '🎤 K/DA • True Damage • Riot Music', groupCinematic: '🎬 Season / Cinematic'
  },
  en: {
    title: 'Riot Music', subtitle: 'Official YouTube • League of Legends', playing: 'Playing', stopped: 'Off',
    enable: 'Play Riot Music', stop: 'Stop Riot Music', background: 'Default track', worlds: 'Track in Worlds',
    autoWorlds: 'Switch anthem automatically in Worlds', volume: 'Volume', channel: 'League of Legends channel',
    openVideo: 'Open video on YouTube', credit: 'Official YouTube embed • no Riot audio files are re-uploaded to WebLienMinh',
    autoplay: 'Autoplay on entry', muted: 'The browser blocked audible autoplay • playback is muted and will unmute on your first click/tap.',
    loading: 'Connecting to YouTube…', unavailable: 'The YouTube player is unavailable or this video cannot be embedded.',
    dock: 'Riot Music • YouTube', close: 'Stop Riot Music', panelClose: 'Close', openPanel: 'Open Riot Music',
    autoplayInfo: 'Riot Music starts automatically when the site opens. If audible autoplay is blocked, it starts muted and unmutes after the first interaction.',
    groupWorlds: '🏆 Worlds 2014–2025', groupMusic: '🎤 K/DA • True Damage • Riot Music', groupCinematic: '🎬 Season / Cinematic'
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
let button = null;
let panel = null;
let panelOpen = false;
let changing = false;
let autoplayMuted = false;
let userInteracted = false;
let youtubeApiPromise = null;
let statusMessage = '';

const lang = () => getLanguage() === 'en' ? 'en' : 'vi';
const text = () => COPY[lang()];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function defaults() {
  return { enabled: true, track: 'yt-rise', worldsTrack: 'yt-sacrifice', autoWorlds: true, volume: 35 };
}

function loadSettings() {
  try {
    const old = JSON.parse(localStorage.getItem('rift:riot-youtube-music:v1') || 'null') || {};
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') || {};
    return {
      ...defaults(),
      ...old,
      ...saved,
      enabled: saved.enabled ?? true,
      volume: clamp(Number(saved.volume ?? old.volume ?? 35), 0, 100)
    };
  } catch {
    return defaults();
  }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

function ensureCss() {
  if (document.querySelector('link[data-riot-music]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/riot-music.css?v=3.7.0';
  link.dataset.riotMusic = 'true';
  document.head.appendChild(link);
}

function effectiveTrackId() {
  return settings.autoWorlds && currentSection === 'worlds' ? settings.worldsTrack : settings.track;
}

function track(id) { return TRACKS[id] || TRACKS['yt-rise']; }
function youtubeUrl(id) { return `https://www.youtube.com/watch?v=${track(id).videoId}`; }

function options(selected) {
  const groups = [
    ['worlds', text().groupWorlds],
    ['music', text().groupMusic],
    ['cinematic', text().groupCinematic]
  ];
  return groups.map(([group, label]) => {
    const rows = Object.entries(TRACKS)
      .filter(([, item]) => item.group === group)
      .sort((a, b) => Number(b[1].year || 0) - Number(a[1].year || 0))
      .map(([id, item]) => `<option value="${id}" ${selected === id ? 'selected' : ''}>${item.icon} ${item.title} • ${item.year}</option>`)
      .join('');
    return `<optgroup label="${label}">${rows}</optgroup>`;
  }).join('');
}

function updateBody() {
  document.body.classList.toggle('riot-music-playing', settings.enabled && Boolean(currentTrackId));
  document.body.classList.toggle('riot-music-worlds', settings.enabled && settings.autoWorlds && currentSection === 'worlds');
  document.body.classList.toggle('riot-music-muted', settings.enabled && autoplayMuted);
}

function ensureYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(true);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise(resolve => {
    const previousReady = window.onYouTubeIframeAPIReady;
    let settled = false;
    const finish = ok => { if (!settled) { settled = true; resolve(Boolean(ok)); } };
    window.onYouTubeIframeAPIReady = () => {
      try { previousReady?.(); } catch {}
      finish(Boolean(window.YT?.Player));
    };
    if (!document.querySelector('script[data-youtube-iframe-api]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.youtubeIframeApi = 'true';
      script.onerror = () => finish(false);
      document.head.appendChild(script);
    }
    const poll = setInterval(() => {
      if (window.YT?.Player) { clearInterval(poll); finish(true); }
    }, 120);
    setTimeout(() => { clearInterval(poll); finish(Boolean(window.YT?.Player)); }, 6500);
  });
  return youtubeApiPromise;
}

function installUi() {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;

  button = document.createElement('button');
  button.type = 'button';
  button.className = 'riot-music-button';
  button.dataset.riotMusicButton = 'true';
  button.setAttribute('aria-expanded', 'false');
  const status = document.getElementById('statusBadge');
  topbar.insertBefore(button, status || null);

  panel = document.createElement('aside');
  panel.className = 'riot-music-panel';
  panel.dataset.riotMusicPanel = 'true';
  document.body.appendChild(panel);

  button.addEventListener('click', event => {
    event.stopPropagation();
    setPanel(!panelOpen);
  });
  panel.addEventListener('click', event => event.stopPropagation());
  document.addEventListener('click', () => { if (panelOpen) setPanel(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && panelOpen) setPanel(false); });
  renderUi();
}

function setPanel(open) {
  panelOpen = Boolean(open);
  renderUi();
}

function renderButton() {
  if (!button) return;
  const item = track(effectiveTrackId());
  button.classList.toggle('is-playing', settings.enabled && Boolean(currentTrackId));
  button.classList.toggle('is-muted', autoplayMuted);
  button.innerHTML = `<span class="riot-music-button-icon">${autoplayMuted ? '🔇' : settings.enabled ? '♫' : '♪'}</span><span><b>${text().title}</b><small>${settings.enabled ? `${item.title} • ${currentTrackId ? text().playing : text().loading}` : text().stopped}</small></span>`;
  button.setAttribute('aria-label', text().openPanel);
  button.setAttribute('aria-expanded', String(panelOpen));
}

function renderPanel() {
  if (!panel) return;
  const active = track(effectiveTrackId());
  panel.classList.toggle('open', panelOpen);
  panel.innerHTML = `<div class="riot-music-panel-head"><div><span>▶</span><div><b>${text().title}</b><small>${text().subtitle}</small></div></div><button type="button" data-riot-panel-close aria-label="${text().panelClose}">×</button></div>
    <div class="riot-music-now"><strong>${active.icon} ${active.title}</strong><span>${active.subtitle}</span>${autoplayMuted ? `<em>🔇 ${text().muted}</em>` : ''}</div>
    <button type="button" class="riot-music-toggle ${settings.enabled ? 'active' : ''}" data-riot-toggle>${settings.enabled ? '■' : '▶'} <span>${settings.enabled ? text().stop : text().enable}</span></button>
    <label class="riot-music-field"><span>${text().background}</span><select data-riot-track>${options(settings.track)}</select></label>
    <label class="riot-music-field"><span>${text().worlds}</span><select data-riot-worlds-track>${options(settings.worldsTrack)}</select></label>
    <label class="riot-music-switch"><input type="checkbox" data-riot-auto-worlds ${settings.autoWorlds ? 'checked' : ''}><span></span><b>${text().autoWorlds}</b></label>
    <label class="riot-music-volume"><span>${text().volume}</span><input type="range" min="0" max="100" step="1" value="${settings.volume}" data-riot-volume><b>${settings.volume}%</b></label>
    <div class="riot-music-links"><a href="${youtubeUrl(effectiveTrackId())}" target="_blank" rel="noreferrer">${text().openVideo} ↗</a><a href="${YOUTUBE_CHANNEL}" target="_blank" rel="noreferrer">${text().channel} ↗</a></div>
    <p class="riot-music-autoplay">⚡ ${text().autoplayInfo}</p><p class="riot-music-credit">${text().credit}</p>
    ${statusMessage ? `<div class="riot-music-status">${statusMessage}</div>` : ''}`;
  bindPanel();
}

function renderUi() {
  updateBody();
  renderButton();
  renderPanel();
  updateDock();
}

function bindPanel() {
  if (!panel) return;
  panel.querySelector('[data-riot-panel-close]')?.addEventListener('click', () => setPanel(false));
  panel.querySelector('[data-riot-toggle]')?.addEventListener('click', async () => {
    settings.enabled = !settings.enabled;
    saveSettings();
    if (settings.enabled) await playOfficial();
    else stopOfficial();
    renderUi();
  });
  panel.querySelector('[data-riot-track]')?.addEventListener('change', async event => {
    settings.track = event.target.value;
    saveSettings();
    if (settings.enabled && currentSection !== 'worlds') await playOfficial();
    renderUi();
  });
  panel.querySelector('[data-riot-worlds-track]')?.addEventListener('change', async event => {
    settings.worldsTrack = event.target.value;
    saveSettings();
    if (settings.enabled && currentSection === 'worlds' && settings.autoWorlds) await playOfficial();
    renderUi();
  });
  panel.querySelector('[data-riot-auto-worlds]')?.addEventListener('change', async event => {
    settings.autoWorlds = event.target.checked;
    saveSettings();
    if (settings.enabled) await playOfficial();
    renderUi();
  });
  panel.querySelector('[data-riot-volume]')?.addEventListener('input', event => {
    settings.volume = clamp(Number(event.target.value), 0, 100);
    saveSettings();
    try { player?.setVolume?.(settings.volume); } catch {}
    const value = panel.querySelector('.riot-music-volume>b');
    if (value) value.textContent = `${settings.volume}%`;
  });
}

function ensureDock() {
  if (playerDock?.isConnected) return playerDock;
  playerDock = document.createElement('aside');
  playerDock.className = 'riot-youtube-dock';
  playerDock.dataset.riotYoutubeDock = 'true';
  playerDock.innerHTML = `<div class="riot-youtube-dock-head"><div><span>▶</span><div><b>${text().dock}</b><small data-riot-youtube-now>—</small></div></div><div class="riot-youtube-dock-actions"><a data-riot-youtube-open target="_blank" rel="noreferrer">↗</a><button type="button" data-riot-youtube-close aria-label="${text().close}">×</button></div></div><div class="riot-youtube-player-shell"><div id="riotYoutubePlayer"></div></div><div class="riot-youtube-muted-hint" data-riot-youtube-muted></div>`;
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
  const muted = playerDock.querySelector('[data-riot-youtube-muted]');
  if (now) now.textContent = `${item.title} • ${item.subtitle}`;
  if (open) { open.href = youtubeUrl(effectiveTrackId()); open.title = text().openVideo; }
  if (muted) { muted.textContent = autoplayMuted ? `🔇 ${text().muted}` : ''; muted.hidden = !autoplayMuted; }
  const title = playerDock.querySelector('.riot-youtube-dock-head b');
  if (title) title.textContent = text().dock;
}

function destroyPlayer() {
  playerReady = false;
  try { player?.stopVideo?.(); } catch {}
  try { player?.destroy?.(); } catch {}
  player = null;
  playerHost = null;
  playerDock?.remove();
  playerDock = null;
  currentTrackId = null;
  autoplayMuted = false;
}

function stopOfficial() {
  settings.enabled = false;
  saveSettings();
  destroyPlayer();
  statusMessage = '';
  renderUi();
}

function onPlayerStateChange(event) {
  if (!window.YT || !settings.enabled) return;
  if (event.data === window.YT.PlayerState.PLAYING) {
    currentTrackId = effectiveTrackId();
    statusMessage = '';
    renderUi();
  }
  if (event.data === window.YT.PlayerState.ENDED) {
    try { event.target.seekTo(0, true); event.target.playVideo(); } catch {}
  }
}

function tryUnmute() {
  if (!settings.enabled || !autoplayMuted || !playerReady || !player) return false;
  try {
    player.unMute();
    player.setVolume(settings.volume);
    player.playVideo();
    autoplayMuted = false;
    statusMessage = '';
    renderUi();
    return true;
  } catch {
    return false;
  }
}

function handleAutoplayBlocked() {
  if (!settings.enabled || !player) return;
  if (userInteracted) {
    try { player.unMute(); player.setVolume(settings.volume); player.playVideo(); return; } catch {}
  }
  try {
    player.mute();
    autoplayMuted = true;
    statusMessage = text().muted;
    player.playVideo();
    renderUi();
  } catch {
    statusMessage = text().unavailable;
    renderUi();
  }
}

async function createPlayer(videoId) {
  ensureDock();
  const apiReady = await ensureYouTubeApi();
  if (!apiReady || !playerHost?.isConnected || !settings.enabled) return false;
  return new Promise(resolve => {
    let resolved = false;
    const finish = value => { if (!resolved) { resolved = true; resolve(value); } };
    try {
      player = new window.YT.Player('riotYoutubePlayer', {
        width: '100%', height: '220', videoId,
        playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: event => {
            playerReady = true;
            try {
              event.target.setVolume(settings.volume);
              if (userInteracted) event.target.unMute();
              event.target.playVideo();
            } catch {}
            setTimeout(() => {
              try {
                const playing = event.target.getPlayerState() === window.YT.PlayerState.PLAYING;
                if (!playing) handleAutoplayBlocked();
              } catch {}
            }, 900);
            finish(true);
          },
          onStateChange: onPlayerStateChange,
          onAutoplayBlocked: handleAutoplayBlocked,
          onError: () => { statusMessage = text().unavailable; currentTrackId = null; renderUi(); finish(false); }
        }
      });
    } catch {
      finish(false);
    }
  });
}

async function playOfficial() {
  if (!settings.enabled || changing) return;
  changing = true;
  const id = effectiveTrackId();
  const item = track(id);
  statusMessage = text().loading;
  ensureDock();
  renderUi();
  let ok = true;
  if (player && playerReady) {
    try {
      player.setVolume(settings.volume);
      if (currentTrackId !== id) player.loadVideoById(item.videoId);
      else player.playVideo();
    } catch { ok = false; }
  } else {
    destroyPlayer();
    ensureDock();
    ok = await createPlayer(item.videoId);
  }
  if (ok && !currentTrackId) currentTrackId = id;
  if (!ok) statusMessage = text().unavailable;
  changing = false;
  renderUi();
}

function bindFirstInteraction() {
  const mark = () => {
    userInteracted = true;
    if (autoplayMuted) tryUnmute();
  };
  document.addEventListener('pointerdown', mark, { capture: true, passive: true });
  document.addEventListener('keydown', mark, { capture: true });
}

export function setRiotMusicSection(sectionId) {
  const before = effectiveTrackId();
  currentSection = sectionId || 'dashboard';
  const after = effectiveTrackId();
  renderUi();
  if (settings.enabled && before !== after) playOfficial();
}

export function initRiotMusic() {
  if (initialized) return;
  initialized = true;
  ensureCss();
  currentSection = document.querySelector('.page-section.active-section')?.id || 'dashboard';
  installUi();
  bindFirstInteraction();
  onLanguageChange(() => renderUi());
  if (settings.enabled) requestAnimationFrame(() => playOfficial());
}
