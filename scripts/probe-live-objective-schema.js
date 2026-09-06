import fs from 'node:fs/promises';

const API = 'https://esports-api.lolesports.com/persisted/gw';
const LIVE = 'https://feed.lolesports.com/livestats/v1';
const KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const schedule = JSON.parse(await fs.readFile(new URL('../public/data/esports-schedule.json', import.meta.url), 'utf8'));
const text = value => String(value ?? '').trim();
const interesting = /dragon|baron|tower|turret|inhib|herald|grub|elder|kill|gold|atakhan/i;

async function json(url) {
  const response = await fetch(url, {
    headers: { 'x-api-key': KEY, 'User-Agent': 'WebLienMinh/3.30 objective-schema-probe' },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function riotGet(endpoint, params = {}) {
  const query = new URLSearchParams({ hl: 'en-US', ...params });
  return json(`${API}/${endpoint}?${query}`);
}

function eventDetail(body) {
  return body?.data?.event || body?.data?.eventDetails || body?.data?.match || null;
}

function gamesFrom(detail) {
  const match = detail?.match || detail?.event?.match || (detail?.games ? detail : null) || {};
  return Array.isArray(match.games) ? match.games : [];
}

function stateDone(value) {
  const state = text(value).toLowerCase();
  return state.includes('complete') || state.includes('finished');
}

function normalizeStart(value) {
  const ms = new Date(value || '').getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(Math.floor(ms / 10_000) * 10_000).toISOString();
}

function offsets(value) {
  const ms = new Date(value || '').getTime();
  if (!Number.isFinite(ms)) return [];
  return [0, 10, 20, 30, 40, 50, 60].map(minutes => normalizeStart(ms + minutes * 60_000));
}

async function firstWindow(game, seriesStart) {
  const id = text(game?.id || game?.gameId);
  if (!id) return null;
  const candidates = [null];
  for (const vod of game?.vods || []) candidates.push(...offsets(vod?.firstFrameTime));
  candidates.push(...offsets(game?.startTime || seriesStart));
  for (const startingTime of [...new Set(candidates.filter((value, index) => index === 0 || value))]) {
    try {
      const suffix = startingTime ? `?startingTime=${encodeURIComponent(startingTime)}` : '';
      const body = await json(`${LIVE}/window/${encodeURIComponent(id)}${suffix}`);
      if (text(body?.esportsGameId) && text(body.esportsGameId) !== id) continue;
      if (body?.frames?.some(frame => frame?.blueTeam && frame?.redTeam)) return { body, startingTime };
    } catch {}
  }
  return null;
}

async function firstDetails(game, seriesStart) {
  const id = text(game?.id || game?.gameId);
  if (!id) return null;
  const candidates = [];
  for (const vod of game?.vods || []) candidates.push(...offsets(vod?.firstFrameTime));
  candidates.push(...offsets(game?.startTime || seriesStart));
  for (const startingTime of [...new Set(candidates.filter(Boolean))]) {
    try {
      const body = await json(`${LIVE}/details/${encodeURIComponent(id)}?startingTime=${encodeURIComponent(startingTime)}`);
      if (text(body?.esportsGameId) && text(body.esportsGameId) !== id) continue;
      if (body?.frames?.length) return { body, startingTime };
    } catch {}
  }
  return null;
}

function interestingObject(object) {
  if (!object || typeof object !== 'object') return {};
  return Object.fromEntries(Object.entries(object).filter(([key]) => interesting.test(key)));
}

function recursiveInteresting(value, path = '', out = [], depth = 0) {
  if (depth > 5 || value == null) return out;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 3)) recursiveInteresting(item, `${path}[]`, out, depth + 1);
    return out;
  }
  if (typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (interesting.test(key)) out.push([next, Array.isArray(child) ? child.slice(0, 8) : typeof child === 'object' ? '[object]' : child]);
    recursiveInteresting(child, next, out, depth + 1);
  }
  return out;
}

const candidates = (schedule.events || [])
  .filter(event => event?.state === 'completed' && event?.riotEventId)
  .sort((a, b) => String(b.startTime || '').localeCompare(String(a.startTime || '')))
  .slice(0, 20);

let selected = null;
for (const event of candidates) {
  const detail = eventDetail(await riotGet('getEventDetails', { id: event.riotEventId }).catch(() => null));
  const games = gamesFrom(detail).filter(game => stateDone(game?.state || game?.status));
  if (!games.length) continue;
  selected = { event, detail, game: games.at(-1) };
  break;
}
if (!selected) throw new Error('No recent completed Riot game could be resolved');

const gameId = text(selected.game?.id || selected.game?.gameId);
const windowResult = await firstWindow(selected.game, selected.event.startTime);
const detailsResult = await firstDetails(selected.game, selected.event.startTime);
const frame = windowResult?.body?.frames?.filter(row => row?.blueTeam && row?.redTeam).at(-1) || null;
const detailsFrame = detailsResult?.body?.frames?.at(-1) || null;

console.log(JSON.stringify({
  event: { id: selected.event.riotEventId, league: selected.event.league?.name, startTime: selected.event.startTime },
  game: { id: gameId, number: selected.game?.number, state: selected.game?.state },
  window: {
    startingTime: windowResult?.startingTime || null,
    frameKeys: Object.keys(frame || {}),
    blueKeys: Object.keys(frame?.blueTeam || {}),
    redKeys: Object.keys(frame?.redTeam || {}),
    blueInteresting: interestingObject(frame?.blueTeam),
    redInteresting: interestingObject(frame?.redTeam)
  },
  details: {
    startingTime: detailsResult?.startingTime || null,
    frameKeys: Object.keys(detailsFrame || {}),
    interestingPaths: recursiveInteresting(detailsFrame).slice(0, 120)
  }
}, null, 2));
