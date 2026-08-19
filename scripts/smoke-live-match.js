import fs from 'node:fs/promises';

const schedule = JSON.parse(await fs.readFile(new URL('../public/data/esports-schedule.json', import.meta.url), 'utf8'));
const now = Date.now();
const candidates = (schedule.events || [])
  .filter(event => event.state !== 'completed' && event.startTime && new Date(event.startTime).getTime() >= now - 6 * 60 * 60_000)
  .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

const event = candidates[0];
if (!event) throw new Error('No upcoming/live event available for live-match smoke test.');

const params = new URLSearchParams({
  leagueId: String(event.league?.id || ''),
  leagueSlug: String(event.league?.slug || ''),
  startTime: String(event.startTime || ''),
  teamA: String(event.teams?.[0]?.code || event.teams?.[0]?.name || ''),
  teamB: String(event.teams?.[1]?.code || event.teams?.[1]?.name || ''),
  state: String(event.state || 'unstarted'),
  locale: 'vi-VN',
  detail: '0'
});

const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/esports/match-live?${params}`, {
  signal: AbortSignal.timeout(25_000)
});
const body = await response.json().catch(() => ({}));

if (!response.ok) throw new Error(`Live endpoint HTTP ${response.status}: ${JSON.stringify(body)}`);
if (!body.ok) throw new Error(`Live endpoint returned ok=false: ${JSON.stringify(body)}`);
if (!body.resolved) throw new Error(`LoL Esports event did not resolve: ${JSON.stringify({ event: event.id, startTime: event.startTime, teams: event.teams?.map(x => x.code) })}`);
if (!Array.isArray(body.teams) || body.teams.length < 2) throw new Error(`Resolved match has no team score data: ${JSON.stringify(body)}`);
if (!body.matchId) throw new Error(`Resolved match has no Riot matchId: ${JSON.stringify(body)}`);
if (!Array.isArray(body.games) || body.games.length < 1) throw new Error(`Resolved match has no BO game list: ${JSON.stringify(body)}`);
if (!body.officialUrl || !new URL(body.officialUrl).pathname.includes('/schedule')) throw new Error(`Resolved match has no schedule-scoped LoL Esports URL: ${body.officialUrl}`);
if (body.watchUrl) {
  const watch = new URL(body.watchUrl);
  if (watch.hostname.startsWith('static.') || /\.(?:png|jpe?g|gif|webp|svg|ico)$/i.test(watch.pathname)) {
    throw new Error(`Asset URL was incorrectly classified as a stream: ${body.watchUrl}`);
  }
}

console.log(JSON.stringify({
  smoke: 'ok',
  requested: { league: event.league?.name, startTime: event.startTime, teams: event.teams?.map(x => x.code) },
  resolved: { eventId: body.eventId, matchId: body.matchId, state: body.state, bestOf: body.bestOf, games: body.games?.length || 0 },
  score: body.teams.map(team => ({ code: team.code, wins: team.wins })),
  watchUrl: body.watchUrl || null,
  officialUrl: body.officialUrl
}, null, 2));
