// Temporary diagnostic: print the objective-related keys Riot exposes for the
// exact KRX vs NS Game 2 window used by the live-match regression.
const API_KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const gameId = '115548147900750239';
const probes = [
  '2026-08-20T11:00:00.000Z',
  '2026-08-20T11:10:00.000Z',
  '2026-08-20T11:20:00.000Z',
  '2026-08-20T11:30:00.000Z'
];
for (const startingTime of probes) {
  const response = await fetch(`https://feed.lolesports.com/livestats/v1/window/${gameId}?startingTime=${encodeURIComponent(startingTime)}`, {
    headers: { 'x-api-key': API_KEY, 'User-Agent': 'WebLienMinh objective diagnostic' },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) continue;
  const body = await response.json();
  const frame = [...(body.frames || [])].reverse().find(row => row?.blueTeam && row?.redTeam);
  if (!frame) continue;
  const summarize = team => Object.fromEntries(Object.entries(team || {}).filter(([key]) => /dragon|baron|tower|turret|inhib|herald|grub|void|gold|kill/i.test(key)));
  console.log(JSON.stringify({ startingTime, frame: frame.rfc460Timestamp, blueKeys: Object.keys(frame.blueTeam || {}), redKeys: Object.keys(frame.redTeam || {}), blue: summarize(frame.blueTeam), red: summarize(frame.redTeam) }, null, 2));
}
