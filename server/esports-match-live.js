const ESPORTS_API = 'https://esports-api.lolesports.com/persisted/gw';
const LIVE_FEED = 'https://feed.lolesports.com/livestats/v1';
const PUBLIC_API_KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const CACHE_TTL = 3_000;
const cache = new Map();
const metadataCache = new Map();
const latestWindowCache = new Map();

const text = value => String(value ?? '').trim();
const lower = value => text(value).toLowerCase();

function httpsUrl(value) {
  if (!value) return null;
  const raw = String(value);
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('http://')) return `https://${raw.slice(7)}`;
  return raw;
}

async function riotGet(endpoint, params = {}) {
  const query = new URLSearchParams({ hl: 'en-US', ...params });
  const response = await fetch(`${ESPORTS_API}/${endpoint}?${query}`, {
    headers: {
      'x-api-key': PUBLIC_API_KEY,
      'User-Agent': 'WebLienMinh/3.2 live-match-center'
    },
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) throw new Error(`${endpoint} HTTP ${response.status}`);
  const body = await response.json();
  if (body?.error) throw new Error(body.error.message || body.error.code || 'LoL Esports API error');
  return body;
}

function teamCodes(event) {
  return (event?.match?.teams || []).slice(0, 2).map(team => lower(team.code || team.name));
}

function scheduleMatchScore(event) {
  return (event?.match?.teams || []).slice(0, 2).map(team => ({
    name: team.name || team.code || 'TBD',
    code: team.code || team.name || 'TBD',
    image: httpsUrl(team.image),
    wins: Number(team?.result?.gameWins ?? team?.result?.wins ?? 0) || 0,
    outcome: team?.result?.outcome || null
  }));
}

function eventMatches(event, wanted) {
  if (!event?.match) return false;
  if (wanted.eventId && text(event.id) === wanted.eventId) return true;
  if (wanted.matchId && text(event.match?.id) === wanted.matchId) return true;
  const startDelta = wanted.startTime && event.startTime
    ? Math.abs(new Date(event.startTime).getTime() - new Date(wanted.startTime).getTime())
    : Number.POSITIVE_INFINITY;
  const codes = teamCodes(event);
  const wantedCodes = [wanted.teamA, wanted.teamB].map(lower).filter(Boolean);
  const sameTeams = wantedCodes.length === 2 && wantedCodes.every(code => codes.includes(code));
  return sameTeams && startDelta <= 3 * 60 * 60_000;
}

async function resolveScheduleEvent(wanted) {
  if (!wanted.leagueId) return null;
  let pageToken = null;
  const seen = new Set();
  for (let page = 0; page < 3; page += 1) {
    const body = await riotGet('getSchedule', pageToken
      ? { leagueId: wanted.leagueId, pageToken }
      : { leagueId: wanted.leagueId });
    const schedule = body?.data?.schedule || {};
    const hit = (schedule.events || []).find(event => eventMatches(event, wanted));
    if (hit) return hit;
    const next = schedule?.pages?.newer || null;
    if (!next || seen.has(next)) break;
    seen.add(next);
    pageToken = next;
  }
  return null;
}

function eventFromDetail(body) {
  return body?.data?.event || body?.data?.eventDetails || body?.data?.match || null;
}

async function fetchEventDetail(id) {
  if (!id) return null;
  try {
    const body = await riotGet('getEventDetails', { id });
    return eventFromDetail(body);
  } catch {
    return null;
  }
}

function gameState(game) {
  return lower(game?.state || game?.status || 'unstarted');
}

function gameNumber(game, index = 0) {
  return Number(game?.number || game?.gameNumber || index + 1) || index + 1;
}

function normalizeGames(match = {}) {
  return (match.games || []).map((game, index) => ({
    id: text(game.id || game.gameId) || null,
    number: gameNumber(game, index),
    state: gameState(game),
    startTime: game.startTime || null,
    vods: Array.isArray(game.vods) ? game.vods : []
  }));
}

function stateIsLive(value) {
  const state = lower(value);
  return state.includes('progress') || state === 'in_game' || state === 'in-game';
}

function stateIsCompleted(value) {
  const state = lower(value);
  return state.includes('complete') || state.includes('finished');
}

function currentGame(games = [], seriesState = '') {
  const live = games.find(game => stateIsLive(game.state));
  if (live) return live;

  if (!stateIsCompleted(seriesState)) {
    const next = games.find(game => !stateIsCompleted(game.state));
    if (next) return next;
  }

  return [...games].reverse().find(game => stateIsCompleted(game.state))
    || games.at(-1)
    || null;
}

export function selectViewGame(games = [], requestedId = '', requestedNumber = 0, seriesState = '') {
  const id = text(requestedId);
  if (id) {
    const byId = games.find(game => text(game.id) === id);
    if (byId) return byId;
  }
  const number = Number(requestedNumber || 0);
  if (number > 0) {
    const byNumber = games.find(game => Number(game.number) === number);
    if (byNumber) return byNumber;
  }
  return currentGame(games, seriesState);
}

function validStreamUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(httpsUrl(value));
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return url.toString();
    if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) return url.toString();
    if (host === 'sooplive.com' || host.endsWith('.sooplive.com') || host === 'sooplive.co.kr' || host.endsWith('.sooplive.co.kr')) return url.toString();
    if (host === 'afreecatv.com' || host.endsWith('.afreecatv.com')) return url.toString();
    if (host === 'lolesports.com' || host === 'www.lolesports.com') {
      if (/\.(?:png|jpe?g|gif|webp|svg|ico)(?:$|\?)/i.test(url.pathname)) return null;
      return url.toString();
    }
  } catch {}
  return null;
}

