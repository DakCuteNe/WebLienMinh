const LEAGUEPEDIA_API = 'https://lol.fandom.com/api.php';
const TARGET_SELECTOR = 'img.player-image, img.profile-player-image, img.team-logo, img.profile-team-logo';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const BATCH_SIZE = 20;

const currentImageCache = new Map();
const explicitImageCache = new Map();
let scanTimer = null;

function key(value) {
  return String(value || '').trim().replaceAll('_', ' ').toLowerCase();
}

function cleanTitle(value) {
  let title = String(value || '').trim();
  if (!title) return null;
  try { title = decodeURIComponent(title); } catch {}
  return title.replaceAll('_', ' ').trim() || null;
}

function wikiTitleFromUrl(value) {
  try {
    const url = new URL(value, location.href);
    const marker = '/wiki/';
    const at = url.pathname.indexOf(marker);
    if (at < 0) return null;
    return cleanTitle(url.pathname.slice(at + marker.length));
  } catch {
    return null;
  }
}

function titleForImage(image) {
  if (!(image instanceof HTMLImageElement)) return null;

  if (image.classList.contains('player-image')) {
    const profileKey = image.closest('.player-card')?.dataset?.profile;
    return cleanTitle(profileKey || image.alt);
  }

  if (image.classList.contains('profile-player-image')) {
    const sourceLink = image.closest('.modal-card, #modalContent, .modal')?.querySelector('.profile-source a[href*="/wiki/"]');
    return cleanTitle(wikiTitleFromUrl(sourceLink?.href) || image.alt);
  }

  if (image.classList.contains('team-logo')) return cleanTitle(image.alt);

  if (image.classList.contains('profile-team-logo')) {
    const teamName = image.closest('.profile-team')?.querySelector('b')?.textContent;
    return cleanTitle(teamName || image.alt);
  }

  return null;
}

