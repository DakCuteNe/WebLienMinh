import { esc } from './shared.js';
import { getLanguage, onLanguageChange } from './i18n.js';

const SETTINGS_KEY = 'rift:music-center:v1';
const DB_NAME = 'rift-music-center';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const BUILTIN_TRACKS = {
  'rift-ambient': {
    icon: '◇',
    vi: ['Rift Ambient', 'Không gian Summoner’s Rift nhẹ nhàng'],
    en: ['Rift Ambient', 'Soft Summoner’s Rift atmosphere'],
    stepMs: 7200,
    filter: 1150,
    voices: [
      { type: 'sine', gain: 0.072 },
      { type: 'triangle', gain: 0.035 },
      { type: 'sine', gain: 0.028 },
      { type: 'sine', gain: 0.018 }
    ],
    chords: [
      [110.00, 164.81, 220.00, 329.63],
      [98.00, 146.83, 196.00, 293.66],
      [130.81, 196.00, 261.63, 392.00],
      [123.47, 185.00, 246.94, 369.99]
    ],
    pulseHz: 0.065,
    pulseDepth: 0.12
  },
  'nexus-chill': {
    icon: '✦',
    vi: ['Nexus Chill', 'Pad êm và sáng để đọc meta'],
    en: ['Nexus Chill', 'Warm, bright pads for browsing meta'],
    stepMs: 6100,
    filter: 1450,
    voices: [
      { type: 'sine', gain: 0.055 },
      { type: 'sine', gain: 0.034 },
      { type: 'triangle', gain: 0.024 },
      { type: 'sine', gain: 0.016 }
    ],
    chords: [
      [130.81, 196.00, 261.63, 329.63],
      [146.83, 220.00, 293.66, 369.99],
      [123.47, 185.00, 246.94, 329.63],
      [110.00, 164.81, 220.00, 293.66]
    ],
    pulseHz: 0.09,
    pulseDepth: 0.1
  },
  'ranked-focus': {
    icon: '◈',
    vi: ['Ranked Focus', 'Nhịp synth tối, đều và tập trung'],
    en: ['Ranked Focus', 'Dark steady synth for focused browsing'],
    stepMs: 4800,
    filter: 980,
    voices: [
      { type: 'triangle', gain: 0.06 },
      { type: 'sine', gain: 0.038 },
      { type: 'triangle', gain: 0.024 },
      { type: 'sine', gain: 0.014 }
    ],
    chords: [
      [73.42, 110.00, 146.83, 220.00],
      [82.41, 123.47, 164.81, 246.94],
      [65.41, 98.00, 130.81, 196.00],
      [73.42, 110.00, 164.81, 220.00]
    ],
    pulseHz: 0.16,
    pulseDepth: 0.16
  },
  'worlds-arena': {
    icon: '♛',
    vi: ['Worlds Arena', 'Không khí sân khấu CKTG riêng'],
    en: ['Worlds Arena', 'Dedicated Worlds championship atmosphere'],
    stepMs: 5200,
    filter: 900,
    voices: [
      { type: 'sine', gain: 0.09 },
      { type: 'triangle', gain: 0.046 },
      { type: 'sawtooth', gain: 0.012 },
      { type: 'sine', gain: 0.024 },
      { type: 'sine', gain: 0.012 }
    ],
    chords: [
      [55.00, 82.41, 110.00, 164.81, 220.00],
      [65.41, 98.00, 130.81, 196.00, 261.63],
      [73.42, 110.00, 146.83, 220.00, 293.66],
      [61.74, 92.50, 123.47, 185.00, 246.94]
    ],
    pulseHz: 0.22,
    pulseDepth: 0.22
  }
};

