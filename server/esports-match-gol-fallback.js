const GOL_BASE = 'https://gol.gg';
const TEAM_LIST_URL = `${GOL_BASE}/teams/list/season-S16/split-ALL/tournament-ALL/`;
const DIRECTORY_TTL = 6 * 60 * 60_000;
const MATCHLIST_TTL = 5 * 60_000;
const RESULT_TTL = 30 * 60_000;

let directoryCache = { at: 0, value: [] };
const matchListCache = new Map();
const resultCache = new Map();

const text = value => String(value ?? '').trim();
const lower = value => text(value).toLowerCase();
const compact = value => lower(value).normalize('NFKD').replace(/[^a-z0-9]+/g, '');

function decodeHtml(value) {
  return text(value)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code) || 32));
}

function stripHtml(value) {
  return decodeHtml(text(value).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; WebLienMinh/3.30; +https://github.com/DakCuteNe/WebLienMinh)',
      Accept: 'text/html,application/xhtml+xml'
    },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) return null;
  const html = await response.text();
  return html.length >= 200 ? html : null;
}

export function parseGolTeamDirectory(html) {
  const teams = [];
  const seen = new Set();
  const regex = /href=["'](?:\.\.\/)?team-stats\/(\d+)\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of text(html).matchAll(regex)) {
    const id = text(match[1]);
    const name = stripHtml(match[2]);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    teams.push({ id, name, key: compact(name) });
  }
  return teams;
}

function teamAliases(team = {}) {
  return [...new Set([team.name, team.code, team.slug]
    .map(value => compact(value))
    .filter(Boolean))];
}

export function resolveGolTeam(team = {}, directory = []) {
  const aliases = teamAliases(team);
  if (!aliases.length) return null;
  let best = null;
  for (const candidate of directory) {
    const key = compact(candidate?.name || candidate?.key);
    if (!key) continue;
    let score = 0;
    for (const alias of aliases) {
      if (alias === key) score = Math.max(score, 10_000 + alias.length);
      else if (alias.length >= 4 && (key.includes(alias) || alias.includes(key))) score = Math.max(score, 2_000 + Math.min(alias.length, key.length));
    }
    if (!best || score > best.score) best = { candidate, score };
  }
  return best?.score > 0 ? best.candidate : null;
}

