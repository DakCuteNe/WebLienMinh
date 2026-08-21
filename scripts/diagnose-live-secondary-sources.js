import fs from 'node:fs/promises';

const RIOT_KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const LIVE_FEED = 'https://feed.lolesports.com/livestats/v1';
const TARGET = Date.parse('2026-08-21T10:00:00Z');

async function json(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'User-Agent': 'WebLienMinh/diagnostic live secondary sources', ...(options.headers || {}) },
    signal: AbortSignal.timeout(20_000)
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${url} :: ${raw.slice(0, 180)}`);
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

async function textFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'User-Agent': 'Mozilla/5.0 WebLienMinh/1.0', ...(options.headers || {}) },
    signal: AbortSignal.timeout(20_000)
  });
  const raw = await response.text();
  return { status: response.status, raw, finalUrl: response.url };
}

function deepMatches(value, regex, path = '', out = []) {
  if (value == null) return out;
  if (Array.isArray(value)) {
    value.forEach((child, index) => deepMatches(child, regex, `${path}[${index}]`, out));
    return out;
  }
  if (typeof value !== 'object') {
    if (regex.test(`${path} ${String(value)}`)) out.push({ path, value });
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (regex.test(key)) out.push({ path: next, value: typeof child === 'object' ? `[${Array.isArray(child) ? 'array' : 'object'}]` : child });
    deepMatches(child, regex, next, out);
  }
  return out;
}

const schedule = JSON.parse(await fs.readFile(new URL('../public/data/esports-schedule.json', import.meta.url), 'utf8'));
const match = (schedule.events || []).filter(row => {
  const codes = (row.teams || []).map(team => String(team.code || team.name || '').toUpperCase());
  const at = Date.parse(row.startTime || '');
  return codes.includes('T1') && codes.includes('KT') && Number.isFinite(at);
}).sort((a, b) => Math.abs(Date.parse(a.startTime) - TARGET) - Math.abs(Date.parse(b.startTime) - TARGET))[0];
if (!match) throw new Error('T1 vs KT Aug 21 event not found');

const params = new URLSearchParams({
  leagueId: String(match.league?.id || ''),
  leagueSlug: String(match.league?.slug || 'lck'),
  startTime: String(match.startTime || ''),
  teamA: String(match.teams?.[0]?.code || match.teams?.[0]?.name || ''),
  teamB: String(match.teams?.[1]?.code || match.teams?.[1]?.name || ''),
  state: String(match.state || 'inprogress'),
  locale: 'vi-VN', detail: '1', viewGameNumber: '2'
});
const local = await json(`http://127.0.0.1:${process.env.PORT || 3000}/api/esports/match-live?${params}`);
console.log('LOCAL_MATCH', JSON.stringify({ matchId: local.matchId, state: local.state, teams: local.teams?.map(t => ({id:t.id,code:t.code,wins:t.wins})), games: local.games?.map(g => ({id:g.id,number:g.number,state:g.state})), viewGame: local.viewGame, live: local.live }, null, 2));

const game = local.viewGame;
const detailProbeStart = Date.parse('2026-08-21T11:10:00Z');
const detailProbeEnd = Date.parse('2026-08-21T13:00:00Z');
for (let at = detailProbeStart; at <= detailProbeEnd; at += 5 * 60_000) {
  const startingTime = new Date(at).toISOString();
  const details = await json(`${LIVE_FEED}/details/${game.id}?startingTime=${encodeURIComponent(startingTime)}`, { headers: { 'x-api-key': RIOT_KEY } }).catch(() => null);
  if (!details?.frames?.length) continue;
  const frame = details.frames.at(-1) || {};
  const sample = frame.participants?.[0] || null;
  const matches = deepMatches(details, /ban|herald|grub|void|rift|monster|objective|item|buff|stack|3513/i).slice(0, 100);
  console.log('RIOT_EARLY_DETAILS', JSON.stringify({ startingTime, frameTime: frame.rfc460Timestamp, frameKeys: Object.keys(frame), participantKeys: sample ? Object.keys(sample) : [], sample, matches }, null, 2));
}

