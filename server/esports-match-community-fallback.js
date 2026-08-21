const ARCTIC_SHIFT = 'https://arctic-shift.photon-reddit.com/api/posts/search';
const DDRAGON_VERSIONS = 'https://ddragon.leagueoflegends.com/api/versions.json';
const LIVE_CACHE_MS = 20_000;
const COMPLETED_CACHE_MS = 3 * 60_000;
const fallbackCache = new Map();
let championIndexPromise = null;

const text = value => String(value ?? '').trim();
const lower = value => text(value).toLowerCase();
const compact = value => lower(value).normalize('NFKD').replace(/[^a-z0-9]+/g, '');
const words = value => lower(value).normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

function stateIsCompleted(value) {
  const state = lower(value);
  return state.includes('complete') || state.includes('finished');
}

function stripMarkdown(value) {
  return text(value)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~#>]/g, '')
    .replace(/&nbsp;|\u00a0/gi, ' ')
    .trim();
}

function teamAliases(team = {}) {
  return [...new Set([team.code, team.name, team.slug]
    .flatMap(value => {
      const raw = stripMarkdown(value);
      if (!raw) return [];
      const aliases = [compact(raw), words(raw)];
      const first = words(raw).split(' ')[0];
      if (first?.length >= 2) aliases.push(compact(first));
      return aliases;
    })
    .filter(alias => alias && alias.length >= 2))];
}

function resolveTeam(label, teams = []) {
  const rawCompact = compact(stripMarkdown(label));
  const rawWords = words(stripMarkdown(label));
  if (!rawCompact) return null;
  let best = null;
  for (const team of teams) {
    let score = 0;
    for (const alias of teamAliases(team)) {
      const aliasCompact = compact(alias);
      const aliasWords = words(alias);
      if (!aliasCompact) continue;
      if (rawCompact === aliasCompact) score = Math.max(score, 1000 + aliasCompact.length);
      else if (rawCompact.includes(aliasCompact) || aliasCompact.includes(rawCompact)) score = Math.max(score, 500 + Math.min(rawCompact.length, aliasCompact.length));
      if (rawWords === aliasWords) score = Math.max(score, 1200 + aliasWords.length);
    }
    if (!best || score > best.score) best = { team, score };
  }
  return best?.score > 0 ? best.team : null;
}

function postHasTeams(post, teams = []) {
  if (teams.length < 2) return false;
  const hayCompact = compact(`${post?.title || ''} ${post?.selftext || ''}`);
  const hayWords = words(`${post?.title || ''} ${post?.selftext || ''}`);
  return teams.every(team => teamAliases(team).some(alias => {
    const aCompact = compact(alias);
    const aWords = words(alias);
    return (aCompact.length >= 2 && hayCompact.includes(aCompact)) || (aWords.length >= 2 && hayWords.includes(aWords));
  }));
}

function splitMarkdownRow(line) {
  const raw = text(line);
  if (!raw.startsWith('|')) return [];
  const body = raw.replace(/^\|/, '').replace(/\|\s*$/, '');
  return body.split('|').map(cell => cell.trim());
}

function gameNumberFromPost(post) {
  const source = `${post?.title || ''}\n${post?.selftext || ''}`;
  const match = source.match(/(?:GAME|MATCH)\s*(\d+)\s*(?:DISCUSSION|:)?/i);
  return Number(match?.[1] || 0) || null;
}

function isSeparatorRow(cells = []) {
  return cells.length > 0 && cells.every(cell => /^\s*:?-{2,}:?\s*$/.test(cell) || !cell);
}

