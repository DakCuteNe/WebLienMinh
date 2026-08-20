import { alignLiveTeams, normalizeWindow } from './esports-match-live.js';

const LIVE_FEED = 'https://feed.lolesports.com/livestats/v1';
const PUBLIC_API_KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const MAX_HISTORY_GAMES = 96;
const HISTORY_PROBE_COOLDOWN_MS = 5 * 60_000;
const LIVE_PROBE_COOLDOWN_MS = 20_000;
const historyByGame = new Map();
const recoveryProbeAt = new Map();

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

function draftScore(live) {
  if (!live) return 0;
  const sides = Array.isArray(live.teams) && live.teams.length ? live.teams : [live.blue, live.red];
  return sides.reduce((score, side) => score
    + (Array.isArray(side?.picks) ? side.picks.length : 0)
    + (Array.isArray(side?.bans) ? side.bans.length : 0), 0);
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

function normalizeStart(value) {
  const parsed = new Date(value || Date.now()).getTime();
  const time = Number.isFinite(parsed) ? parsed : Date.now();
  return new Date(Math.floor(time / 10_000) * 10_000).toISOString();
}

function addCandidate(target, value) {
  const parsed = new Date(value || '').getTime();
  if (!Number.isFinite(parsed)) return;
  target.add(normalizeStart(parsed));
}

export function recoveryStartingTimes(game = {}, seriesStart = '', liveTimestamp = '') {
  const candidates = new Set();
  const gameStart = new Date(game?.startTime || '').getTime();
  const series = new Date(seriesStart || '').getTime();
  const feed = new Date(liveTimestamp || '').getTime();
  const gameNumber = Math.max(1, Number(game?.number || 1));

  if (Number.isFinite(gameStart)) {
    for (const minutes of [0, 2, 5, 8, 12, 16, 20, 25, 30]) addCandidate(candidates, gameStart + minutes * 60_000);
  }

  // Riot's event start is the series start, not the exact start of every game.
  // Probe a compact window around the estimated start for the requested game.
  if (Number.isFinite(series)) {
    const estimatedMinutes = (gameNumber - 1) * 35;
    for (const delta of [-10, -5, 0, 5, 10, 15, 20, 25, 30]) {
      const minutes = Math.max(0, estimatedMinutes + delta);
      addCandidate(candidates, series + minutes * 60_000);
    }
  }

  // A final/rolling frame often survives after metadata disappears. Walk back
  // from that exact same-game timestamp to find the draft metadata window.
  if (Number.isFinite(feed)) {
    for (const minutes of [35, 30, 25, 20, 15, 10, 5, 0]) addCandidate(candidates, feed - minutes * 60_000);
  }

  return [...candidates];
}

async function fetchHistoricalWindow(gameId, startingTime) {
  const response = await fetch(`${LIVE_FEED}/window/${encodeURIComponent(gameId)}?startingTime=${encodeURIComponent(startingTime)}`, {
    headers: {
      'x-api-key': PUBLIC_API_KEY,
      'User-Agent': 'WebLienMinh/3.15 historical-draft-recovery'
    },
    signal: AbortSignal.timeout(4_500)
  });
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  const returnedId = text(body?.esportsGameId);
  if (returnedId && returnedId !== text(gameId)) return null;
  return body;
}

async function recoverHistoricalDraft(body, gameId) {
  const game = body?.viewGame;
  if (!game?.id || text(game.id) !== text(gameId)) return null;

  const isCurrent = text(body?.currentGame?.id) === text(gameId);
  const state = text(body?.state).toLowerCase();
  const isSeriesLive = state.includes('progress') || state === 'in_game' || state === 'in-game';
  const cooldown = isCurrent && isSeriesLive ? LIVE_PROBE_COOLDOWN_MS : HISTORY_PROBE_COOLDOWN_MS;
  const lastProbe = recoveryProbeAt.get(gameId) || 0;
  if (Date.now() - lastProbe < cooldown) return null;
  recoveryProbeAt.set(gameId, Date.now());

  const candidates = recoveryStartingTimes(game, body?.startTime, body?.live?.timestamp);
  if (!candidates.length) return null;

  let best = null;
  let bestScore = 0;
  // Probe in small parallel batches so a missing old window cannot block the UI
  // for tens of seconds. Stop as soon as a complete 10-pick + 10-ban draft is found.
  for (let offset = 0; offset < candidates.length; offset += 4) {
    const batch = candidates.slice(offset, offset + 4);
    const windows = await Promise.all(batch.map(startingTime => fetchHistoricalWindow(gameId, startingTime).catch(() => null)));
    for (const windowData of windows) {
      if (!windowData) continue;
      const normalized = normalizeWindow(windowData, game);
      const aligned = alignLiveTeams(normalized, game, body?.teams || []);
      if (!sameGame(aligned, gameId)) continue;
      const score = draftScore(aligned);
      if (score > bestScore) {
        best = aligned;
        bestScore = score;
      }
    }
    if (bestScore >= 20) break;
  }

  return best;
}

export function installEsportsMatchHistoryCache(app) {
  app.use('/api/esports/match-live', (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = body => {
      if (!body?.ok) return originalJson(body);

      const gameId = text(body?.viewGame?.id || body?.live?.gameId);
      if (!gameId) return originalJson(body);

      // Delay the response only when the requested game's Ban/Pick is incomplete.
      // The route still owns the match resolution; this layer only recovers an
      // older metadata window for that exact gameId and then merges it safely.
      void (async () => {
        try {
          const cached = historyByGame.get(gameId)?.live || null;
          const fresh = sameGame(body.live, gameId) ? body.live : null;
          let live = reconcileHistoricalLive(fresh, cached, gameId);

          if (draftScore(live) < 20) {
            const recovered = await recoverHistoricalDraft(body, gameId);
            // Keep the newest same-game stats/timestamp as the fresh side while
            // using the recovered older window only to fill richer Pick/Ban rows.
            live = reconcileHistoricalLive(live, recovered, gameId);
          }

          if (live) body.live = remember(gameId, live);
          else body.live = null;
        } catch {
          const cached = historyByGame.get(gameId)?.live || null;
          const fresh = sameGame(body.live, gameId) ? body.live : null;
          body.live = reconcileHistoricalLive(fresh, cached, gameId);
        }
        originalJson(body);
      })();

      return res;
    };
    next();
  });
}

export const __liveHistoryTest = {
  reconcileHistoricalLive,
  recoveryStartingTimes,
  draftScore
};
