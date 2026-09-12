import fs from 'node:fs/promises';

const BASE_URL = `http://127.0.0.1:${process.env.PORT || 3000}`;
const schedule = JSON.parse(await fs.readFile(new URL('../public/data/esports-schedule.json', import.meta.url), 'utf8'));
const now = Date.now();

const hasTwoTeams = event => Array.isArray(event?.teams)
  && event.teams.length >= 2
  && event.teams.slice(0, 2).every(team => String(team?.code || team?.name || '').trim());

function paramsFor(event, detail = false, viewGameId = '') {
  const params = new URLSearchParams({
    leagueId: String(event.league?.id || ''),
    leagueSlug: String(event.league?.slug || ''),
    startTime: String(event.startTime || ''),
    teamA: String(event.teams?.[0]?.code || event.teams?.[0]?.name || ''),
    teamB: String(event.teams?.[1]?.code || event.teams?.[1]?.name || ''),
    state: String(event.state || 'unstarted'),
    locale: 'vi-VN',
    detail: detail ? '1' : '0'
  });
  if (event.riotEventId) params.set('eventId', String(event.riotEventId));
  if (event.matchId) params.set('matchId', String(event.matchId));
  if (viewGameId) params.set('viewGameId', String(viewGameId));
  return params;
}

async function liveRequest(event, detail = false, viewGameId = '', timeout = 30_000) {
  const response = await fetch(`${BASE_URL}/api/esports/match-live?${paramsFor(event, detail, viewGameId)}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Live endpoint HTTP ${response.status}: ${JSON.stringify(body)}`);
  if (!body.ok) throw new Error(`Live endpoint returned ok=false: ${JSON.stringify(body)}`);
  return body;
}

function assertResolved(body, event) {
  if (!body.resolved) throw new Error(`LoL Esports event did not resolve: ${event.id}`);
  if (!Array.isArray(body.teams) || body.teams.length < 2) throw new Error('Resolved match has no team score data.');
  if (!body.matchId) throw new Error('Resolved match has no Riot matchId.');
  if (!Array.isArray(body.games) || body.games.length < 1) throw new Error('Resolved match has no BO game list.');
  if (!body.officialUrl || !new URL(body.officialUrl).pathname.includes('/schedule')) throw new Error(`Invalid official match URL: ${body.officialUrl}`);
  if (body.watchUrl) {
    const watch = new URL(body.watchUrl);
    if (watch.hostname.startsWith('static.') || /\.(?:png|jpe?g|gif|webp|svg|ico)$/i.test(watch.pathname)) {
      throw new Error(`Asset URL was incorrectly classified as a stream: ${body.watchUrl}`);
    }
  }
}

function draftRows(live) {
  if (Array.isArray(live?.teams) && live.teams.length >= 2) return live.teams.slice(0, 2);
  return [live?.blue, live?.red].filter(Boolean).slice(0, 2);
}

function pickCount(live) {
  return draftRows(live).reduce((sum, row) => sum + (Array.isArray(row?.picks) ? row.picks.length : 0), 0);
}

function banCount(live) {
  return draftRows(live).reduce((sum, row) => sum + (Array.isArray(row?.bans) ? row.bans.length : 0), 0);
}

function draftRefs(live) {
  return draftRows(live).map(row => ({
    teamId: row?.teamId || null,
    side: row?.side || null,
    picks: (row?.picks || []).map(item => item?.championId ?? item),
    bans: (row?.bans || []).map(item => item?.championId ?? item)
  }));
}

function statsSignal(live) {
  const sides = [live?.blue?.stats, live?.red?.stats];
  return sides.reduce((sum, stats) => sum
    + Number(stats?.gold || 0)
    + Number(stats?.kills || 0) * 1000
    + Number(stats?.towers || 0) * 1000
    + Number(stats?.dragons || 0) * 1000
    + Number(stats?.barons || 0) * 1000
    + Number(stats?.inhibitors || 0) * 1000, 0);
}