const COPY = {
  vi: {
    title: 'Music Center', now: 'Đang phát', stopped: 'Đã tắt nhạc', waiting: 'Bấm phát để bắt đầu',
    background: 'Nhạc nền', worlds: 'Nhạc khi vào CKTG', autoWorlds: 'Tự đổi nhạc khi mở CKTG',
    volume: 'Âm lượng', upload: 'Tải nhạc lên', uploadHint: 'MP3 / OGG / WAV • lưu cục bộ trên thiết bị',
    local: 'Nhạc của bạn', builtIn: 'Có sẵn', remove: 'Xóa', close: 'Đóng', play: 'Phát nhạc', pause: 'Tắt nhạc',
    uploaded: 'Đã thêm nhạc vào thiết bị.', tooLarge: 'File quá lớn. Giới hạn 50 MB.', invalid: 'Vui lòng chọn file âm thanh MP3, OGG, WAV hoặc audio hợp lệ.',
    dbFail: 'Trình duyệt không cho lưu lâu dài; bài vẫn có thể phát trong phiên này.', worldsMode: 'CKTG đang dùng nhạc riêng', privacy: 'Nhạc tải lên chỉ nằm trong trình duyệt này, không gửi lên server.'
  },
  en: {
    title: 'Music Center', now: 'Now playing', stopped: 'Music off', waiting: 'Press play to start',
    background: 'Background track', worlds: 'Worlds track', autoWorlds: 'Switch track when opening Worlds',
    volume: 'Volume', upload: 'Upload music', uploadHint: 'MP3 / OGG / WAV • stored locally on this device',
    local: 'Your music', builtIn: 'Built in', remove: 'Remove', close: 'Close', play: 'Play music', pause: 'Turn music off',
    uploaded: 'Track saved on this device.', tooLarge: 'File is too large. Limit is 50 MB.', invalid: 'Choose a valid MP3, OGG, WAV or other audio file.',
    dbFail: 'Persistent browser storage is unavailable; the track can still play this session.', worldsMode: 'Worlds is using its dedicated track', privacy: 'Uploaded music stays in this browser and is never sent to the server.'
  }
};

let settings = loadSettings();
let customTracks = [];
let sessionTracks = [];
let currentSection = 'dashboard';
let currentTrackId = null;
let unlocked = false;
let panelOpen = false;
let audioContext = null;
let synthState = null;
let audioElement = null;
let audioObjectUrl = null;
let button = null;
let panel = null;
let fileInput = null;
let messageTimer = null;
let initialized = false;

const lang = () => getLanguage() === 'en' ? 'en' : 'vi';
const text = () => COPY[lang()];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function defaultSettings() {
  return {
    enabled: false,
    track: 'rift-ambient',
    worldsTrack: 'worlds-arena',
    autoWorlds: true,
    volume: 0.22
  };
}

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') || {};
    return { ...defaultSettings(), ...parsed, volume: clamp(Number(parsed.volume ?? 0.22), 0, 1) };
  } catch {
    return defaultSettings();
  }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

