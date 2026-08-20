const STORAGE_KEY = 'rift:live-match-game-history:v2';
const MAX_GAMES = 72;
const MAX_AGE_MS = 14 * 24 * 60 * 60_000;
const PREFETCH_CURRENT_MS = 12_000;
const PREFETCH_HISTORY_MS = 5 * 60_000;

let initialized = false;
let nativeFetch = null;
const prefetchAt = new Map();

const text = value => String(value ?? '').trim();

function bestRows(fresh, cached) {
  const a = Array.isArray(fresh) ? fresh : [];
  const b = Array.isArray(cached) ? cached : [];
  return a.length >= b.length ? a : b;
}

function readStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const now = Date.now();
    for (const [gameId, row] of Object.entries(parsed)) {
      if (!row?.live || !row.at || now - Number(row.at) > MAX_AGE_MS) delete parsed[gameId];
    }
    return parsed;
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    const rows = Object.entries(store)
      .sort((a, b) => Number(b[1]?.at || 0) - Number(a[1]?.at || 0))
      .slice(0, MAX_GAMES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(rows)));
  } catch {}
}

function mergeSide(fresh = {}, cached = {}) {
  return {
    ...cached,
    ...fresh,
    picks: bestRows(fresh?.picks, cached?.picks),
    bans: bestRows(fresh?.bans, cached?.bans),
    stats: fresh?.stats && Object.keys(fresh.stats).length ? fresh.stats : (cached?.stats || {})
  };
}

function mergeTeamRows(freshRows = [], cachedRows = []) {
  const fresh = Array.isArray(freshRows) ? freshRows : [];
  const cached = Array.isArray(cachedRows) ? cachedRows : [];
  const count = Math.max(fresh.length, cached.length);
  const rows = [];

  for (let index = 0; index < count; index += 1) {
    const row = fresh[index] || null;
    const teamId = text(row?.teamId);
    const fallback = (teamId && cached.find(candidate => text(candidate?.teamId) === teamId)) || cached[index] || {};
    rows.push(mergeSide(row || {}, fallback));
  }
  return rows;
}

function sameGame(live, gameId) {
  if (!live || !gameId) return false;
  return text(live.gameId) === text(gameId);
}

function mergeLive(fresh, cached, gameId) {
  const id = text(gameId);
  const safeFresh = sameGame(fresh, id) ? fresh : null;
  const safeCached = sameGame(cached, id) ? cached : null;
  if (!safeFresh && !safeCached) return null;
  if (!safeFresh) return { ...safeCached, gameId: id, historyCached: true };
  if (!safeCached) return { ...safeFresh, gameId: id };

  return {
    ...safeCached,
    ...safeFresh,
    gameId: id,
    patchVersion: safeFresh.patchVersion || safeCached.patchVersion || null,
    timestamp: safeFresh.timestamp || safeCached.timestamp || null,
    blue: mergeSide(safeFresh.blue || {}, safeCached.blue || {}),
    red: mergeSide(safeFresh.red || {}, safeCached.red || {}),
    teams: mergeTeamRows(safeFresh.teams, safeCached.teams)
  };
}

function rememberLive(gameId, live) {
  const id = text(gameId);
  if (!id || !sameGame(live, id)) return live;
  const store = readStore();
  const previous = store[id]?.live || null;
  const merged = mergeLive(live, previous, id);
  if (!merged) return live;
  store[id] = { live: merged, at: Date.now() };
  writeStore(store);
  return merged;
}

function cachedLive(gameId) {
  const id = text(gameId);
  if (!id) return null;
  return readStore()[id]?.live || null;
}

function isLiveState(value) {
  const state = text(value).toLowerCase();
  return state.includes('progress') || state === 'in_game' || state === 'in-game';
}

function requestUrl(input) {
  try {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    return raw ? new URL(raw, location.origin) : null;
  } catch {
    return null;
  }
}

function isMatchLiveUrl(url) {
  return Boolean(url && url.origin === location.origin && url.pathname === '/api/esports/match-live');
}

function reconcileBody(body, url, restore = true) {
  if (!body?.ok) return body;
  const gameId = text(body?.viewGame?.id || body?.live?.gameId);
  if (!gameId) return body;

  const fresh = sameGame(body.live, gameId) ? body.live : null;
  const cached = cachedLive(gameId);
  const detail = url?.searchParams?.get('detail') === '1';
  const live = mergeLive(fresh, detail && restore ? cached : null, gameId);

  if (live) {
    const remembered = rememberLive(gameId, live);
    if (detail) body.live = remembered;
  } else if (detail) {
    body.live = null;
  }
  return body;
}

function gameAlreadyPlayed(game, payload) {
  const number = Number(game?.number || 0);
  const currentNumber = Number(payload?.currentGame?.number || 0);
  if (!game?.id || !number || !currentNumber) return false;
  return number <= currentNumber;
}

function prefetchDelay(game, payload) {
  const currentId = text(payload?.currentGame?.id);
  return text(game?.id) === currentId && isLiveState(payload?.state) ? PREFETCH_CURRENT_MS : PREFETCH_HISTORY_MS;
}

function detailUrl(baseUrl, gameId) {
  const url = new URL(baseUrl.toString());
  url.searchParams.set('detail', '1');
  url.searchParams.set('viewGameId', gameId);
  return url;
}

function scheduleArchive(baseUrl, payload) {
  if (!nativeFetch || !isMatchLiveUrl(baseUrl) || !Array.isArray(payload?.games)) return;
  for (const game of payload.games) {
    if (!gameAlreadyPlayed(game, payload)) continue;
    const gameId = text(game.id);
    if (!gameId) continue;

    const delay = prefetchDelay(game, payload);
    const previous = prefetchAt.get(gameId) || 0;
    if (Date.now() - previous < delay) continue;
    prefetchAt.set(gameId, Date.now());

    const url = detailUrl(baseUrl, gameId);
    queueMicrotask(async () => {
      try {
        const response = await nativeFetch(url.toString(), {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!response.ok) return;
        const body = await response.json();
        reconcileBody(body, url, false);
      } catch {}
    });
  }
}

export function initLiveMatchHistoryCache() {
  if (initialized || typeof window.fetch !== 'function') return;
  initialized = true;
  nativeFetch = window.fetch.bind(window);

  window.fetch = async function liveMatchHistoryFetch(input, init) {
    const url = requestUrl(input);
    const response = await nativeFetch(input, init);
    if (!isMatchLiveUrl(url)) return response;

    return new Proxy(response, {
      get(target, property) {
        if (property === 'json') {
          return async () => {
            const body = await target.json();
            const reconciled = reconcileBody(body, url, true);
            scheduleArchive(url, reconciled);
            return reconciled;
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  };
}
