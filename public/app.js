import { $, $$, api, esc, initModal, publicMetaPatch } from './js/shared.js';
import { initMeta } from './js/meta.js';
import { initAssets, ensureAssets } from './js/assets.js';
import { initEsports, ensureEsports } from './js/esports.js';
import { initIntelligence } from './js/intelligence.js';
import { getLanguage, initI18n, locale, onLanguageChange, t } from './js/i18n.js';
import { initPreferences } from './js/preferences.js';
import { initUX } from './js/ux.js';
import { initAmbient } from './js/ambient.js';
import { initWorlds } from './js/worlds.js';
import { initSchedule, ensureSchedule } from './js/schedule.js';
import { initLiveMatchCenter } from './js/match-live.js';
import { initTeamPredictions } from './js/team-predictions.js';
import { initRiotMusic, setRiotMusicSection } from './js/riot-music.js';

const APP_VERSION = '3.6.0';
let patchesLoaded = false;

function installScheduleBalanceCss() {
  if (document.querySelector('link[data-schedule-balance]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/schedule-structural.css?v=${APP_VERSION}`;
  link.dataset.scheduleBalance = 'true';
  document.head.appendChild(link);
}

function applyVersionBranding() {
  document.title = `Rift Meta Global ${APP_VERSION} — Global LoL Analytics & Esports`;
  const badge = document.querySelector('.new-version');
  if (badge) badge.textContent = APP_VERSION;
  const intelLabel = $$('.eyebrow').find(node => /LIVE INTELLIGENCE/i.test(node.textContent || ''));
  if (intelLabel) intelLabel.textContent = `LIVE INTELLIGENCE ${APP_VERSION}`;
}

function switchSection(id) {
  $$('.page-section').forEach(section => section.classList.toggle('active-section', section.id === id));
  $$('.nav-btn').forEach(button => button.classList.toggle('active', button.dataset.section === id));
  setRiotMusicSection(id);
  if (id === 'assets') ensureAssets();
  if (id === 'esports') ensureEsports();
  if (id === 'schedule') ensureSchedule();
  if (id === 'patch') loadPatches();
  history.replaceState(null, '', '#' + id);
  window.scrollTo({ top: 64, behavior: 'smooth' });
}

document.addEventListener('rift:navigate', event => switchSection(event.detail));

async function loadStatus() {
  const status = await api('/api/status');
  const publicPatch = publicMetaPatch(status.metaPatch);
  const numberLocale = locale();
  $('#patchLive').textContent = status.metaPatch === 'live-data' ? 'LIVE' : publicPatch;
  $('#sampleGames').textContent = Number(status.sampleGames || 0).toLocaleString(numberLocale);
  $('#globalPlayers').textContent = Number(status.esportsPlayers || 0).toLocaleString(numberLocale);
  $('#globalTeams').textContent = Number(status.esportsTeams || 0).toLocaleString(numberLocale);
  const scope = status.metaScope === 'GLOBAL' || String(status.metaMode || '').toLowerCase().includes('global') ? 'GLOBAL' : (status.platform || 'DATA').toUpperCase();
  const gameWord = getLanguage() === 'vi' ? 'trận' : 'games';
  $('#statusBadge').innerHTML = `<span></span> ${scope} • Patch ${esc(publicPatch)} • ${Number(status.sampleGames || 0).toLocaleString(numberLocale)} ${gameWord}`;
}

async function getPatchData() {
  let live = null;
  let cached = null;
  try { live = await api('/api/patches'); } catch {}
  try { cached = await api(`/data/patches.json?v=${Date.now()}`); } catch {}
  if ((live?.patches || []).length) {
    const cachedByPatch = new Map((cached?.patches || []).map(row => [String(row.patch), row]));
    const patches = live.patches.map(row => {
      const fallback = cachedByPatch.get(String(row.patch)) || {};
      return { ...fallback, ...row, image: row.image || fallback.image || null, description: row.description || fallback.description || '', publishedAt: row.publishedAt || fallback.publishedAt || null };
    });
    return { ...(cached || {}), ...live, patches, sourceMode: live.sourceMode || 'live' };
  }
  if ((cached?.patches || []).length) return { ...cached, sourceMode: 'cache', liveWarning: live?.warning || null };
  return live || cached || { patches: [], warning: t('patchUnavailable') };
}

async function loadPatches() {
  if (patchesLoaded) return;
  patchesLoaded = true;
  try {
    const data = await getPatchData();
    const rows = data.patches || [];
    $('#patchGrid').innerHTML = rows.length ? rows.map((p, i) => `<a class="patch-card rich-patch-card" href="${esc(p.url)}" target="_blank" rel="noreferrer">${p.image ? `<img class="patch-banner" src="${esc(p.image)}" alt="${esc(p.title || `Patch ${p.patch}`)}" loading="lazy">` : ''}<div class="patch-card-body"><div class="eyebrow">${i === 0 ? t('latestRiot') : t('riotGames')}${data.sourceMode === 'cache' ? ` • ${t('cached')}` : ''}</div><div class="patch-num">${esc(p.patch)}</div><p>${esc(p.title)}</p>${p.description ? `<small>${esc(p.description)}</small>` : ''}<b>${esc(t('readPatch'))}</b></div></a>`).join('') : `<div class="notice">${esc(data.warning || t('patchUnavailable'))}</div>`;
  } catch (error) {
    $('#patchGrid').innerHTML = `<div class="notice">${esc(error.message)}</div>`;
  }
}

async function boot() {
  initI18n();
  applyVersionBranding();
  initModal();
  initAssets();
  initEsports();
  initPreferences();
  initAmbient();
  initSchedule();
  initLiveMatchCenter();
  initTeamPredictions();
  initRiotMusic();
  installScheduleBalanceCss();
  initWorlds();
  initUX();
  $$('.nav-btn').forEach(button => button.onclick = () => switchSection(button.dataset.section));
  $$('[data-go]').forEach(button => button.onclick = () => switchSection(button.dataset.go));
  onLanguageChange(() => {
    applyVersionBranding();
    loadStatus().catch(() => {});
    if (patchesLoaded) { patchesLoaded = false; loadPatches().catch(() => {}); }
  });
  const hash = location.hash.replace('#', '');
  try {
    await Promise.all([loadStatus(), initMeta(), initIntelligence()]);
    if (hash && document.getElementById(hash)) switchSection(hash);
  } catch (error) {
    console.error(error);
    $('#statusBadge').innerHTML = `<span class="error-dot"></span> ${esc(t('syncError'))}`;
  }
}

boot();
