import { $, api, esc } from './shared.js';
import { getChampionIndex } from './meta.js';
import { getLanguage, onLanguageChange } from './i18n.js';

const UI_VERSION = '3.9.0';
const PREFS_KEY = 'rift:assets-library:v1';
const FAVORITES_KEY = 'rift:assets-favorites:v1';
const PAGE_SIZE = 48;

const COPY = {
  vi: {
    eyebrow: 'RIOT DATA DRAGON • ASSET LIBRARY',
    title: 'Kho dữ liệu <span>Riot Assets</span>',
    lead: 'Duyệt tướng, trang bị và ngọc theo giao diện gallery rõ ràng, nhanh và dễ tìm hơn.',
    showing: 'Đang hiển thị', favorites: 'Yêu thích', category: 'Loại dữ liệu',
    champions: 'Tướng', items: 'Trang bị', runes: 'Ngọc',
    search: 'Tìm tướng, trang bị, ngọc...', sort: 'Sắp xếp',
    sortRiot: 'Thứ tự Riot', sortAZ: 'Tên A → Z', sortZA: 'Tên Z → A', sortGold: 'Giá cao → thấp',
    grid: 'Grid', compact: 'Compact', favoriteOnly: 'Chỉ yêu thích', reset: 'Đặt lại',
    loading: 'Đang tải Riot assets...', empty: 'Không tìm thấy asset phù hợp.', emptyHint: 'Thử đổi từ khóa hoặc bỏ bộ lọc yêu thích.',
    preview: 'Xem trước', copy: 'Copy URL', copied: 'Đã copy URL', open: 'Mở ảnh gốc', favorite: 'Yêu thích', unfavorite: 'Bỏ yêu thích',
    source: 'Nguồn', dataDragon: 'Riot Data Dragon', tags: 'Phân loại', gold: 'Giá', runesCount: 'ngọc',
    loadMore: 'Xem thêm', allLoaded: 'Đã hiển thị toàn bộ', noDescription: 'Không có mô tả.',
    previous: 'Asset trước', next: 'Asset sau', close: 'Đóng preview', results: 'kết quả',
    shortcut: 'Nhấn / để tìm nhanh', favoriteSaved: 'Đã thêm vào yêu thích', favoriteRemoved: 'Đã bỏ khỏi yêu thích'
  },
  en: {
    eyebrow: 'RIOT DATA DRAGON • ASSET LIBRARY',
    title: 'Riot <span>Assets Library</span>',
    lead: 'Browse champions, items and runes in a cleaner, faster gallery designed for discovery.',
    showing: 'Showing', favorites: 'Favorites', category: 'Data type',
    champions: 'Champions', items: 'Items', runes: 'Runes',
    search: 'Search champions, items, runes...', sort: 'Sort',
    sortRiot: 'Riot order', sortAZ: 'Name A → Z', sortZA: 'Name Z → A', sortGold: 'Gold high → low',
    grid: 'Grid', compact: 'Compact', favoriteOnly: 'Favorites only', reset: 'Reset',
    loading: 'Loading Riot assets...', empty: 'No matching assets found.', emptyHint: 'Try another keyword or disable the favorites filter.',
    preview: 'Preview', copy: 'Copy URL', copied: 'URL copied', open: 'Open original', favorite: 'Favorite', unfavorite: 'Remove favorite',
    source: 'Source', dataDragon: 'Riot Data Dragon', tags: 'Tags', gold: 'Gold', runesCount: 'runes',
    loadMore: 'Load more', allLoaded: 'All assets displayed', noDescription: 'No description available.',
    previous: 'Previous asset', next: 'Next asset', close: 'Close preview', results: 'results',
    shortcut: 'Press / to search', favoriteSaved: 'Added to favorites', favoriteRemoved: 'Removed from favorites'
  }
};

let initialized = false;
let currentAsset = 'champions';
let page = 1;
let visibleRows = [];
let previewIndex = -1;
let cached = { champions: null, items: null, runes: null };
let loadingCategory = null;
let prefs = loadPrefs();
let favorites = loadFavorites();
let searchTimer = null;