function collectStreamUrls(value, found = []) {
  if (!value) return found;
  if (typeof value === 'string') {
    const url = validStreamUrl(value);
    if (url) found.push(url);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStreamUrls(item, found);
    return found;
  }
  if (typeof value === 'object') {
    const provider = lower(value.provider || value.type || value.service);
    const parameter = text(value.parameter || value.channel || value.id || value.slug);
    if (provider.includes('twitch') && parameter && !parameter.includes(' ')) found.push(`https://www.twitch.tv/${parameter}`);
    if (provider.includes('youtube') && parameter && !parameter.includes(' ')) found.push(`https://www.youtube.com/watch?v=${parameter}`);
    for (const item of Object.values(value)) collectStreamUrls(item, found);
  }
  return found;
}

function normalizeStart(value) {
  const date = new Date(value || Date.now());
  const time = Number.isFinite(date.getTime()) ? date.getTime() : Date.now();
  return new Date(Math.floor(time / 10_000) * 10_000).toISOString();
}

function shiftedStart(value, deltaMs) {
  const base = new Date(value || Date.now()).getTime();
  return normalizeStart((Number.isFinite(base) ? base : Date.now()) + deltaMs);
}

async function fetchLiveWindowAt(gameId, startingTime) {
  const response = await fetch(`${LIVE_FEED}/window/${encodeURIComponent(gameId)}?startingTime=${encodeURIComponent(startingTime)}`, {
    headers: {
      'x-api-key': PUBLIC_API_KEY,
      'User-Agent': 'WebLienMinh/3.2 live-match-center'
    },
    signal: AbortSignal.timeout(7_000)
  });
  if (!response.ok) throw new Error(`live window HTTP ${response.status}`);
  return response.json();
}

function championIds(value, out = []) {
  if (value == null) return out;
  if (typeof value === 'number' && value > 0) out.push(value);
  else if (typeof value === 'string' && /^\d+$/.test(value) && Number(value) > 0) out.push(Number(value));
  else if (Array.isArray(value)) for (const item of value) championIds(item, out);
  else if (typeof value === 'object') {
    if (value.championId != null) championIds(value.championId, out);
    else for (const item of Object.values(value)) championIds(item, out);
  }
  return out;
}

function bansFromTeam(meta = {}) {
  const values = [];
  for (const [key, value] of Object.entries(meta)) {
    if (/ban/i.test(key)) championIds(value, values);
  }
  return [...new Set(values)].slice(0, 10);
}

function picksFromTeam(meta = {}) {
  return (meta.participantMetadata || meta.participants || []).map((player, index) => ({
    participantId: Number(player.participantId || index + 1) || index + 1,
    championId: Number(player.championId || 0) || null,
    playerId: text(player.esportsPlayerId || player.playerId) || null,
    summonerName: player.summonerName || player.name || null,
    role: player.role || null,
    slot: index + 1
  })).filter(row => row.championId);
}