function ensureCss() {
  if (document.querySelector('link[data-music-center]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/music.css?v=3.3.0';
  link.dataset.musicCenter = 'true';
  document.head.appendChild(link);
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

async function dbList() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => Number(b.addedAt || 0) - Number(a.addedAt || 0)));
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function dbPut(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => { db.close(); resolve(record); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function dbDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

function allCustomTracks() {
  const map = new Map();
  [...customTracks, ...sessionTracks].forEach(track => map.set(track.id, track));
  return [...map.values()];
}

function customTrack(id) {
  return allCustomTracks().find(track => track.id === id) || null;
}

function trackExists(id) {
  return Boolean(BUILTIN_TRACKS[id] || customTrack(id));
}

function trackName(id) {
  const builtin = BUILTIN_TRACKS[id];
  if (builtin) return builtin[lang()][0];
  const custom = customTrack(id);
  return custom?.name || id || '—';
}

function effectiveTrackId() {
  if (settings.autoWorlds && currentSection === 'worlds') {
    return trackExists(settings.worldsTrack) ? settings.worldsTrack : 'worlds-arena';
  }
  return trackExists(settings.track) ? settings.track : 'rift-ambient';
}

function updateBodyMode() {
  document.body.classList.toggle('music-worlds-mode', settings.enabled && settings.autoWorlds && currentSection === 'worlds');
  document.body.classList.toggle('music-playing', settings.enabled && Boolean(currentTrackId));
}

function ensureAudioContext() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContext = new AudioCtx();
  }
  return audioContext;
}

function stopSynth() {
  if (!synthState) return;
  const state = synthState;
  synthState = null;
  if (state.timer) clearInterval(state.timer);
  try {
    const now = state.context.currentTime;
    state.master.gain.cancelScheduledValues(now);
    state.master.gain.setValueAtTime(state.master.gain.value, now);
    state.master.gain.linearRampToValueAtTime(0.0001, now + 0.28);
    state.sources.forEach(source => {
      try { source.stop(now + 0.32); } catch {}
    });
    setTimeout(() => {
      try { state.master.disconnect(); } catch {}
    }, 420);
  } catch {}
}

function stopAudioElement() {
  if (audioElement) {
    try { audioElement.pause(); } catch {}
    audioElement.src = '';
    audioElement = null;
  }
  if (audioObjectUrl) {
    try { URL.revokeObjectURL(audioObjectUrl); } catch {}
    audioObjectUrl = null;
  }
}

function stopPlayback() {
  stopSynth();
  stopAudioElement();
  currentTrackId = null;
  updateBodyMode();
  renderButton();
  renderPanel();
}

function setVolumeLive() {
  if (audioElement) audioElement.volume = settings.volume;
  if (synthState) {
    const now = synthState.context.currentTime;
    const target = Math.max(0.0001, settings.volume * 0.72);
    synthState.master.gain.cancelScheduledValues(now);
    synthState.master.gain.setTargetAtTime(target, now, 0.08);
  }
}

async function playBuiltin(id) {
  const track = BUILTIN_TRACKS[id];
  const context = ensureAudioContext();
  if (!track || !context) return false;
  try { await context.resume(); } catch {}
  if (context.state !== 'running') return false;

  const now = context.currentTime;
  const master = context.createGain();
  const filter = context.createBiquadFilter();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(Math.max(0.0001, settings.volume * 0.72), now + 0.9);
  filter.type = 'lowpass';
  filter.frequency.value = track.filter || 1100;
  filter.Q.value = 0.7;
  filter.connect(master);
  master.connect(context.destination);

  const sources = [];
  const voiceNodes = [];
  const firstChord = track.chords[0];
  track.voices.forEach((voice, index) => {
    const oscillator = context.createOscillator();
    const voiceGain = context.createGain();
    oscillator.type = voice.type || 'sine';
    oscillator.frequency.value = firstChord[index % firstChord.length];
    voiceGain.gain.value = voice.gain;
    oscillator.connect(voiceGain);
    voiceGain.connect(filter);
    oscillator.start(now);
    sources.push(oscillator);
    voiceNodes.push({ oscillator, gain: voiceGain });
  });

  const pulse = context.createOscillator();
  const pulseGain = context.createGain();
  pulse.type = 'sine';
  pulse.frequency.value = track.pulseHz || 0.08;
  pulseGain.gain.value = Math.max(0.002, (track.pulseDepth || 0.1) * settings.volume * 0.12);
  pulse.connect(pulseGain);
  pulseGain.connect(master.gain);
  pulse.start(now);
  sources.push(pulse);

  let step = 0;
  const applyChord = () => {
    step = (step + 1) % track.chords.length;
    const chord = track.chords[step];
    const at = context.currentTime;
    voiceNodes.forEach((node, index) => {
      node.oscillator.frequency.cancelScheduledValues(at);
      node.oscillator.frequency.setTargetAtTime(chord[index % chord.length], at, 1.8);
    });
  };
  const timer = setInterval(applyChord, track.stepMs || 6000);
  synthState = { context, master, filter, sources, voiceNodes, timer, trackId: id };
  return true;
}

async function playCustom(id) {
  const record = customTrack(id);
  if (!record?.blob) return false;
  audioObjectUrl = URL.createObjectURL(record.blob);
  audioElement = new Audio(audioObjectUrl);
  audioElement.loop = true;
  audioElement.preload = 'auto';
  audioElement.volume = settings.volume;
  audioElement.addEventListener('error', () => showMessage(text().invalid, true), { once: true });
  try {
    await audioElement.play();
    return true;
  } catch {
    return false;
  }
}

async function startPlayback(forceGesture = false) {
  if (!settings.enabled) return;
  if (forceGesture) unlocked = true;
  if (!unlocked) return;
  const target = effectiveTrackId();
  if (currentTrackId === target && (synthState || (audioElement && !audioElement.paused))) {
    setVolumeLive();
    renderButton();
    renderPanel();
    return;
  }

  stopSynth();
  stopAudioElement();
  currentTrackId = null;
  let ok = false;
  if (BUILTIN_TRACKS[target]) ok = await playBuiltin(target);
  else ok = await playCustom(target);
  if (ok) currentTrackId = target;
  updateBodyMode();
  renderButton();
  renderPanel();
}

function persistAndApply() {
  saveSettings();
  if (!settings.enabled) stopPlayback();
  else startPlayback(true);
  renderPanel();
  renderButton();
}

function selectOptions(selected) {
  const builtin = Object.entries(BUILTIN_TRACKS).map(([id, track]) => {
    const [name] = track[lang()];
    return `<option value="${esc(id)}" ${selected === id ? 'selected' : ''}>${esc(track.icon)} ${esc(name)} · ${esc(text().builtIn)}</option>`;
  }).join('');
  const custom = allCustomTracks().map(track => `<option value="${esc(track.id)}" ${selected === track.id ? 'selected' : ''}>♫ ${esc(track.name)}</option>`).join('');
  return builtin + custom;
}

function renderButton() {
  if (!button) return;
  const name = trackName(effectiveTrackId());
  button.classList.toggle('is-playing', settings.enabled && Boolean(currentTrackId));
  button.classList.toggle('is-open', panelOpen);
  button.innerHTML = `<span class="music-button-icon">${settings.enabled ? '♫' : '♪'}</span><span class="music-button-copy"><b>${esc(settings.enabled ? name : text().title)}</b><small>${esc(settings.enabled ? (currentTrackId ? text().now : text().waiting) : text().stopped)}</small></span>`;
  button.setAttribute('aria-label', text().title);
  button.setAttribute('aria-expanded', String(panelOpen));
}

function renderPanel() {
  if (!panel) return;
  const effective = effectiveTrackId();
  panel.classList.toggle('open', panelOpen);
  panel.innerHTML = `<div class="music-panel-head">
      <div><span class="music-eq"><i></i><i></i><i></i></span><div><b>${esc(text().title)}</b><small>${esc(settings.enabled && currentTrackId ? `${text().now}: ${trackName(effective)}` : settings.enabled ? text().waiting : text().stopped)}</small></div></div>
      <button type="button" class="music-close" data-music-close aria-label="${esc(text().close)}">×</button>
    </div>
    ${settings.autoWorlds && currentSection === 'worlds' ? `<div class="music-worlds-banner">♛ ${esc(text().worldsMode)} · <b>${esc(trackName(effective))}</b></div>` : ''}
    <button type="button" class="music-play-toggle ${settings.enabled ? 'active' : ''}" data-music-play>${settings.enabled ? '■' : '▶'} <span>${esc(settings.enabled ? text().pause : text().play)}</span></button>
    <label class="music-field"><span>${esc(text().background)}</span><select data-music-track>${selectOptions(settings.track)}</select></label>
    <label class="music-field"><span>${esc(text().worlds)}</span><select data-music-worlds-track>${selectOptions(settings.worldsTrack)}</select></label>
    <label class="music-switch"><input type="checkbox" data-music-auto-worlds ${settings.autoWorlds ? 'checked' : ''}><span></span><b>${esc(text().autoWorlds)}</b></label>
    <label class="music-volume"><span>${esc(text().volume)}</span><input type="range" min="0" max="100" step="1" value="${Math.round(settings.volume * 100)}" data-music-volume><b>${Math.round(settings.volume * 100)}%</b></label>
    <div class="music-upload-row"><button type="button" data-music-upload>＋ ${esc(text().upload)}</button><small>${esc(text().uploadHint)}</small></div>
    ${allCustomTracks().length ? `<div class="music-local-list"><span>${esc(text().local)}</span>${allCustomTracks().map(track => `<div><b title="${esc(track.name)}">♫ ${esc(track.name)}</b><button type="button" data-music-remove="${esc(track.id)}">${esc(text().remove)}</button></div>`).join('')}</div>` : ''}
    <p class="music-privacy">🔒 ${esc(text().privacy)}</p>
    <div class="music-message" data-music-message></div>`;
  bindPanelEvents();
}

function showMessage(message, error = false) {
  if (!panel) return;
  const target = panel.querySelector('[data-music-message]');
  if (!target) return;
  target.textContent = message;
  target.classList.toggle('error', error);
  target.classList.add('show');
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => target.classList.remove('show'), 3200);
}