const lang = () => getLanguage() === 'en' ? 'en' : 'vi';
const c = () => COPY[lang()];

function loadPrefs() {
  try {
    return { view: 'grid', sort: 'riot', favoriteOnly: false, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}) };
  } catch {
    return { view: 'grid', sort: 'riot', favoriteOnly: false };
  }
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

function loadFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveFavorites() {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); } catch {}
}

function ensureCss() {
  if (document.querySelector('link[data-assets-library]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/assets-library.css?v=${UI_VERSION}`;
  link.dataset.assetsLibrary = 'true';
  document.head.appendChild(link);
}

function stripHtml(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try { return new DOMParser().parseFromString(raw, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() || ''; }
  catch { return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function keyFor(kind, row) {
  return `${kind}:${String(row?.id || row?.key || row?.name || 'unknown')}`;
}

function isFavorite(kind, row) {
  return favorites.has(keyFor(kind, row));
}

function imageFor(kind, row) {
  if (kind === 'champions') return row?.splash || row?.image || '';
  return row?.image || row?.icon || '';
}

function searchable(kind, row) {
  if (kind === 'champions') return `${row?.name || ''} ${row?.title || ''} ${(row?.tags || []).join(' ')}`.toLowerCase();
  if (kind === 'items') return `${row?.name || ''} ${stripHtml(row?.description || row?.fullDescription || '')} ${row?.id || ''}`.toLowerCase();
  return `${row?.name || ''} ${(row?.runes || []).map(r => `${r?.name || ''} ${stripHtml(r?.shortDesc || '')}`).join(' ')}`.toLowerCase();
}

function currentLabel() {
  return c()[currentAsset] || currentAsset;
}

function shellHtml() {
  const copy = c();
  return `
    <div class="assets-hero-panel">
      <div class="assets-hero-copy">
        <div class="eyebrow">${copy.eyebrow}</div>
        <h2>${copy.title}</h2>
        <p>${copy.lead}</p>
        <div class="assets-source-line"><span>◆</span> ${copy.dataDragon}<small>${copy.shortcut}</small></div>
      </div>
      <div class="assets-hero-stats" aria-label="Asset stats">
        <div><small>${copy.showing}</small><strong id="assetVisibleCount">0</strong><span>${copy.results}</span></div>
        <div><small>${copy.favorites}</small><strong id="assetFavoriteCount">${favorites.size}</strong><span>Local</span></div>
        <div><small>${copy.category}</small><strong id="assetCurrentType">${currentLabel()}</strong><span>Data Dragon</span></div>
      </div>
    </div>

    <div class="assets-toolbar" data-assets-toolbar>
      <div class="assets-tabs" role="tablist" aria-label="Asset categories">
        ${['champions','items','runes'].map(type => `<button type="button" class="assets-tab ${currentAsset === type ? 'active' : ''}" data-assets-type="${type}" role="tab" aria-selected="${currentAsset === type}"><span>${type === 'champions' ? '◈' : type === 'items' ? '⬡' : '✦'}</span>${copy[type]}</button>`).join('')}
      </div>
      <div class="assets-toolbar-main">
        <label class="assets-search-box">
          <span>⌕</span>
          <input id="assetSearch" autocomplete="off" value="" placeholder="${copy.search}" aria-label="${copy.search}" />
          <kbd>/</kbd>
        </label>
        <label class="assets-sort-box">
          <span>${copy.sort}</span>
          <select id="assetSort" aria-label="${copy.sort}">
            <option value="riot" ${prefs.sort === 'riot' ? 'selected' : ''}>${copy.sortRiot}</option>
            <option value="name-asc" ${prefs.sort === 'name-asc' ? 'selected' : ''}>${copy.sortAZ}</option>
            <option value="name-desc" ${prefs.sort === 'name-desc' ? 'selected' : ''}>${copy.sortZA}</option>
            <option value="gold-desc" ${prefs.sort === 'gold-desc' ? 'selected' : ''}>${copy.sortGold}</option>
          </select>
        </label>
        <button type="button" class="assets-filter-favorite ${prefs.favoriteOnly ? 'active' : ''}" id="assetFavoriteOnly" aria-pressed="${prefs.favoriteOnly}"><span>★</span>${copy.favoriteOnly}<b>${favorites.size}</b></button>
        <div class="assets-view-toggle" role="group" aria-label="View mode">
          <button type="button" data-assets-view="grid" class="${prefs.view === 'grid' ? 'active' : ''}" title="${copy.grid}" aria-label="${copy.grid}">▦</button>
          <button type="button" data-assets-view="compact" class="${prefs.view === 'compact' ? 'active' : ''}" title="${copy.compact}" aria-label="${copy.compact}">☷</button>
        </div>
        <button type="button" class="assets-reset" id="assetReset">↺ <span>${copy.reset}</span></button>
      </div>
      <div class="assets-results-meta"><span id="assetResultsMeta">0 ${copy.results}</span><span class="assets-results-line"></span><b id="assetCategoryMeta">${currentLabel()}</b></div>
    </div>

    <div id="assetGrid" class="assets-library-grid ${prefs.view === 'compact' ? 'is-compact' : ''}" aria-live="polite">${skeletonHtml()}</div>
    <div class="assets-load-more-wrap" id="assetLoadMoreWrap"></div>
    <div class="asset-preview-overlay" id="assetPreview" hidden></div>
    <div class="assets-toast" id="assetToast" role="status" aria-live="polite"></div>`;
}

function skeletonHtml(count = 8) {
  return Array.from({ length: count }, () => `<article class="asset-library-card skeleton"><div class="asset-card-media"></div><div class="asset-card-content"><i></i><b></b><span></span><span></span></div></article>`).join('');
}

function renderShell() {
  const section = $('#assets');
  if (!section) return;
  section.classList.add('assets-library-section');
  section.innerHTML = shellHtml();
  bindUi();
}

function bindUi() {
  document.querySelectorAll('[data-assets-type]').forEach(button => button.addEventListener('click', async () => {
    const next = button.dataset.assetsType;
    if (!next || next === currentAsset) return;
    currentAsset = next;
    page = 1;
    prefs.sort = 'riot';
    savePrefs();
    renderShell();
    await loadCurrentCategory();
  }));

  $('#assetSearch')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { page = 1; renderAssets(); }, 140);
  });

  $('#assetSort')?.addEventListener('change', event => {
    prefs.sort = event.target.value;
    savePrefs();
    page = 1;
    renderAssets();
  });

  $('#assetFavoriteOnly')?.addEventListener('click', () => {
    prefs.favoriteOnly = !prefs.favoriteOnly;
    savePrefs();
    page = 1;
    renderShellState();
    renderAssets();
  });

  document.querySelectorAll('[data-assets-view]').forEach(button => button.addEventListener('click', () => {
    prefs.view = button.dataset.assetsView === 'compact' ? 'compact' : 'grid';
    savePrefs();
    document.querySelectorAll('[data-assets-view]').forEach(x => x.classList.toggle('active', x === button));
    $('#assetGrid')?.classList.toggle('is-compact', prefs.view === 'compact');
  }));

  $('#assetReset')?.addEventListener('click', () => {
    const search = $('#assetSearch');
    if (search) search.value = '';
    prefs.favoriteOnly = false;
    prefs.sort = 'riot';
    page = 1;
    savePrefs();
    const sort = $('#assetSort');
    if (sort) sort.value = 'riot';
    renderShellState();
    renderAssets();
  });
}

function renderShellState() {
  const favButton = $('#assetFavoriteOnly');
  if (favButton) {
    favButton.classList.toggle('active', prefs.favoriteOnly);
    favButton.setAttribute('aria-pressed', String(prefs.favoriteOnly));
    const badge = favButton.querySelector('b');
    if (badge) badge.textContent = String(favorites.size);
  }
  const favStat = $('#assetFavoriteCount');
  if (favStat) favStat.textContent = String(favorites.size);
}

async function fetchCategory(type) {
  if (cached[type]) return cached[type];
  if (type === 'champions') {
    cached.champions = [...(getChampionIndex() || [])];
  } else if (type === 'items') {
    cached.items = (await api('/api/assets/items?search=')).items || [];
  } else if (type === 'runes') {
    cached.runes = (await api('/api/assets/runes?search=')).trees || [];
  }
  return cached[type] || [];
}

function sortedRows(rows) {
  const indexed = rows.map((row, index) => ({ row, index }));
  if (prefs.sort === 'name-asc') indexed.sort((a, b) => String(a.row?.name || '').localeCompare(String(b.row?.name || ''), lang()));
  if (prefs.sort === 'name-desc') indexed.sort((a, b) => String(b.row?.name || '').localeCompare(String(a.row?.name || ''), lang()));
  if (prefs.sort === 'gold-desc') indexed.sort((a, b) => number(b.row?.gold) - number(a.row?.gold) || a.index - b.index);
  return indexed.map(x => x.row);
}

function filteredRows() {
  const query = ($('#assetSearch')?.value || '').trim().toLowerCase();
  let rows = [...(cached[currentAsset] || [])];
  if (query) rows = rows.filter(row => searchable(currentAsset, row).includes(query));
  if (prefs.favoriteOnly) rows = rows.filter(row => isFavorite(currentAsset, row));
  return sortedRows(rows);
}

function tagsHtml(tags = [], limit = 3) {
  return tags.slice(0, limit).map(tag => `<span>${esc(tag)}</span>`).join('');
}

function championCard(row, index) {
  const copy = c();
  const favorite = isFavorite('champions', row);
  const tags = row.tags || [];
  return `<article class="asset-library-card champion-asset" data-asset-index="${index}">
    <div class="asset-card-media">
      <img src="${esc(row.splash || row.image || '')}" alt="${esc(row.name || '')}" loading="lazy" decoding="async">
      <div class="asset-media-shade"></div>
      <span class="asset-kind-badge">◈ ${copy.champions}</span>
      <button type="button" class="asset-favorite ${favorite ? 'active' : ''}" data-favorite-index="${index}" aria-label="${favorite ? copy.unfavorite : copy.favorite}" title="${favorite ? copy.unfavorite : copy.favorite}">★</button>
    </div>
    <div class="asset-card-content">
      <div class="asset-title-row"><img src="${esc(row.image || row.splash || '')}" alt="" loading="lazy"><div><h3>${esc(row.name || '—')}</h3><p>${esc(row.title || '')}</p></div></div>
      <div class="asset-card-tags">${tagsHtml(tags)}</div>
      <div class="asset-card-actions"><button type="button" data-preview-index="${index}">${copy.preview}</button><button type="button" data-copy-index="${index}">${copy.copy}</button></div>
    </div>
  </article>`;
}

function itemCard(row, index) {
  const copy = c();
  const favorite = isFavorite('items', row);
  const description = stripHtml(row.description || row.fullDescription || '');
  const gold = number(row.gold);
  return `<article class="asset-library-card item-asset" data-asset-index="${index}">
    <div class="asset-card-media icon-media">
      <div class="asset-icon-stage"><span></span><img src="${esc(row.image || '')}" alt="${esc(row.name || '')}" loading="lazy" decoding="async"></div>
      <span class="asset-kind-badge">⬡ ${copy.items}</span>
      <button type="button" class="asset-favorite ${favorite ? 'active' : ''}" data-favorite-index="${index}" aria-label="${favorite ? copy.unfavorite : copy.favorite}" title="${favorite ? copy.unfavorite : copy.favorite}">★</button>
    </div>
    <div class="asset-card-content">
      <div class="asset-title-row no-icon"><div><h3>${esc(row.name || '—')}</h3><p>${esc(description || copy.noDescription)}</p></div></div>
      <div class="asset-item-meta"><span>${copy.gold}</span><b>${gold.toLocaleString(lang() === 'vi' ? 'vi-VN' : 'en-US')}</b></div>
      <div class="asset-card-actions"><button type="button" data-preview-index="${index}">${copy.preview}</button><button type="button" data-copy-index="${index}">${copy.copy}</button></div>
    </div>
  </article>`;
}

function runeCard(row, index) {
  const copy = c();
  const favorite = isFavorite('runes', row);
  const runes = row.runes || [];
  return `<article class="asset-library-card rune-asset" data-asset-index="${index}">
    <div class="asset-card-media rune-media">
      <div class="rune-tree-stage"><span></span><img src="${esc(row.icon || '')}" alt="${esc(row.name || '')}" loading="lazy" decoding="async"></div>
      <span class="asset-kind-badge">✦ ${copy.runes}</span>
      <button type="button" class="asset-favorite ${favorite ? 'active' : ''}" data-favorite-index="${index}" aria-label="${favorite ? copy.unfavorite : copy.favorite}" title="${favorite ? copy.unfavorite : copy.favorite}">★</button>
    </div>
    <div class="asset-card-content">
      <div class="asset-title-row no-icon"><div><h3>${esc(row.name || '—')}</h3><p>${runes.length} ${copy.runesCount}</p></div></div>
      <div class="asset-rune-preview">${runes.slice(0, 8).map(r => `<span title="${esc(r.name || '')}"><img src="${esc(r.icon || '')}" alt="${esc(r.name || '')}" loading="lazy"></span>`).join('')}</div>
      <div class="asset-card-actions"><button type="button" data-preview-index="${index}">${copy.preview}</button><button type="button" data-copy-index="${index}">${copy.copy}</button></div>
    </div>
  </article>`;
}

function cardHtml(row, index) {
  if (currentAsset === 'champions') return championCard(row, index);
  if (currentAsset === 'items') return itemCard(row, index);
  return runeCard(row, index);
}

function bindCards() {
  document.querySelectorAll('[data-preview-index]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    openPreview(Number(button.dataset.previewIndex));
  }));
  document.querySelectorAll('[data-copy-index]').forEach(button => button.addEventListener('click', async event => {
    event.stopPropagation();
    await copyAssetUrl(Number(button.dataset.copyIndex));
  }));
  document.querySelectorAll('[data-favorite-index]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    toggleFavorite(Number(button.dataset.favoriteIndex));
  }));
  document.querySelectorAll('[data-asset-index]').forEach(card => card.addEventListener('click', event => {
    if (event.target.closest('button,a')) return;
    openPreview(Number(card.dataset.assetIndex));
  }));
}

