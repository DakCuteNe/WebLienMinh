const LIVE_FEED = 'https://feed.lolesports.com/livestats/v1';
const PUBLIC_API_KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const LIVE_CACHE_MS = 4_000;
const COMPLETED_CACHE_MS = 30 * 60_000;
const cache = new Map();

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

function nullableCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function fieldCount(object, keys) {
  const value = firstOwn(object, keys);
  return value === undefined ? null : nullableCount(value);
}

function normalizeDragonType(value) {
  return lower(value)
    .replace(/dragon|drake/g, '')
    .replace(/[^a-z]/g, '')
    .trim();
}

function elderCountFromTypes(types) {
  if (!Array.isArray(types)) return null;
  return types.filter(type => normalizeDragonType(type).includes('elder')).length;
}

function recognizedStatPayload(team) {
  if (!team || typeof team !== 'object') return false;
  return [
    'totalKills', 'kills', 'totalGold', 'gold', 'towers', 'turrets', 'turretKills',
    'inhibitors', 'inhibitorKills', 'inhibitorsDestroyed', 'barons', 'baronKills',
    'dragons', 'dragonKills', 'elders', 'elderDragons', 'elderDragonKills', 'elderKills',
    'voidGrubs', 'voidGrubKills', 'grubs', 'grubKills', 'voidgrubs',
    'riftHeralds', 'riftHeraldKills', 'heralds', 'heraldKills', 'riftHerald',
    'atakhans', 'atakhanKills'
  ].some(key => hasOwn(team, key));
}

export function extractStrictObjectiveStats(team) {
  if (!recognizedStatPayload(team)) return null;
  const dragonsRaw = firstOwn(team, ['dragons', 'dragonKills']);
  const dragonTypes = Array.isArray(dragonsRaw) ? dragonsRaw.map(text).filter(Boolean) : null;
  const dragons = dragonsRaw === undefined ? null : nullableCount(dragonsRaw);
  const explicitElders = fieldCount(team, ['elders', 'elderDragons', 'elderDragonKills', 'elderKills']);
  const elders = explicitElders != null ? explicitElders : elderCountFromTypes(dragonTypes);
  return {
    kills: fieldCount(team, ['totalKills', 'kills']),
    gold: fieldCount(team, ['totalGold', 'gold']),
    towers: fieldCount(team, ['towers', 'turrets', 'turretKills']),
    inhibitors: fieldCount(team, ['inhibitors', 'inhibitorKills', 'inhibitorsDestroyed']),
    barons: fieldCount(team, ['barons', 'baronKills']),
    dragons,
    dragonTypes,
    elders,
    voidGrubs: fieldCount(team, ['voidGrubs', 'voidGrubKills', 'grubs', 'grubKills', 'voidgrubs']),
    riftHeralds: fieldCount(team, ['riftHeralds', 'riftHeraldKills', 'heralds', 'heraldKills', 'riftHerald']),
    atakhans: fieldCount(team, ['atakhans', 'atakhanKills'])
  };
}

const MONOTONIC = ['kills', 'gold', 'towers', 'inhibitors', 'barons', 'dragons', 'elders', 'voidGrubs', 'riftHeralds', 'atakhans'];

export function mergeStrictObjectiveStats(existing, fresh) {
  if (!existing && !fresh) return null;
  if (!fresh) return existing ? { ...existing } : null;
  if (!existing) return { ...fresh };
  const merged = { ...existing };
  for (const key of MONOTONIC) {
    const oldValue = existing?.[key];
    const newValue = fresh?.[key];
    if (newValue == null) continue;
    if (oldValue == null) merged[key] = newValue;
    else merged[key] = Math.max(Number(oldValue) || 0, Number(newValue) || 0);
  }
  if (Array.isArray(fresh.dragonTypes)) {
    if (!Array.isArray(existing.dragonTypes) || fresh.dragonTypes.length >= existing.dragonTypes.length) {
      merged.dragonTypes = [...fresh.dragonTypes];
    }
  }
  return merged;
}

