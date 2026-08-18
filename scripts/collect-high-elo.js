import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'data', 'matches');
const patchFile = path.join(root, 'data', 'riot', 'patch.json');

const rawKey = String(process.env.RIOT_API_KEY || '').trim();
const key = rawKey
  .replace(/^RIOT_API_KEY\s*=\s*/i, '')
  .replace(/^['"]|['"]$/g, '')
  .trim();
const platform = String(process.env.RIOT_PLATFORM || 'vn2').toLowerCase();
const region = String(process.env.RIOT_REGION || 'sea').toLowerCase();
const playerLimit = Math.max(1, Math.min(10, Number(process.env.HIGH_ELO_PLAYERS || 5)));
const matchesPerPlayer = Math.max(1, Math.min(20, Number(process.env.MATCHES_PER_PLAYER || 10)));
const requestDelayMs = Math.max(1200, Number(process.env.RIOT_REQUEST_DELAY_MS || 1300));

if (!key) throw new Error('Thiếu RIOT_API_KEY. Hãy thêm secret RIOT_API_KEY trên GitHub.');
if (!key.startsWith('RGAPI-')) {
  console.warn('RIOT_API_KEY không bắt đầu bằng RGAPI-. Hãy kiểm tra lại giá trị secret nếu Riot trả 401/403.');
}

let patchState = null;
try {
  patchState = JSON.parse(await fs.readFile(patchFile, 'utf8'));
} catch {
  throw new Error('Thiếu data/riot/patch.json. Hãy chạy npm run update:riot trước.');
}
const currentPatch = patchState.patch;

let lastRequestAt = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function riot(url, retry = 0) {
  const sinceLast = Date.now() - lastRequestAt;
  if (sinceLast < requestDelayMs) await sleep(requestDelayMs - sinceLast);
  lastRequestAt = Date.now();

  const response = await fetch(url, {
    headers: {
      'X-Riot-Token': key,
      'User-Agent': 'WebLienMinh/1.1 (+GitHub Actions)'
    }
  });

  if (response.status === 429 && retry < 4) {
    const retryAfter = Math.max(2, Number(response.headers.get('retry-after') || 2));
    console.log(`Riot rate limit. Chờ ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return riot(url, retry + 1);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
  }
  return response.json();
}

console.log(`Lấy Challenger ${platform.toUpperCase()} - patch ${currentPatch}`);
const league = await riot(
  `https://${platform}.api.riotgames.com/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5`
);

const entries = [...(league.entries || [])]
  .sort((a, b) => Number(b.leaguePoints || 0) - Number(a.leaguePoints || 0))
  .slice(0, playerLimit);

if (!entries.length) throw new Error('Riot không trả về danh sách Challenger cho VN2.');

const puuids = [];
for (const entry of entries) {
  if (entry.puuid) {
    puuids.push(entry.puuid);
    continue;
  }
  if (!entry.summonerId) continue;
  const summoner = await riot(
    `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/${encodeURIComponent(entry.summonerId)}`
  );
  if (summoner.puuid) puuids.push(summoner.puuid);
}

if (!puuids.length) throw new Error('Không lấy được PUUID từ danh sách Challenger.');

const matchIds = new Set();
for (const puuid of puuids) {
  const ids = await riot(
    `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?queue=420&start=0&count=${matchesPerPlayer}`
  );
  for (const id of ids) matchIds.add(id);
}

console.log(`Tìm thấy ${matchIds.size} match unique từ ${puuids.length} người chơi.`);

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

let saved = 0;
let skippedPatch = 0;
for (const matchId of matchIds) {
  const match = await riot(
    `https://${region}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`
  );

  if (match?.info?.queueId !== 420) continue;
  const gameVersion = String(match?.info?.gameVersion || '');
  if (currentPatch && !gameVersion.startsWith(`${currentPatch}.`)) {
    skippedPatch++;
    continue;
  }

  await fs.writeFile(
    path.join(outDir, `${matchId}.json`),
    JSON.stringify(match)
  );
  saved++;
  console.log(`[${saved}] ${matchId} | ${gameVersion}`);
}

console.log(`Hoàn tất: lưu ${saved} trận patch ${currentPatch}; bỏ qua ${skippedPatch} trận patch cũ.`);
if (!saved) {
  throw new Error(`Chưa lấy được trận Ranked Solo/Duo thuộc patch ${currentPatch}. Có thể patch vừa phát hành và Challenger chưa có đủ trận mới.`);
}
