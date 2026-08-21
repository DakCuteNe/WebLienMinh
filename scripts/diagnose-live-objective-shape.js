import fs from 'node:fs/promises';

// Temporary diagnostic: resolve the exact KRX vs NS series through the local
// backend, then inspect Riot's per-game result metadata.
const API_KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const ESPORTS_API = 'https://esports-api.lolesports.com/persisted/gw';
const TARGET_TIME = Date.parse('2026-08-20T10:00:00.000Z');

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'x-api-key': API_KEY, 'User-Agent': 'WebLienMinh result diagnostic', ...(options.headers || {}) },
    signal: options.signal || AbortSignal.timeout(15_000)
  });
  if (!response.ok) return null;
  const raw = await response.text();
  if (!raw.trim()) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const localSchedule = JSON.parse(await fs.readFile(new URL('../public/data/esports-schedule.json', import.meta.url), 'utf8'));
const candidates = (localSchedule.events || []).filter(row => {
  const codes = (row.teams || []).map(team => String(team.code || '').toUpperCase());
  return codes.includes('KRX') && codes.includes('NS') && Number.isFinite(Date.parse(row.startTime || ''));
}).sort((a, b) => Math.abs(Date.parse(a.startTime) - TARGET_TIME) - Math.abs(Date.parse(b.startTime) - TARGET_TIME));
const event = candidates[0];
if (!event) throw new Error('KRX vs NS event not found in local schedule.');

const params = new URLSearchParams({
  leagueId: String(event.league?.id || '98767991310872058'),
  leagueSlug: String(event.league?.slug || 'lck'),
  startTime: String(event.startTime || ''),
  teamA: String(event.teams?.[0]?.code || event.teams?.[0]?.name || ''),
  teamB: String(event.teams?.[1]?.code || event.teams?.[1]?.name || ''),
  state: String(event.state || 'completed'),
  locale: 'vi-VN',
  detail: '0'
});
const local = await fetchJson(`http://127.0.0.1:${process.env.PORT || 3000}/api/esports/match-live?${params}`, {
  headers: { 'x-api-key': '' },
  signal: AbortSignal.timeout(30_000)
});
const detailLookupId = local?.eventId || local?.matchId;
if (!detailLookupId) throw new Error(`Local live endpoint did not resolve Riot lookup id: ${JSON.stringify({ startTime: event.startTime, teams: event.teams?.map(team => team.code), local })}`);

const detail = await fetchJson(`${ESPORTS_API}/getEventDetails?hl=en-US&id=${encodeURIComponent(detailLookupId)}`);
const eventDetail = detail?.data?.event || detail?.data?.eventDetails || null;
if (!eventDetail) throw new Error(`getEventDetails returned no event for Riot id ${detailLookupId}`);
const match = eventDetail.match || {};
console.log('EVENT_GAME_RESULTS', JSON.stringify({
  requested: { startTime: event.startTime, teams: event.teams?.map(team => team.code) },
  lookupId: detailLookupId,
  detailEventId: eventDetail.id || null,
  resolvedEventId: local.eventId,
  resolvedMatchId: local.matchId,
  eventState: eventDetail.state,
  matchKeys: Object.keys(match),
  teams: match.teams,
  games: (match.games || []).map(game => ({
    id: game.id,
    number: game.number,
    state: game.state,
    keys: Object.keys(game),
    teams: game.teams,
    result: game.result,
    outcome: game.outcome,
    winner: game.winner
  }))
}, null, 2));
