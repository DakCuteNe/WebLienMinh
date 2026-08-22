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
const matches = await get('/matches/recentResults/');
const recent = (Array.isArray(matches) ? matches : []).find(row => String(row?.startTime || '').startsWith('2026'));
if (!recent?.matchId) throw new Error('No 2026 OE recent match');
const match = first(await get(`/matches/singleMatch/${recent.matchId}`)) || {};
const gameId = [1,2,3,4,5].map(n => match[`game${n}Id`]).filter(Boolean).at(-1);
if (!gameId) throw new Error('OE recent match has no game id');
const game = first(await get(`/games/singleGame/${gameId}`)) || {};
const project = team => {
  const stats = team?.teamStats || {};
  return {
    teamName: team?.teamName || null,
    keys: Object.keys(stats),
    interesting: Object.fromEntries(Object.entries(stats).filter(([key]) => interesting.test(key)))
  };
};
console.log(JSON.stringify({
  match: { matchId: recent.matchId, startTime: recent.startTime, gameId },
  blue: project(game.blueTeam),
  red: project(game.redTeam)
}, null, 2));
