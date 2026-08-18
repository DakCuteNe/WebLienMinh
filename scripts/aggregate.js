import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dir = path.join(root, 'data', 'matches');
const output = path.join(root, 'data', 'meta.json');
const patchFile = path.join(root, 'data', 'riot', 'patch.json');

const roleMap = {
  TOP: 'TOP',
  JUNGLE: 'JUNGLE',
  MIDDLE: 'MIDDLE',
  BOTTOM: 'BOTTOM',
  UTILITY: 'UTILITY'
};

let patchState = null;
try { patchState = JSON.parse(await fs.readFile(patchFile, 'utf8')); } catch {}
const currentPatch = patchState?.patch || null;

const stats = new Map();
const matchups = new Map();

function key(champ, role) { return `${champ}:${role}`; }
function ensure(champ, role) {
  const k = key(champ, role);
  if (!stats.has(k)) {
    stats.set(k, {
      id: champ,
      role,
      games: 0,
      wins: 0,
      picks: 0,
      counters: [],
      goodAgainst: []
    });
  }
  return stats.get(k);
}
function matchupKey(a, b, role) { return `${a}|${b}|${role}`; }

let files;
try {
  files = (await fs.readdir(dir)).filter(x => x.endsWith('.json'));
} catch {
  throw new Error('Chưa có data/matches. Hãy chạy collector trước.');
}
if (!files.length) throw new Error('data/matches đang trống.');

let validGames = 0;
for (const file of files) {
  const match = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
  const participants = match?.info?.participants || [];
  const gameVersion = String(match?.info?.gameVersion || '');

  if (match?.info?.queueId !== 420 || participants.length !== 10) continue;
  if (currentPatch && !gameVersion.startsWith(`${currentPatch}.`)) continue;
  validGames++;

  for (const participant of participants) {
    const role = roleMap[participant.teamPosition];
    if (!role || !participant.championName) continue;
    const stat = ensure(participant.championName, role);
    stat.games++;
    stat.picks++;
    if (participant.win) stat.wins++;
  }

  for (const player of participants) {
    const role = roleMap[player.teamPosition];
    if (!role) continue;
    const enemy = participants.find(
      candidate => candidate.teamId !== player.teamId && candidate.teamPosition === player.teamPosition
    );
    if (!enemy) continue;

    const mk = matchupKey(player.championName, enemy.championName, role);
    const matchup = matchups.get(mk) || { games: 0, wins: 0 };
    matchup.games++;
    if (player.win) matchup.wins++;
    matchups.set(mk, matchup);
  }
}

if (!validGames) {
  throw new Error(`Không có trận hợp lệ${currentPatch ? ` thuộc patch ${currentPatch}` : ''}.`);
}

function tierFor(winRate, pickRate, games) {
  if (games < 3) return 'C';
  const confidence = Math.min(3, Math.log10(games + 1) * 1.4);
  const score = winRate + Math.min(4, pickRate * 0.25) + confidence;
  if (score >= 55) return 'S';
  if (score >= 52) return 'A';
  if (score >= 49.5) return 'B';
  return 'C';
}

const champions = [];
for (const stat of stats.values()) {
  const winRate = stat.games ? (stat.wins / stat.games) * 100 : 0;
  const pickRate = validGames ? (stat.picks / validGames) * 100 : 0;

  const opponents = [];
  for (const [mk, matchup] of matchups) {
    const [champion, opponent, role] = mk.split('|');
    if (champion !== stat.id || role !== stat.role || matchup.games < 2) continue;
    opponents.push({
      id: opponent,
      games: matchup.games,
      winRate: (matchup.wins / matchup.games) * 100
    });
  }

  opponents.sort((a, b) => a.winRate - b.winRate);
  const counters = opponents.slice(0, 3).map(x => x.id);
  const goodAgainst = [...opponents]
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 3)
    .map(x => x.id);

  const tier = tierFor(winRate, pickRate, stat.games);
  let verdict = 'CÂN NHẮC';
  if (tier === 'S' || tier === 'A') verdict = 'NÊN CHƠI';
  if (tier === 'C') verdict = 'KHÔNG ƯU TIÊN';

  champions.push({
    id: stat.id,
    role: stat.role,
    tier,
    winRate: +winRate.toFixed(2),
    pickRate: +pickRate.toFixed(2),
    banRate: 0,
    games: stat.games,
    trend: 0,
    verdict,
    reason: `Tự động tổng hợp từ ${stat.games} lượt pick Challenger VN2 trong patch ${currentPatch || 'hiện tại'}.`,
    counters,
    goodAgainst
  });
}

const tierOrder = { S: 0, A: 1, B: 2, C: 3 };
champions.sort((a, b) =>
  tierOrder[a.tier] - tierOrder[b.tier] ||
  b.winRate - a.winRate ||
  b.games - a.games
);

const result = {
  patch: currentPatch || 'live-data',
  dataDragonVersion: patchState?.dataDragonVersion || null,
  mode: 'match-v5-vn2-challenger',
  generatedAt: new Date().toISOString(),
  sampleGames: validGames,
  notice: `Tổng hợp tự động từ ${validGames} trận Ranked Solo/Duo (queue 420) của nhóm Challenger VN2. Mẫu nhỏ có thể gây sai lệch; dữ liệu sẽ ổn định hơn khi tích lũy thêm trận.`,
  champions
};

await fs.writeFile(output, JSON.stringify(result, null, 2));
console.log(`Đã tạo ${output}: patch ${result.patch}, ${validGames} trận, ${champions.length} champion-role.`);
