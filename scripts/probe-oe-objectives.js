const BASE = 'https://oe.datalisk.io';
const KEY = 'f561197a-82ea-4e54-acd2-386979018a7a';
const interesting = /kill|gold|tower|turret|inhib|dragon|baron|herald|grub|elder|atakhan|monster|objective/i;

async function get(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'X-Api-Key': KEY, 'User-Agent': 'WebLienMinh/3.30 oe-objective-probe' },
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json();
}
const first = value => Array.isArray(value) ? value[0] : value;
const gameIdsFrom = value => {
  const direct = [1,2,3,4,5].map(n => value?.[`game${n}Id`]).filter(Boolean);
  const nested = Array.isArray(value?.games) ? value.games.map(row => row?.gameId || row?.id).filter(Boolean) : [];
  return [...direct, ...nested];
};
function interestingPaths(value, path = '', out = [], depth = 0) {
  if (depth > 7 || value == null || out.length >= 160) return out;
  if (Array.isArray(value)) {
    for (const [index, child] of value.slice(0, 20).entries()) interestingPaths(child, `${path}[${index}]`, out, depth + 1);
    return out;
  }
  if (typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (interesting.test(key) || (typeof child === 'string' && interesting.test(child))) {
      out.push([next, typeof child === 'object' ? (Array.isArray(child) ? `[array:${child.length}]` : '[object]') : child]);
    }
    interestingPaths(child, next, out, depth + 1);
  }
  return out;
}

const matches = await get('/matches/recentResults/');
const candidates = (Array.isArray(matches) ? matches : [])
  .filter(row => String(row?.startTime || '').startsWith('2026') && row?.matchId)
  .slice(0, 24);
let resolved = null;
const sampled = [];
for (const recent of candidates) {
  const payload = await get(`/matches/singleMatch/${recent.matchId}`).catch(() => null);
  const match = first(payload) || {};
  const ids = [...gameIdsFrom(recent), ...gameIdsFrom(match)];
  sampled.push({ matchId: recent.matchId, league: recent.league, state: recent.state, gameIds: ids.length });
  if (ids.length) {
    resolved = { recent, match, gameId: ids.at(-1), ids };
    break;
  }
}

if (!resolved) {
  console.log(JSON.stringify({ sampled, result: 'No recent OE series has populated game ids yet.' }, null, 2));
  process.exit(0);
}

const game = first(await get(`/games/singleGame/${resolved.gameId}`)) || {};
const project = team => {
  const stats = team?.teamStats || {};
  return {
    teamName: team?.teamName || null,
    keys: Object.keys(stats),
    interesting: Object.fromEntries(Object.entries(stats).filter(([key]) => interesting.test(key)))
  };
};
console.log(JSON.stringify({
  sampled,
  match: {
    matchId: resolved.recent.matchId,
    league: resolved.recent.league,
    startTime: resolved.recent.startTime,
    gameIds: resolved.ids,
    selectedGameId: resolved.gameId
  },
  gameKeys: Object.keys(game),
  blue: project(game.blueTeam),
  red: project(game.redTeam),
  timelineType: Array.isArray(game.timeline) ? `array:${game.timeline.length}` : typeof game.timeline,
  timelineKeys: game.timeline && typeof game.timeline === 'object' && !Array.isArray(game.timeline) ? Object.keys(game.timeline) : [],
  timelineInteresting: interestingPaths(game.timeline)
}, null, 2));