export function buildChampionIndex(champions = []) {
  const entries = [];
  for (const champion of champions) {
    const championId = Number(champion?.key ?? champion?.championId ?? 0) || null;
    if (!championId) continue;
    const name = text(champion?.name || champion?.id);
    const aliases = [...new Set([champion?.name, champion?.id].map(value => words(value)).filter(Boolean))];
    const compactAliases = [...new Set([champion?.name, champion?.id].map(value => compact(value)).filter(Boolean))];
    entries.push({ championId, name, aliases, compactAliases });
  }
  entries.sort((a, b) => Math.max(...b.aliases.map(value => value.length), 0) - Math.max(...a.aliases.map(value => value.length), 0));
  return entries;
}

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseChampionCell(cell, championIndex = []) {
  const cleanWords = words(stripMarkdown(cell));
  const cleanCompact = compact(stripMarkdown(cell));
  if (!cleanWords && !cleanCompact) return [];
  const found = [];
  for (const champion of championIndex) {
    let position = Number.POSITIVE_INFINITY;
    for (const alias of champion.aliases || []) {
      if (!alias) continue;
      const match = new RegExp(`(?:^|\\s)${regexEscape(alias)}(?:$|\\s)`, 'i').exec(cleanWords);
      if (match) position = Math.min(position, match.index);
    }
    if (!Number.isFinite(position)) {
      for (const alias of champion.compactAliases || []) {
        if (!alias || alias.length < 3) continue;
        const at = cleanCompact.indexOf(alias);
        if (at >= 0) position = Math.min(position, at + 10_000);
      }
    }
    if (Number.isFinite(position)) found.push({ position, championId: champion.championId, championName: champion.name });
  }
  const unique = [];
  for (const row of found.sort((a, b) => a.position - b.position)) {
    if (!unique.some(item => item.championId === row.championId)) unique.push(row);
  }
  return unique.slice(0, 5);
}

function objectiveColumns(header = []) {
  return {
    ban1: header.findIndex(cell => /bans?\s*1/i.test(stripMarkdown(cell))),
    ban2: header.findIndex(cell => /bans?\s*2/i.test(stripMarkdown(cell))),
    vgRhBn: header.findIndex(cell => /\bVG\b.*\bRH\b.*\bBN\b/i.test(stripMarkdown(cell))),
    db: header.findIndex(cell => /^D\s*\/\s*B$/i.test(stripMarkdown(cell)))
  };
}