function objectivesReady(live) {
  const sides = [live?.blue?.stats, live?.red?.stats];
  return sides.every(stats => stats
    && Array.isArray(stats.dragonTypes)
    && Number.isFinite(Number(stats.inhibitors))
    && Number.isFinite(Number(stats.towers))
    && Number.isFinite(Number(stats.barons)));
}

function codesFor(event) {
  return (event?.teams || []).map(team => String(team?.code || team?.name || '').toUpperCase());
}

function playedGamesFrom(series) {
  const currentNumber = Number(series.currentGame?.number || 0);
  return (series.games || []).filter(game => {
    const state = String(game?.state || '').toLowerCase();
    const number = Number(game?.number || 0);
    return game?.id && number > 0 && number <= currentNumber && !state.includes('unneeded');
  });
}

// Basic resolver smoke: choose a recent/upcoming real event, never a TBD placeholder.
const upcoming = (schedule.events || [])
  .filter(event => event.state !== 'completed'
    && event.startTime
    && new Date(event.startTime).getTime() >= now - 6 * 60 * 60_000
    && hasTwoTeams(event))
  .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
const recent = (schedule.events || [])
  .filter(event => event.startTime
    && Math.abs(now - new Date(event.startTime).getTime()) <= 24 * 60 * 60_000
    && hasTwoTeams(event))
  .sort((a, b) => Math.abs(now - new Date(a.startTime).getTime()) - Math.abs(now - new Date(b.startTime).getTime()));
const event = upcoming[0] || recent[0];
if (!event) throw new Error('No resolvable recent/upcoming event with two teams available for live-match smoke test.');

const body = await liveRequest(event);
assertResolved(body, event);

console.log(JSON.stringify({
  smoke: 'ok',
  requested: { league: event.league?.name, startTime: event.startTime, teams: event.teams?.map(team => team.code) },
  resolved: { matchId: body.matchId, state: body.state, bestOf: body.bestOf, games: body.games.length },
  score: body.teams.map(team => ({ code: team.code, wins: team.wins }))
}, null, 2));

// Real rolling-window regression. Prefer the exact KRX–NS series that exposed
// Riot string champion ids; otherwise use a recent LCK series that has played games.
const recentLck = (schedule.events || [])
  .filter(row => row.league?.slug === 'lck'
    && row.startTime
    && hasTwoTeams(row)
    && Math.abs(now - new Date(row.startTime).getTime()) <= 36 * 60 * 60_000)
  .sort((a, b) => Math.abs(now - new Date(a.startTime).getTime()) - Math.abs(now - new Date(b.startTime).getTime()));
const exactReported = recentLck.find(row => {
  const codes = codesFor(row);
  return codes.includes('KRX') && codes.includes('NS');
});
const playedFallback = recentLck.find(row => row.state === 'completed' || (row.teams || []).some(team => Number(team?.wins || 0) > 0));
const regressionEvent = exactReported || playedFallback || null;

