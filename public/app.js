import { $, $$, api, esc, initModal, publicMetaPatch } from './js/shared.js';
import { initMeta } from './js/meta.js';
import { initAssets, ensureAssets } from './js/assets.js';
import { initEsports, ensureEsports } from './js/esports.js';
import { initIntelligence } from './js/intelligence.js';

const APP_VERSION = '2.5.1';
let patchesLoaded = false;

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
  if (id === 'assets') ensureAssets();
  if (id === 'esports') ensureEsports();
  if (id === 'patch') loadPatches();
  history.replaceState(null, '', '#' + id);
  window.scrollTo({ top: 64, behavior: 'smooth' });
}

document.addEventListener('rift:navigate', event => switchSection(event.detail));

async function loadStatus() {
  const status = await api('/api/status');
  const publicPatch = publicMetaPatch(status.metaPatch);
  $('#patchLive').textContent = status.metaPatch === 'live-data' ? 'LIVE' : publicPatch;
  $('#sampleGames').textContent = Number(status.sampleGames || 0).toLocaleString('vi-VN');
  $('#globalPlayers').textContent = Number(status.esportsPlayers || 0).toLocaleString('vi-VN');
  $('#globalTeams').textContent = Number(status.esportsTeams || 0).toLocaleString('vi-VN');
  const scope = status.metaScope === 'GLOBAL' || String(status.metaMode || '').toLowerCase().includes('global') ? 'GLOBAL' : (status.platform || 'DATA').toUpperCase();
  $('#statusBadge').innerHTML = `<span></span> ${scope} • Patch ${esc(publicPatch)} • ${Number(status.sampleGames || 0).toLocaleString('vi-VN')} games`;
}

async function getPatchData() {
  let live = null;
  try {
    live = await api('/api/patches');
    if ((live.patches || []).length) return live;
  } catch {}

  try {
    const cached = await api(`/data/patches.json?v=${Date.now()}`);
    if ((cached.patches || []).length) return { ...cached, sourceMode: 'cache', liveWarning: live?.warning || null };
  } catch (error) {
    if (live) return live;
    throw error;
  }

  return live || { patches: [], warning: 'Chưa đọc được Patch Notes.' };
}

async function loadPatches() {
  if (patchesLoaded) return;
  patchesLoaded = true;
  try {
    const data = await getPatchData();
    const rows = data.patches || [];
    $('#patchGrid').innerHTML = rows.length ? rows.map((p, i) => `<a class="patch-card rich-patch-card" href="${esc(p.url)}" target="_blank" rel="noreferrer">
      ${p.image ? `<img class="patch-banner" src="${esc(p.image)}" alt="${esc(p.title || `Patch ${p.patch}`)}" loading="lazy">` : ''}
      <div class="patch-card-body">
        <div class="eyebrow">${i === 0 ? 'LATEST • RIOT GAMES' : 'RIOT GAMES'}${data.sourceMode === 'cache' ? ' • CACHED' : ''}</div>
        <div class="patch-num">${esc(p.patch)}</div>
        <p>${esc(p.title)}</p>
        ${p.description ? `<small>${esc(p.description)}</small>` : ''}
        <b>Đọc Patch Notes chính thức ↗</b>
      </div>
    </a>`).join('') : `<div class="notice">${esc(data.warning || 'Chưa đọc được Patch Notes.')}</div>`;
  } catch (error) {
    $('#patchGrid').innerHTML = `<div class="notice">${esc(error.message)}</div>`;
  }
}

async function boot() {
  applyVersionBranding();
  initModal();
  initAssets();
  initEsports();
  $$('.nav-btn').forEach(button => button.onclick = () => switchSection(button.dataset.section));
  $$('[data-go]').forEach(button => button.onclick = () => switchSection(button.dataset.go));

  const hash = location.hash.replace('#', '');
  try {
    await Promise.all([loadStatus(), initMeta(), initIntelligence()]);
    if (hash && document.getElementById(hash)) switchSection(hash);
  } catch (error) {
    console.error(error);
    $('#statusBadge').innerHTML = '<span class="error-dot"></span> Lỗi đồng bộ';
  }
}

boot();
