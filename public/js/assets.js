import { $, $$, api, esc } from './shared.js';
import { getChampionIndex } from './meta.js';

let currentAsset = 'champions';
let loaded = false;
let cached = { champions: null, items: null, runes: null };

export function initAssets() {
  $$('.asset-tab').forEach(button => button.onclick = () => {
    currentAsset = button.dataset.asset;
    $$('.asset-tab').forEach(x => x.classList.toggle('active', x === button));
    loadAssets(true);
  });
  let timer;
  $('#assetSearch').oninput = () => { clearTimeout(timer); timer = setTimeout(() => loadAssets(true), 180); };
}

export async function ensureAssets() {
  if (!loaded) await loadAssets();
}

async function loadAssets(force = false) {
  const q = $('#assetSearch').value.trim().toLowerCase();
  $('#assetGrid').innerHTML = '<div class="loading-card">Đang tải asset...</div>';
  try {
    if (currentAsset === 'champions') {
      if (!cached.champions) cached.champions = getChampionIndex();
      let rows = [...(cached.champions || [])];
      if (q) rows = rows.filter(x => `${x.name} ${x.title} ${(x.tags || []).join(' ')}`.toLowerCase().includes(q));
      $('#assetGrid').innerHTML = rows.map(c => `<article class="asset-card champion-card" data-id="${esc(c.id)}"><img class="asset-splash" src="${esc(c.splash)}" loading="lazy"><div class="asset-card-body"><div class="asset-icon-wrap"><img src="${esc(c.image)}"></div><div><h3>${esc(c.name)}</h3><p>${esc(c.title)}</p><div class="tags">${(c.tags || []).map(t => `<span>${esc(t)}</span>`).join('')}</div></div></div></article>`).join('') || '<div class="empty-state">Không tìm thấy tướng.</div>';
    }

    if (currentAsset === 'items') {
      if (!cached.items || force) cached.items = (await api('/api/assets/items?search=' + encodeURIComponent(q))).items || [];
      $('#assetGrid').innerHTML = cached.items.map(item => `<article class="asset-card compact-card"><img class="square-icon" src="${esc(item.image || '')}" loading="lazy"><div><h3>${esc(item.name)}</h3><p>${esc(item.description || item.fullDescription || '')}</p><small>${Number(item.gold || 0).toLocaleString('vi-VN')} vàng</small></div></article>`).join('') || '<div class="empty-state">Không tìm thấy trang bị.</div>';
    }

    if (currentAsset === 'runes') {
      if (!cached.runes || force) cached.runes = (await api('/api/assets/runes?search=' + encodeURIComponent(q))).trees || [];
      $('#assetGrid').innerHTML = cached.runes.map(tree => `<article class="rune-tree-card"><div class="rune-tree-head"><img src="${esc(tree.icon || '')}"><div><div class="eyebrow">RUNE TREE</div><h3>${esc(tree.name)}</h3></div></div><div class="rune-grid">${(tree.runes || []).map(r => `<div class="rune-entry" title="${esc(r.shortDesc || '')}"><img src="${esc(r.icon || '')}"><span>${esc(r.name)}</span></div>`).join('')}</div></article>`).join('') || '<div class="empty-state">Không tìm thấy ngọc.</div>';
    }
    loaded = true;
  } catch (error) {
    $('#assetGrid').innerHTML = `<div class="notice">${esc(error.message)}</div>`;
  }
}