function bindPanelEvents() {
  if (!panel) return;
  panel.querySelector('[data-music-close]')?.addEventListener('click', () => setPanel(false));
  panel.querySelector('[data-music-play]')?.addEventListener('click', async () => {
    unlocked = true;
    settings.enabled = !settings.enabled;
    saveSettings();
    if (settings.enabled) await startPlayback(true);
    else stopPlayback();
    renderPanel();
    renderButton();
  });
  panel.querySelector('[data-music-track]')?.addEventListener('change', event => {
    settings.track = event.target.value;
    persistAndApply();
  });
  panel.querySelector('[data-music-worlds-track]')?.addEventListener('change', event => {
    settings.worldsTrack = event.target.value;
    persistAndApply();
  });
  panel.querySelector('[data-music-auto-worlds]')?.addEventListener('change', event => {
    settings.autoWorlds = event.target.checked;
    persistAndApply();
  });
  panel.querySelector('[data-music-volume]')?.addEventListener('input', event => {
    settings.volume = clamp(Number(event.target.value) / 100, 0, 1);
    saveSettings();
    setVolumeLive();
    const value = panel.querySelector('.music-volume>b');
    if (value) value.textContent = `${Math.round(settings.volume * 100)}%`;
  });
  panel.querySelector('[data-music-upload]')?.addEventListener('click', () => fileInput?.click());
  panel.querySelectorAll('[data-music-remove]').forEach(remove => remove.addEventListener('click', async () => {
    const id = remove.dataset.musicRemove;
    try { await dbDelete(id); } catch {}
    customTracks = customTracks.filter(track => track.id !== id);
    sessionTracks = sessionTracks.filter(track => track.id !== id);
    if (settings.track === id) settings.track = 'rift-ambient';
    if (settings.worldsTrack === id) settings.worldsTrack = 'worlds-arena';
    saveSettings();
    if (currentTrackId === id) await startPlayback(true);
    renderPanel();
    renderButton();
  }));
}