function metricAvailable(stats, key) {
  if (!stats) return false;
  if (key === 'dragonTypes') return Array.isArray(stats.dragonTypes);
  return stats[key] != null;
}

function statsAvailability(rows = []) {
  const sides = rows.filter(Boolean);
  const keys = ['kills', 'gold', 'towers', 'inhibitors', 'barons', 'dragons', 'dragonTypes', 'elders', 'voidGrubs', 'riftHeralds', 'atakhans'];
  return Object.fromEntries(keys.map(key => [key, sides.length > 0 && sides.some(stats => metricAvailable(stats, key))]));
}

function frameTime(frame) {
  const parsed = Date.parse(frame?.rfc460Timestamp || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestStatFrame(frames = []) {
  return [...(Array.isArray(frames) ? frames : [])]
    .filter(frame => frame?.blueTeam && frame?.redTeam)
    .sort((a, b) => frameTime(b) - frameTime(a))[0] || null;
}

function normalizeStart(value) {
  const parsed = new Date(value || '').getTime();
  if (!Number.isFinite(parsed)) return null;
  return new Date(Math.floor(parsed / 10_000) * 10_000).toISOString();
}

function addOffsets(set, value, minutes) {
  const base = new Date(value || '').getTime();
  if (!Number.isFinite(base)) return;
  for (const minute of minutes) {
    const normalized = normalizeStart(base + minute * 60_000);
    if (normalized) set.add(normalized);
  }
}

function startingTimes(body, game) {
  const candidates = new Set();
  addOffsets(candidates, body?.live?.timestamp, [-20, -10, 0, 10, 20, 30, 40]);
  for (const vod of game?.vods || []) addOffsets(candidates, vod?.firstFrameTime, [0, 10, 20, 30, 40, 50, 60]);
  addOffsets(candidates, game?.startTime, [0, 10, 20, 30, 40, 50, 60]);
  const series = new Date(body?.startTime || '').getTime();
  if (Number.isFinite(series)) {
    const number = Math.max(1, Number(game?.number || 1));
    const estimated = series + (number - 1) * 70 * 60_000;
    addOffsets(candidates, estimated, [0, 10, 20, 30, 40, 50, 60]);
  }
  if (!stateIsCompleted(game?.state) && !stateIsCompleted(body?.state)) {
    addOffsets(candidates, Date.now(), [-10, -5, -2, -1, 0]);
  }
  return [...candidates];
}

async function fetchWindow(gameId, startingTime = null) {
  const suffix = startingTime ? `?startingTime=${encodeURIComponent(startingTime)}` : '';
  const response = await fetch(`${LIVE_FEED}/window/${encodeURIComponent(gameId)}${suffix}`, {
    headers: {
      'x-api-key': PUBLIC_API_KEY,
      'User-Agent': 'WebLienMinh/3.30 strict-objectives'
    },
    signal: AbortSignal.timeout(startingTime ? 5_000 : 4_000)
  });
  if (!response.ok) return null;
  const raw = await response.text();
  if (!raw.trim()) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function normalizeWindow(windowData, gameId) {
  if (!windowData) return null;
  const returnedId = text(windowData?.esportsGameId);
  if (returnedId && returnedId !== text(gameId)) return null;
  const frame = latestStatFrame(windowData?.frames || []);
  if (!frame) return null;
  const blue = extractStrictObjectiveStats(frame.blueTeam);
  const red = extractStrictObjectiveStats(frame.redTeam);
  if (!blue && !red) return null;
  return {
    gameId: text(gameId),
    timestamp: frame.rfc460Timestamp || null,
    gameState: frame.gameState || null,
    blue,
    red
  };
}

function fresher(a, b) {
  if (!a) return b;
  if (!b) return a;
  const at = Date.parse(a.timestamp || '') || 0;
  const bt = Date.parse(b.timestamp || '') || 0;
  return bt >= at ? b : a;
}

async function loadStrictObjectives(body, game) {
  const gameId = text(game?.id);
  if (!gameId) return null;
  const completed = stateIsCompleted(game?.state) || stateIsCompleted(body?.state);
  const cached = cache.get(gameId);
  const maxAge = completed ? COMPLETED_CACHE_MS : LIVE_CACHE_MS;
  if (cached && Date.now() - cached.at < maxAge) return cached.value;

  let best = normalizeWindow(await fetchWindow(gameId).catch(() => null), gameId);
  const candidates = startingTimes(body, game);
  for (let offset = 0; offset < candidates.length; offset += 6) {
    const windows = await Promise.all(candidates.slice(offset, offset + 6)
      .map(value => fetchWindow(gameId, value).catch(() => null)));
    for (const windowData of windows) best = fresher(best, normalizeWindow(windowData, gameId));
    if (!completed && best && (Date.parse(best.timestamp || '') || 0) >= Date.now() - 3 * 60_000) break;
  }
  if (best) cache.set(gameId, { at: Date.now(), value: best });
  return best || cached?.value || null;
}

function sideForTeam(game, teamId, fallbackIndex) {
  const rows = game?.teams || [];
  const side = teamId ? lower(rows.find(row => text(row?.id) === text(teamId))?.side) : '';
  return side || (fallbackIndex === 0 ? 'blue' : 'red');
}

function mergeRow(row, officialStats) {
  if (!row && !officialStats) return row || null;
  return {
    ...(row || {}),
    stats: mergeStrictObjectiveStats(row?.stats || null, officialStats)
  };
}

function applyStrictObjectives(body, strict) {
  if (!body?.live || !strict) return body;
  const viewed = body?.viewGame || body?.currentGame;
  if (!viewed?.id || text(body.live.gameId) !== text(viewed.id) || strict.gameId !== text(viewed.id)) return body;

  body.live.blue = mergeRow(body.live.blue, strict.blue);
  body.live.red = mergeRow(body.live.red, strict.red);
  if (Array.isArray(body.live.teams)) {
    body.live.teams = body.live.teams.map((row, index) => {
      const side = lower(row?.side) || sideForTeam(viewed, row?.teamId, index);
      return {
        ...mergeRow(row, side === 'red' ? strict.red : strict.blue),
        side
      };
    });
  }

  const statsRows = [body.live.blue?.stats, body.live.red?.stats];
  const availability = statsAvailability(statsRows);
  body.live.timestamp = fresher({ timestamp: body.live.timestamp }, { timestamp: strict.timestamp }).timestamp;
  body.live.gameState = strict.gameState || body.live.gameState || viewed.state || null;
  body.live.dataAvailability = {
    ...(body.live.dataAvailability || {}),
    ...availability,
    picks: Boolean((body.live.blue?.picks?.length || 0) + (body.live.red?.picks?.length || 0)),
    bans: Boolean((body.live.blue?.bans?.length || 0) + (body.live.red?.bans?.length || 0))
  };
  body.live.objectiveSource = 'riot-window-strict';
  return body;
}

async function enrichResponse(body) {
  if (!body?.ok || !body?.live) return body;
  const game = body.viewGame || body.currentGame || null;
  if (!game?.id || text(body.live.gameId) !== text(game.id)) return body;
  const strict = await loadStrictObjectives(body, game).catch(() => null);
  return strict ? applyStrictObjectives(body, strict) : body;
}

export function installEsportsMatchObjectivesV3(app) {
  app.use('/api/esports/match-live', (req, res, next) => {
    const previousJson = res.json.bind(res);
    res.json = body => {
      void enrichResponse(body).catch(() => body).then(value => previousJson(value));
      return res;
    };
    next();
  });
}

export const __strictObjectivesTest = {
  extractStrictObjectiveStats,
  mergeStrictObjectiveStats,
  applyStrictObjectives,
  statsAvailability
};
