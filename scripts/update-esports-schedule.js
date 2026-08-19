import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'esports-schedule.json');
const API = 'https://esports-api.lolesports.com/persisted/gw';
const PUBLIC_API_KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const HL = process.env.LOLESPORTS_HL || 'en-US';
const MAX_NEWER_PAGES = Math.max(1, Math.min(6, Number(process.env.ESPORTS_SCHEDULE_PAGES || 4)));

const TARGETS = [
  { id: '98767991310872058', slug: 'lck', name: 'LCK', group: 'REGIONAL', priority: 1 },
  { id: '98767991314006698', slug: 'lpl', name: 'LPL', group: 'REGIONAL', priority: 2 },
  { id: '98767991302996019', slug: 'lec', name: 'LEC', group: 'REGIONAL', priority: 3 },
  { id: '98767991299243165', slug: 'lcs', name: 'LCS', group: 'REGIONAL', priority: 4 },
  { id: '113476371197627891', slug: 'lcp', name: 'LCP', group: 'REGIONAL', priority: 5 },
  { id: '107213827295848783', slug: 'vcs', name: 'VCS', group: 'REGIONAL', priority: 6 },
  { id: '113464388705111224', slug: 'first_stand', name: 'First Stand', group: 'INTERNATIONAL', priority: 7 },
  { id: '98767991325878492', slug: 'msi', name: 'MSI', group: 'INTERNATIONAL', priority: 8 },
  { id: '98767975604431411', slug: 'worlds', name: 'Worlds', group: 'INTERNATIONAL', priority: 9 }
];

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

async function riotGet(endpoint, params = {}) {
  const query = new URLSearchParams({ hl: HL, ...params });
  const response = await fetch(`${API}/${endpoint}?${query}`, {
    headers: {
      'x-api-key': PUBLIC_API_KEY,
      'User-Agent': 'WebLienMinh/3.0 schedule-cache'
    }
  });
  if (!response.ok) throw new Error(`${endpoint} HTTP ${response.status}`);
  const body = await response.json();
  if (body?.error) throw new Error(body.error.message || body.error);
  return body;
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function getLeagueMetadata() {
  try {
    const body = await riotGet('getLeagues');
    const rows = body?.data?.leagues || [];
    const byId = new Map(rows.map(row => [String(row.id), row]));
    return TARGETS.map(target => {
      const live = byId.get(target.id) || {};
      return {
        ...target,
        name: live.name || target.name,
        slug: live.slug || target.slug,
        image: live.image || null,
        region: live.region || null
      };
    });
  } catch (error) {
    console.warn(`getLeagues failed: ${error.message}`);
    return TARGETS.map(x => ({ ...x, image: null, region: null }));
  }
}

function eventId(event, leagueId) {
  return String(event?.id || `${leagueId}:${event?.startTime || ''}:${event?.match?.teams?.map(t => t.code || t.name).join('-') || ''}`);
}

function normalizeTeam(team = {}) {
  const wins = Number(team?.result?.gameWins ?? team?.result?.wins ?? 0);
  return {
    name: team.name || team.code || 'TBD',
    code: team.code || team.name || 'TBD',
    image: team.image || null,
    slug: team.slug || null,
    wins: Number.isFinite(wins) ? wins : 0,
    outcome: team?.result?.outcome || null,
    record: team?.record ? {
      wins: Number(team.record.wins || 0),
      losses: Number(team.record.losses || 0)
    } : null
  };
}

function normalizeEvent(event, league) {
  const match = event?.match || {};
  const strategy = match?.strategy || {};
  const teams = (match?.teams || []).slice(0, 2).map(normalizeTeam);
  return {
    id: eventId(event, league.id),
    startTime: event?.startTime || null,
    state: String(event?.state || 'unstarted').toLowerCase(),
    type: event?.type || 'match',
    blockName: event?.blockName || null,
    league: {
      id: league.id,
      name: league.name,
      slug: league.slug,
      image: league.image || event?.league?.image || null,
      group: league.group,
      priority: league.priority
    },
    bestOf: Number(strategy?.count || match?.bestOf || 0) || null,
    strategyType: strategy?.type || null,
    teams,
    vodsAvailable: Boolean(event?.vods?.length),
    tournamentId: event?.tournament?.id || null
  };
}

async function fetchLeagueSchedule(league) {
  const all = [];
  let pageToken = null;
  const seenTokens = new Set();

  for (let page = 0; page < MAX_NEWER_PAGES; page += 1) {
    const body = await riotGet('getSchedule', pageToken ? { leagueId: league.id, pageToken } : { leagueId: league.id });
    const schedule = body?.data?.schedule || {};
    for (const event of schedule.events || []) all.push(normalizeEvent(event, league));

    const next = schedule?.pages?.newer || null;
    if (!next || seenTokens.has(next)) break;
    seenTokens.add(next);
    pageToken = next;
  }

  const unique = new Map();
  for (const event of all) unique.set(event.id, event);
  return [...unique.values()].sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
}

function previousEventsFor(previous, leagueId) {
  return (previous?.events || []).filter(event => String(event?.league?.id || '') === String(leagueId));
}

function summarize(events) {
  const now = Date.now();
  let live = 0;
  let upcoming = 0;
  let completed = 0;
  for (const event of events) {
    if (event.state === 'inprogress') live += 1;
    else if (event.state === 'completed') completed += 1;
    else if (!event.startTime || new Date(event.startTime).getTime() >= now - 6 * 60 * 60_000) upcoming += 1;
  }
  return { live, upcoming, completed, total: events.length };
}

async function main() {
  const previous = await readJson(OUT, null);
  const leagues = await getLeagueMetadata();
  const events = [];
  const failures = [];
  let refreshed = 0;

  for (const league of leagues) {
    try {
      const rows = await fetchLeagueSchedule(league);
      events.push(...rows);
      refreshed += 1;
      console.log(`${league.name}: ${rows.length} events`);
    } catch (error) {
      const fallback = previousEventsFor(previous, league.id);
      events.push(...fallback);
      failures.push({ league: league.name, error: error.message, preserved: fallback.length });
      console.warn(`${league.name}: ${error.message}; preserved ${fallback.length}`);
    }
  }

  if (!events.length && previous?.events?.length) {
    console.warn('All Riot schedule requests failed; preserving previous schedule file.');
    process.exitCode = 75;
    return;
  }

  const deduped = [...new Map(events.map(event => [event.id, event])).values()]
    .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)) || Number(a.league.priority || 99) - Number(b.league.priority || 99));

  const output = {
    generatedAt: new Date().toISOString(),
    source: {
      name: 'LoL Esports',
      url: 'https://lolesports.com/en-US/schedule',
      api: 'https://esports-api.lolesports.com/persisted/gw/getSchedule'
    },
    refresh: {
      successfulLeagues: refreshed,
      requestedLeagues: leagues.length,
      failures,
      preservedPreviousData: failures.some(x => x.preserved > 0)
    },
    summary: summarize(deduped),
    leagues,
    events: deduped
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`Schedule written: ${deduped.length} events across ${leagues.length} leagues; refreshed=${refreshed}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