function renderAssets() {
  const grid = $('#assetGrid');
  if (!grid) return;
  const rows = filteredRows();
  visibleRows = rows;
  const visible = rows.slice(0, page * PAGE_SIZE);
  grid.classList.toggle('is-compact', prefs.view === 'compact');

  if (!visible.length) {
    grid.innerHTML = `<div class="assets-empty"><div>◇</div><h3>${c().empty}</h3><p>${c().emptyHint}</p><button type="button" id="assetEmptyReset">↺ ${c().reset}</button></div>`;
    $('#assetEmptyReset')?.addEventListener('click', () => $('#assetReset')?.click());
  } else {
    grid.innerHTML = visible.map((row, index) => cardHtml(row, index)).join('');
    bindCards();
  }

  const visibleCount = $('#assetVisibleCount');
  if (visibleCount) visibleCount.textContent = String(visible.length);
  const currentType = $('#assetCurrentType');
  if (currentType) currentType.textContent = currentLabel();
  const resultMeta = $('#assetResultsMeta');
  if (resultMeta) resultMeta.textContent = `${rows.length.toLocaleString(lang() === 'vi' ? 'vi-VN' : 'en-US')} ${c().results}`;
  const categoryMeta = $('#assetCategoryMeta');
  if (categoryMeta) categoryMeta.textContent = currentLabel();
  renderShellState();
  renderLoadMore(visible.length, rows.length);
}

