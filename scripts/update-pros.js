import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const watchFile = path.join(root, 'data', 'pro-watchlist.json');
const output = path.join(root, 'data', 'pros.json');
const API = 'https://lol.fandom.com/api.php';

const watch = JSON.parse(await fs.readFile(watchFile, 'utf8'));
const featured = watch.players || [];
if (!featured.length) throw new Error('pro-watchlist.json chưa có tuyển thủ.');

const escapeCargo = value => String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
const cutoff = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const namesWhere = featured.map(x => `SP.Link='${escapeCargo(x.name)}'`).join(' OR ');

const params = new URLSearchParams({
  action: 'cargoquery',
  format: 'json',
  tables: 'ScoreboardPlayers=SP,ScoreboardGames=SG',
  fields: [
    'SP.Link=player','SP.Team=team','SP.TeamVs=opponent','SP.Champion=champion',
    'SP.Kills=kills','SP.Deaths=deaths','SP.Assists=assists','SP.CS=cs',
    'SP.DamageToChampions=damage','SP.VisionScore=vision','SP.Gold=gold',
    'SP.SummonerSpells=spells','SP.Items=items','SP.KeystoneRune=keystone',
    'SP.PrimaryTree=primaryTree','SP.SecondaryTree=secondaryTree','SP.Runes=runes',
    'SP.Role=role','SP.Side=side','SP.PlayerWin=win','SP.DateTime_UTC=date',
    'SG.Gamelength_Number=gameLength','SG.Team1Bans=team1Bans','SG.Team2Bans=team2Bans','SG.Patch=patch'
  ].join(','),
  join_on: 'SP.GameId=SG.GameId',
  where: `(${namesWhere}) AND SP.DateTime_UTC >= '${cutoff}'`,
  order_by: 'SP.DateTime_UTC DESC',
  limit: '500'
});

const response = await fetch(`${API}?${params}`, {
  headers: { 'User-Agent': 'WebLienMinh/1.2 featured-pro-analytics (educational project)' }
});
if (!response.ok) throw new Error(`Leaguepedia HTTP ${response.status}: ${await response.text()}`);
const payload = await response.json();
if (payload?.error) throw new Error(`Leaguepedia Cargo: ${payload.error.info || payload.error.code}`);
const rows = (payload.cargoquery || []).map(x => x.title || x);

const asNum = value => Number(value || 0) || 0;
const pct = (a, b) => b ? +(a / b * 100).toFixed(1) : 0;
const avg = (arr, field) => arr.length ? +(arr.reduce((s, x) => s + asNum(x[field]), 0) / arr.length).toFixed(1) : 0;
const isWin = value => ['1','true','yes','win','winner'].includes(String(value || '').trim().toLowerCase());
const splitList = (value, separator) => String(value || '').split(separator).map(x => x.trim()).filter(x => x && x !== 'None');
const countBy = (arr, getter) => {
  const map = new Map();
  for (const row of arr) {
    const values = getter(row);
    for (const value of Array.isArray(values) ? values : [values]) {
      if (!value) continue;
      map.set(value, (map.get(value) || 0) + 1);
    }
  }
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count || a.name.localeCompare(b.name));
};

function normalizeRole(role) {
  const r = String(role || '').toLowerCase();
  if (r.includes('top')) return 'TOP';
  if (r.includes('jung')) return 'JUNGLE';
  if (r.includes('mid')) return 'MIDDLE';
  if (r.includes('bot') || r.includes('adc')) return 'BOTTOM';
  if (r.includes('sup')) return 'UTILITY';
  return String(role || '').toUpperCase();
}

function playstyleSummary(role, games, championPool, kda, vision, damage, winRate) {
  const tags = [];
  if (championPool.length >= 7) tags.push('bể tướng rộng');
  if (kda >= 4.5) tags.push('KDA ổn định');
  if (winRate >= 60) tags.push('chuyển hóa lợi thế tốt');
  if (role === 'UTILITY' && vision >= 45) tags.push('ưu tiên kiểm soát tầm nhìn');
  if (role === 'JUNGLE') tags.push('đọc bản đồ và phối hợp mục tiêu');
  if (['MIDDLE','BOTTOM','TOP'].includes(role) && damage >= 18000) tags.push('xu hướng gây áp lực sát thương');
  if (!tags.length) tags.push('lối chơi linh hoạt theo draft');
  return `Trong ${games} ván gần đây, dữ liệu cho thấy xu hướng ${tags.slice(0, 3).join(', ')}.`;
}