function initials(value) {
  return String(value || '?')
    .trim()
    .split(/\s+/)
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

function ensureFallbackStyle() {
  if (document.querySelector('style[data-esports-media-fallback]')) return;
  const style = document.createElement('style');
  style.dataset.esportsMediaFallback = 'true';
  style.textContent = `
    .esports-media-fallback{display:grid;place-items:center;background:linear-gradient(145deg,#142236,#09111c);color:#c8a45b;border:1px solid #283b55;font-weight:900;letter-spacing:.06em;text-align:center;overflow:hidden}
    .player-photo>.esports-media-fallback,.profile-photo>.esports-media-fallback{width:100%;height:100%;min-height:100%;font-size:clamp(24px,4vw,52px)}
    .player-team-row>.esports-media-fallback{width:30px;height:30px;border-radius:7px;font-size:9px;flex:0 0 auto}
    .profile-team>.esports-media-fallback{width:68px;height:40px;border-radius:6px;font-size:10px;flex:0 0 auto}
  `;
  document.head.appendChild(style);
}

function hideExistingFallback(image) {
  const sibling = image.nextElementSibling;
  if (sibling?.classList?.contains('image-fallback')) sibling.classList.add('hidden');
  const generated = image.parentElement?.querySelector(':scope > .esports-media-fallback');
  if (generated) generated.remove();
}

function showFallback(image, title) {
  if (!(image instanceof HTMLImageElement)) return;
  image.style.display = 'none';

  const sibling = image.nextElementSibling;
  if (sibling?.classList?.contains('image-fallback')) {
    sibling.classList.remove('hidden');
    return;
  }

  ensureFallbackStyle();
  if (image.parentElement?.querySelector(':scope > .esports-media-fallback')) return;
  const fallback = document.createElement('span');
  fallback.className = 'esports-media-fallback';
  fallback.textContent = initials(title || image.alt);
  fallback.setAttribute('aria-label', `${title || image.alt || 'Esports'} image unavailable`);
  image.insertAdjacentElement('afterend', fallback);
}

function applyImage(image, url, source) {
  if (!(image instanceof HTMLImageElement) || !url) return false;
  const absolute = new URL(url, location.href).href;
  if (!image.dataset.originalSrc) image.dataset.originalSrc = image.getAttribute('src') || '';
  image.dataset.mediaSource = source;
  image.dataset.mediaRecovering = '0';
  image.style.display = '';
  image.referrerPolicy = 'no-referrer';
  hideExistingFallback(image);
  if (image.src !== absolute) image.src = absolute;
  return true;
}

function cached(cache, title) {
  const row = cache.get(key(title));
  return row && Date.now() - row.at < CACHE_TTL_MS ? row.value : undefined;
}

function putCache(cache, title, value) {
  cache.set(key(title), { at: Date.now(), value: value || null });
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function apiQuery(params, timeoutMs = 10_000) {
  const query = new URLSearchParams({ action: 'query', format: 'json', origin: '*', ...params });
  const response = await fetch(`${LEAGUEPEDIA_API}?${query}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`Leaguepedia image API ${response.status}`);
  const body = await response.json();
  if (body?.error) throw new Error(body.error.info || body.error.code || 'Leaguepedia API error');
  return body;
}

function resolveAlias(title, aliases) {
  let current = title;
  const seen = new Set();
  while (aliases.has(key(current)) && !seen.has(key(current))) {
    seen.add(key(current));
    current = aliases.get(key(current));
  }
  return current;
}

async function currentImagesForTitles(titles) {
  const result = new Map();
  const missing = [];

  for (const title of titles) {
    const value = cached(currentImageCache, title);
    if (value !== undefined) result.set(key(title), value);
    else missing.push(title);
  }

  for (const batch of chunks([...new Set(missing)], BATCH_SIZE)) {
    try {
      const body = await apiQuery({
        redirects: '1',
        prop: 'pageimages|info',
        piprop: 'thumbnail|original|name',
        pithumbsize: '900',
        inprop: 'url',
        titles: batch.join('|')
      });
      const aliases = new Map();
      for (const item of body.query?.normalized || []) aliases.set(key(item.from), item.to);
      for (const item of body.query?.redirects || []) aliases.set(key(item.from), item.to);
      const pages = Object.values(body.query?.pages || {}).filter(page => !page.missing);
      const byTitle = new Map(pages.map(page => [key(page.title), page]));

      for (const requested of batch) {
        const finalTitle = resolveAlias(requested, aliases);
        const page = byTitle.get(key(finalTitle)) || byTitle.get(key(requested));
        const url = page?.thumbnail?.source || page?.original?.source || null;
        putCache(currentImageCache, requested, url);
        result.set(key(requested), url);
      }
    } catch {
      for (const requested of batch) {
        putCache(currentImageCache, requested, null);
        result.set(key(requested), null);
      }
    }
  }

  return result;
}

function fileNameFromWikitext(wikitext) {
  const text = String(wikitext || '');
  const match = text.match(/^\s*\|\s*(?:image|playerimage|photo|logo)\s*=\s*(.*?)\s*$/im);
  if (!match) return null;
  let value = String(match[1] || '').trim();
  value = value.replace(/^\[\[(?:File|Image):/i, '').replace(/\]\]$/, '').split('|')[0].trim();
  value = value.replace(/^(?:File|Image):/i, '').trim();
  return value || null;
}

async function explicitCurrentImage(title) {
  const hit = cached(explicitImageCache, title);
  if (hit !== undefined) return hit;

  try {
    const body = await apiQuery({
      redirects: '1',
      prop: 'revisions|pageimages',
      piprop: 'thumbnail|original|name',
      pithumbsize: '900',
      rvprop: 'content',
      rvslots: 'main',
      titles: title
    }, 12_000);
    const page = Object.values(body.query?.pages || {}).find(item => !item.missing);
    if (!page) {
      putCache(explicitImageCache, title, null);
      return null;
    }

    const revision = page.revisions?.[0];
    const wikitext = revision?.slots?.main?.['*'] ?? revision?.slots?.main?.content ?? revision?.['*'] ?? '';
    const fileName = fileNameFromWikitext(wikitext);
    if (!fileName) {
      const fallback = page.thumbnail?.source || page.original?.source || null;
      putCache(explicitImageCache, title, fallback);
      return fallback;
    }

    const fileBody = await apiQuery({
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: '900',
      titles: `File:${fileName}`
    }, 10_000);
    const filePage = Object.values(fileBody.query?.pages || {}).find(item => !item.missing);
    const info = filePage?.imageinfo?.[0];
    const url = info?.thumburl || info?.url || page.thumbnail?.source || page.original?.source || null;
    putCache(explicitImageCache, title, url);
    return url;
  } catch {
    putCache(explicitImageCache, title, null);
    return null;
  }
}

async function refreshImages(images) {
  const entries = images
    .filter(image => image instanceof HTMLImageElement && image.matches(TARGET_SELECTOR))
    .map(image => ({ image, title: titleForImage(image) }))
    .filter(entry => entry.title);
  if (!entries.length) return;

  const current = await currentImagesForTitles(entries.map(entry => entry.title));
  for (const { image, title } of entries) {
    if (!image.isConnected) continue;
    const url = current.get(key(title));
    image.dataset.wikiTitle = title;
    if (url) applyImage(image, url, 'leaguepedia-current-pageimage');
  }
}

function scheduleScan(root = document) {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    const images = root instanceof HTMLImageElement
      ? [root]
      : [...(root.querySelectorAll?.(TARGET_SELECTOR) || [])];
    refreshImages(images).catch(() => {});
  }, 80);
}

async function recoverBrokenImage(image) {
  if (!(image instanceof HTMLImageElement) || !image.matches(TARGET_SELECTOR)) return;
  if (image.dataset.mediaRecovering === '1') return;
  image.dataset.mediaRecovering = '1';

  const title = image.dataset.wikiTitle || titleForImage(image);
  if (!title) {
    image.dataset.mediaRecovering = '0';
    showFallback(image, image.alt);
    return;
  }

  if (image.dataset.explicitTried !== '1') {
    image.dataset.explicitTried = '1';
    const explicit = await explicitCurrentImage(title);
    if (explicit && image.src !== new URL(explicit, location.href).href) {
      applyImage(image, explicit, 'leaguepedia-current-infobox');
      return;
    }
  }

  const original = image.dataset.originalSrc;
  if (original && image.dataset.originalTried !== '1') {
    image.dataset.originalTried = '1';
    if (image.src !== new URL(original, location.href).href) {
      applyImage(image, original, 'stored-original');
      return;
    }
  }

  image.dataset.mediaRecovering = '0';
  showFallback(image, title);
}

// Capture image failures before inline onerror handlers hide the element. This lets us
// replace stale Fandom URLs with the current Leaguepedia image first.
document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.matches(TARGET_SELECTOR)) return;
  if (image.dataset.mediaRecovering !== '1') {
    event.stopImmediatePropagation();
    recoverBrokenImage(image).catch(() => showFallback(image, titleForImage(image)));
  }
}, true);

document.addEventListener('load', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.matches(TARGET_SELECTOR)) return;
  image.dataset.mediaRecovering = '0';
  image.style.display = '';
  hideExistingFallback(image);
}, true);

const observer = new MutationObserver(records => {
  const roots = [];
  for (const record of records) {
    for (const node of record.addedNodes) if (node instanceof Element) roots.push(node);
  }
  if (!roots.length) return;
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    const images = [];
    for (const root of roots) {
      if (root instanceof HTMLImageElement && root.matches(TARGET_SELECTOR)) images.push(root);
      images.push(...(root.querySelectorAll?.(TARGET_SELECTOR) || []));
    }
    refreshImages(images).catch(() => {});
  }, 80);
});

function start() {
  ensureFallbackStyle();
  scheduleScan(document);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