function setPanel(open) {
  panelOpen = Boolean(open);
  renderButton();
  renderPanel();
}

async function handleUpload(file) {
  if (!file) return;
  const extensionOk = /\.(mp3|ogg|wav|m4a|aac|flac|opus)$/i.test(file.name || '');
  if (!String(file.type || '').startsWith('audio/') && !extensionOk) return showMessage(text().invalid, true);
  if (file.size > MAX_UPLOAD_BYTES) return showMessage(text().tooLarge, true);

  const record = {
    id: `custom:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    name: file.name.replace(/\.[^.]+$/, '') || file.name || 'Custom track',
    type: file.type || 'audio/*',
    size: file.size,
    addedAt: Date.now(),
    blob: file
  };

  try {
    await dbPut(record);
    customTracks = [record, ...customTracks.filter(track => track.id !== record.id)];
    showMessage(text().uploaded);
  } catch {
    sessionTracks = [record, ...sessionTracks];
    showMessage(text().dbFail, true);
  }
  settings.track = record.id;
  settings.enabled = true;
  unlocked = true;
  saveSettings();
  renderPanel();
  await startPlayback(true);
}

function installUi() {
  ensureCss();
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;

  button = document.createElement('button');
  button.type = 'button';
  button.className = 'music-center-button';
  button.dataset.musicCenterButton = 'true';
  const status = document.getElementById('statusBadge');
  topbar.insertBefore(button, status || null);

  panel = document.createElement('aside');
  panel.className = 'music-center-panel';
  panel.dataset.musicCenterPanel = 'true';
  panel.setAttribute('aria-live', 'polite');
  document.body.appendChild(panel);

  fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac,.opus';
  fileInput.hidden = true;
  document.body.appendChild(fileInput);

  button.addEventListener('click', event => {
    event.stopPropagation();
    unlocked = true;
    setPanel(!panelOpen);
    if (settings.enabled) startPlayback(true);
  });
  panel.addEventListener('click', event => event.stopPropagation());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    await handleUpload(file);
  });
  document.addEventListener('click', () => { if (panelOpen) setPanel(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && panelOpen) setPanel(false); });

  renderButton();
  renderPanel();
}

async function hydrateCustomTracks() {
  try { customTracks = await dbList(); } catch { customTracks = []; }
  if (!trackExists(settings.track)) settings.track = 'rift-ambient';
  if (!trackExists(settings.worldsTrack)) settings.worldsTrack = 'worlds-arena';
  saveSettings();
  renderPanel();
  renderButton();
}

function installUnlockGesture() {
  const unlock = async () => {
    unlocked = true;
    const context = ensureAudioContext();
    if (context?.state === 'suspended') {
      try { await context.resume(); } catch {}
    }
    if (settings.enabled) startPlayback(true);
  };
  document.addEventListener('pointerdown', unlock, { once: true, capture: true });
  document.addEventListener('keydown', unlock, { once: true, capture: true });
}

export function setMusicSection(sectionId) {
  const next = sectionId || 'dashboard';
  const before = effectiveTrackId();
  currentSection = next;
  const after = effectiveTrackId();
  updateBodyMode();
  renderButton();
  renderPanel();
  if (settings.enabled && unlocked && before !== after) startPlayback(true);
}

export function initMusicCenter() {
  if (initialized) return;
  initialized = true;
  currentSection = document.querySelector('.page-section.active-section')?.id || 'dashboard';
  installUi();
  installUnlockGesture();
  hydrateCustomTracks().then(() => {
    if (settings.enabled && unlocked) startPlayback(true);
  });
  onLanguageChange(() => {
    renderButton();
    renderPanel();
  });
}
