// Temporary diagnostic: inspect whether Riot's details feed exposes champion bans
// for the exact KRX vs NS Game 2. This file is removed before merge.
const API_KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const gameId = '115548147900750239';
const probes = ['2026-08-20T11:40:00.000Z','2026-08-20T11:50:00.000Z','2026-08-20T12:00:00.000Z','2026-08-20T12:10:00.000Z'];

function findPaths(value, regex, path = '', out = []) {
  if (value == null) return out;
  if (Array.isArray(value)) {
    value.forEach((child, index) => findPaths(child, regex, `${path}[${index}]`, out));
    return out;
  }
  if (typeof value !== 'object') {
    if (regex.test(`${path} ${String(value)}`)) out.push({ path, value });
    return out;
  }
  for (const [key, child] of Object.entries(value)) findPaths(child, regex, path ? `${path}.${key}` : key, out);
  return out;
}

for (const startingTime of probes) {
  const response = await fetch(`https://feed.lolesports.com/livestats/v1/details/${gameId}?startingTime=${encodeURIComponent(startingTime)}`, {
    headers: { 'x-api-key': API_KEY, 'User-Agent': 'WebLienMinh ban diagnostic' },
    signal: AbortSignal.timeout(10_000)
  }).catch(() => null);
  if (!response?.ok) continue;
  const raw = await response.text();
  if (!raw.trim()) continue;
  let body = null;
  try { body = JSON.parse(raw); } catch { continue; }
  const banPaths = findPaths(body, /ban|banned|championban/i).slice(0, 100);
  console.log('BAN_PATHS', JSON.stringify({ startingTime, count: banPaths.length, paths: banPaths }, null, 2));
}
