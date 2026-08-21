import fs from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT || 3000);
const BASE = process.env.AUDIT_BASE_URL || `http://127.0.0.1:${PORT}`;
const LEAGUE = String(process.env.AUDIT_LEAGUE || '').trim().toLowerCase();
const STRICT = String(process.env.AUDIT_STRICT || '0') === '1';
const REQUEST_GAP_MS = Number(process.env.AUDIT_REQUEST_GAP_MS || 180);

const schedule = JSON.parse(await fs.readFile(new URL('../public/data/esports-schedule.json', import.meta.url), 'utf8'));
const allEvents = (schedule.events || []).filter(event => {
  if (!LEAGUE) return true;
  return String(event?.league?.slug || event?.league?.name || '').toLowerCase() === LEAGUE;
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const text = value => String(value ?? '').trim();
const lower = value => text(value).toLowerCase();
const stateCompleted = value => lower(value).includes('complete') || lower(value).includes('finished');
const stateLive = value => lower(value).includes('progress') || lower(value) === 'in_game' || lower(value) === 'in-game';

function teamLabel(event) {
  return (event.teams || []).map(team => team.code || team.name || 'TBD').join(' vs ');
}

function playedGameCount(event) {
  const wins = (event.teams || []).reduce((sum, team) => sum + (Number(team?.wins || 0) || 0), 0);
  if (stateCompleted(event.state)) return wins;
  if (stateLive(event.state)) return Math.max(1, wins + 1);
  return 0;
}

function requestParams(event, gameNumber = 0) {
  const params = new URLSearchParams({
    leagueId: text(event?.league?.id),
    leagueSlug: text(event?.league?.slug),
    startTime: text(event?.startTime),
    teamA: text(event?.teams?.[0]?.code || event?.teams?.[0]?.name),
    teamB: text(event?.teams?.[1]?.code || event?.teams?.[1]?.name),
    state: text(event?.state),
    locale: 'vi-VN',
    detail: '1'
  });
  if (gameNumber > 0) params.set('viewGameNumber', String(gameNumber));
  return params;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40_000);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'WebLienMinh/all-games-audit' },
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw.slice(0, 160)}`);
    return raw.trim() ? JSON.parse(raw) : null;
  } finally {
    clearTimeout(timeout);
  }
}

function liveRows(payload) {
  if (Array.isArray(payload?.live?.teams) && payload.live.teams.length >= 2) return payload.live.teams.slice(0, 2);
  return [payload?.live?.blue, payload?.live?.red].filter(Boolean).slice(0, 2);
}

function numberKnown(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function coverageFor(payload) {
  const rows = liveRows(payload);
  const each = predicate => rows.length >= 2 && rows.every(predicate);
  const total = mapper => rows.reduce((sum, row) => sum + mapper(row), 0);
  return {
    liveAvailable: Boolean(payload?.live),
    exactGame: Boolean(payload?.viewGame?.id && (!payload?.live?.gameId || text(payload.live.gameId) === text(payload.viewGame.id))),
    picks: each(row => Array.isArray(row?.picks) && row.picks.length === 5),
    bans: each(row => Array.isArray(row?.bans) && row.bans.length === 5),
    gold: each(row => numberKnown(row?.stats?.gold) && Number(row.stats.gold) > 0),
    kills: each(row => numberKnown(row?.stats?.kills)),
    towers: each(row => numberKnown(row?.stats?.towers)),
    inhibitors: each(row => numberKnown(row?.stats?.inhibitors)),
    dragons: each(row => numberKnown(row?.stats?.dragons)),
    barons: each(row => numberKnown(row?.stats?.barons)),
    voidGrubs: each(row => numberKnown(row?.stats?.voidGrubs)),
    riftHeralds: each(row => numberKnown(row?.stats?.riftHeralds)),
    winner: Boolean(payload?.gameResult?.winnerTeamId || payload?.viewGame?.winnerTeamId),
    scoreAfterGame: Array.isArray(payload?.gameResult?.scoreAfterGame || payload?.viewGame?.scoreAfterGame),
    pickCount: total(row => Array.isArray(row?.picks) ? row.picks.length : 0),
    banCount: total(row => Array.isArray(row?.bans) ? row.bans.length : 0),
    secondarySource: payload?.live?.secondarySource || null
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  scheduleGeneratedAt: schedule.generatedAt || null,
  league: LEAGUE || 'all',
  events: allEvents.length,
  counts: { completed: 0, live: 0, upcoming: 0, auditedGames: 0, errors: 0 },
  coverage: {
    picks: 0, bans: 0, gold: 0, kills: 0, towers: 0, inhibitors: 0,
    dragons: 0, barons: 0, voidGrubs: 0, riftHeralds: 0, winner: 0, scoreAfterGame: 0
  },
  issues: [],
  games: []
};

function issue(level, event, message, extra = {}) {
  report.issues.push({ level, eventId: event.id, match: teamLabel(event), startTime: event.startTime, ...extra, message });
  if (level === 'error') report.counts.errors += 1;
}

for (const event of allEvents) {
  const teams = event.teams || [];
  if (teams.length !== 2 || teams.some(team => !(team?.code || team?.name))) {
    issue('error', event, 'Schedule event does not contain two usable teams.');
    continue;
  }
  if (stateCompleted(event.state)) report.counts.completed += 1;
  else if (stateLive(event.state)) report.counts.live += 1;
  else report.counts.upcoming += 1;

  if (!stateCompleted(event.state) && !stateLive(event.state)) {
    const wins = teams.map(team => Number(team?.wins || 0) || 0);
    if (wins.some(Boolean)) issue('error', event, 'Upcoming match already has a non-zero series score.', { wins });
    continue;
  }

  const played = playedGameCount(event);
  if (played <= 0) {
    issue('error', event, 'Played/live match has no played game count from series score.');
    continue;
  }

  for (let gameNumber = 1; gameNumber <= played; gameNumber += 1) {
    await sleep(REQUEST_GAP_MS);
    const url = `${BASE}/api/esports/match-live?${requestParams(event, gameNumber)}`;
    let payload = null;
    try {
      payload = await fetchJson(url);
    } catch (error) {
      issue('error', event, `Game ${gameNumber} endpoint failed: ${error.message}`, { gameNumber });
      continue;
    }
    if (!payload?.ok || !payload?.resolved) {
      issue('error', event, `Game ${gameNumber} could not be resolved by live endpoint.`, { gameNumber });
      continue;
    }
    if (Number(payload?.viewGame?.number || 0) !== gameNumber) {
      issue('error', event, `Requested Game ${gameNumber} but endpoint selected Game ${payload?.viewGame?.number || '?'}.`, { gameNumber, viewGame: payload?.viewGame });
      continue;
    }

    const expectedScheduleWins = teams.map(team => Number(team?.wins || 0) || 0);
    const endpointWins = (payload.teams || []).map(team => Number(team?.wins || 0) || 0);
    if (endpointWins.reduce((a, b) => a + b, 0) < expectedScheduleWins.reduce((a, b) => a + b, 0)) {
      issue('error', event, `Series score regressed in endpoint for Game ${gameNumber}.`, { gameNumber, expectedScheduleWins, endpointWins });
    }

    const coverage = coverageFor(payload);
    if (!coverage.exactGame) issue('error', event, `Game ${gameNumber} live data belongs to another gameId.`, { gameNumber, viewGameId: payload?.viewGame?.id, liveGameId: payload?.live?.gameId });

    const row = {
      eventId: event.id,
      match: teamLabel(event),
      league: event?.league?.slug || event?.league?.name || null,
      state: event.state,
      gameNumber,
      gameId: payload?.viewGame?.id || null,
      series: endpointWins,
      coverage
    };
    report.games.push(row);
    report.counts.auditedGames += 1;
    for (const key of Object.keys(report.coverage)) if (coverage[key]) report.coverage[key] += 1;

    for (const key of ['picks', 'bans', 'gold', 'towers', 'inhibitors', 'dragons', 'barons', 'voidGrubs', 'riftHeralds', 'winner']) {
      if (!coverage[key]) issue('coverage', event, `Game ${gameNumber} missing ${key}.`, { gameNumber, gameId: row.gameId, source: coverage.secondarySource });
    }
  }
}

const audited = report.counts.auditedGames || 1;
report.coveragePercent = Object.fromEntries(Object.entries(report.coverage).map(([key, value]) => [key, Math.round((value / audited) * 1000) / 10]));
report.coverageIssues = report.issues.filter(row => row.level === 'coverage').length;

await fs.mkdir(path.resolve('audit-results'), { recursive: true });
const safeLeague = (LEAGUE || 'all').replace(/[^a-z0-9_-]+/g, '-');
await fs.writeFile(path.resolve(`audit-results/${safeLeague}.json`), JSON.stringify(report, null, 2));

console.log(`AUDIT ${LEAGUE || 'ALL'}: ${report.events} events, ${report.counts.auditedGames} played/live games, ${report.counts.upcoming} upcoming, ${report.counts.errors} integrity errors.`);
console.log('COVERAGE %', JSON.stringify(report.coveragePercent));
console.log('COVERAGE GAPS', report.coverageIssues);
for (const row of report.issues.filter(item => item.level === 'error').slice(0, 40)) console.error('ERROR', JSON.stringify(row));
for (const row of report.issues.filter(item => item.level === 'coverage').slice(0, 40)) console.log('MISSING', JSON.stringify(row));

if (report.counts.errors > 0) process.exitCode = 1;
if (STRICT && report.coverageIssues > 0) process.exitCode = 2;
