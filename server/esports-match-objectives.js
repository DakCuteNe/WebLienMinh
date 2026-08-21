const LIVE_FEED = 'https://feed.lolesports.com/livestats/v1';
const PUBLIC_API_KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const LIVE_CACHE_MS = 4_000;
const COMPLETED_CACHE_MS = 10 * 60_000;
const objectiveCache = new Map();
const seriesProgress = new Map();
const winnerByMatch = new Map();

const text = value => String(value ?? '').trim();
const lower = value => text(value).toLowerCase();

function stateIsCompleted(value) {
  const state = lower(value);
  return state.includes('complete') || state.includes('finished');
}

function hasOwn(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function firstOwn(object, keys) {
  for (const key of keys) if (hasOwn(object, key)) return object[key];
  return undefined;
}

function objectiveCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function nullableNumber(object, keys) {
  const value = firstOwn(object, keys);
  if (value === undefined) return null;
  return objectiveCount(value);
}

export function extractObjectiveStats(team) {
  if (!team || typeof team !== 'object') return null;
  const dragonsRaw = hasOwn(team, 'dragons') ? team.dragons : undefined;
  const dragonTypes = Array.isArray(dragonsRaw) ? dragonsRaw.map(text).filter(Boolean) : [];
  return {
    kills: nullableNumber(team, ['totalKills', 'kills']) ?? 0,
    gold: nullableNumber(team, ['totalGold', 'gold']) ?? 0,
    towers: nullableNumber(team, ['towers', 'turrets', 'turretKills']) ?? 0,
    inhibitors: nullableNumber(team, ['inhibitors', 'inhibitorKills', 'inhibitorsDestroyed']) ?? 0,
    barons: nullableNumber(team, ['barons', 'baronKills']) ?? 0,
    dragons: dragonTypes.length || nullableNumber(team, ['dragons', 'dragonKills']) || 0,
    dragonTypes,
    // Riot's current official LoL Esports feed does not expose these for every
    // match. Keep null to mean “not supplied”; never turn missing data into 0.
    voidGrubs: nullableNumber(team, ['voidGrubs', 'voidGrubKills', 'grubs', 'grubKills', 'voidgrubs']),
    riftHeralds: nullableNumber(team, ['riftHeralds', 'riftHeraldKills', 'heralds', 'heraldKills', 'riftHerald'])
  };
}

function frameTime(frame) {
  const parsed = Date.parse(frame?.rfc460Timestamp || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function bestStatFrame(frames = []) {
  return [...(Array.isArray(frames) ? frames : [])]
    .filter(frame => frame?.blueTeam && frame?.redTeam)
    .sort((a, b) => frameTime(b) - frameTime(a))[0] || null;
}

function normalizeStart(value) {
  const parsed = new Date(value || '').getTime();
  if (!Number.isFinite(parsed)) return null;
  return new Date(Math.floor(parsed / 10_000) * 10_000).toISOString();
}

function addCandidate(set, value) {
  const normalized = normalizeStart(value);
  if (normalized) set.add(normalized);
}

function addOffsets(set, value, minutes = []) {
  const base = new Date(value || '').getTime();
  if (!Number.isFinite(base)) return;
  for (const minute of minutes) addCandidate(set, base + minute * 60_000);
}

function objectiveCandidates(game = {}, seriesStart = '', liveTimestamp = '') {
  const set = new Set();
  addOffsets(set, liveTimestamp, [-10, 0, 10, 20, 30]);
  for (const vod of game.vods || []) addOffsets(set, vod?.firstFrameTime, [0, 10, 20, 30, 40, 50, 60]);
  addOffsets(set, game.startTime, [0, 10, 20, 30, 40, 50, 60]);
  const series = new Date(seriesStart || '').getTime();
  const number = Math.max(1, Number(game.number || 1));
  if (Number.isFinite(series)) {
    const estimate = series + (number - 1) * 70 * 60_000;
    addOffsets(set, estimate, [0, 10, 20, 30, 40, 50, 60]);
  }
  for (const minute of [1, 2, 5, 10, 20]) addCandidate(set, Date.now() - minute * 60_000);
  return [...set];
}

async function fetchWindow(gameId, startingTime = '') {
  const suffix = startingTime ? `?startingTime=${encodeURIComponent(startingTime)}` : '';
  const response = await fetch(`${LIVE_FEED}/window/${encodeURIComponent(gameId)}${suffix}`, {
    headers: {
      'x-api-key': PUBLIC_API_KEY,
      'User-Agent': 'WebLienMinh/3.18 per-game-objectives'
    },
    signal: AbortSignal.timeout(startingTime ? 5_000 : 4_000)
  });
  if (!response.ok) return null;
  const raw = await response.text();
  if (!raw.trim()) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function sameGame(windowData, gameId) {
  const returned = text(windowData?.esportsGameId);
  return Boolean(windowData) && (!returned || returned === text(gameId));
}

function normalizedObjectiveWindow(windowData, gameId) {
  if (!sameGame(windowData, gameId)) return null;
  const frame = bestStatFrame(windowData?.frames || []);
  if (!frame) return null;
  return {
    gameId: text(gameId),
    timestamp: frame.rfc460Timestamp || null,
    gameState: frame.gameState || null,
    blue: extractObjectiveStats(frame.blueTeam),
    red: extractObjectiveStats(frame.redTeam)
  };
}

function chooseFresher(a, b) {
  if (!a) return b;
  if (!b) return a;
  const at = Date.parse(a.timestamp || '') || 0;
  const bt = Date.parse(b.timestamp || '') || 0;
  return bt >= at ? b : a;
}

async function loadObjectives(body, game) {
  const gameId = text(game?.id);
  if (!gameId) return null;
  const completed = stateIsCompleted(game?.state) || stateIsCompleted(body?.state);
  const cached = objectiveCache.get(gameId);
  const maxAge = completed ? COMPLETED_CACHE_MS : LIVE_CACHE_MS;
  if (cached && Date.now() - cached.at < maxAge) return cached.value;

  let best = normalizedObjectiveWindow(await fetchWindow(gameId).catch(() => null), gameId);
  const candidates = objectiveCandidates(game, body?.startTime, body?.live?.timestamp);
  // Completed games need the latest surviving historical frame, not merely the
  // first valid one. Probe compact batches and keep the newest timestamp.
  for (let offset = 0; offset < candidates.length; offset += 6) {
    const windows = await Promise.all(candidates.slice(offset, offset + 6)
      .map(startingTime => fetchWindow(gameId, startingTime).catch(() => null)));
    for (const windowData of windows) best = chooseFresher(best, normalizedObjectiveWindow(windowData, gameId));
    if (!completed && best && (Date.parse(best.timestamp || '') || 0) >= Date.now() - 3 * 60_000) break;
  }

  if (best) objectiveCache.set(gameId, { at: Date.now(), value: best });
  return best || cached?.value || null;
}

function mergeStats(existing = {}, enriched = null) {
  if (!enriched) return existing || null;
  const merged = { ...(existing || {}), ...enriched };
  // Preserve richer cached arrays when a later rolling window omits them.
  if ((!enriched.dragonTypes || !enriched.dragonTypes.length) && Array.isArray(existing?.dragonTypes) && existing.dragonTypes.length) {
    merged.dragonTypes = existing.dragonTypes;
    merged.dragons = Math.max(Number(existing.dragons || 0), Number(enriched.dragons || 0));
  }
  for (const key of ['voidGrubs', 'riftHeralds']) {
    if (enriched[key] == null && existing?.[key] != null) merged[key] = existing[key];
  }
  return merged;
}

function enrichAlignedLive(body, objectives) {
  if (!body?.live || !objectives) return;
  body.live.timestamp = chooseFresher({ timestamp: body.live.timestamp }, { timestamp: objectives.timestamp }).timestamp;
  if (body.live.blue) body.live.blue.stats = mergeStats(body.live.blue.stats, objectives.blue);
  if (body.live.red) body.live.red.stats = mergeStats(body.live.red.stats, objectives.red);

  const gameTeams = body?.viewGame?.teams || [];
  if (Array.isArray(body.live.teams)) {
    body.live.teams = body.live.teams.map((row, index) => {
      const teamId = text(row?.teamId);
      let side = lower(row?.side);
      if (!side && teamId) side = lower(gameTeams.find(team => text(team?.id) === teamId)?.side);
      if (!side) side = index === 0 ? 'blue' : 'red';
      const stats = side === 'red' ? objectives.red : objectives.blue;
      return { ...row, side, stats: mergeStats(row?.stats, stats) };
    });
  }

  body.live.dataAvailability = {
    ...(body.live.dataAvailability || {}),
    bans: Boolean((body.live.blue?.bans?.length || 0) + (body.live.red?.bans?.length || 0)),
    voidGrubs: objectives.blue?.voidGrubs != null || objectives.red?.voidGrubs != null,
    riftHeralds: objectives.blue?.riftHeralds != null || objectives.red?.riftHeralds != null
  };
}

function matchKey(body) {
  return text(body?.matchId) || [body?.startTime, ...(body?.teams || []).map(team => text(team?.id || team?.code))].filter(Boolean).join(':');
}

function winnersFor(matchId) {
  if (!winnerByMatch.has(matchId)) winnerByMatch.set(matchId, new Map());
  return winnerByMatch.get(matchId);
}

function recordWinner(matchId, game, winnerTeamId, source = 'score-progression', confidence = 'exact') {
  if (!matchId || !game?.id || !winnerTeamId) return;
  winnersFor(matchId).set(text(game.id), { winnerTeamId: text(winnerTeamId), source, confidence });
}

function recordSeriesProgress(body) {
  const key = matchKey(body);
  if (!key) return;
  const teams = body.teams || [];
  const games = [...(body.games || [])].sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
  const current = teams.map(team => Number(team?.wins || 0) || 0);
  const total = current.reduce((sum, value) => sum + value, 0);
  const previous = seriesProgress.get(key);

  if (previous && total > previous.total) {
    const deltas = current.map((value, index) => value - (previous.scores[index] || 0));
    const changed = deltas.map((value, index) => ({ value, index })).filter(row => row.value > 0);
    if (changed.length === 1) {
      const winner = teams[changed[0].index]?.id;
      for (let number = previous.total + 1; number <= total; number += 1) {
        const game = games.find(row => Number(row.number) === number);
        if (game) recordWinner(key, game, winner, 'score-progression', 'exact');
      }
    }
  }

  // A cold start at 1–0 is still exact: only Game 1 has been completed.
  if (!previous && total === 1) {
    const index = current.findIndex(value => value === 1);
    const game = games.find(row => Number(row.number) === 1);
    if (index >= 0 && game) recordWinner(key, game, teams[index]?.id, 'series-score', 'exact');
  }

  // Completed sweeps (2–0, 3–0...) reveal every played game's winner exactly.
  const positive = current.map((value, index) => ({ value, index })).filter(row => row.value > 0);
  const zeroCount = current.filter(value => value === 0).length;
  if (stateIsCompleted(body.state) && positive.length === 1 && zeroCount === Math.max(0, current.length - 1)) {
    const winner = teams[positive[0].index]?.id;
    for (const game of games.filter(row => stateIsCompleted(row.state) && Number(row.number || 0) <= total)) {
      recordWinner(key, game, winner, 'completed-sweep', 'exact');
    }
  }

  seriesProgress.set(key, { scores: current, total, at: Date.now() });
}

function inferredWinner(body, game) {
  if (!stateIsCompleted(game?.state) || !body?.live?.teams?.length) return null;
  const rows = body.live.teams.filter(row => row?.teamId && row?.stats);
  if (rows.length < 2) return null;
  const score = stats => Number(stats?.towers || 0) * 1_000_000
    + Number(stats?.inhibitors || 0) * 250_000
    + Number(stats?.barons || 0) * 60_000
    + Number(stats?.dragons || 0) * 20_000
    + Number(stats?.gold || 0)
    + Number(stats?.kills || 0) * 500;
  const ranked = rows.map(row => ({ row, value: score(row.stats) })).sort((a, b) => b.value - a.value);
  if (!ranked[0] || !ranked[1] || ranked[0].value === ranked[1].value) return null;
  const lead = ranked[0].value - ranked[1].value;
  // Require a material objective/gold lead to avoid presenting a coin flip as a result.
  if (lead < 25_000) return null;
  return { winnerTeamId: text(ranked[0].row.teamId), source: 'final-stats-inferred', confidence: 'inferred' };
}

function applyGameResults(body) {
  const key = matchKey(body);
  if (!key) return;
  recordSeriesProgress(body);
  const winners = winnersFor(key);
  const teams = body.teams || [];
  const indexById = new Map(teams.map((team, index) => [text(team?.id), index]));
  const running = Array(teams.length).fill(0);
  let prefixKnown = true;

  body.games = (body.games || []).map(game => {
    let result = winners.get(text(game.id)) || null;
    if (!result && body?.viewGame?.id === game.id) {
      result = inferredWinner(body, game);
      if (result) recordWinner(key, game, result.winnerTeamId, result.source, result.confidence);
    }
    if (result?.winnerTeamId && prefixKnown) {
      const index = indexById.get(text(result.winnerTeamId));
      if (index == null) prefixKnown = false;
      else running[index] += 1;
    } else if (stateIsCompleted(game.state)) {
      prefixKnown = false;
    }
    return {
      ...game,
      winnerTeamId: result?.winnerTeamId || null,
      winnerSource: result?.source || null,
      winnerConfidence: result?.confidence || null,
      scoreAfterGame: prefixKnown && result?.winnerTeamId ? [...running] : null
    };
  });

  const byId = new Map(body.games.map(game => [text(game.id), game]));
  if (body.currentGame?.id && byId.has(text(body.currentGame.id))) body.currentGame = byId.get(text(body.currentGame.id));
  if (body.viewGame?.id && byId.has(text(body.viewGame.id))) body.viewGame = byId.get(text(body.viewGame.id));
  body.gameResult = body.viewGame?.id ? byId.get(text(body.viewGame.id)) || null : null;
}

async function enrichResponse(body) {
  if (!body?.ok) return body;
  const game = body.viewGame || body.currentGame || null;
  if (body?.live && game?.id && text(body.live.gameId) === text(game.id)) {
    const objectives = await loadObjectives(body, game).catch(() => null);
    if (objectives) enrichAlignedLive(body, objectives);
  }
  applyGameResults(body);
  return body;
}

export function installEsportsMatchObjectives(app) {
  app.use('/api/esports/match-live', (req, res, next) => {
    const previousJson = res.json.bind(res);
    res.json = body => {
      void enrichResponse(body)
        .catch(() => body)
        .then(value => previousJson(value));
      return res;
    };
    next();
  });
}

export const __liveObjectivesTest = {
  extractObjectiveStats,
  applyGameResults
};
