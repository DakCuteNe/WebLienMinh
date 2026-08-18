if (!document.querySelector('link[data-rift-v2]')) {
  const theme = document.createElement('link');
  theme.rel = 'stylesheet';
  theme.href = '/v2.css';
  theme.dataset.riftV2 = 'true';
  document.head.appendChild(theme);
}

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const roleName = { TOP:'TOP', JUNGLE:'JUNGLE', MIDDLE:'MID', BOTTOM:'ADC', UTILITY:'SUPPORT' };
export const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
export const fmt = n => Number(n || 0).toFixed(1) + '%';
export const score = n => Number(n || 0).toFixed(1);
export const number = n => Number(n || 0).toLocaleString('vi-VN');

export async function api(url) {
  const sep = url.includes('?') ? '&' : '?';
  const freshUrl = `${url}${sep}_=${Date.now()}`;
  const response = await fetch(freshUrl, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

export function esportsMediaUrl(kind, key) {
  const params = new URLSearchParams({
    kind: kind === 'team' ? 'team' : 'player',
    key: String(key || '').trim()
  });
  return `/api/esports/media?${params}`;
}

export function openModal(html) {
  $('#modalContent').innerHTML = html;
  $('#modal').classList.remove('hidden');
}

export function closeModal() {
  $('#modal').classList.add('hidden');
}

export function initModal() {
  $('#closeModal').onclick = closeModal;
  $('#modal').onclick = event => { if (event.target.id === 'modal') closeModal(); };
}

export function trendHtml(value) {
  const v = Number(value || 0);
  if (Math.abs(v) < .05) return '<span class="trend flat">• 0.0</span>';
  return `<span class="trend ${v > 0 ? 'up' : 'down'}">${v > 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}</span>`;
}

export function initials(name) {
  return String(name || '?').split(/\s+/).map(x => x[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export function img(url, alt = '', cls = '') {
  if (!url) return `<span class="image-fallback ${esc(cls)}">${esc(initials(alt))}</span>`;
  return `<img class="${esc(cls)}" src="${esc(url)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling?.classList.remove('hidden')"><span class="image-fallback ${esc(cls)} hidden">${esc(initials(alt))}</span>`;
}
