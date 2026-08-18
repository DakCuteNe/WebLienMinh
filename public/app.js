import { $, $$, api, esc, initModal } from './js/shared.js';
import { initMeta } from './js/meta.js';
import { initAssets, ensureAssets } from './js/assets.js';
import { initEsports, ensureEsports } from './js/esports.js';
import { initIntelligence } from './js/intelligence.js';

let patchesLoaded = false;

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
  $('#patchLive').textContent = status.metaPatch === 'live-data' ? 'LIVE' : status.metaPatch;
  $('#sampleGames').textContent = Number(status.sampleGames || 0).toLocaleString('vi-VN');
  $('#globalPlayers').textContent = Number(status.esportsPlayers || 0).toLocaleString('vi-VN');
  $('#globalTeams').textContent = Number(status.esportsTeams || 0).toLocaleString('vi-VN');
  const scope = String(status.metaMode || '').toLowerCase().includes('global') ? 'GLOBAL' : (status.platform || 'DATA').toUpperCase();
  $('#statusBadge').innerHTML = `<span></span> ${scope} • Patch ${esc(status.metaPatch)} • ${Number(status.sampleGames || 0).toLocaleString('vi-VN')} games`;
}

async function loadPatches() {
  if (patchesLoaded) return;
  patchesLoaded = true;
  try {
    const data = await api('/api/patches');
    $('#patchGrid').innerHTML = (data.patches || []).length ? data.patches.map((p, i) => `<a class="patch-card" href="${esc(p.url)}" target="_blank" rel="noreferrer"><div class="eyebrow">${i === 0 ? 'LATEST • RIOT GAMES' : 'RIOT GAMES'}</div><div class="patch-num">${esc(p.patch)}</div><p>${esc(p.title)}</p><b>Đọc patch notes ↗</b></a>`).join('') : `<div class="notice">${esc(data.warning || 'Chưa đọc được Patch Notes.')}</div>`;
  } catch (error) {
    $('#patchGrid').innerHTML = `<div class="notice">${esc(error.message)}</div>`;
  }
}

async function boot() {
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
