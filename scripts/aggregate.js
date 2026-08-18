import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dir = path.join(root, 'data', 'matches');
const output = path.join(root, 'data', 'meta.json');

const roleMap = {
  TOP: 'TOP', JUNGLE: 'JUNGLE', MIDDLE: 'MIDDLE', BOTTOM: 'BOTTOM', UTILITY: 'UTILITY'
};
const stats = new Map();
const matchups = new Map();

function key(champ, role) { return `${champ}:${role}`; }
function ensure(champ, role) {
  const k = key(champ, role);
  if (!stats.has(k)) stats.set(k, { id: champ, role, games: 0, wins: 0, picks: 0, bans: 0, counters: [], goodAgainst: [] });
  return stats.get(k);
}
function matchupKey(a, b, role) { return `${a}|${b}|${role}`; }

let files;
try { files = (await fs.readdir(dir)).filter(x => x.endsWith('.json')); }
catch { throw new Error('Chưa có data/matches. Hãy chạy npm run collect trước.'); }
if (!files.length) throw new Error('data/matches đang trống.');

let validGames = 0;
for (const file of files) {
  const match = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
  const p = match?.info?.participants || [];
  if (match?.info?.queueId !== 420 || p.length !== 10) continue;
  validGames++;

  for (const x of p) {
    const role = roleMap[x.teamPosition];
    if (!role || !x.championName) continue;
    const s = ensure(x.championName, role);
    s.games++; s.picks++; if (x.win) s.wins++;
  }

  for (const a of p) {
    const role = roleMap[a.teamPosition];
    if (!role) continue;
    const enemy = p.find(b => b.teamId !== a.teamId && b.teamPosition === a.teamPosition);
    if (!enemy) continue;
    const mk = matchupKey(a.championName, enemy.championName, role);
    const m = matchups.get(mk) || { games: 0, wins: 0 };
    m.games++; if (a.win) m.wins++;
    matchups.set(mk, m);
  }
}

const totalPicksByRole = {};
for (const s of stats.values()) totalPicksByRole[s.role] = (totalPicksByRole[s.role] || 0) + s.picks;

function tierFor(winRate, pickRate, games) {
  if (games < 3) return 'C';
  const score = winRate + Math.min(4, pickRate * 0.25);
  if (score >= 54) return 'S';
  if (score >= 51.5) return 'A';
  if (score >= 49.5) return 'B';
  return 'C';
}

const champions = [];
for (const s of stats.values()) {
  const winRate = s.games ? (s.wins / s.games) * 100 : 0;
  const pickRate = totalPicksByRole[s.role] ? (s.picks / totalPicksByRole[s.role]) * 100 : 0;
  const opponents = [];
  for (const [mk, m] of matchups) {
    const [a, b, role] = mk.split('|');
    if (a !== s.id || role !== s.role || m.games < 2) continue;
    opponents.push({ id: b, games: m.games, winRate: (m.wins / m.games) * 100 });
  }
  opponents.sort((a,b) => a.winRate - b.winRate);
  const counters = opponents.slice(0, 3).map(x => x.id);
  const goodAgainst = [...opponents].sort((a,b) => b.winRate - a.winRate).slice(0, 3).map(x => x.id);
  const tier = tierFor(winRate, pickRate, s.games);
  champions.push({
    id: s.id, role: s.role, tier,
    winRate: +winRate.toFixed(2), pickRate: +pickRate.toFixed(2), banRate: 0,
    games: s.games, trend: 0,
    verdict: tier === 'S' || tier === 'A' ? 'NÊN CHƠI' : tier === 'C' ? 'KHÔNG ƯU TIÊN' : 'CÂN NHẮC',
    reason: `Tự động tổng hợp từ ${s.games} lượt pick trong dataset hiện tại.`,
    counters, goodAgainst
  });
}

champions.sort((a,b) => b.winRate - a.winRate);
const result = {
  patch: 'live-data', mode: 'match-v5', generatedAt: new Date().toISOString(),
  notice: `Tổng hợp từ ${validGames} trận Ranked Solo/Duo (queue 420). Mẫu nhỏ có thể gây sai lệch; nên thu thập nhiều người chơi cùng mức rank.`,
  champions
};
await fs.writeFile(output, JSON.stringify(result, null, 2));
console.log(`Đã tạo ${output} từ ${validGames} trận, ${champions.length} champion-role.`);