const pullQueries = [
  'KT Rolster vs. T1 LCK 2026 Rounds 3-4 Legend Group Week 13 Game 2 Discussion',
  'KT Rolster T1 Game 2 Discussion',
  'KT Rolster vs T1 LCK 2026'
];
for (const q of pullQueries) {
  const url = `https://api.pullpush.io/topic?subreddit=leagueoflegends&size=30&q=${encodeURIComponent(q)}`;
  const data = await json(url).catch(error => ({ error: error.message }));
  const rows = data?.data || [];
  console.log('PULLPUSH', JSON.stringify({ q, error: data?.error || null, count: rows.length, rows: rows.slice(0, 10).map(row => ({ id: row.id, title: row.title, created_utc: row.created_utc, selftext: row.selftext })) }, null, 2));
}

const after = Math.floor(Date.parse('2026-08-21T00:00:00Z') / 1000);
const before = Math.floor(Date.parse('2026-08-22T00:00:00Z') / 1000);
for (const endpoint of [
  `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=leagueoflegends&after=${after}&before=${before}&limit=100&sort=desc`,
  `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=leagueoflegends&after=${after}&before=${before}&limit=100&sort=asc`
]) {
  const data = await json(endpoint).catch(error => ({ error: error.message }));
  const rows = data?.data || [];
  const hits = rows.filter(row => /KT Rolster.*T1|T1.*KT Rolster/i.test(row.title || '') || /KT vs\. T1/i.test(row.title || ''));
  console.log('ARCTIC', JSON.stringify({ endpoint, error: data?.error || null, count: rows.length, hits: hits.map(row => ({ id: row.id, title: row.title, created_utc: row.created_utc, selftext: row.selftext })) }, null, 2));
}

const date = '20260821';
const oeUrl = `https://oracleselixir-downloadable-match-data.s3-us-west-2.amazonaws.com/2026_LoL_esports_match_data_from_OraclesElixir_${date}.csv`;
try {
  const response = await fetch(oeUrl, { headers: { 'User-Agent': 'WebLienMinh/1.0' }, signal: AbortSignal.timeout(30_000) });
  const raw = await response.text();
  console.log('OE_HTTP', JSON.stringify({ status: response.status, bytes: raw.length }));
  if (response.ok && raw.trim()) {
    const lines = raw.split(/\r?\n/);
    const header = lines[0].split(',');
    const interesting = header.map((name, index) => ({ name, index })).filter(row => /ban|herald|grub|void|dragon|baron|tower|inhib|teamname|date|gameid|game$|side|participantid/i.test(row.name));
    const hits = lines.slice(1).filter(line => /T1|KT Rolster/i.test(line) && /2026-08-21/.test(line));
    console.log('OE_HEADER', JSON.stringify(interesting, null, 2));
    console.log('OE_MATCH_LINES', JSON.stringify(hits.slice(-30).map(line => {
      const cells = line.split(',');
      return Object.fromEntries(interesting.map(({name,index}) => [name,cells[index]]));
    }), null, 2));
  }
} catch (error) {
  console.log('OE_ERROR', error.message);
}

const golTournament = 'https://gol.gg/tournament/tournament-matchlist/LCK%202026%20Rounds%203-4/';
const golList = await textFetch(golTournament).catch(error => ({ status: 0, raw: error.message, finalUrl: golTournament }));
const normalizedHtml = golList.raw.replace(/\s+/g, ' ');
const rowAt = normalizedHtml.indexOf('KT Rolster vs T1');
console.log('GOL_LIST', JSON.stringify({ status: golList.status, finalUrl: golList.finalUrl, bytes: golList.raw.length, currentRow: rowAt >= 0 ? normalizedHtml.slice(Math.max(0, rowAt - 250), rowAt + 800) : null }, null, 2));

for (const id of [81853, 81854, 81855, 81856]) {
  for (const page of ['page-summary', 'page-game']) {
    const url = `https://gol.gg/game/stats/${id}/${page}/`;
    const result = await textFetch(url).catch(error => ({ status: 0, raw: error.message, finalUrl: url }));
    const html = result.raw.replace(/\s+/g, ' ');
    const title = (html.match(/<title>(.*?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim();
    const markers = [];
    for (const word of ['Bans', 'Herald', 'Void', 'Grub', 'Dragon', 'Baron', 'KT Rolster', 'T1']) {
      const idx = html.toLowerCase().indexOf(word.toLowerCase());
      if (idx >= 0) markers.push({ word, snippet: html.slice(Math.max(0, idx - 250), idx + 900) });
    }
    console.log('GOL_PAGE', JSON.stringify({ id, page, status: result.status, finalUrl: result.finalUrl, title, bytes: result.raw.length, markers }, null, 2));
  }
}