if (regressionEvent) {
  const series = await liveRequest(regressionEvent, false, '', 30_000);
  assertResolved(series, regressionEvent);
  const playedGames = playedGamesFrom(series);

  if (!playedGames.length) throw new Error('Recent played LCK series resolved without a played game.');

  const summaries = [];
  for (const game of playedGames) {
    const detail = await liveRequest(regressionEvent, true, game.id, 60_000);
    if (detail.viewGame?.id !== game.id) throw new Error(`Requested Game ${game.number} resolved to another game.`);
    if (detail.live?.gameId !== game.id) throw new Error(`Game ${game.number} returned no exact-game live/history snapshot.`);
    if (pickCount(detail.live) < 10) throw new Error(`Game ${game.number} did not recover all 10 Riot picks.`);
    if (statsSignal(detail.live) <= 0) throw new Error(`Game ${game.number} recovered picks but no real team stats.`);
    if (!objectivesReady(detail.live)) throw new Error(`Game ${game.number} did not enrich Riot objective details.`);

    const expectedIds = new Set((series.teams || []).map(team => String(team.id || '')).filter(Boolean));
    const alignedIds = new Set((detail.live.teams || []).map(team => String(team.teamId || '')).filter(Boolean));
    for (const id of expectedIds) {
      if (!alignedIds.has(id)) throw new Error(`Game ${game.number} lost team alignment for ${id}.`);
    }

    summaries.push({
      game: game.number,
      gameId: game.id,
      picks: pickCount(detail.live),
      bans: banCount(detail.live),
      secondarySource: detail.live?.secondarySource || null,
      dataAvailability: detail.live?.dataAvailability || null,
      draft: draftRefs(detail.live),
      blue: detail.live.blue?.stats,
      red: detail.live.red?.stats
    });
  }

  const unneeded = (series.games || []).find(game => String(game?.state || '').toLowerCase().includes('unneeded'));
  if (unneeded?.id) {
    const unusedDetail = await liveRequest(regressionEvent, true, unneeded.id, 30_000);
    if (unusedDetail.live) throw new Error(`Unused Game ${unneeded.number} must not inherit another game's live data.`);
  }

  console.log(JSON.stringify({
    liveHistoryRegression: 'ok',
    teams: regressionEvent.teams?.map(team => team.code),
    score: series.teams?.map(team => ({ code: team.code, wins: team.wins })),
    games: summaries
  }, null, 2));
}

// Dedicated real Ban fallback probe: the reported T1–KT series has published
// post-match draft tables. Keep this diagnostic in smoke output so future
// regressions cannot hide behind the Riot-only Pick path.
const t1KtEvent = recentLck.find(row => {
  const codes = codesFor(row);
  return codes.includes('T1') && codes.includes('KT');
}) || null;

if (t1KtEvent) {
  const series = await liveRequest(t1KtEvent, false, '', 30_000);
  assertResolved(series, t1KtEvent);
  const summaries = [];
  for (const game of playedGamesFrom(series)) {
    const detail = await liveRequest(t1KtEvent, true, game.id, 60_000);
    summaries.push({
      game: game.number,
      gameId: game.id,
      picks: pickCount(detail.live),
      bans: banCount(detail.live),
      secondarySource: detail.live?.secondarySource || null,
      dataAvailability: detail.live?.dataAvailability || null,
      draft: draftRefs(detail.live)
    });
  }
  console.log(JSON.stringify({
    realBanProbe: 'T1-KT',
    startTime: t1KtEvent.startTime,
    matchId: series.matchId,
    score: series.teams?.map(team => ({ code: team.code, wins: team.wins })),
    games: summaries
  }, null, 2));
}

// Temporary source probe: verify whether GitHub-hosted production can refresh
// the latest Reddit selftext for the known T1-KT Post-Match thread instead of
// relying only on Arctic Shift's archived snapshot.
for (const url of [
  'https://www.reddit.com/comments/1vugxz5.json?raw_json=1',
  'https://www.reddit.com/r/leagueoflegends/comments/1vugxz5/.json?raw_json=1',
  'https://old.reddit.com/comments/1vugxz5.json?raw_json=1'
]) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'WebLienMinh/3.21 ban-pick-diagnostic' },
      signal: AbortSignal.timeout(10_000)
    });
    const raw = await response.text();
    let selftext = '';
    try {
      const body = JSON.parse(raw);
      selftext = String(body?.[0]?.data?.children?.[0]?.data?.selftext || '');
    } catch {}
    console.log(JSON.stringify({
      redditCurrentProbe: url,
      status: response.status,
      bytes: raw.length,
      selftextBytes: selftext.length,
      match1: /MATCH\s*1/i.test(selftext),
      match2: /MATCH\s*2/i.test(selftext),
      match3: /MATCH\s*3/i.test(selftext),
      bansHeader: /Bans?\s*1/i.test(selftext)
    }));
  } catch (error) {
    console.log(JSON.stringify({ redditCurrentProbe: url, error: error.message }));
  }
}
