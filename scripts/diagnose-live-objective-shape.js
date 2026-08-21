// Temporary diagnostic: print objective-related fields exposed by Riot's live
// window and details endpoints for the exact KRX vs NS Game 2 regression.
const API_KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const gameId = '115548147900750239';
const start = Date.parse('2026-08-20T10:00:00.000Z');
const probes = Array.from({ length: 19 }, (_, index) => new Date(start + index * 10 * 60_000).toISOString());

function matchesObjective(value) {
  return /dragon|baron|tower|turret|inhib|herald|grub|void|rift|monster|gold|kill/i.test(String(value || ''));
}

function findObjectivePaths(value, path = '', out = []) {
  if (value == null) return out;
  if (Array.isArray(value)) {
    value.forEach((child, index) => findObjectivePaths(child, `${path}[${index}]`, out));
    return out;
  }
  if (typeof value !== 'object') {
    if (matchesObjective(path) || matchesObjective(value)) out.push({ path, value });
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (matchesObjective(key) && (typeof child !== 'object' || child == null)) out.push({ path: next, value: child });
    findObjectivePaths(child, next, out);
  }
  return out;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'x-api-key': API_KEY, 'User-Agent': 'WebLienMinh objective diagnostic' },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) return null;
  const raw = await response.text();
  if (!raw.trim()) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

let found = 0;
for (const startingTime of probes) {
  try {
    const windowBody = await fetchJson(`https://feed.lolesports.com/livestats/v1/window/${gameId}?startingTime=${encodeURIComponent(startingTime)}`);
    const frame = [...(windowBody?.frames || [])].reverse().find(row => row?.blueTeam && row?.redTeam);
    if (frame) {
      const summarize = team => Object.fromEntries(Object.entries(team || {}).filter(([key]) => matchesObjective(key)));
      console.log('WINDOW_OBJECTIVES', JSON.stringify({ startingTime, frame: frame.rfc460Timestamp, blueKeys: Object.keys(frame.blueTeam || {}), redKeys: Object.keys(frame.redTeam || {}), blue: summarize(frame.blueTeam), red: summarize(frame.redTeam) }, null, 2));
      found += 1;
    }

    const details = await fetchJson(`https://feed.lolesports.com/livestats/v1/details/${gameId}?startingTime=${encodeURIComponent(startingTime)}`);
    if (details) {
      const paths = findObjectivePaths(details).filter(row => /herald|grub|void|rift|monster/i.test(`${row.path} ${row.value}`));
      if (paths.length) console.log('DETAIL_OBJECTIVES', JSON.stringify({ startingTime, paths: paths.slice(0, 80) }, null, 2));
    }
  } catch (error) {
    console.log(JSON.stringify({ startingTime, error: error.message }));
  }
}
if (!found) throw new Error('No Riot objective frame found in diagnostic probe range.');