export function parseGolMatchList(html) {
  const rows = [];
  const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const tr of text(html).matchAll(trRegex)) {
    const rowHtml = tr[1];
    const link = rowHtml.match(/href=["'](?:\.\.\/)?game\/stats\/(\d+)\/page-game\/["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const id = text(link[1]);
    const label = stripHtml(link[2]);
    const number = Number(label.match(/\((\d+)\)\s*$/)?.[1] || 0) || null;
    rows.push({ id, label, number, text: stripHtml(rowHtml) });
  }
  return rows;
}

function rowHasTeam(row, team = {}) {
  const hay = compact(`${row?.label || ''} ${row?.text || ''}`);
  if (!hay) return false;
  const aliases = teamAliases(team);
  const strong = aliases.filter(alias => alias.length >= 4);
  if (strong.some(alias => hay.includes(alias))) return true;
  return aliases.some(alias => alias.length >= 2 && hay.includes(alias));
}

function dateDistanceDays(a, b) {
  const aa = Date.parse(`${text(a).slice(0, 10)}T00:00:00Z`);
  const bb = Date.parse(`${text(b).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(aa) || !Number.isFinite(bb)) return Number.POSITIVE_INFINITY;
  return Math.abs(aa - bb) / 86_400_000;
}

export function parseGolGamePage(html) {
  const source = text(html);
  const date = source.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] || null;
  const heading = stripHtml(source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
  const banBlocks = [];
  const banRegex = /<div\s+class=["']col-2["']>\s*Bans\s*<\/div>\s*<div\s+class=["']col-10["']>([\s\S]*?)<\/div>/gi;
  for (const block of source.matchAll(banRegex)) {
    const bans = [];
    for (const image of block[1].matchAll(/<img\b[^>]*>/gi)) {
      const tag = image[0];
      if (!/champions_icon\//i.test(tag)) continue;
      const alt = decodeHtml(tag.match(/\balt=["']([^"']+)["']/i)?.[1] || '');
      if (alt && !bans.some(value => compact(value) === compact(alt))) bans.push(alt);
    }
    if (bans.length) banBlocks.push(bans.slice(0, 5));
  }
  return { date, heading, blueBans: banBlocks[0] || [], redBans: banBlocks[1] || [] };
}

function gameSideTeamId(game, side, teams = []) {
  const row = (game?.teams || []).find(candidate => lower(candidate?.side) === side);
  if (row?.id) return text(row.id);
  const index = side === 'blue' ? 0 : 1;
  return text(teams[index]?.id) || null;
}

export function golCommunityFromPage(body, parsed, golGameId = null) {
  const game = body?.viewGame || body?.currentGame;
  if (!game?.id || !parsed) return null;
  const blueTeamId = gameSideTeamId(game, 'blue', body?.teams || []);
  const redTeamId = gameSideTeamId(game, 'red', body?.teams || []);
  const rows = [];
  if (blueTeamId && parsed.blueBans?.length) rows.push({ teamId: blueTeamId, bans: parsed.blueBans.slice(0, 5), stats: {} });
  if (redTeamId && parsed.redBans?.length) rows.push({ teamId: redTeamId, bans: parsed.redBans.slice(0, 5), stats: {} });
  if (!rows.length) return null;
  return {
    source: 'Games of Legends',
    golGameId: text(golGameId) || null,
    scores: null,
    games: [{ number: Number(game.number || 0) || 1, teams: rows }]
  };
}

async function teamDirectory() {
  if (directoryCache.value.length && Date.now() - directoryCache.at < DIRECTORY_TTL) return directoryCache.value;
  const html = await fetchHtml(TEAM_LIST_URL);
  const value = html ? parseGolTeamDirectory(html) : [];
  if (value.length) directoryCache = { at: Date.now(), value };
  return value;
}

async function matchList(teamId) {
  const key = text(teamId);
  const cached = matchListCache.get(key);
  if (cached && Date.now() - cached.at < MATCHLIST_TTL) return cached.value;
  const html = await fetchHtml(`${GOL_BASE}/teams/team-matchlist/${encodeURIComponent(key)}/split-ALL/tournament-ALL/`);
  const value = html ? parseGolMatchList(html) : [];
  matchListCache.set(key, { at: Date.now(), value });
  return value;
}

function targetDate(body) {
  return text(body?.startTime).slice(0, 10);
}

function pageMatchesBody(body, parsed) {
  if (!parsed?.date || dateDistanceDays(parsed.date, targetDate(body)) > 1) return false;
  const hay = compact(parsed.heading);
  if (!hay) return false;
  return (body?.teams || []).slice(0, 2).every(team => {
    const aliases = teamAliases(team);
    const strong = aliases.filter(alias => alias.length >= 4);
    return strong.some(alias => hay.includes(alias)) || aliases.some(alias => alias.length >= 2 && hay.includes(alias));
  });
}

function cacheKey(body) {
  const game = body?.viewGame || body?.currentGame;
  return [targetDate(body), ...(body?.teams || []).slice(0, 2).map(team => compact(team?.name || team?.code)).sort(), Number(game?.number || 0) || 1].join(':');
}

export async function loadGolMatchFallback(body) {
  if (!body?.ok || !body?.startTime || !Array.isArray(body?.teams) || body.teams.length < 2) return null;
  const game = body?.viewGame || body?.currentGame;
  if (!game?.id) return null;
  const key = cacheKey(body);
  const cached = resultCache.get(key);
  if (cached && Date.now() - cached.at < RESULT_TTL) return cached.value;

  const directory = await teamDirectory();
  if (!directory.length) return null;
  const resolved = body.teams.slice(0, 2).map(team => resolveGolTeam(team, directory));
  const sourceIndex = resolved[0]?.id ? 0 : resolved[1]?.id ? 1 : -1;
  if (sourceIndex < 0) return null;

  const rows = await matchList(resolved[sourceIndex].id);
  const gameNumber = Number(game.number || 0) || 1;
  const candidates = rows
    .filter(row => (!row.number || row.number === gameNumber)
      && rowHasTeam(row, body.teams[0])
      && rowHasTeam(row, body.teams[1]))
    .slice(0, 12);

  let value = null;
  for (const candidate of candidates) {
    const html = await fetchHtml(`${GOL_BASE}/game/stats/${encodeURIComponent(candidate.id)}/page-game/`);
    if (!html) continue;
    const parsed = parseGolGamePage(html);
    if (!pageMatchesBody(body, parsed)) continue;
    value = golCommunityFromPage(body, parsed, candidate.id);
    if (value) break;
  }

  resultCache.set(key, { at: Date.now(), value });
  return value;
}

export const __golFallbackTest = {
  parseGolTeamDirectory,
  resolveGolTeam,
  parseGolMatchList,
  parseGolGamePage,
  golCommunityFromPage
};