const players = [];
for (const target of featured) {
  const games = rows.filter(x => String(x.player).toLowerCase() === target.name.toLowerCase());
  if (!games.length) {
    players.push({ name: target.name, role: target.role, available: false, games: 0, note: 'Chưa có scoreboard gần đây trong khoảng 120 ngày.' });
    continue;
  }

  const recent = games.slice(0, 30);
  const wins = recent.filter(x => isWin(x.win)).length;
  const championPool = countBy(recent, x => x.champion).slice(0, 10).map(x => ({ ...x, rate: pct(x.count, recent.length) }));
  const spells = countBy(recent, x => splitList(x.spells, ',').sort().join(' + ')).slice(0, 5).map(x => ({ ...x, rate: pct(x.count, recent.length) }));
  const runePages = countBy(recent, x => {
    const parts = [x.keystone, x.primaryTree, x.secondaryTree].filter(Boolean);
    return parts.join(' • ');
  }).slice(0, 5).map(x => ({ ...x, rate: pct(x.count, recent.length) }));

  const builds = countBy(recent, x => {
    const items = splitList(x.items, ';').filter(name => !/warding totem|oracle lens|farsight alteration/i.test(name));
    return items.slice(0, 6).join(' → ');
  }).filter(x => x.name).slice(0, 5).map(x => ({ ...x, rate: pct(x.count, recent.length) }));

  const itemPool = countBy(recent, x => splitList(x.items, ';').filter(name => !/warding totem|oracle lens|farsight alteration/i.test(name)))
    .slice(0, 10).map(x => ({ ...x, rate: pct(x.count, recent.length) }));

  const bans = countBy(recent, x => {
    const side = Number(x.side);
    const raw = side === 2 ? x.team2Bans : x.team1Bans;
    return splitList(raw, ',');
  }).slice(0, 10).map(x => ({ ...x, rate: pct(x.count, recent.length) }));

  const role = normalizeRole(recent.find(x => x.role)?.role || target.role);
  const deaths = recent.reduce((s, x) => s + asNum(x.deaths), 0);
  const kda = +(recent.reduce((s, x) => s + asNum(x.kills) + asNum(x.assists), 0) / Math.max(1, deaths)).toFixed(2);
  const vision = avg(recent, 'vision');
  const damage = avg(recent, 'damage');
  const winRate = pct(wins, recent.length);

  players.push({
    name: target.name,
    available: true,
    team: recent[0]?.team || null,
    role,
    games: recent.length,
    winRate,
    kda,
    avgKills: avg(recent, 'kills'),
    avgDeaths: avg(recent, 'deaths'),
    avgAssists: avg(recent, 'assists'),
    avgCS: avg(recent, 'cs'),
    avgDamage: damage,
    avgVision: vision,
    latestPatch: recent[0]?.patch || null,
    latestGameAt: recent[0]?.date || null,
    styleSummary: playstyleSummary(role, recent.length, championPool, kda, vision, damage, winRate),
    championPool,
    commonBuilds: builds,
    commonItems: itemPool,
    commonRunes: runePages,
    commonSpells: spells,
    teamBanPriorities: bans,
    recentGames: recent.slice(0, 8).map(x => ({
      date: x.date,
      patch: x.patch,
      team: x.team,
      opponent: x.opponent,
      champion: x.champion,
      win: isWin(x.win),
      kda: `${asNum(x.kills)}/${asNum(x.deaths)}/${asNum(x.assists)}`,
      items: splitList(x.items, ';').filter(name => !/warding totem|oracle lens|farsight alteration/i.test(name)),
      spells: splitList(x.spells, ','),
      keystone: x.keystone || null,
      primaryTree: x.primaryTree || null,
      secondaryTree: x.secondaryTree || null
    }))
  });
}

const result = {
  generatedAt: new Date().toISOString(),
  source: 'Leaguepedia / League of Legends Esports Wiki scoreboard data',
  sourceType: 'community-maintained, not Riot official',
  rangeDays: 120,
  perPlayerGames: 30,
  note: 'Featured Pros là danh sách theo dõi tuyển thủ nổi bật, không phải bảng xếp hạng tuyệt đối. Build là end-game build từ scoreboard; ban là ưu tiên ban của đội trong các trận có tuyển thủ đó.',
  players
};

await fs.writeFile(output, JSON.stringify(result, null, 2));
console.log(`Đã cập nhật ${players.filter(x => x.available).length}/${players.length} featured pros từ ${rows.length} scoreboard rows.`);
