import fs from 'node:fs/promises';

// Temporary diagnostic: inspect Riot's per-game result metadata for the exact
// KRX vs NS series stored in the repo schedule.
const API_KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const ESPORTS_API = 'https://esports-api.lolesports.com/persisted/gw';

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'x-api-key': API_KEY, 'User-Agent': 'WebLienMinh result diagnostic' },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) return null;
  const raw = await response.text();
  if (!raw.trim()) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const localSchedule = JSON.parse(await fs.readFile(new URL('../public/data/esports-schedule.json', import.meta.url), 'utf8'));
const event = (localSchedule.events || []).find(row => {
  const codes = (row.teams || []).map(team => String(team.code || '').toUpperCase());
  return codes.includes('KRX') && codes.includes('NS');
});
if (!event?.id) throw new Error('KRX vs NS event id not found in local schedule.');

const detail = await fetchJson(`${ESPORTS_API}/getEventDetails?hl=en-US&id=${encodeURIComponent(event.id)}`);
const eventDetail = detail?.data?.event || detail?.data?.eventDetails || null;
if (!eventDetail) throw new Error(`getEventDetails returned no event for ${event.id}`);
const match = eventDetail.match || {};
console.log('EVENT_GAME_RESULTS', JSON.stringify({
  eventId: event.id,
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