function partialStatsFromRow(cells, columns) {
  const stats = {};
  if (columns.vgRhBn >= 0) {
    const values = stripMarkdown(cells[columns.vgRhBn]).match(/\d+/g)?.map(Number) || [];
    if (values.length >= 3) {
      stats.voidGrubs = values[0];
      stats.riftHeralds = values[1];
      stats.barons = values[2];
    }
  }
  if (columns.db >= 0) {
    const cell = text(cells[columns.db]);
    const heralds = (cell.match(/#mt-herald/gi) || []).length || (cell.match(/\[H\]/g) || []).length;
    const barons = (cell.match(/#mt-barons?/gi) || []).length || (cell.match(/\[B\]/g) || []).length;
    if (heralds > 0) stats.riftHeralds = heralds;
    if (barons > 0) stats.barons = barons;
  }
  return stats;
}

function winnerFromText(post, teams, fallbackGameNumber = null) {
  const body = text(post?.selftext);
  const explicit = body.match(/\*\*\s*Winner:\s*([^*\n]+)\*\*/i);
  const winner = explicit ? resolveTeam(explicit[1], teams) : null;
  if (winner && fallbackGameNumber) return [{ number: fallbackGameNumber, winnerTeamId: text(winner.id) }];
  const results = [];
  for (const line of body.split(/\r?\n/)) {
    let match = stripMarkdown(line).match(/^(.+?)\s+wins\s+game\s+(\d+)\b/i);
    if (!match) match = stripMarkdown(line).match(/^(.+?)\s+have\s+prevailed\s+over\s+.+?\s+in\s+game\s+(\d+)\b/i);
    if (!match) continue;
    const team = resolveTeam(match[1], teams);
    const number = Number(match[2] || 0);
    if (team?.id && number > 0) results.push({ number, winnerTeamId: text(team.id) });
  }
  return results;
}

function scoreFromPost(post, teams) {
  let best = null;
  for (const line of text(post?.selftext).split(/\r?\n/)) {
    const clean = stripMarkdown(line).replace(/\s+/g, ' ').trim();
    if (!/\d+\s*-\s*\d+/.test(clean)) continue;
    const match = clean.match(/^(.+?)\s+(\d+)\s*-\s*(\d+)\s+(.+?)$/);
    if (!match) continue;
    const left = resolveTeam(match[1], teams);
    const right = resolveTeam(match[4], teams);
    if (!left?.id || !right?.id || text(left.id) === text(right.id)) continue;
    const leftWins = Number(match[2]);
    const rightWins = Number(match[3]);
    const candidate = { scores: Object.fromEntries([[text(left.id), leftWins], [text(right.id), rightWins]]), total: leftWins + rightWins, createdUtc: Number(post?.created_utc || 0) || 0 };
    if (!best || candidate.total > best.total || (candidate.total === best.total && candidate.createdUtc > best.createdUtc)) best = candidate;
  }
  return best;
}

export function parseCommunityPost(post, teams = [], championIndex = []) {
  if (!postHasTeams(post, teams)) return null;
  const number = gameNumberFromPost(post);
  const lines = text(post?.selftext).split(/\r?\n/);
  const game = number ? { number, teams: [] } : null;
  if (game) {
    const headerIndex = lines.findIndex(line => /\|.*Bans?\s*1.*\|.*Bans?\s*2/i.test(line));
    if (headerIndex >= 0) {
      const header = splitMarkdownRow(lines[headerIndex]);
      const columns = objectiveColumns(header);
      for (let index = headerIndex + 1; index < lines.length; index += 1) {
        const cells = splitMarkdownRow(lines[index]);
        if (!cells.length) {
          if (game.teams.length) break;
          continue;
        }
        if (isSeparatorRow(cells)) continue;
        const team = resolveTeam(cells[0], teams);
        if (!team?.id) {
          if (game.teams.length >= 2) break;
          continue;
        }
        const bans = [...(columns.ban1 >= 0 ? parseChampionCell(cells[columns.ban1], championIndex) : []), ...(columns.ban2 >= 0 ? parseChampionCell(cells[columns.ban2], championIndex) : [])]
          .filter((row, pos, all) => all.findIndex(other => other.championId === row.championId) === pos).slice(0, 5);
        game.teams.push({ teamId: text(team.id), bans: bans.map(row => row.championId), banNames: bans.map(row => row.championName), stats: partialStatsFromRow(cells, columns) });
        if (game.teams.length >= 2) break;
      }
    }
  }
  const winners = winnerFromText(post, teams, number);
  if (game) game.winnerTeamId = winners.find(row => row.number === number)?.winnerTeamId || null;
  return { postId: text(post?.id) || null, createdUtc: Number(post?.created_utc || 0) || 0, score: scoreFromPost(post, teams), game, winners };
}

function mergeCommunityGame(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const byTeam = new Map((existing.teams || []).map(row => [text(row.teamId), row]));
  for (const row of incoming.teams || []) {
    const previous = byTeam.get(text(row.teamId)) || {};
    const prevBans = Array.isArray(previous.bans) ? previous.bans : [];
    const nextBans = Array.isArray(row.bans) ? row.bans : [];
    const stats = { ...(previous.stats || {}) };
    for (const [key, value] of Object.entries(row.stats || {})) if (value != null) stats[key] = value;
    byTeam.set(text(row.teamId), { ...previous, ...row, bans: nextBans.length >= prevBans.length ? nextBans : prevBans, banNames: nextBans.length >= prevBans.length ? row.banNames : previous.banNames, stats });
  }
  return { ...existing, ...incoming, winnerTeamId: incoming.winnerTeamId || existing.winnerTeamId || null, teams: [...byTeam.values()] };
}

export function parseCommunityPosts(posts = [], teams = [], championIndex = []) {
  const parsed = posts.map(post => parseCommunityPost(post, teams, championIndex)).filter(Boolean);
  if (!parsed.length) return null;
  const games = new Map();
  const winners = new Map();
  let bestScore = null;
  let newestPost = null;
  for (const row of parsed.sort((a, b) => a.createdUtc - b.createdUtc)) {
    if (!newestPost || row.createdUtc >= newestPost.createdUtc) newestPost = row;
    if (row.score && (!bestScore || row.score.total > bestScore.total || (row.score.total === bestScore.total && row.score.createdUtc >= bestScore.createdUtc))) bestScore = row.score;
    if (row.game?.number) games.set(row.game.number, mergeCommunityGame(games.get(row.game.number), row.game));
    for (const result of row.winners || []) if (result.number && result.winnerTeamId) winners.set(result.number, result.winnerTeamId);
  }
  for (const [number, winnerTeamId] of winners) games.set(number, mergeCommunityGame(games.get(number) || { number, teams: [] }, { number, winnerTeamId, teams: [] }));
  let scores = bestScore?.scores || null;
  if (!scores && winners.size) {
    scores = {};
    for (const winnerTeamId of winners.values()) scores[winnerTeamId] = (scores[winnerTeamId] || 0) + 1;
  }
  return { source: 'Reddit Post-Match archive (Arctic Shift)', postId: newestPost?.postId || null, scores, games: [...games.values()].sort((a, b) => a.number - b.number) };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'User-Agent': 'WebLienMinh/3.19 community-fallback', ...(options.headers || {}) }, signal: options.signal || AbortSignal.timeout(8_000) });
  if (!response.ok) return null;
  const raw = await response.text();
  if (!raw.trim()) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function championIndex() {
  if (!championIndexPromise) {
    championIndexPromise = (async () => {
      const versions = await fetchJson(DDRAGON_VERSIONS);
      const version = Array.isArray(versions) ? versions[0] : null;
      if (!version) return [];
      const body = await fetchJson(`https://ddragon.leagueoflegends.com/cdn/${encodeURIComponent(version)}/data/en_US/champion.json`);
      return buildChampionIndex(Object.values(body?.data || {}));
    })().catch(() => []);
  }
  return championIndexPromise;
}

function cacheKey(body) {
  return [text(body?.startTime).slice(0, 10), ...(body?.teams || []).map(team => text(team?.id || team?.code)).sort()].join(':');
}

async function fetchPostsForMatch(body) {
  const start = Date.parse(body?.startTime || '');
  if (!Number.isFinite(start)) return [];
  const after = Math.floor((start - 45 * 60_000) / 1000);
  const before = Math.floor((start + 7 * 60 * 60_000) / 1000);
  const base = `subreddit=leagueoflegends&after=${after}&before=${before}&limit=100`;
  const urls = [`${ARCTIC_SHIFT}?${base}&sort=desc`, `${ARCTIC_SHIFT}?${base}&sort=asc`];
  const responses = await Promise.all(urls.map(url => fetchJson(url).catch(() => null)));
  const byId = new Map();
  for (const response of responses) for (const post of response?.data || []) if (post?.id) byId.set(post.id, post);
  return [...byId.values()].filter(post => postHasTeams(post, body?.teams || []));
}

export async function loadCommunityMatchFallback(body) {
  if (!body?.ok || !Array.isArray(body.teams) || body.teams.length < 2 || !body.startTime) return null;
  const key = cacheKey(body);
  const ttl = stateIsCompleted(body.state) ? COMPLETED_CACHE_MS : LIVE_CACHE_MS;
  const cached = fallbackCache.get(key);
  if (cached && Date.now() - cached.at < ttl) return cached.value;
  const [posts, index] = await Promise.all([fetchPostsForMatch(body), championIndex()]);
  const value = parseCommunityPosts(posts, body.teams, index);
  fallbackCache.set(key, { at: Date.now(), value });
  return value;
}

export const __communityFallbackTest = { buildChampionIndex, parseChampionCell, parseCommunityPost, parseCommunityPosts };
