const ESPORTS_API = 'https://esports-api.lolesports.com/persisted/gw';
const LIVE_FEED = 'https://feed.lolesports.com/livestats/v1';
const PUBLIC_API_KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const CACHE_TTL = 5_000;
const cache = new Map();

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
      'User-Agent': 'WebLienMinh/3.1 live-match-center'
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

function currentGame(games = []) {
  return games.find(game => game.state.includes('progress') || game.state === 'in_game')
    || [...games].reverse().find(game => game.state.includes('complete'))
    || games.find(game => !game.state.includes('complete'))
    || games.at(-1)
    || null;
}

function collectStreamUrls(value, found = []) {
  if (!value) return found;
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value) && /(lolesports\.com|youtube\.com|youtu\.be|twitch\.tv|sooplive\.|afreecatv\.)/i.test(value)) found.push(httpsUrl(value));
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

async function fetchLiveWindow(game, fallbackStart) {
  if (!game?.id) return null;
  const startingTime = normalizeStart(game.startTime || fallbackStart);
  const response = await fetch(`${LIVE_FEED}/window/${encodeURIComponent(game.id)}?startingTime=${encodeURIComponent(startingTime)}`, {
    headers: { 'User-Agent': 'WebLienMinh/3.1 live-match-center' },
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
    championId: Number(player.championId || 0) || null,
    playerId: text(player.esportsPlayerId || player.playerId) || null,
    summonerName: player.summonerName || player.name || null,
    role: player.role || null,
    slot: index + 1
  })).filter(row => row.championId);
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

function normalizeWindow(windowData) {
  if (!windowData) return null;
  const metadata = windowData.gameMetadata || {};
  const frames = windowData.frames || [];
  const frame = frames.at(-1) || {};
  const blueMeta = metadata.blueTeamMetadata || {};
  const redMeta = metadata.redTeamMetadata || {};
  return {
    patchVersion: metadata.patchVersion || null,
    gameState: frame.gameState || null,
    timestamp: frame.rfc460Timestamp || null,
    blue: {
      teamId: text(blueMeta.esportsTeamId) || null,
      picks: picksFromTeam(blueMeta),
      bans: bansFromTeam(blueMeta),
      stats: liveTeamStats(frame.blueTeam)
    },
    red: {
      teamId: text(redMeta.esportsTeamId) || null,
      picks: picksFromTeam(redMeta),
      bans: bansFromTeam(redMeta),
      stats: liveTeamStats(frame.redTeam)
    }
  };
}

function officialScheduleUrl(slug, locale = 'vi-VN') {
  const base = `https://lolesports.com/${locale || 'vi-VN'}/`;
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
    detail: String(query.detail || '') === '1'
  };

  const scheduleEvent = await resolveScheduleEvent(wanted).catch(() => null);
  const resolvedEventId = text(scheduleEvent?.id || wanted.eventId) || null;
  const resolvedMatchId = text(scheduleEvent?.match?.id || wanted.matchId) || null;
  const detail = await fetchEventDetail(resolvedEventId || resolvedMatchId);
  const match = detailMatch(detail, scheduleEvent);
  const games = normalizeGames(match);
  const game = currentGame(games);
  const teams = scheduleMatchScore(detail?.match ? detail : scheduleEvent || { match });
  const streams = [...new Set(collectStreamUrls(detail || scheduleEvent))];
  let live = null;

  if (wanted.detail && game?.id) {
    live = await fetchLiveWindow(game, game.startTime || scheduleEvent?.startTime || wanted.startTime)
      .then(normalizeWindow)
      .catch(() => null);
  }

  return {
    ok: true,
    resolved: Boolean(scheduleEvent || detail),
    eventId: resolvedEventId,
    matchId: resolvedMatchId,
    state: lower(detail?.state || scheduleEvent?.state || query.state || 'unstarted'),
    startTime: detail?.startTime || scheduleEvent?.startTime || wanted.startTime || null,
    teams,
    bestOf: Number(match?.strategy?.count || match?.bestOf || 0) || null,
    games,
    currentGame: game,
    live,
    watchUrl: streams[0] || null,
    streams,
    officialUrl: officialScheduleUrl(wanted.leagueSlug, wanted.locale),
    source: 'LoL Esports',
    fetchedAt: new Date().toISOString()
  };
}

export function installEsportsMatchLiveRoutes(app) {
  app.get('/api/esports/match-live', async (req, res) => {
    const key = JSON.stringify(req.query || {});
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return res.json(hit.value);
    try {
      const value = await buildLivePayload(req.query || {});
      cache.set(key, { at: Date.now(), value });
      res.set('Cache-Control', 'no-store');
      res.json(value);
    } catch (error) {
      res.status(502).json({ ok: false, error: error.message, source: 'LoL Esports' });
    }
  });
}
