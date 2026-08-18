import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dir = path.join(root, 'data', 'matches');
const output = path.join(root, 'data', 'meta.json');
const riotDir = path.join(root, 'data', 'riot');

const roleMap = {
  TOP: 'TOP',
  JUNGLE: 'JUNGLE',
  MIDDLE: 'MIDDLE',
  BOTTOM: 'BOTTOM',
  UTILITY: 'UTILITY'
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const round = (n, digits = 2) => +Number(n || 0).toFixed(digits);
const inc = (map, k, amount = 1) => map.set(k, (map.get(k) || 0) + amount);

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

const patchState = await readJson(path.join(riotDir, 'patch.json'), {});
const currentPatch = patchState?.patch || null;
const previousMeta = await readJson(output, { champions: [] });
const previousByKey = new Map((previousMeta?.champions || []).map(x => [`${x.id}:${x.role}`, x]));

const championStatic = await readJson(path.join(riotDir, 'champions.json'), { data: {} });
const itemStatic = await readJson(path.join(riotDir, 'items.json'), { data: {} });
const runeStatic = await readJson(path.join(riotDir, 'runes.json'), []);
const spellStatic = await readJson(path.join(riotDir, 'summoner-spells.json'), { data: {} });

const championIdByNumeric = new Map(
  Object.values(championStatic?.data || {}).map(c => [Number(c.key), c.id])
);
const itemData = itemStatic?.data || {};

const runeById = new Map();
for (const tree of runeStatic || []) {
  runeById.set(Number(tree.id), { id: Number(tree.id), name: tree.name, icon: tree.icon, tree: true });
  for (const slot of tree.slots || []) {
    for (const rune of slot.runes || []) runeById.set(Number(rune.id), { ...rune, treeName: tree.name });
  }
}
const spellById = new Map(
  Object.values(spellStatic?.data || {}).map(s => [Number(s.key), s])
);

function isUsefulItem(id) {
  const item = itemData[String(id)];
  if (!item) return false;
  const tags = item.tags || [];
  if (tags.includes('Consumable') || tags.includes('Trinket')) return false;
  return Number(item.gold?.total || 0) >= 900;
}

function isCoreItem(id) {
  const item = itemData[String(id)];
  if (!item || !isUsefulItem(id)) return false;
  const tags = item.tags || [];
  if (tags.includes('Boots')) return false;
  return Number(item.gold?.total || 0) >= 1800;
}

function bayesRate(wins, games, prior = 0.5, strength = 12) {
  return games ? ((wins + prior * strength) / (games + strength)) * 100 : prior * 100;
}

function confidenceLabel(games) {
  if (games >= 12) return 'CAO';
  if (games >= 6) return 'VỪA';
  return 'THẤP';
}

const stats = new Map();
const matchups = new Map();
const globalBans = new Map();

function statKey(champ, role) { return `${champ}:${role}`; }
function matchupKey(a, b, role) { return `${a}|${b}|${role}`; }

function ensure(champ, role) {
  const k = statKey(champ, role);
  if (!stats.has(k)) {
    stats.set(k, {
      id: champ,
      role,
      games: 0,
      wins: 0,
      picks: 0,
      itemCounts: new Map(),
      coreBuildCounts: new Map(),
      runePages: new Map(),
      spellCombos: new Map()
    });
  }
  return stats.get(k);
}

let files;
try { files = (await fs.readdir(dir)).filter(x => x.endsWith('.json')); }
catch { throw new Error('Chưa có data/matches. Hãy chạy collector trước.'); }
if (!files.length) throw new Error('data/matches đang trống.');

let validGames = 0;
for (const file of files) {
  const match = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
  const participants = match?.info?.participants || [];
  const gameVersion = String(match?.info?.gameVersion || '');
  if (match?.info?.queueId !== 420 || participants.length !== 10) continue;
  if (currentPatch && !gameVersion.startsWith(`${currentPatch}.`)) continue;
  validGames++;

  for (const team of match?.info?.teams || []) {
    for (const ban of team?.bans || []) {
      const champion = championIdByNumeric.get(Number(ban.championId));
      if (champion) inc(globalBans, champion);
    }
  }

  for (const p of participants) {
    const role = roleMap[p.teamPosition];
    if (!role || !p.championName) continue;
    const s = ensure(p.championName, role);
    s.games++;
    s.picks++;
    if (p.win) s.wins++;

    const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5]
      .map(Number)
      .filter(id => id > 0 && isUsefulItem(id));
    for (const id of new Set(items)) inc(s.itemCounts, id);

    const core = items.filter(isCoreItem).slice(0, 4);
    if (core.length >= 2) {
      const buildKey = [...core].sort((a, b) => a - b).join('+');
      const current = s.coreBuildCounts.get(buildKey) || { count: 0, wins: 0, items: core };
      current.count++;
      if (p.win) current.wins++;
      s.coreBuildCounts.set(buildKey, current);
    }

    const styles = p.perks?.styles || [];
    const primary = styles.find(x => x.description === 'primaryStyle') || styles[0];
    const secondary = styles.find(x => x.description === 'subStyle') || styles[1];
    if (primary) {
      const page = {
        primaryStyle: Number(primary.style),
        secondaryStyle: Number(secondary?.style || 0),
        perks: [
          ...(primary.selections || []).map(x => Number(x.perk)),
          ...(secondary?.selections || []).map(x => Number(x.perk))
        ].filter(Boolean)
      };
      const pageKey = `${page.primaryStyle}|${page.secondaryStyle}|${page.perks.join(',')}`;
      const current = s.runePages.get(pageKey) || { ...page, count: 0, wins: 0 };
      current.count++;
      if (p.win) current.wins++;
      s.runePages.set(pageKey, current);
    }

    const spells = [Number(p.summoner1Id), Number(p.summoner2Id)].filter(Boolean);
    if (spells.length === 2) {
      const spellKey = [...spells].sort((a, b) => a - b).join('+');
      const current = s.spellCombos.get(spellKey) || { ids: spells, count: 0, wins: 0 };
      current.count++;
      if (p.win) current.wins++;
      s.spellCombos.set(spellKey, current);
    }
  }

  for (const player of participants) {
    const role = roleMap[player.teamPosition];
    if (!role) continue;
    const enemy = participants.find(x => x.teamId !== player.teamId && x.teamPosition === player.teamPosition);
    if (!enemy) continue;
    const mk = matchupKey(player.championName, enemy.championName, role);
    const m = matchups.get(mk) || { games: 0, wins: 0 };
    m.games++;
    if (player.win) m.wins++;
    matchups.set(mk, m);
  }
}