function collectBanEntries(value, path = '', out = []) {
  if (value == null) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectBanEntries(item, path, out);
    return out;
  }
  if (typeof value !== 'object') return out;
  if (/ban/i.test(path) && value.championId != null) {
    const championId = Number(value.championId || 0);
    if (championId > 0) {
      out.push({
        championId,
        teamId: text(value.esportsTeamId || value.teamId) || null,
        side: lower(value.side || value.teamSide),
        path: lower(path),
        order: Number(value.pickTurn || value.order || value.slot || 0) || 0
      });
    }
  }
  for (const [key, child] of Object.entries(value)) collectBanEntries(child, path ? `${path}.${key}` : key, out);
  return out;
}

function bansForSide(metadata = {}, teamMeta = {}, side = 'blue') {
  const direct = bansFromTeam(teamMeta);
  if (direct.length) return direct.slice(0, 5);

  const entries = collectBanEntries(metadata);
  if (!entries.length) return [];
  const teamId = text(teamMeta.esportsTeamId || teamMeta.teamId);
  const byTeam = teamId ? entries.filter(row => row.teamId && row.teamId === teamId) : [];
  const bySide = entries.filter(row => row.side === side || row.path.includes(`${side}team`) || row.path.includes(`${side}.`));
  const chosen = byTeam.length ? byTeam : bySide;
  if (chosen.length) return [...new Set(chosen.sort((a, b) => a.order - b.order).map(row => row.championId))].slice(0, 5);

  const unique = [...new Set(entries.sort((a, b) => a.order - b.order).map(row => row.championId))];
  if (unique.length >= 10) return side === 'blue' ? unique.slice(0, 5) : unique.slice(5, 10);
  return [];
}

function metadataScore(metadata = {}) {
  const blue = metadata.blueTeamMetadata || {};
  const red = metadata.redTeamMetadata || {};
  return picksFromTeam(blue).length + picksFromTeam(red).length
    + bansForSide(metadata, blue, 'blue').length + bansForSide(metadata, red, 'red').length;
}

function mergeTeamMetadata(fresh = {}, fallback = {}) {
  const freshParticipants = fresh.participantMetadata || fresh.participants || [];
  const fallbackParticipants = fallback.participantMetadata || fallback.participants || [];
  const participants = picksFromTeam(fresh).length >= picksFromTeam(fallback).length ? freshParticipants : fallbackParticipants;
  const merged = { ...fallback, ...fresh };
  if (participants.length) merged.participantMetadata = participants;

  const keys = new Set([...Object.keys(fallback || {}), ...Object.keys(fresh || {})]);
  for (const key of keys) {
    if (!/ban/i.test(key)) continue;
    const a = fresh?.[key];
    const b = fallback?.[key];
    merged[key] = championIds(a, []).length >= championIds(b, []).length ? a : b;
  }
  return merged;
}

function mergeGameMetadata(fresh = {}, fallback = {}) {
  return {
    ...fallback,
    ...fresh,
    patchVersion: fresh.patchVersion || fallback.patchVersion || null,
    blueTeamMetadata: mergeTeamMetadata(fresh.blueTeamMetadata || {}, fallback.blueTeamMetadata || {}),
    redTeamMetadata: mergeTeamMetadata(fresh.redTeamMetadata || {}, fallback.redTeamMetadata || {})
  };
}

export function mergeLiveWindows(metadataWindow, latestWindow) {
  if (!metadataWindow && !latestWindow) return null;
  const fallback = metadataWindow || {};
  const latest = latestWindow || {};
  const metadata = metadataScore(latest.gameMetadata || {}) >= metadataScore(fallback.gameMetadata || {})
    ? mergeGameMetadata(latest.gameMetadata || {}, fallback.gameMetadata || {})
    : mergeGameMetadata(fallback.gameMetadata || {}, latest.gameMetadata || {});
  return {
    ...fallback,
    ...latest,
    esportsGameId: latest.esportsGameId || fallback.esportsGameId || null,
    esportsMatchId: latest.esportsMatchId || fallback.esportsMatchId || null,
    gameMetadata: metadata,
    frames: latest.frames?.length ? latest.frames : (fallback.frames || [])
  };
}

function rememberMetadata(gameId, metadata) {
  if (!gameId || !metadata) return;
  const previous = metadataCache.get(gameId);
  if (!previous || metadataScore(metadata) >= metadataScore(previous.metadata)) {
    metadataCache.set(gameId, { metadata, at: Date.now() });
  }
}

