const LIVE_FEED = 'https://feed.lolesports.com/livestats/v1';
const DDRAGON_VERSIONS = 'https://ddragon.leagueoflegends.com/api/versions.json';
const PUBLIC_API_KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const MAX_HISTORY_GAMES = 96;
const HISTORY_PROBE_COOLDOWN_MS = 5 * 60_000;
const LIVE_PROBE_COOLDOWN_MS = 12_000;
const historyByGame = new Map();
const recoveryProbeAt = new Map();
let championKeysPromise = null;

const text = value => String(value ?? '').trim();
const lower = value => text(value).toLowerCase();

function bestRows(fresh, cached) {
  const a = Array.isArray(fresh) ? fresh : [];
  const b = Array.isArray(cached) ? cached : [];
  return a.length >= b.length ? a : b;
}

function statsSignal(stats) {
  if (!stats || typeof stats !== 'object') return 0;
  return Number(stats.gold || 0)
    + Number(stats.kills || 0) * 1000
    + Number(stats.towers || 0) * 1000
    + Number(stats.dragons || 0) * 1000
    + Number(stats.barons || 0) * 1000;
}

function bestStats(fresh, cached) {
  const freshSignal = statsSignal(fresh);
  const cachedSignal = statsSignal(cached);
  if (freshSignal === 0 && cachedSignal > 0) return cached;
  if (fresh && typeof fresh === 'object') return fresh;
  return cached || null;
}