function renderLoadMore(visible, total) {
  const wrap = $('#assetLoadMoreWrap');
  if (!wrap) return;
  if (!total) { wrap.innerHTML = ''; return; }
  if (visible < total) {
    wrap.innerHTML = `<button type="button" class="assets-load-more" id="assetLoadMore"><span>${c().loadMore}</span><b>${visible.toLocaleString()} / ${total.toLocaleString()}</b></button>`;
    $('#assetLoadMore')?.addEventListener('click', () => { page += 1; renderAssets(); });
  } else {
    wrap.innerHTML = `<span class="assets-all-loaded">✓ ${c().allLoaded} • ${total.toLocaleString()}</span>`;
  }
}

async function loadCurrentCategory(force = false) {
  const grid = $('#assetGrid');
  if (!grid) return;
  if (loadingCategory === currentAsset) return;
  if (!cached[currentAsset] || force) {
    loadingCategory = currentAsset;
    grid.innerHTML = skeletonHtml();
    try {
      await fetchCategory(currentAsset);
    } catch (error) {
      grid.innerHTML = `<div class="notice">${esc(error?.message || String(error))}</div>`;
      loadingCategory = null;
      return;
    }
    loadingCategory = null;
  }
  renderAssets();
}

function toggleFavorite(index) {
  const row = visibleRows[index];
  if (!row) return;
  const key = keyFor(currentAsset, row);
  const nextFavorite = !favorites.has(key);
  if (nextFavorite) favorites.add(key); else favorites.delete(key);
  saveFavorites();
  showToast(nextFavorite ? c().favoriteSaved : c().favoriteRemoved);
  if (prefs.favoriteOnly && !nextFavorite) page = 1;
  renderAssets();
  if (previewIndex >= 0) {
    const nextIndex = visibleRows.findIndex(x => keyFor(currentAsset, x) === key);
    if (nextIndex >= 0) openPreview(nextIndex, true);
    else closePreview();
  }
}

