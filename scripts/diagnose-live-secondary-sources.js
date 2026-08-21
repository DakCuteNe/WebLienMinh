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
const starts = new Set();
const add = value => { const ms = Date.parse(value || ''); if (Number.isFinite(ms)) starts.add(new Date(Math.floor(ms / 10000) * 10000).toISOString()); };
add(local.live?.timestamp);
for (const vod of game?.vods || []) {
  const base = Date.parse(vod.firstFrameTime || '');
  for (const delta of [0, 10, 20, 30, 40, 50, 60]) if (Number.isFinite(base)) add(new Date(base + delta * 60_000).toISOString());
}
for (const startingTime of [...starts].slice(0, 10)) {
  const details = await json(`${LIVE_FEED}/details/${game.id}?startingTime=${encodeURIComponent(startingTime)}`, { headers: { 'x-api-key': RIOT_KEY } }).catch(() => null);
  if (!details) continue;
  const matches = deepMatches(details, /ban|herald|grub|void|rift|monster|objective|3513/i).slice(0, 150);
  const frame = details.frames?.at(-1) || {};
  console.log('RIOT_DETAILS', JSON.stringify({ startingTime, rootKeys: Object.keys(details), frameKeys: Object.keys(frame), matches }, null, 2));
}

const redditQuery = encodeURIComponent('KT Rolster T1 LCK 2026 Rounds 3-4 Legend Group Week 13 Game 2 Discussion');
for (const host of ['www.reddit.com','old.reddit.com']) {
  const url = `https://${host}/r/leagueoflegends/search.json?q=${redditQuery}&restrict_sr=1&sort=new&t=week&limit=20&raw_json=1`;
  const data = await json(url, { headers: { 'User-Agent': 'WebLienMinh/1.0 contact github.com/DakCuteNe/WebLienMinh' } }).catch(error => ({ error: error.message }));
  const posts = data?.data?.children?.map(row => row.data).filter(Boolean) || [];
  const hit = posts.find(post => /KT Rolster vs\. T1.*Game 2 Discussion/i.test(post.title || '')) || posts[0] || null;
  console.log('REDDIT_SOURCE', JSON.stringify({ host, error: data?.error || null, count: posts.length, hit: hit && { title: hit.title, permalink: hit.permalink, selftext: hit.selftext } }, null, 2));
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
const around = [];
for (const marker of ['2026-08-21', 'KT Rolster vs T1', 'KT Rolster', 'T1']) {
  let at = normalizedHtml.indexOf(marker);
  while (at >= 0 && around.length < 20) {
    around.push(normalizedHtml.slice(Math.max(0, at - 450), at + 700));
    at = normalizedHtml.indexOf(marker, at + marker.length);
  }
}
const gameLinks = [...normalizedHtml.matchAll(/href=["']([^"']*(?:game\/stats|page-game\/stats|game\/game-stats)[^"']*)["'][^>]*>([^<]*)</gi)]
  .map(match => ({ href: match[1], text: match[2].replace(/<[^>]+>/g, '').trim() }));
console.log('GOL_LIST', JSON.stringify({ status: golList.status, finalUrl: golList.finalUrl, bytes: golList.raw.length, snippets: around.slice(0, 10), gameLinks: gameLinks.slice(-30) }, null, 2));

const genericLinks = [...normalizedHtml.matchAll(/href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi)].map(row => ({ href: row[1], text: row[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() }));
const likely = genericLinks.filter(row => /T1|KT Rolster|2026-08-21/.test(row.text) || /game\/stats|page-game\/stats/.test(row.href));
console.log('GOL_LIKELY_LINKS', JSON.stringify(likely.slice(-80), null, 2));
