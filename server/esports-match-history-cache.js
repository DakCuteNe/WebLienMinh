const MAX_HISTORY_GAMES = 96;
const historyByGame = new Map();

const text = value => String(value ?? '').trim();

function bestRows(fresh, cached) {
  const a = Array.isArray(fresh) ? fresh : [];
  const b = Array.isArray(cached) ? cached : [];
  return a.length >= b.length ? a : b;
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

export function reconcileHistoricalLive(fresh, cached, gameId) {
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

function remember(gameId, live) {
  const id = text(gameId);
  if (!id || !sameGame(live, id)) return live;
  const previous = historyByGame.get(id)?.live || null;
  const merged = reconcileHistoricalLive(live, previous, id);
  if (!merged) return live;

  historyByGame.delete(id);
  historyByGame.set(id, { live: merged, at: Date.now() });
  while (historyByGame.size > MAX_HISTORY_GAMES) historyByGame.delete(historyByGame.keys().next().value);
  return merged;
}

export function installEsportsMatchHistoryCache(app) {
  app.use('/api/esports/match-live', (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = body => {
      if (!body?.ok) return originalJson(body);

      const gameId = text(body?.viewGame?.id || body?.live?.gameId);
      if (!gameId) return originalJson(body);

      const cached = historyByGame.get(gameId)?.live || null;
      const fresh = sameGame(body.live, gameId) ? body.live : null;
      const live = reconcileHistoricalLive(fresh, cached, gameId);
      if (live) body.live = remember(gameId, live);
      else body.live = null;

      return originalJson(body);
    };
    next();
  });
}

export const __liveHistoryTest = {
  reconcileHistoricalLive
};
