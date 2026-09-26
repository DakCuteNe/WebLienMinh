import { buildChampionIndex, parseCommunityPosts } from './esports-match-community-fallback.js';
import { applyCommunityOverlay } from './esports-match-community-overlay.js';

const ARCTIC_SHIFT = 'https://arctic-shift.photon-reddit.com/api/posts/search';
const DDRAGON_VERSIONS = 'https://ddragon.leagueoflegends.com/api/versions.json';
const MATCH_CACHE_MS = 3 * 60_000;
const LIVE_CACHE_MS = 20_000;

const cache = new Map();
let championIndexPromise = null;

const text = value => String(value ?? '').trim();
const lower = value => text(value).toLowerCase();
const compact = value => lower(value).normalize('NFKD').replace(/[^a-z0-9]+/g, '');

function stateIsCompleted(value) {
  const state = lower(value);
  return state.includes('complete') || state.includes('finished');
}

function stripHeading(value) {
  return text(value).replace(/^\s*#{1,6}\s*/, '').replace(/[*_`~]/g, '').trim();
}

function sectionMarkers(lines = []) {
  const markers = [];
  for (let index = 0; index < lines.length; index += 1) {
    const clean = stripHeading(lines[index]);
    const match = clean.match(/^(?:GAME|MATCH)\s*(\d+)\s*(?::|DISCUSSION|\b)/i);
    const number = Number(match?.[1] || 0);
    if (number > 0) markers.push({ number, index });
  }
  return markers;
}

export function expandPostMatchSections(posts = []) {
  const expanded = [];
  for (const post of posts || []) {
    if (!post) continue;
    expanded.push(post);
    const lines = text(post.selftext).split(/\r?\n/);
    const markers = sectionMarkers(lines);
    if (markers.length <= 1) continue;
    for (let position = 0; position < markers.length; position += 1) {
      const marker = markers[position];
      const end = markers[position + 1]?.index ?? lines.length;
      const section = lines.slice(marker.index, end).join('\n').trim();
      if (!section) continue;
      expanded.push({
        ...post,
        id: `${text(post.id) || 'post'}:game-${marker.number}`,
        title: `${text(post.title)} / Game ${marker.number} Discussion`,
        selftext: section
      });
    }
  }
  return expanded;
}

function teamNeedles(body) {
  return (body?.teams || []).map(team => [team?.code, team?.name]
    .map(compact)
    .filter(value => value.length >= 2));
}

function postMatchesTeams(post, body) {
  const hay = compact(`${post?.title || ''} ${post?.selftext || ''}`);
  return teamNeedles(body).every(aliases => aliases.some(alias => hay.includes(alias)));
}

async function fetchJson(url, timeout = 8_000) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'WebLienMinh/3.21 multi-game-postmatch' },
    signal: AbortSignal.timeout(timeout)
  });
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

function matchKey(body) {
  return text(body?.matchId) || [
    text(body?.startTime).slice(0, 16),
    ...(body?.teams || []).map(team => text(team?.id || team?.code || team?.name)).sort()
  ].filter(Boolean).join(':');
}

function searchWindows(body) {
  const start = Date.parse(body?.startTime || '');
  if (!Number.isFinite(start)) return [];
  return [
    { after: start - 45 * 60_000, before: start + 7 * 60 * 60_000, sort: 'desc' },
    { after: start - 20 * 60_000, before: start + 7 * 60 * 60_000, sort: 'asc' }
  ];
}

async function fetchPosts(body) {
  const windows = searchWindows(body);
  const responses = await Promise.all(windows.map(async window => {
    const query = new URLSearchParams({
      subreddit: 'leagueoflegends',
      after: String(Math.floor(window.after / 1000)),
      before: String(Math.floor(window.before / 1000)),
      limit: '100',
      sort: window.sort
    });
    return fetchJson(`${ARCTIC_SHIFT}?${query}`).catch(() => null);
  }));
  const byId = new Map();
  for (const response of responses) {
    for (const post of response?.data || []) {
      if (post?.id && postMatchesTeams(post, body)) byId.set(String(post.id), post);
    }
  }
  return [...byId.values()];
}

async function loadMultiGameFallback(body) {
  if (!body?.ok || !body.startTime || !Array.isArray(body.teams) || body.teams.length < 2) return null;
  const key = matchKey(body);
  if (!key) return null;
  const ttl = stateIsCompleted(body.state) ? MATCH_CACHE_MS : LIVE_CACHE_MS;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < ttl) return cached.value;
  const [posts, index] = await Promise.all([fetchPosts(body), championIndex()]);
  const value = parseCommunityPosts(expandPostMatchSections(posts), body.teams, index);
  cache.set(key, { at: Date.now(), value });
  return value;
}

function liveRows(body) {
  if (Array.isArray(body?.live?.teams) && body.live.teams.length >= 2) return body.live.teams.slice(0, 2);
  return [body?.live?.blue, body?.live?.red].filter(Boolean).slice(0, 2);
}

function needsMultiGameFallback(body) {
  if (!body?.ok || !body?.live) return false;
  const rows = liveRows(body);
  if (rows.length < 2) return true;
  const banCount = rows.reduce((sum, row) => sum + (Array.isArray(row?.bans) ? row.bans.length : 0), 0);
  const missingGrubs = rows.some(row => row?.stats?.voidGrubs == null);
  const missingHerald = rows.some(row => row?.stats?.riftHeralds == null);
  return banCount < 10 || missingGrubs || missingHerald;
}

async function enrich(body) {
  if (!needsMultiGameFallback(body)) return body;
  const fallback = await loadMultiGameFallback(body).catch(() => null);
  return fallback ? applyCommunityOverlay(body, fallback) : body;
}

export function installEsportsMatchMultiGameCommunityOverlay(app) {
  app.use('/api/esports/match-live', (req, res, next) => {
    const previousJson = res.json.bind(res);
    res.json = body => {
      void enrich(body).catch(() => body).then(value => previousJson(value));
      return res;
    };
    next();
  });
}

export const __multiGameCommunityTest = { expandPostMatchSections };
