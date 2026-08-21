// Temporary diagnostic: print the objective-related keys Riot exposes for the
// exact KRX vs NS Game 2 window used by the live-match regression.
const API_KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const gameId = '115548147900750239';
const start = Date.parse('2026-08-20T10:00:00.000Z');
const probes = Array.from({ length: 19 }, (_, index) => new Date(start + index * 10 * 60_000).toISOString());
let found = 0;
for (const startingTime of probes) {
  try {
    const response = await fetch(`https://feed.lolesports.com/livestats/v1/window/${gameId}?startingTime=${encodeURIComponent(startingTime)}`, {
      headers: { 'x-api-key': API_KEY, 'User-Agent': 'WebLienMinh objective diagnostic' },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) continue;
    const raw = await response.text();
    if (!raw.trim()) continue;
    let body = null;
    try { body = JSON.parse(raw); } catch { continue; }
    const frame = [...(body.frames || [])].reverse().find(row => row?.blueTeam && row?.redTeam);
    if (!frame) continue;
    const summarize = team => Object.fromEntries(Object.entries(team || {}).filter(([key]) => /dragon|baron|tower|turret|inhib|herald|grub|void|gold|kill/i.test(key)));
    console.log(JSON.stringify({ startingTime, frame: frame.rfc460Timestamp, blueKeys: Object.keys(frame.blueTeam || {}), redKeys: Object.keys(frame.redTeam || {}), blue: summarize(frame.blueTeam), red: summarize(frame.redTeam) }, null, 2));
    found += 1;
  } catch (error) {
    console.log(JSON.stringify({ startingTime, error: error.message }));
  }
}
if (!found) throw new Error('No Riot objective frame found in diagnostic probe range.');