if (!validGames) throw new Error(`Không có trận hợp lệ${currentPatch ? ` thuộc patch ${currentPatch}` : ''}.`);

const rows = [];
for (const s of stats.values()) {
  const winRate = (s.wins / s.games) * 100;
  const adjustedWinRate = bayesRate(s.wins, s.games, 0.5, 20);
  const pickRate = (s.picks / validGames) * 100;
  const banRate = ((globalBans.get(s.id) || 0) / validGames) * 100;

  const opponentRows = [];
  for (const [mk, m] of matchups) {
    const [champion, opponent, role] = mk.split('|');
    if (champion !== s.id || role !== s.role || m.games < 2) continue;
    const smoothed = bayesRate(m.wins, m.games, 0.5, 8);
    const confidence = 1 - Math.exp(-m.games / 8);
    const delta = smoothed - adjustedWinRate;
    opponentRows.push({
      id: opponent,
      games: m.games,
      winRate: round((m.wins / m.games) * 100),
      adjustedWinRate: round(smoothed),
      delta: round(delta),
      confidence: round(confidence * 100, 1),
      confidenceLabel: confidenceLabel(m.games),
      score: round(Math.abs(delta) * confidence)
    });
  }

  const bad = opponentRows.filter(x => x.delta < 0).sort((a, b) => b.score - a.score || b.games - a.games).slice(0, 5);
  const good = opponentRows.filter(x => x.delta > 0).sort((a, b) => b.score - a.score || b.games - a.games).slice(0, 5);
  const matchupEdge = opponentRows.length
    ? opponentRows.reduce((sum, x) => sum + x.delta * (x.confidence / 100), 0) / opponentRows.reduce((sum, x) => sum + (x.confidence / 100), 0)
    : 0;

  const items = [...s.itemCounts.entries()]
    .map(([id, count]) => ({ id: Number(id), games: count, rate: round((count / s.games) * 100) }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 8);

  const coreBuilds = [...s.coreBuildCounts.values()]
    .map(x => ({
      items: x.items,
      games: x.count,
      rate: round((x.count / s.games) * 100),
      winRate: round((x.wins / x.count) * 100)
    }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate)
    .slice(0, 4);

  const runes = [...s.runePages.values()]
    .map(x => ({
      primaryStyle: x.primaryStyle,
      secondaryStyle: x.secondaryStyle,
      perks: x.perks,
      games: x.count,
      rate: round((x.count / s.games) * 100),
      winRate: round((x.wins / x.count) * 100)
    }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 3);

  const spells = [...s.spellCombos.values()]
    .map(x => ({
      ids: x.ids,
      games: x.count,
      rate: round((x.count / s.games) * 100),
      winRate: round((x.wins / x.count) * 100)
    }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 3);

  rows.push({
    id: s.id,
    role: s.role,
    games: s.games,
    wins: s.wins,
    winRate: round(winRate),
    adjustedWinRate: round(adjustedWinRate),
    pickRate: round(pickRate),
    banRate: round(banRate),
    presenceRate: round(pickRate + banRate),
    matchupEdge: round(matchupEdge),
    items,
    coreBuilds,
    runes,
    spells,
    counters: bad.map(x => x.id),
    goodAgainst: good.map(x => x.id),
    counterMatchups: bad,
    goodMatchups: good
  });
}

const roleGroups = new Map();
for (const row of rows) {
  if (!roleGroups.has(row.role)) roleGroups.set(row.role, []);
  roleGroups.get(row.role).push(row);
}

for (const group of roleGroups.values()) {
  const presenceValues = group.map(x => x.presenceRate);
  const mean = presenceValues.reduce((a, b) => a + b, 0) / Math.max(1, presenceValues.length);
  const variance = presenceValues.reduce((sum, x) => sum + (x - mean) ** 2, 0) / Math.max(1, presenceValues.length);
  const sd = Math.sqrt(variance) || 1;

  for (const row of group) {
    const presenceZ = clamp((row.presenceRate - mean) / sd, -2.5, 2.5);
    const confidence = clamp(row.games / 20, 0.12, 1);
    const raw = 50
      + (row.adjustedWinRate - 50) * 5
      + presenceZ * 5.5
      + clamp(row.matchupEdge, -5, 5) * 1.1;
    const tierScore = clamp(50 + (raw - 50) * confidence, 0, 100);

    row.tierScore = round(tierScore, 1);
    row.tierScoreComponents = {
      adjustedWinRate: row.adjustedWinRate,
      presenceZ: round(presenceZ),
      matchupEdge: row.matchupEdge,
      sampleConfidence: round(confidence * 100, 1)
    };

    row.tier = tierScore >= 64 ? 'S' : tierScore >= 56 ? 'A' : tierScore >= 49 ? 'B' : tierScore >= 43 ? 'C' : 'D';

    const previous = previousByKey.get(statKey(row.id, row.role));
    const previousScore = Number(previous?.tierScore ?? 50);
    row.trend = previous ? round(tierScore - previousScore, 1) : 0;
    row.trendStats = {
      tierScore: row.trend,
      winRate: previous ? round(row.winRate - Number(previous.winRate || 0), 1) : 0,
      pickRate: previous ? round(row.pickRate - Number(previous.pickRate || 0), 1) : 0,
      banRate: previous ? round(row.banRate - Number(previous.banRate || 0), 1) : 0,
      comparedAt: previousMeta?.generatedAt || null,
      previousPatch: previousMeta?.patch || null
    };

    row.verdict = row.tier === 'S' || row.tier === 'A' ? 'ĐÁNG ƯU TIÊN' : row.tier === 'D' ? 'KÉM ỔN ĐỊNH' : 'CÂN NHẮC';
    row.reason = `Tier Score ${row.tierScore}/100 từ WR đã hiệu chỉnh ${row.adjustedWinRate}%, presence ${row.presenceRate}% và ${row.games} lượt pick Challenger VN2.`;
  }
}

const tierOrder = { S: 0, A: 1, B: 2, C: 3, D: 4 };
rows.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || b.tierScore - a.tierScore || b.games - a.games);

const result = {
  patch: currentPatch || 'live-data',
  dataDragonVersion: patchState?.dataDragonVersion || null,
  mode: 'match-v5-vn2-challenger-v2',
  generatedAt: new Date().toISOString(),
  sampleGames: validGames,
  methodology: {
    banRate: 'Tỷ lệ số trận tướng xuất hiện trong bans / tổng trận mẫu.',
    counter: 'Matchup cùng vị trí, Bayesian smoothing + hệ số độ tin cậy theo số trận.',
    items: 'Trang bị cuối trận; core build loại trinket, consumable và boots.',
    runes: 'Trang ngọc phổ biến từ Match-V5 participant perks.',
    spells: 'Cặp phép bổ trợ phổ biến từ Match-V5.',
    trend: 'Chênh Tier Score so với lần aggregate trước.',
    tierScore: 'WR Bayesian + presence theo vị trí + matchup edge, sau đó shrink về 50 khi sample nhỏ.'
  },
  notice: `Tổng hợp tự động từ ${validGames} trận Ranked Solo/Duo Challenger VN2 patch ${currentPatch || 'hiện tại'}. Counter và Tier Score được giảm độ tự tin khi sample thấp.`,
  champions: rows
};

await fs.writeFile(output, JSON.stringify(result, null, 2));
console.log(`Đã tạo ${output}: patch ${result.patch}, ${validGames} trận, ${rows.length} champion-role.`);
