const BASE = 'https://oe.datalisk.io';
const KEY = 'f561197a-82ea-4e54-acd2-386979018a7a';
const interesting = /kill|gold|tower|turret|inhib|dragon|baron|herald|grub|elder|atakhan/i;

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
  red: project(game.redTeam)
}, null, 2));