async function copyText(value) {
  if (!value) return false;
  try { await navigator.clipboard.writeText(value); return true; }
  catch {
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch { return false; }
  }
}

async function copyAssetUrl(index) {
  const row = visibleRows[index];
  if (!row) return;
  const ok = await copyText(imageFor(currentAsset, row));
  showToast(ok ? c().copied : c().open);
}

function showToast(message) {
  const toast = $('#assetToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function previewDetails(row) {
  const copy = c();
  if (currentAsset === 'champions') {
    return `<div class="asset-preview-details"><div><small>${copy.tags}</small><div class="asset-preview-tags">${tagsHtml(row.tags || [], 10) || '<span>Champion</span>'}</div></div><div><small>${copy.source}</small><b>${copy.dataDragon}</b></div></div>`;
  }
  if (currentAsset === 'items') {
    return `<div class="asset-preview-details"><div><small>${copy.gold}</small><b>${number(row.gold).toLocaleString(lang() === 'vi' ? 'vi-VN' : 'en-US')}</b></div><div><small>${copy.source}</small><b>${copy.dataDragon}</b></div></div>`;
  }
  return `<div class="asset-preview-details"><div><small>${copy.runes}</small><b>${(row.runes || []).length} ${copy.runesCount}</b></div><div><small>${copy.source}</small><b>${copy.dataDragon}</b></div></div>`;
}

function previewBody(row) {
  if (currentAsset === 'champions') {
    return `<div class="asset-preview-art champion-preview-art"><img src="${esc(row.splash || row.image || '')}" alt="${esc(row.name || '')}"><div class="asset-preview-art-shade"></div></div>`;
  }
  if (currentAsset === 'items') {
    return `<div class="asset-preview-art item-preview-art"><div class="asset-preview-icon-orbit"><span></span><span></span><img src="${esc(row.image || '')}" alt="${esc(row.name || '')}"></div></div>`;
  }
  return `<div class="asset-preview-art rune-preview-art"><div class="asset-preview-rune-head"><img src="${esc(row.icon || '')}" alt="${esc(row.name || '')}"></div><div class="asset-preview-rune-grid">${(row.runes || []).map(r => `<article><img src="${esc(r.icon || '')}" alt="${esc(r.name || '')}"><div><b>${esc(r.name || '')}</b><p>${esc(stripHtml(r.shortDesc || ''))}</p></div></article>`).join('')}</div></div>`;
}

function previewDescription(row) {
  if (currentAsset === 'champions') return row.title || '';
  if (currentAsset === 'items') return stripHtml(row.description || row.fullDescription || '') || c().noDescription;
  return `${(row.runes || []).length} ${c().runesCount}`;
}

function openPreview(index, rerender = false) {
  const overlay = $('#assetPreview');
  const row = visibleRows[index];
  if (!overlay || !row) return;
  previewIndex = index;
  const favorite = isFavorite(currentAsset, row);
  const image = imageFor(currentAsset, row);
  overlay.hidden = false;
  overlay.innerHTML = `<div class="asset-preview-backdrop" data-preview-close></div><section class="asset-preview-dialog" tabindex="-1" role="dialog" aria-modal="true" aria-label="${esc(row.name || c().preview)}">
    <button type="button" class="asset-preview-close" data-preview-close aria-label="${c().close}">×</button>
    <button type="button" class="asset-preview-nav prev" data-preview-prev aria-label="${c().previous}" ${index <= 0 ? 'disabled' : ''}>‹</button>
    <button type="button" class="asset-preview-nav next" data-preview-next aria-label="${c().next}" ${index >= visibleRows.length - 1 ? 'disabled' : ''}>›</button>
    <div class="asset-preview-layout">
      ${previewBody(row)}
      <div class="asset-preview-copy">
        <div class="asset-preview-eyebrow">${currentLabel()} • ${c().dataDragon}</div>
        <h2>${esc(row.name || '—')}</h2>
        <p>${esc(previewDescription(row))}</p>
        ${previewDetails(row)}
        <div class="asset-preview-actions">
          <button type="button" class="primary-action" data-preview-favorite>${favorite ? '★' : '☆'} ${favorite ? c().unfavorite : c().favorite}</button>
          <button type="button" data-preview-copy>⧉ ${c().copy}</button>
          ${image ? `<a href="${esc(image)}" target="_blank" rel="noreferrer">↗ ${c().open}</a>` : ''}
        </div>
      </div>
    </div>
  </section>`;
  overlay.classList.add('open');
  document.body.classList.add('asset-preview-open');

  overlay.querySelectorAll('[data-preview-close]').forEach(node => node.addEventListener('click', closePreview));
  overlay.querySelector('[data-preview-prev]')?.addEventListener('click', () => openPreview(Math.max(0, previewIndex - 1)));
  overlay.querySelector('[data-preview-next]')?.addEventListener('click', () => openPreview(Math.min(visibleRows.length - 1, previewIndex + 1)));
  overlay.querySelector('[data-preview-favorite]')?.addEventListener('click', () => toggleFavorite(previewIndex));
  overlay.querySelector('[data-preview-copy]')?.addEventListener('click', () => copyAssetUrl(previewIndex));
  if (!rerender) requestAnimationFrame(() => overlay.querySelector('.asset-preview-dialog')?.focus());
}

function closePreview() {
  const overlay = $('#assetPreview');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.hidden = true;
  overlay.innerHTML = '';
  previewIndex = -1;
  document.body.classList.remove('asset-preview-open');
}

function bindGlobalShortcuts() {
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && previewIndex >= 0) { closePreview(); return; }
    if (previewIndex >= 0 && event.key === 'ArrowLeft') { event.preventDefault(); openPreview(Math.max(0, previewIndex - 1)); return; }
    if (previewIndex >= 0 && event.key === 'ArrowRight') { event.preventDefault(); openPreview(Math.min(visibleRows.length - 1, previewIndex + 1)); return; }
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
      const section = $('#assets');
      if (!section?.classList.contains('active-section')) return;
      event.preventDefault();
      $('#assetSearch')?.focus();
    }
  });
}

export function initAssets() {
  if (initialized) return;
  initialized = true;
  ensureCss();
  renderShell();
  bindGlobalShortcuts();
  onLanguageChange(() => {
    const query = $('#assetSearch')?.value || '';
    renderShell();
    const search = $('#assetSearch');
    if (search) search.value = query;
    renderAssets();
  });
}

export async function ensureAssets() {
  if (!initialized) initAssets();
  await loadCurrentCategory();
}
