import { api, esc } from './shared.js';
import { getLanguage, locale, onLanguageChange, setLanguage, t } from './i18n.js';

const STORAGE_KEY = 'rift:user-preferences:v1';
const PROFILE_VERSION = 1;
const countryCodes = [
  'VN','KR','CN','TW','JP','US','CA','MX','BR','AR','CL','PE','GB','FR','DE','ES','PT','IT','NL','BE','PL','SE','NO','DK','FI','CZ','RO','TR','AU','NZ','PH','SG','MY','TH','ID','OTHER'
];
const lanes = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

let current = null;
let draft = null;
let step = 0;
let editing = false;
let overlay = null;
let teams = [];
let playerSuggestions = [];
let playerTimer = null;
let teamsLoading = false;

function ensureCss() {
  if (document.querySelector('link[data-rift-preferences]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/preferences.css';
  link.dataset.riftPreferences = 'true';
  document.head.appendChild(link);
}

function loadSaved() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return parsed && parsed.version === PROFILE_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function saveCurrent(value) {
  current = { ...value, version: PROFILE_VERSION, updatedAt: new Date().toISOString() };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch {}
  return current;
}

function inferredCountry() {
  const localeValue = navigator.languages?.[0] || navigator.language || '';
  const region = String(localeValue).split('-')[1]?.toUpperCase();
  return countryCodes.includes(region) ? region : (String(localeValue).toLowerCase().startsWith('vi') ? 'VN' : 'OTHER');
}

function emptyDraft() {
  return {
    country: inferredCountry(),
    teamId: '',
    teamName: '',
    lane: 'MIDDLE',
    playerName: '',
    language: getLanguage()
  };
}

function flag(code) {
  if (!code || code === 'OTHER') return '🌐';
  return [...code].map(char => String.fromCodePoint(127397 + char.charCodeAt(0))).join('');
}

function countryName(code) {
  if (code === 'OTHER') return getLanguage() === 'vi' ? 'Khác' : 'Other';
  try {
    return new Intl.DisplayNames([getLanguage() === 'vi' ? 'vi' : 'en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

function laneLabel(lane) {
  return ({ TOP: t('top'), JUNGLE: t('jungle'), MIDDLE: t('middle'), BOTTOM: t('bottom'), UTILITY: t('utility') })[lane] || t('allRoles');
}

function laneIcon(lane) {
  return ({ TOP:'⬆️', JUNGLE:'🌿', MIDDLE:'◆', BOTTOM:'🎯', UTILITY:'🛡️' })[lane] || '✦';
}

async function ensureTeams() {
  if (teams.length || teamsLoading) return;
  teamsLoading = true;
  try {
    const data = await api('/api/esports/filters');
    teams = data.teams || [];
  } catch {
    teams = [];
  } finally {
    teamsLoading = false;
    if (overlay && step === 2) renderWizard();
  }
}

async function searchPlayers(query) {
  const search = String(query || '').trim();
  if (search.length < 2) {
    playerSuggestions = [];
    updatePlayerDatalist();
    return;
  }
  try {
    const qs = new URLSearchParams({ page: '1', limit: '24', search, role: 'ALL', region: 'ALL', team: 'ALL' });
    const data = await api('/api/esports?' + qs);
    const seen = new Set();
    playerSuggestions = (data.players || []).filter(player => {
      const key = String(player.id || '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    updatePlayerDatalist();
  } catch {
    playerSuggestions = [];
    updatePlayerDatalist();
  }
}

function updatePlayerDatalist() {
  const list = document.getElementById('prefPlayerList');
  if (!list) return;
  list.innerHTML = playerSuggestions.map(player => {
    const team = player.currentTeamName || player.team?.name || '';
    const label = [team, player.team?.region].filter(Boolean).join(' • ');
    return `<option value="${esc(player.id)}">${esc(label)}</option>`;
  }).join('');
}

function ensureTopbarButton() {
  const topbar = document.querySelector('.topbar');
  const status = document.getElementById('statusBadge');
  if (!topbar || document.getElementById('preferencesBtn')) return;
  const button = document.createElement('button');
  button.id = 'preferencesBtn';
  button.className = 'preferences-btn';
  button.type = 'button';
  if (status) topbar.insertBefore(button, status);
  else topbar.appendChild(button);
  button.onclick = () => openPreferences(true);
  refreshTopbarButton();
}

function refreshTopbarButton() {
  const button = document.getElementById('preferencesBtn');
  if (!button) return;
  const marker = current?.country ? flag(current.country) : '👤';
  button.innerHTML = `<span>${marker}</span><b>${esc(t('preferences'))}</b>`;
  button.title = t('editPreferences');
}

function applySavedFilters(profile) {
  if (!profile) return;
  const lane = lanes.includes(profile.lane) ? profile.lane : '';
  const mappings = [
    ['#role', lane || 'ALL'],
    ['#playerRole', lane || 'ALL'],
    ['#counterRole', lane]
  ];
  for (const [selector, value] of mappings) {
    const select = document.querySelector(selector);
    if (select && [...select.options].some(option => option.value === value)) select.value = value;
  }
}

function profileStripHtml(profile) {
  const team = profile.teamName || t('notSelected');
  const player = profile.playerName || t('notSelected');
  return `<div class="rift-profile-strip-inner">
    <div class="rift-profile-title"><span class="profile-orb">${flag(profile.country)}</span><div><small>${esc(t('myRiftProfile'))}</small><b>${esc(t('personalizedForYou'))}</b></div></div>
    <div class="rift-profile-facts">
      <button type="button" data-profile-action="country"><small>${esc(t('country'))}</small><b>${esc(countryName(profile.country))}</b></button>
      <button type="button" data-profile-action="team"><small>${esc(t('favoriteTeam'))}</small><b>${esc(team)}</b></button>
      <button type="button" data-profile-action="lane"><small>${esc(t('favoriteLane'))}</small><b>${laneIcon(profile.lane)} ${esc(laneLabel(profile.lane))}</b></button>
      <button type="button" data-profile-action="player"><small>${esc(t('favoritePlayer'))}</small><b>${esc(player)}</b></button>
    </div>
    <button class="secondary profile-edit-btn" type="button" data-profile-action="edit">⚙ ${esc(t('edit'))}</button>
  </div>`;
}

function renderProfileStrip() {
  const dashboard = document.getElementById('dashboard');
  const hero = dashboard?.querySelector('.hero');
  if (!dashboard || !hero) return;
  let strip = document.getElementById('riftProfileStrip');
  if (!strip) {
    strip = document.createElement('div');
    strip.id = 'riftProfileStrip';
    strip.className = 'rift-profile-strip';
    hero.insertAdjacentElement('afterend', strip);
  }
  if (!current) {
    strip.innerHTML = '';
    strip.classList.add('hidden');
    return;
  }
  strip.classList.remove('hidden');
  strip.innerHTML = profileStripHtml(current);
  strip.querySelector('[data-profile-action="edit"]')?.addEventListener('click', () => openPreferences(true));
  strip.querySelector('[data-profile-action="country"]')?.addEventListener('click', () => openPreferences(true, 1));
  strip.querySelector('[data-profile-action="team"]')?.addEventListener('click', () => openPreferences(true, 2));
  strip.querySelector('[data-profile-action="lane"]')?.addEventListener('click', () => {
    const role = document.getElementById('role');
    if (role && current.lane) role.value = current.lane;
    document.dispatchEvent(new CustomEvent('rift:navigate', { detail: 'meta' }));
    role?.dispatchEvent(new Event('change'));
  });
  strip.querySelector('[data-profile-action="player"]')?.addEventListener('click', () => {
    if (!current.playerName) return openPreferences(true, 4);
    const input = document.getElementById('playerSearch');
    if (input) input.value = current.playerName;
    document.dispatchEvent(new CustomEvent('rift:navigate', { detail: 'esports' }));
    input?.dispatchEvent(new Event('input'));
  });
}

function toast(message, subtitle = '') {
  document.querySelector('.rift-toast')?.remove();
  const node = document.createElement('div');
  node.className = 'rift-toast';
  node.innerHTML = `<span>✦</span><div><b>${esc(message)}</b>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</div>`;
  document.body.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 260);
  }, 3600);
}

function progressHtml() {
  return `<div class="pref-progress">${Array.from({ length: 6 }, (_, index) => `<span class="${index <= step ? 'active' : ''}"></span>`).join('')}</div>`;
}

function countryStep() {
  const options = countryCodes.map(code => `<option value="${code}" ${draft.country === code ? 'selected' : ''}>${flag(code)} ${esc(countryName(code))}</option>`).join('');
  return `<div class="pref-step-copy"><span class="pref-kicker">01 • ${esc(t('country'))}</span><h2>${esc(t('countryTitle'))}</h2><p>${esc(t('countryLead'))}</p></div>
    <label class="pref-field"><span>${esc(t('country'))}</span><select id="prefCountry">${options}</select></label>`;
}

function teamStep() {
  const options = teams.map(team => `<option value="${esc(team.name)}">${esc([team.short, team.region].filter(Boolean).join(' • '))}</option>`).join('');
  return `<div class="pref-step-copy"><span class="pref-kicker">02 • ESPORTS</span><h2>${esc(t('teamTitle'))}</h2><p>${esc(t('teamLead'))}</p></div>
    <label class="pref-field"><span>${esc(t('favoriteTeam'))}</span><input id="prefTeam" list="prefTeamList" value="${esc(draft.teamName || '')}" placeholder="${esc(teamsLoading ? t('loadingTeams') : t('teamPlaceholder'))}" autocomplete="off"><datalist id="prefTeamList">${options}</datalist><small>${esc(t('teamOptional'))}</small></label>`;
}

function laneStep() {
  return `<div class="pref-step-copy"><span class="pref-kicker">03 • ROLE</span><h2>${esc(t('laneTitle'))}</h2><p>${esc(t('laneLead'))}</p></div>
    <div class="lane-picker">${lanes.map(lane => `<button type="button" class="lane-choice ${draft.lane === lane ? 'active' : ''}" data-lane="${lane}"><span>${laneIcon(lane)}</span><b>${esc(laneLabel(lane))}</b><small>${lane}</small></button>`).join('')}</div>`;
}

function playerStep() {
  return `<div class="pref-step-copy"><span class="pref-kicker">04 • PRO PLAYER</span><h2>${esc(t('playerTitle'))}</h2><p>${esc(t('playerLead'))}</p></div>
    <label class="pref-field"><span>${esc(t('favoritePlayer'))}</span><input id="prefPlayer" list="prefPlayerList" value="${esc(draft.playerName || '')}" placeholder="${esc(t('playerPlaceholder'))}" autocomplete="off"><datalist id="prefPlayerList"></datalist><small>${esc(t('playerOptional'))}</small></label>`;
}

function languageStep() {
  return `<div class="pref-step-copy"><span class="pref-kicker">05 • LANGUAGE</span><h2>${esc(t('languageTitle'))}</h2><p>${esc(t('languageLead'))}</p></div>
    <div class="language-picker">
      <button type="button" class="language-choice ${draft.language === 'vi' ? 'active' : ''}" data-language="vi"><span>🇻🇳</span><div><b>Tiếng Việt</b><small>Vietnamese</small></div></button>
      <button type="button" class="language-choice ${draft.language === 'en' ? 'active' : ''}" data-language="en"><span>🌐</span><div><b>English</b><small>English</small></div></button>
    </div>
    <div class="pref-summary">
      <div><small>${esc(t('country'))}</small><b>${flag(draft.country)} ${esc(countryName(draft.country))}</b></div>
      <div><small>${esc(t('favoriteTeam'))}</small><b>${esc(draft.teamName || t('notSelected'))}</b></div>
      <div><small>${esc(t('favoriteLane'))}</small><b>${esc(laneLabel(draft.lane))}</b></div>
      <div><small>${esc(t('favoritePlayer'))}</small><b>${esc(draft.playerName || t('notSelected'))}</b></div>
    </div>`;
}

function welcomeStep() {
  return `<div class="welcome-mark"><span>R</span></div><div class="pref-step-copy centered"><span class="pref-kicker">RIFT META GLOBAL</span><h1>${esc(t('welcomeTitle'))}</h1><p>${esc(t('welcomeLead'))}</p></div>
    <div class="welcome-features"><span>🌍 ${esc(t('country'))}</span><span>🏆 ${esc(t('favoriteTeam'))}</span><span>◆ ${esc(t('favoriteLane'))}</span><span>⭐ ${esc(t('favoritePlayer'))}</span><span>文 ${esc(t('language'))}</span></div>`;
}

function bodyForStep() {
  if (step === 0) return welcomeStep();
  if (step === 1) return countryStep();
  if (step === 2) return teamStep();
  if (step === 3) return laneStep();
  if (step === 4) return playerStep();
  return languageStep();
}

function syncDraftFromInputs() {
  const country = document.getElementById('prefCountry');
  const team = document.getElementById('prefTeam');
  const player = document.getElementById('prefPlayer');
  if (country) draft.country = country.value;
  if (team) {
    draft.teamName = team.value.trim();
    const match = teams.find(row => row.name.toLowerCase() === draft.teamName.toLowerCase());
    draft.teamId = match?.id || '';
    if (match) draft.teamName = match.name;
  }
  if (player) draft.playerName = player.value.trim();
}

function bindWizard() {
  overlay?.querySelector('[data-pref-close]')?.addEventListener('click', closePreferences);
  overlay?.querySelector('[data-pref-back]')?.addEventListener('click', () => {
    syncDraftFromInputs();
    step = Math.max(0, step - 1);
    renderWizard();
  });
  overlay?.querySelector('[data-pref-next]')?.addEventListener('click', () => {
    syncDraftFromInputs();
    if (step >= 5) return finishPreferences();
    step++;
    if (step === 2) ensureTeams();
    renderWizard();
  });
  overlay?.querySelectorAll('[data-quick-lang]').forEach(button => button.addEventListener('click', () => {
    syncDraftFromInputs();
    draft.language = button.dataset.quickLang;
    setLanguage(draft.language);
    renderWizard();
  }));
  overlay?.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => {
    draft.language = button.dataset.language;
    setLanguage(draft.language);
    renderWizard();
  }));
  overlay?.querySelectorAll('[data-lane]').forEach(button => button.addEventListener('click', () => {
    draft.lane = button.dataset.lane;
    renderWizard();
  }));
  const player = document.getElementById('prefPlayer');
  if (player) {
    updatePlayerDatalist();
    player.addEventListener('input', () => {
      draft.playerName = player.value.trim();
      clearTimeout(playerTimer);
      playerTimer = setTimeout(() => searchPlayers(player.value), 240);
    });
  }
}

function renderWizard() {
  if (!overlay) return;
  overlay.innerHTML = `<div class="preferences-panel" role="dialog" aria-modal="true">
    <div class="preferences-head">
      <div class="pref-lang-mini"><button type="button" data-quick-lang="vi" class="${draft.language === 'vi' ? 'active' : ''}">VI</button><button type="button" data-quick-lang="en" class="${draft.language === 'en' ? 'active' : ''}">EN</button></div>
      ${progressHtml()}
      ${editing ? '<button class="pref-close" type="button" data-pref-close aria-label="Close">×</button>' : '<span class="pref-close-spacer"></span>'}
    </div>
    <div class="preferences-body">${bodyForStep()}</div>
    <div class="preferences-foot">
      ${step > 0 ? `<button class="secondary" type="button" data-pref-back>← ${esc(t('back'))}</button>` : '<span></span>'}
      <button class="primary pref-next" type="button" data-pref-next>${esc(step === 0 ? t('start') : step === 5 ? t('save') : t('next'))} ${step < 5 ? '→' : '✓'}</button>
    </div>
  </div>`;
  bindWizard();
}

function closePreferences() {
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => {
    overlay?.remove();
    overlay = null;
  }, 180);
}

function finishPreferences() {
  syncDraftFromInputs();
  draft.language = draft.language === 'en' ? 'en' : 'vi';
  saveCurrent(draft);
  setLanguage(current.language);
  applySavedFilters(current);
  refreshTopbarButton();
  renderProfileStrip();
  closePreferences();
  toast(t('saved'), `${flag(current.country)} ${countryName(current.country)} • ${laneLabel(current.lane)}`);
  document.dispatchEvent(new CustomEvent('rift:preferences', { detail: { ...current } }));
}

export function openPreferences(isEditing = false, startStep = null) {
  ensureCss();
  editing = Boolean(isEditing && current);
  draft = { ...(current || emptyDraft()) };
  if (!draft.language) draft.language = getLanguage();
  step = Number.isInteger(startStep) ? Math.max(0, Math.min(5, startStep)) : (editing ? 1 : 0);
  overlay?.remove();
  overlay = document.createElement('div');
  overlay.className = 'preferences-overlay';
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay?.classList.add('show'));
  if (step === 2) ensureTeams();
  renderWizard();
}

export function getPreferences() {
  return current ? { ...current } : null;
}

export function initPreferences() {
  ensureCss();
  current = loadSaved();
  ensureTopbarButton();
  if (current?.language) setLanguage(current.language, { emit: false });
  applySavedFilters(current);
  renderProfileStrip();

  onLanguageChange(() => {
    refreshTopbarButton();
    renderProfileStrip();
    if (overlay) renderWizard();
  });

  if (!current) {
    setTimeout(() => openPreferences(false), 120);
  } else {
    setTimeout(() => toast(`${t('welcomeBack')}${current.playerName ? `, ${current.playerName} fan` : ''}!`, `${flag(current.country)} ${countryName(current.country)} • ${laneLabel(current.lane)}`), 700);
  }

  return current;
}
