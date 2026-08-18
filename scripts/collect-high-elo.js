import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'data', 'matches');
const tempDir = path.join(root, 'data', 'matches-global-tmp');
const patchFile = path.join(root, 'data', 'riot', 'patch.json');
const seedFile = path.join(root, 'data', 'high-elo-seeds.json');
const coverageFile = path.join(root, 'data', 'global-coverage.json');

const rawKey = String(process.env.RIOT_API_KEY || '').trim();
const key = rawKey.replace(/^RIOT_API_KEY\s*=\s*/i, '').replace(/^['"]|['"]$/g, '').trim();
const requestDelayMs = Math.max(1250, Number(process.env.RIOT_REQUEST_DELAY_MS || 1350));
const playersPerPlatform = Math.max(1, Math.min(4, Number(process.env.GLOBAL_PLAYERS_PER_PLATFORM || 2)));
const matchesPerPlayer = Math.max(2, Math.min(10, Number(process.env.GLOBAL_MATCHES_PER_PLAYER || 6)));
const minGlobalPlatforms = Math.max(2, Number(process.env.MIN_GLOBAL_PLATFORMS || 6));
const minGlobalMatches = Math.max(10, Number(process.env.MIN_GLOBAL_MATCHES || 40));

if (!key) throw new Error('Thiếu RIOT_API_KEY. Hãy thêm secret RIOT_API_KEY trên GitHub.');
if (!key.startsWith('RGAPI-')) console.warn('RIOT_API_KEY không bắt đầu bằng RGAPI-.');

const PLATFORMS = [
  { id: 'na1', label: 'North America', macro: 'AMERICAS', routes: ['americas'] },
  { id: 'br1', label: 'Brazil', macro: 'AMERICAS', routes: ['americas'] },
  { id: 'la1', label: 'Latin America North', macro: 'AMERICAS', routes: ['americas'] },
  { id: 'la2', label: 'Latin America South', macro: 'AMERICAS', routes: ['americas'] },
  { id: 'euw1', label: 'Europe West', macro: 'EUROPE', routes: ['europe'] },
  { id: 'eun1', label: 'Europe Nordic & East', macro: 'EUROPE', routes: ['europe'] },
  { id: 'tr1', label: 'Türkiye', macro: 'EUROPE', routes: ['europe'] },
  { id: 'ru', label: 'Russia', macro: 'EUROPE', routes: ['europe'] },
  { id: 'kr', label: 'Korea', macro: 'ASIA', routes: ['asia'] },
  { id: 'jp1', label: 'Japan', macro: 'ASIA', routes: ['asia'] },
  { id: 'vn2', label: 'Vietnam', macro: 'SEA', routes: ['sea'] },
  { id: 'ph2', label: 'Philippines', macro: 'SEA', routes: ['sea'] },
  { id: 'sg2', label: 'Singapore', macro: 'SEA', routes: ['sea'] },
  { id: 'th2', label: 'Thailand', macro: 'SEA', routes: ['sea'] },
  { id: 'tw2', label: 'Taiwan', macro: 'SEA', routes: ['sea'] },
  // OCE has moved between regional clusters historically. Try SEA first, then AMERICAS as a safe fallback.
  { id: 'oc1', label: 'Oceania', macro: 'SEA', routes: ['sea', 'americas'] }
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let lastRequestAt = 0;

class RiotHttpError extends Error {
  constructor(status, message, body = '') {
    super(`${status} ${message}: ${body.slice(0, 300)}`);
    this.status = status;
  }
}

async function riot(url, retry = 0) {
  const sinceLast = Date.now() - lastRequestAt;
  if (sinceLast < requestDelayMs) await sleep(requestDelayMs - sinceLast);
  lastRequestAt = Date.now();

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'X-Riot-Token': key,
        'User-Agent': 'WebLienMinh/3.0 global-high-elo (+GitHub Actions)'
      }
    });
  } catch (error) {
    if (retry < 5) {
      const wait = Math.min(30_000, 2500 * (retry + 1));
      console.log(`Riot network error: ${error.message}. Chờ ${wait / 1000}s...`);
      await sleep(wait);
      return riot(url, retry + 1);
    }
    throw error;
  }

  if (response.status === 429 && retry < 7) {
    const retryAfter = Math.max(2, Number(response.headers.get('retry-after') || 2));
    console.log(`Riot rate limit. Chờ ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return riot(url, retry + 1);
  }

  if ([500, 502, 503, 504].includes(response.status) && retry < 5) {
    const wait = Math.min(40_000, 4000 * (retry + 1));
    console.log(`Riot ${response.status} tạm thời. Chờ ${wait / 1000}s...`);
    await sleep(wait);
    return riot(url, retry + 1);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new RiotHttpError(response.status, response.statusText, body);
  }
  return response.json();
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

const patchState = await readJson(patchFile, null);
if (!patchState) throw new Error('Thiếu data/riot/patch.json. Hãy chạy npm run update:riot trước.');
const currentPatch = patchState.patch;
const previousSeeds = await readJson(seedFile, { platforms: {} });

function leagueEndpoint(platform, tier) {
  const name = tier === 'CHALLENGER' ? 'challengerleagues' : tier === 'GRANDMASTER' ? 'grandmasterleagues' : 'masterleagues';
  return `https://${platform}.api.riotgames.com/lol/league/v4/${name}/by-queue/RANKED_SOLO_5x5`;
}

async function getPlatformSeeds(platform) {
  const tiers = ['CHALLENGER', 'GRANDMASTER', 'MASTER'];
  for (const tier of tiers) {
    try {
      const league = await riot(leagueEndpoint(platform.id, tier));
      const entries = [...(league.entries || [])]
        .sort((a, b) => Number(b.leaguePoints || 0) - Number(a.leaguePoints || 0));
      if (!entries.length) continue;

      const seeds = [];
      for (const entry of entries) {
        if (seeds.length >= playersPerPlatform) break;
        if (entry.puuid) {
          seeds.push({ puuid: entry.puuid, tier });
          continue;
        }
        if (!entry.summonerId) continue;
        try {
          const summoner = await riot(`https://${platform.id}.api.riotgames.com/lol/summoner/v4/summoners/${encodeURIComponent(entry.summonerId)}`);
          if (summoner.puuid) seeds.push({ puuid: summoner.puuid, tier });
        } catch (error) {
          if ([401, 403].includes(error.status)) throw error;
          console.log(`[${platform.id}] bỏ qua summoner lỗi: ${error.message}`);
        }
      }
      if (seeds.length) return { seeds, tier, fromCache: false };
    } catch (error) {
      if ([401, 403].includes(error.status)) throw error;
      console.log(`[${platform.id}] ${tier} không dùng được: ${error.message}`);
    }
  }

  const cached = previousSeeds?.platforms?.[platform.id]?.seeds || [];
  if (cached.length) {
    console.log(`[${platform.id}] dùng ${cached.length} PUUID cache vì leaderboard đang lỗi.`);
    return { seeds: cached.slice(0, playersPerPlatform), tier: 'CACHED', fromCache: true };
  }
  return { seeds: [], tier: null, fromCache: false };
}

async function getMatchIdsForSeed(platform, seed) {
  let lastError = null;
  for (const route of platform.routes) {
    try {
      const ids = await riot(`https://${route}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(seed.puuid)}/ids?queue=420&start=0&count=${matchesPerPlayer}`);
      return { ids, route };
    } catch (error) {
      lastError = error;
      if ([401, 403].includes(error.status)) throw error;
      if (error.status !== 404) console.log(`[${platform.id}] Match-V5 route ${route} lỗi: ${error.message}`);
    }
  }
  if (lastError) console.log(`[${platform.id}] không lấy được match list: ${lastError.message}`);
  return { ids: [], route: platform.routes[0] };
}

console.log(`GLOBAL HIGH-ELO • patch ${currentPatch} • ${PLATFORMS.length} platforms • ${playersPerPlatform} seed/platform • ${matchesPerPlayer} match/seed`);

const matchSources = new Map();
const platformStatus = [];
const nextSeedCache = { generatedAt: new Date().toISOString(), patch: currentPatch, scope: 'GLOBAL', platforms: {} };

for (const platform of PLATFORMS) {
  console.log(`\n=== ${platform.id.toUpperCase()} • ${platform.label} ===`);
  try {
    const seedResult = await getPlatformSeeds(platform);
    if (!seedResult.seeds.length) {
      platformStatus.push({ platform: platform.id, label: platform.label, macro: platform.macro, ok: false, reason: 'no-seeds', matchesDiscovered: 0 });
      continue;
    }

    nextSeedCache.platforms[platform.id] = {
      label: platform.label,
      macro: platform.macro,
      tier: seedResult.tier,
      seeds: seedResult.seeds
    };

    let discovered = 0;
    for (const seed of seedResult.seeds) {
      const { ids, route } = await getMatchIdsForSeed(platform, seed);
      discovered += ids.length;
      for (const id of ids) {
        if (!matchSources.has(id)) {
          matchSources.set(id, {
            platform: platform.id,
            label: platform.label,
            macro: platform.macro,
            route,
            tier: seed.tier || seedResult.tier
          });
        }
      }
    }
    platformStatus.push({
      platform: platform.id,
      label: platform.label,
      macro: platform.macro,
      ok: discovered > 0,
      seedTier: seedResult.tier,
      fromCache: seedResult.fromCache,
      seeds: seedResult.seeds.length,
      matchesDiscovered: discovered
    });
  } catch (error) {
    if ([401, 403].includes(error.status)) throw error;
    platformStatus.push({ platform: platform.id, label: platform.label, macro: platform.macro, ok: false, reason: error.message, matchesDiscovered: 0 });
  }
}

console.log(`\nTìm thấy ${matchSources.size} match unique toàn cầu.`);
await fs.rm(tempDir, { recursive: true, force: true });
await fs.mkdir(tempDir, { recursive: true });

let saved = 0;
let skippedPatch = 0;
let failedMatches = 0;
const savedByPlatform = new Map();
const savedByMacro = new Map();

for (const [matchId, source] of matchSources) {
  try {
    const match = await riot(`https://${source.route}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`);
    if (match?.info?.queueId !== 420) continue;
    const gameVersion = String(match?.info?.gameVersion || '');
    if (currentPatch && !gameVersion.startsWith(`${currentPatch}.`)) {
      skippedPatch++;
      continue;
    }

    match._webLienMinh = {
      scope: 'GLOBAL',
      sourcePlatform: source.platform,
      sourceLabel: source.label,
      macroRegion: source.macro,
      regionalRoute: source.route,
      seedTier: source.tier
    };

    await fs.writeFile(path.join(tempDir, `${matchId}.json`), JSON.stringify(match));
    saved++;
    savedByPlatform.set(source.platform, (savedByPlatform.get(source.platform) || 0) + 1);
    savedByMacro.set(source.macro, (savedByMacro.get(source.macro) || 0) + 1);
    console.log(`[${saved}] ${source.platform.toUpperCase()} • ${matchId} • ${gameVersion}`);
  } catch (error) {
    if ([401, 403].includes(error.status)) throw error;
    failedMatches++;
    console.log(`Bỏ qua ${matchId}: ${error.message}`);
  }
}

const successfulPlatforms = [...savedByPlatform.keys()];
const successfulMacros = [...savedByMacro.keys()];

const coverage = {
  generatedAt: new Date().toISOString(),
  patch: currentPatch,
  scope: 'GLOBAL',
  mode: 'global-high-elo-ranked-solo',
  queueId: 420,
  attemptedPlatforms: PLATFORMS.map(x => x.id),
  successfulPlatforms,
  platformCount: successfulPlatforms.length,
  macroRegions: successfulMacros,
  macroRegionCount: successfulMacros.length,
  matchesSaved: saved,
  matchesDiscovered: matchSources.size,
  skippedOldPatch: skippedPatch,
  failedMatches,
  settings: { playersPerPlatform, matchesPerPlayer, minGlobalPlatforms, minGlobalMatches },
  matchesByPlatform: Object.fromEntries([...savedByPlatform.entries()].sort()),
  matchesByMacroRegion: Object.fromEntries([...savedByMacro.entries()].sort()),
  platforms: platformStatus
};

if (saved < minGlobalMatches || successfulPlatforms.length < minGlobalPlatforms) {
  await fs.writeFile(coverageFile, JSON.stringify({ ...coverage, accepted: false }, null, 2));
  await fs.rm(tempDir, { recursive: true, force: true });
  throw new Error(`Global dataset chưa đủ độ phủ: ${saved}/${minGlobalMatches} trận, ${successfulPlatforms.length}/${minGlobalPlatforms} platforms. Giữ nguyên meta cũ.`);
}

await fs.rm(outDir, { recursive: true, force: true });
await fs.rename(tempDir, outDir);
await fs.writeFile(seedFile, JSON.stringify(nextSeedCache, null, 2));
await fs.writeFile(coverageFile, JSON.stringify({ ...coverage, accepted: true }, null, 2));

console.log(`\nGLOBAL DATASET OK: ${saved} trận • ${successfulPlatforms.length}/${PLATFORMS.length} platforms • ${successfulMacros.length}/4 macro regions.`);
console.log(`Theo platform: ${JSON.stringify(Object.fromEntries(savedByPlatform))}`);