function mergeSide(fresh = {}, cached = {}) {
  return {
    ...cached,
    ...fresh,
    picks: bestRows(fresh?.picks, cached?.picks),
    bans: bestRows(fresh?.bans, cached?.bans),
    stats: bestStats(fresh?.stats, cached?.stats)
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

// Riot's current LoL Esports window metadata contains the ten picked champions
// but does not consistently expose bans. Pick completeness is therefore the
// reliable recovery target; bans remain best-effort when a feed shape contains them.
export function draftScore(live) {
  if (!live) return 0;
  const sides = Array.isArray(live.teams) && live.teams.length ? live.teams : [live.blue, live.red];
  return sides.reduce((score, side) => score + (Array.isArray(side?.picks) ? side.picks.length : 0), 0);
}

function liveStatsSignal(live) {
  if (!live) return 0;
  const sides = Array.isArray(live.teams) && live.teams.length ? live.teams : [live.blue, live.red];
  return sides.reduce((sum, side) => sum + statsSignal(side?.stats), 0);
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

function addMinuteOffsets(target, base, offsets) {
  const parsed = new Date(base || '').getTime();
  if (!Number.isFinite(parsed)) return;
  for (const minutes of offsets) addCandidate(target, parsed + minutes * 60_000);
}

export function recoveryStartingTimes(game = {}, seriesStart = '', liveTimestamp = '', nowValue = Date.now()) {
  const candidates = new Set();
  const gameNumber = Math.max(1, Number(game?.number || 1));

  // A direct rolling window can end on a metadata-only/partial frame. Probe
  // around that exact game's last timestamp first; +10/+20 is especially useful
  // for completed games where Riot only serves snapshots after game start.
  addMinuteOffsets(candidates, liveTimestamp, [-20, -10, 0, 10, 20, 30, 40]);

  // VOD firstFrameTime is much closer to the real per-game start than the
  // schedule's series start. Different locales can expose different anchors.
  for (const vod of game?.vods || []) {
    addMinuteOffsets(candidates, vod?.firstFrameTime, [0, 10, 20, 30, 40, 50]);
  }

  addMinuteOffsets(candidates, game?.startTime, [0, 10, 20, 30, 40, 50]);

  const series = new Date(seriesStart || '').getTime();
  if (Number.isFinite(series)) {
    // BO games commonly start 55-75 minutes apart once broadcast breaks are
    // included. Use 70m/game as a search anchor, then cover a broad compact band.
    const estimated = series + (gameNumber - 1) * 70 * 60_000;
    addMinuteOffsets(candidates, estimated, [0, 10, 20, 30, 40, 50, 60]);
  }

  const now = Number(nowValue);
  if (Number.isFinite(now)) {
    for (const minutes of [20, 10, 5, 2, 1]) addCandidate(candidates, now - minutes * 60_000);
  }

  return [...candidates];
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) return null;
  const raw = await response.text();
  if (!raw.trim()) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function championKeyMap() {
  if (!championKeysPromise) {
    championKeysPromise = (async () => {
      const versions = await fetchJson(DDRAGON_VERSIONS, { signal: AbortSignal.timeout(6_000) });
      const version = Array.isArray(versions) ? versions[0] : null;
      if (!version) return new Map();
      const body = await fetchJson(`https://ddragon.leagueoflegends.com/cdn/${encodeURIComponent(version)}/data/en_US/champion.json`, {
        signal: AbortSignal.timeout(6_000)
      });
      const map = new Map();
      for (const champion of Object.values(body?.data || {})) {
        const key = Number(champion?.key || 0) || null;
        if (!key) continue;
        for (const alias of [champion?.id, champion?.name]) {
          const normalized = lower(alias).replace(/[^a-z0-9]/g, '');
          if (normalized) map.set(normalized, key);
        }
      }
      return map;
    })().catch(() => new Map());
  }
  return championKeysPromise;
}

function championRef(value, keys) {
  if (typeof value === 'number' && value > 0) return value;
  const raw = text(value);
  if (!raw) return null;
  if (/^\d+$/.test(raw) && Number(raw) > 0) return Number(raw);
  const normalized = lower(raw).replace(/[^a-z0-9]/g, '');
  return keys.get(normalized) || raw;
}

function picksFromMeta(meta = {}, keys = new Map()) {
  return (meta?.participantMetadata || meta?.participants || []).map((player, index) => ({
    participantId: Number(player?.participantId || index + 1) || index + 1,
    championId: championRef(player?.championId, keys),
    playerId: text(player?.esportsPlayerId || player?.playerId) || null,
    summonerName: player?.summonerName || player?.name || null,
    role: player?.role || null,
    slot: index + 1
  })).filter(row => row.championId != null);
}

function collectBanRefs(value, keys, path = '', out = []) {
  if (value == null) return out;
  if (Array.isArray(value)) {
    for (const child of value) collectBanRefs(child, keys, path, out);
    return out;
  }
  if (typeof value !== 'object') return out;
  if (/ban/i.test(path) && value.championId != null) {
    const ref = championRef(value.championId, keys);
    if (ref != null) out.push({
      championId: ref,
      teamId: text(value.esportsTeamId || value.teamId),
      side: lower(value.side || value.teamSide),
      path: lower(path),
      order: Number(value.pickTurn || value.order || value.slot || 0) || 0
    });
  }
  for (const [key, child] of Object.entries(value)) collectBanRefs(child, keys, path ? `${path}.${key}` : key, out);
  return out;
}

function bansForSide(metadata, teamMeta, side, keys) {
  const entries = collectBanRefs(metadata, keys);
  if (!entries.length) return [];
  const teamId = text(teamMeta?.esportsTeamId || teamMeta?.teamId);
  const byTeam = teamId ? entries.filter(row => row.teamId && row.teamId === teamId) : [];
  const bySide = entries.filter(row => row.side === side || row.path.includes(`${side}team`) || row.path.includes(`${side}.`));
  const chosen = byTeam.length ? byTeam : bySide;
  const unique = [];
  for (const row of chosen.sort((a, b) => a.order - b.order)) {
    if (!unique.some(value => String(value) === String(row.championId))) unique.push(row.championId);
  }
  return unique.slice(0, 5);
}

function statFrame(frames = []) {
  return [...frames].reverse().find(frame => frame?.blueTeam && frame?.redTeam) || null;
}

function teamStats(team) {
  if (!team || typeof team !== 'object') return null;
  return {
    kills: Number(team.totalKills ?? team.kills ?? 0) || 0,
    gold: Number(team.totalGold ?? team.gold ?? 0) || 0,
    towers: Number(team.towers ?? team.turrets ?? 0) || 0,
    barons: Number(team.barons ?? 0) || 0,
    dragons: Array.isArray(team.dragons) ? team.dragons.length : Number(team.dragons ?? 0) || 0
  };
}

async function normalizeRecoveredWindow(windowData, game, seriesTeams = []) {
  if (!windowData || !game?.id) return null;
  const returnedId = text(windowData.esportsGameId);
  if (returnedId && returnedId !== text(game.id)) return null;
  const keys = await championKeyMap();
  const metadata = windowData.gameMetadata || {};
  const blueMeta = metadata.blueTeamMetadata || {};
  const redMeta = metadata.redTeamMetadata || {};
  const frame = statFrame(windowData.frames || []);
  const blue = {
    teamId: text(blueMeta.esportsTeamId) || null,
    picks: picksFromMeta(blueMeta, keys),
    bans: bansForSide(metadata, blueMeta, 'blue', keys),
    stats: teamStats(frame?.blueTeam)
  };
  const red = {
    teamId: text(redMeta.esportsTeamId) || null,
    picks: picksFromMeta(redMeta, keys),
    bans: bansForSide(metadata, redMeta, 'red', keys),
    stats: teamStats(frame?.redTeam)
  };
  const gameTeams = game?.teams || [];
  const teams = seriesTeams.map((team, index) => {
    let side = team?.id ? gameTeams.find(row => row?.id && row.id === team.id)?.side || null : null;
    if (!side && team?.id && blue.teamId === team.id) side = 'blue';
    if (!side && team?.id && red.teamId === team.id) side = 'red';
    const data = side === 'red' ? red : side === 'blue' ? blue : (index === 0 ? blue : red);
    return { ...data, teamId: team?.id || data?.teamId || null, side: side || (data === red ? 'red' : 'blue') };
  });
  return {
    gameId: text(game.id),
    gameNumber: Number(game.number || 0) || null,
    patchVersion: metadata.patchVersion || null,
    gameState: frame?.gameState || game.state || null,
    timestamp: frame?.rfc460Timestamp || null,
    blue,
    red,
    teams
  };
}

async function fetchHistoricalWindow(gameId, startingTime) {
  return fetchJson(`${LIVE_FEED}/window/${encodeURIComponent(gameId)}?startingTime=${encodeURIComponent(startingTime)}`, {
    headers: {
      'x-api-key': PUBLIC_API_KEY,
      'User-Agent': 'WebLienMinh/3.16 live-window-recovery'
    },
    signal: AbortSignal.timeout(4_500)
  });
}

async function recoverHistoricalDraft(body, gameId) {
  const game = body?.viewGame;
  if (!game?.id || text(game.id) !== text(gameId)) return null;
  const currentNumber = Number(body?.currentGame?.number || 0);
  const requestedNumber = Number(game?.number || 0);
  if (currentNumber && requestedNumber > currentNumber) return null;

  const isCurrent = text(body?.currentGame?.id) === text(gameId);
  const state = lower(body?.state);
  const isSeriesLive = state.includes('progress') || state === 'in_game' || state === 'in-game';
  const cooldown = isCurrent && isSeriesLive ? LIVE_PROBE_COOLDOWN_MS : HISTORY_PROBE_COOLDOWN_MS;
  const lastProbe = recoveryProbeAt.get(gameId) || 0;
  if (Date.now() - lastProbe < cooldown) return null;
  recoveryProbeAt.set(gameId, Date.now());

  const candidates = recoveryStartingTimes(game, body?.startTime, body?.live?.timestamp);
  if (!candidates.length) return null;

  let best = null;
  let bestRank = -1;
  for (let offset = 0; offset < candidates.length; offset += 6) {
    const batch = candidates.slice(offset, offset + 6);
    const windows = await Promise.all(batch.map(startingTime => fetchHistoricalWindow(gameId, startingTime).catch(() => null)));
    for (const windowData of windows) {
      if (!windowData) continue;
      const normalized = await normalizeRecoveredWindow(windowData, game, body?.teams || []);
      if (!sameGame(normalized, gameId)) continue;
      const picks = draftScore(normalized);
      const statSignal = liveStatsSignal(normalized);
      const timestamp = Date.parse(normalized.timestamp || '') || 0;
      const rank = picks * 1_000_000_000_000 + (statSignal > 0 ? 1_000_000_000 : 0) + timestamp;
      if (rank > bestRank) {
        best = normalized;
        bestRank = rank;
      }
    }
    if (draftScore(best) >= 10 && liveStatsSignal(best) > 0) break;
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

      void (async () => {
        try {
          const cached = historyByGame.get(gameId)?.live || null;
          const fresh = sameGame(body.live, gameId) ? body.live : null;
          let live = reconcileHistoricalLive(fresh, cached, gameId);

          const needsPicks = draftScore(live) < 10;
          const needsStats = liveStatsSignal(live) === 0;
          if (needsPicks || needsStats) {
            const recovered = await recoverHistoricalDraft(body, gameId);
            // The recovered window owns missing Pick/real-stat data. Reconcile
            // exact game ids only, never leaking another BO game's snapshot.
            live = reconcileHistoricalLive(recovered, live, gameId);
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
  draftScore,
  statsSignal
};
