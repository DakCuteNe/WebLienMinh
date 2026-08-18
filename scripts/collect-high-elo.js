import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'data', 'matches');
const patchFile = path.join(root, 'data', 'riot', 'patch.json');
const seedFile = path.join(root, 'data', 'high-elo-seeds.json');

const rawKey = String(process.env.RIOT_API_KEY || '').trim();
const key = rawKey.replace(/^RIOT_API_KEY\s*=\s*/i, '').replace(/^['"]|['"]$/g, '').trim();
const platform = String(process.env.RIOT_PLATFORM || 'vn2').toLowerCase();
const region = String(process.env.RIOT_REGION || 'sea').toLowerCase();
const playerLimit = Math.max(1, Math.min(20, Number(process.env.HIGH_ELO_PLAYERS || 10)));
const matchesPerPlayer = Math.max(1, Math.min(30, Number(process.env.MATCHES_PER_PLAYER || 20)));
const requestDelayMs = Math.max(1200, Number(process.env.RIOT_REQUEST_DELAY_MS || 1350));

if (!key) throw new Error('Thiếu RIOT_API_KEY. Hãy thêm secret RIOT_API_KEY trên GitHub.');
if (!key.startsWith('RGAPI-')) console.warn('RIOT_API_KEY không bắt đầu bằng RGAPI-.');

let patchState;
try { patchState = JSON.parse(await fs.readFile(patchFile, 'utf8')); }
catch { throw new Error('Thiếu data/riot/patch.json. Hãy chạy npm run update:riot trước.'); }
const currentPatch = patchState.patch;

let lastRequestAt = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function riot(url, retry = 0) {
  const sinceLast = Date.now() - lastRequestAt;
  if (sinceLast < requestDelayMs) await sleep(requestDelayMs - sinceLast);
  lastRequestAt = Date.now();

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'X-Riot-Token': key,
        'User-Agent': 'WebLienMinh/2.1 (+GitHub Actions)'
      }
    });
  } catch (error) {
    if (retry < 7) {
      const wait = Math.min(60_000, 4_000 * (retry + 1));
      console.log(`Riot network error: ${error.message}. Chờ ${Math.ceil(wait / 1000)}s...`);
      await sleep(wait);
      return riot(url, retry + 1);
    }
    throw error;
  }

  if (response.status === 429 && retry < 8) {
    const retryAfter = Math.max(3, Number(response.headers.get('retry-after') || 3));
    console.log(`Riot rate limit. Chờ ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return riot(url, retry + 1);
  }

  if ([500, 502, 503, 504].includes(response.status) && retry < 8) {
    const wait = Math.min(75_000, 6_000 * (retry + 1));
    console.log(`Riot ${response.status} tạm thời. Chờ ${Math.ceil(wait / 1000)}s rồi thử lại (${retry + 1}/8)...`);
    await sleep(wait);
    return riot(url, retry + 1);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
  }
  return response.json();
}

async function loadCachedSeeds() {
  try {
    const saved = JSON.parse(await fs.readFile(seedFile, 'utf8'));
    const puuids = Array.isArray(saved.puuids) ? saved.puuids.filter(Boolean) : [];
    if (puuids.length) {
      console.log(`Dùng ${puuids.length} PUUID seed đã cache từ ${saved.updatedAt || 'lần chạy trước'}.`);
      return puuids.slice(0, playerLimit);
    }
  } catch {}
  return [];
}

async function getLeagueEntries() {
  const tiers = [
    ['Challenger', 'challengerleagues'],
    ['Grandmaster', 'grandmasterleagues'],
    ['Master', 'masterleagues']
  ];
  const errors = [];
  for (const [label, endpoint] of tiers) {
    try {
      console.log(`Thử seed từ ${label} ${platform.toUpperCase()}...`);
      const league = await riot(`https://${platform}.api.riotgames.com/lol/league/v4/${endpoint}/by-queue/RANKED_SOLO_5x5`);
      const entries = [...(league.entries || [])]
        .sort((a, b) => Number(b.leaguePoints || 0) - Number(a.leaguePoints || 0));
      if (entries.length) {
        console.log(`Seed source: ${label} (${entries.length} entries).`);
        return { label, entries };
      }
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
      console.log(`${label} lỗi, chuyển tier tiếp theo: ${error.message}`);
    }
  }
  console.warn('Không lấy được league live: ' + errors.join(' | '));
  return null;
}