function frameTimestamp(windowData) {
  const value = windowData?.frames?.at(-1)?.rfc460Timestamp;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function rememberLatestWindow(gameId, windowData) {
  if (!gameId || !windowData) return windowData;
  const previous = latestWindowCache.get(gameId)?.value || null;
  if (!previous || frameTimestamp(windowData) >= frameTimestamp(previous)) {
    latestWindowCache.set(gameId, { value: windowData, at: Date.now() });
    return windowData;
  }
  return previous;
}

async function firstWindow(gameId, candidates, predicate) {
  let lastError = null;
  for (const startingTime of [...new Set(candidates.filter(Boolean))]) {
    try {
      const body = await fetchLiveWindowAt(gameId, startingTime);
      if (predicate(body)) return body;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return null;
}

async function fetchMetadataWindow(game, fallbackStart, latestWindow) {
  const cached = metadataCache.get(game.id);
  const latestMetadata = latestWindow?.gameMetadata || null;
  if (latestMetadata) rememberMetadata(game.id, latestMetadata);
  if (latestMetadata && metadataScore(latestMetadata) >= 10) return { gameMetadata: latestMetadata, frames: [] };
  if (cached?.metadata && metadataScore(cached.metadata) >= 10) return { gameMetadata: cached.metadata, frames: [] };

  const start = game.startTime || fallbackStart || Date.now() - 30 * 60_000;
  const candidates = [
    normalizeStart(start),
    shiftedStart(start, 2 * 60_000),
    shiftedStart(start, 5 * 60_000),
    normalizeStart(Date.now() - 15 * 60_000),
    normalizeStart(Date.now() - 30 * 60_000),
    normalizeStart(Date.now() - 60 * 60_000)
  ];
  const window = await firstWindow(game.id, candidates, body => Boolean(body?.gameMetadata && metadataScore(body.gameMetadata) > 0)).catch(() => null);
  if (window?.gameMetadata) rememberMetadata(game.id, window.gameMetadata);
  return window || (cached?.metadata ? { gameMetadata: cached.metadata, frames: [] } : null);
}

async function fetchLatestWindow(game, fallbackStart) {
  const completed = stateIsCompleted(game.state);
  const cached = latestWindowCache.get(game.id)?.value || null;
  const cachedAt = frameTimestamp(cached);
  const start = game.startTime || fallbackStart;

  const candidates = completed
    ? [
        normalizeStart(Date.now() + 5 * 60_000),
        normalizeStart(Date.now()),
        shiftedStart(start, 60 * 60_000),
        shiftedStart(start, 45 * 60_000),
        shiftedStart(start, 30 * 60_000),
        normalizeStart(start)
      ]
    : [
        cachedAt ? normalizeStart(cachedAt + 10_000) : null,
        normalizeStart(Date.now() - 30_000),
        normalizeStart(Date.now() - 90_000),
        normalizeStart(Date.now() - 180_000),
        normalizeStart(Date.now() - 300_000),
        normalizeStart(Date.now() - 600_000),
        normalizeStart(start)
      ];

  const fresh = await firstWindow(game.id, candidates, body => Boolean(body?.frames?.length || body?.gameMetadata)).catch(() => null);
  return fresh ? rememberLatestWindow(game.id, fresh) : cached;
}

async function fetchLiveWindow(game, fallbackStart) {
  if (!game?.id) return null;
  const latest = await fetchLatestWindow(game, fallbackStart).catch(() => null);
  const metadataWindow = await fetchMetadataWindow(game, fallbackStart, latest).catch(() => null);
  return mergeLiveWindows(metadataWindow, latest);
}

function liveTeamStats(team = {}) {
  return {
    kills: Number(team.totalKills ?? team.kills ?? 0) || 0,
    gold: Number(team.totalGold ?? team.gold ?? 0) || 0,
    towers: Number(team.towers ?? team.turrets ?? 0) || 0,
    barons: Number(team.barons ?? 0) || 0,
    dragons: Array.isArray(team.dragons) ? team.dragons.length : Number(team.dragons ?? 0) || 0
  };
}

export function normalizeWindow(windowData, game = null) {
  if (!windowData) return null;
  const metadata = windowData.gameMetadata || {};
  const frames = windowData.frames || [];
  const frame = frames.at(-1) || {};
  const blueMeta = metadata.blueTeamMetadata || {};
  const redMeta = metadata.redTeamMetadata || {};
  return {
    gameId: game?.id || text(windowData.esportsGameId) || null,
    gameNumber: game?.number || null,
    patchVersion: metadata.patchVersion || null,
    gameState: frame.gameState || game?.state || null,
    timestamp: frame.rfc460Timestamp || null,
    blue: {
      teamId: text(blueMeta.esportsTeamId) || null,
      picks: picksFromTeam(blueMeta),
      bans: bansForSide(metadata, blueMeta, 'blue'),
      stats: liveTeamStats(frame.blueTeam)
    },
    red: {
      teamId: text(redMeta.esportsTeamId) || null,
      picks: picksFromTeam(redMeta),
      bans: bansForSide(metadata, redMeta, 'red'),
      stats: liveTeamStats(frame.redTeam)
    }
  };
}

function officialScheduleUrl(slug, locale = 'vi-VN') {
  const base = `https://lolesports.com/${locale || 'vi-VN'}/schedule`;
  return slug ? `${base}?leagues=${encodeURIComponent(slug)}` : base;
}

function detailMatch(detail, scheduleEvent) {
  return detail?.match || detail?.event?.match || (detail?.games ? detail : null) || scheduleEvent?.match || {};
}

async function buildLivePayload(query) {
  const wanted = {
    eventId: text(query.eventId),
    matchId: text(query.matchId),
    leagueId: text(query.leagueId),
    leagueSlug: text(query.leagueSlug),
    startTime: text(query.startTime),
    teamA: text(query.teamA),
    teamB: text(query.teamB),
    locale: text(query.locale) || 'vi-VN',
    detail: String(query.detail || '') === '1',
    viewGameId: text(query.viewGameId),
    viewGameNumber: Number(query.viewGameNumber || 0) || 0
  };

  const scheduleEvent = await resolveScheduleEvent(wanted).catch(() => null);
  const resolvedEventId = text(scheduleEvent?.id || wanted.eventId) || null;
  const resolvedMatchId = text(scheduleEvent?.match?.id || wanted.matchId) || null;
  const detail = await fetchEventDetail(resolvedEventId || resolvedMatchId);
  const match = detailMatch(detail, scheduleEvent);
  const games = normalizeGames(match);
  const state = lower(detail?.state || scheduleEvent?.state || query.state || 'unstarted');
  const game = currentGame(games, state);
  const viewGame = selectViewGame(games, wanted.viewGameId, wanted.viewGameNumber, state);
  const teams = scheduleMatchScore(detail?.match ? detail : scheduleEvent || { match });
  const streams = [...new Set(collectStreamUrls(detail || scheduleEvent))].filter(Boolean);
  let live = null;

  if (wanted.detail && viewGame?.id) {
    live = await fetchLiveWindow(viewGame, viewGame.startTime || scheduleEvent?.startTime || wanted.startTime)
      .then(window => normalizeWindow(window, viewGame))
      .catch(() => null);
  }

  return {
    ok: true,
    resolved: Boolean(scheduleEvent || detail),
    eventId: resolvedEventId,
    matchId: resolvedMatchId,
    state,
    startTime: detail?.startTime || scheduleEvent?.startTime || wanted.startTime || null,
    teams,
    bestOf: Number(match?.strategy?.count || match?.bestOf || 0) || null,
    games,
    currentGame: game,
    viewGame,
    live,
    watchUrl: streams[0] || null,
    streams,
    officialUrl: officialScheduleUrl(wanted.leagueSlug, wanted.locale),
    source: 'LoL Esports',
    fetchedAt: new Date().toISOString()
  };
}

export const __liveMatchTest = {
  currentGame,
  selectViewGame,
  mergeLiveWindows,
  normalizeWindow
};

export function installEsportsMatchLiveRoutes(app) {
  app.get('/api/esports/match-live', async (req, res) => {
    const key = JSON.stringify(req.query || {});
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return res.json(hit.value);
    try {
      const value = await buildLivePayload(req.query || {});
      cache.set(key, { at: Date.now(), value });
      res.set('Cache-Control', 'no-store, max-age=0');
      res.json(value);
    } catch (error) {
      res.status(502).json({ ok: false, error: error.message, source: 'LoL Esports' });
    }
  });
}