async function resolvePuuids() {
  const leagueResult = await getLeagueEntries();
  if (!leagueResult) {
    const cached = await loadCachedSeeds();
    if (cached.length) return cached;
    throw new Error('Riot League API đang lỗi và chưa có high-elo seed cache để fallback.');
  }

  const puuids = [];
  for (const entry of leagueResult.entries) {
    if (puuids.length >= playerLimit) break;
    if (entry.puuid) {
      puuids.push(entry.puuid);
      continue;
    }
    if (!entry.summonerId) continue;
    try {
      const summoner = await riot(`https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/${encodeURIComponent(entry.summonerId)}`);
      if (summoner.puuid) puuids.push(summoner.puuid);
    } catch (error) {
      console.log(`Bỏ qua một summoner seed bị lỗi: ${error.message}`);
    }
  }

  if (!puuids.length) {
    const cached = await loadCachedSeeds();
    if (cached.length) return cached;
    throw new Error('Không lấy được PUUID từ ranked league và chưa có seed cache.');
  }

  await fs.writeFile(seedFile, JSON.stringify({
    updatedAt: new Date().toISOString(),
    platform,
    sourceTier: leagueResult.label,
    puuids
  }, null, 2));
  console.log(`Đã cache ${puuids.length} PUUID high-elo.`);
  return puuids;
}

console.log(`Thu thập high-elo ${platform.toUpperCase()} - patch ${currentPatch}`);
const puuids = await resolvePuuids();

const matchIds = new Set();
for (const puuid of puuids) {
  try {
    const ids = await riot(`https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?queue=420&start=0&count=${matchesPerPlayer}`);
    for (const id of ids || []) matchIds.add(id);
  } catch (error) {
    console.log(`Không lấy được match list của một seed: ${error.message}`);
  }
}
if (!matchIds.size) throw new Error('Không lấy được match ID nào từ Match-V5; giữ nguyên meta hiện tại.');
console.log(`Tìm thấy ${matchIds.size} match unique từ ${puuids.length} seed.`);

const tempDir = path.join(root, 'data', 'matches-next');
await fs.rm(tempDir, { recursive: true, force: true });
await fs.mkdir(tempDir, { recursive: true });

let saved = 0;
let skippedPatch = 0;
let failedMatches = 0;
for (const matchId of matchIds) {
  try {
    const match = await riot(`https://${region}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`);
    if (match?.info?.queueId !== 420) continue;
    const gameVersion = String(match?.info?.gameVersion || '');
    if (currentPatch && !gameVersion.startsWith(`${currentPatch}.`)) {
      skippedPatch++;
      continue;
    }
    await fs.writeFile(path.join(tempDir, `${matchId}.json`), JSON.stringify(match));
    saved++;
    console.log(`[${saved}] ${matchId} | ${gameVersion}`);
  } catch (error) {
    failedMatches++;
    console.log(`Bỏ qua match ${matchId}: ${error.message}`);
  }
}

if (!saved) {
  await fs.rm(tempDir, { recursive: true, force: true });
  throw new Error(`Không lấy được trận patch ${currentPatch}; giữ nguyên meta hiện tại. skippedPatch=${skippedPatch}, failed=${failedMatches}`);
}

await fs.rm(outDir, { recursive: true, force: true });
await fs.rename(tempDir, outDir);
console.log(`Hoàn tất: lưu ${saved} trận patch ${currentPatch}; bỏ qua ${skippedPatch} patch cũ; ${failedMatches} match lỗi.`);
