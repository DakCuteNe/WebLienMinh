import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const watchFile = path.join(root, 'data', 'pro-watchlist.json');
const output = path.join(root, 'data', 'pros.json');
const directoryFile = path.join(root, 'data', 'esports-directory.json');
const API = 'https://lol.fandom.com/api.php';
const RETRY_LIMIT = 2;
const MIN_RETRY_MS = 65_000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const watch = JSON.parse(await fs.readFile(watchFile, 'utf8'));
const featured = watch.players || [];
if (!featured.length) throw new Error('pro-watchlist.json chưa có tuyển thủ.');

// Detailed Leaguepedia queries are intentionally reserved for P1 stars. P2 players still
// appear in pros.json through the worldwide Oracle/identity directory, which avoids turning
// a larger watchlist into a Cargo rate-limit multiplier.
const detailedTargets = featured.filter(target => Number(target.priority || 1) <= 1);
const cargoTargets = detailedTargets.length ? detailedTargets : featured;

const escapeCargo = value => String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
const canonicalPlayer = target => String(target?.page || target?.name || '').trim();
const norm = value => String(value || '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replaceAll('_', ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cutoff = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const namesWhere = cargoTargets.map(x => `SP.Link='${escapeCargo(canonicalPlayer(x))}'`).join(' OR ');

const params = new URLSearchParams({
  action: 'cargoquery',
  format: 'json',
  maxlag: '5',
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

function isTransientLeaguepediaError(value) {
  return /rate limit|ratelimited|too many|maxlag|lagged|temporar|HTTP\s+(?:429|502|503|504)/i.test(String(value || ''));
}

function normalizeRole(role) {
  const r = String(role || '').toLowerCase();
  if (r.includes('top')) return 'TOP';
  if (r.includes('jung')) return 'JUNGLE';
  if (r.includes('mid')) return 'MIDDLE';
  if (r.includes('bot') || r.includes('adc')) return 'BOTTOM';
  if (r.includes('sup') || r.includes('utility')) return 'UTILITY';
  return String(role || '').toUpperCase();
}

function roleFamily(role) {
  const r = normalizeRole(role);
  if (r === 'TOP') return 'TOP';
  if (r === 'JUNGLE') return 'JUNGLE';
  if (r === 'MIDDLE') return 'MIDDLE';
  if (r === 'BOTTOM') return 'BOTTOM';
  if (r === 'UTILITY') return 'UTILITY';
  return null;
}

function regionHints(target) {
  return String(target?.regionHint || '')
    .split(/[\/,]/).map(x => x.trim().toUpperCase()).filter(Boolean);
}

function targetMatchesDirectory(target, player) {
  if (norm(player?.id) !== norm(target?.name)) return false;
  if (target.team) {
    const currentTeams = [player?.team?.name, player?.currentTeamName, player?.preferredTeam].filter(Boolean).map(norm);
    if (!currentTeams.includes(norm(target.team))) return false;
  }
  const wantedRole = roleFamily(target.role);
  const actualRole = roleFamily(player?.role);
  if (wantedRole && actualRole && wantedRole !== actualRole) return false;

  const hints = regionHints(target);
  if (hints.length) {
    const region = String(player?.team?.region || player?.residency || '').toUpperCase();
    if (region && !hints.includes(region)) return false;
  }

  if (target.page) {
    const pages = [player?.preferredPage, player?.profilePageTitle, player?.overviewPage, player?.identityId].filter(Boolean).map(norm);
    if (pages.length && !pages.includes(norm(target.page))) return false;
  }
  return true;
}

async function cachedPros() {
  try {
    const cached = JSON.parse(await fs.readFile(output, 'utf8'));
    return Array.isArray(cached?.players) && cached.players.length ? cached : null;
  } catch {
    return null;
  }
}

async function directoryData() {
  try {
    const directory = JSON.parse(await fs.readFile(directoryFile, 'utf8'));
    return Array.isArray(directory?.players) ? directory : null;
  } catch {
    return null;
  }
}

function cachedPlayerFor(target, cached) {
  const candidates = (cached?.players || []).filter(player => norm(player?.name) === norm(target.name));
  if (!candidates.length) return null;
  if (target.team) {
    const exact = candidates.filter(player => [player?.targetTeam, player?.team].filter(Boolean).some(team => norm(team) === norm(target.team)));
    if (exact.length === 1) return exact[0];
  }
  if (target.page) {
    const exact = candidates.filter(player => player?.page && norm(player.page) === norm(target.page));
    if (exact.length === 1) return exact[0];
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function directoryPlayerFor(target, directory) {
  if (!directory?.players?.length) return null;
  let candidates = directory.players.filter(player => targetMatchesDirectory(target, player));
  if (candidates.length === 1) return candidates[0];

  // For non-pinned names, prefer the freshest active major-region row instead of guessing
  // between duplicate historical identities.
  if (!target.team && !target.page && candidates.length > 1) {
    const sorted = [...candidates].sort((a, b) => Date.parse(b.latestGameAt || '') - Date.parse(a.latestGameAt || ''));
    const first = sorted[0];
    const second = sorted[1];
    if (first && (!second || Date.parse(first.latestGameAt || '') > Date.parse(second.latestGameAt || ''))) return first;
  }
  return null;
}

function basicDirectoryPlayer(target, player, reason = 'directory-fallback') {
  if (!player) {
    return {
      name: target.name,
      page: target.page || null,
      targetTeam: target.team || null,
      priority: Number(target.priority || 3),
      regionHint: target.regionHint || null,
      role: target.role,
      available: false,
      games: 0,
      fallback: true,
      fallbackSource: reason,
      note: 'Chưa resolve được duy nhất tuyển thủ active trong Worldwide Esports Directory; không tự đoán identity.'
    };
  }

  const games = Number(player.games || 0) || 0;
  const result = {
    name: target.name,
    page: target.page || player.preferredPage || player.profilePageTitle || player.overviewPage || null,
    targetTeam: target.team || null,
    priority: Number(target.priority || 3),
    regionHint: target.regionHint || null,
    profileUid: player.uid || null,
    available: games > 0,
    team: player.currentTeamName || player.team?.name || null,
    role: normalizeRole(player.role || target.role),
    games,
    winRate: Number.isFinite(Number(player.winRate)) ? Number(player.winRate) : null,
    kda: Number.isFinite(Number(player.kda)) ? Number(player.kda) : null,
    avgKills: Number.isFinite(Number(player.avgKills)) ? Number(player.avgKills) : null,
    avgDeaths: Number.isFinite(Number(player.avgDeaths)) ? Number(player.avgDeaths) : null,
    avgAssists: Number.isFinite(Number(player.avgAssists)) ? Number(player.avgAssists) : null,
    avgCS: Number.isFinite(Number(player.avgCS)) ? Number(player.avgCS) : null,
    avgDamage: Number.isFinite(Number(player.avgDamage)) ? Number(player.avgDamage) : null,
    avgVision: Number.isFinite(Number(player.avgVision)) ? Number(player.avgVision) : null,
    latestPatch: player.latestPatch || null,
    latestGameAt: player.latestGameAt || null,
    styleSummary: player.styleSummary || `Basic stats lấy từ Worldwide Esports Directory do ${reason}.`,
    championPool: Array.isArray(player.championPool) ? player.championPool : [],
    commonBuilds: [],
    commonItems: [],
    commonRunes: [],
    commonSpells: [],
    teamBanPriorities: [],
    recentGames: [],
    image: player.preferredImage || player.image || null,
    fallback: true,
    fallbackSource: reason,
    note: games > 0
      ? 'Basic performance fallback từ Worldwide Esports Directory; build/rune/spell sẽ được bổ sung khi Leaguepedia Cargo hoạt động lại.'
      : 'Có hồ sơ current identity nhưng chưa có đủ scoreboard stats trong directory.'
  };
  return result;
}

async function buildHybridFallback(cached, error) {
  const directory = await directoryData();
  if (!cached && !directory) return null;

  let preservedDetailedCount = 0;
  let directoryFallbackCount = 0;
  let unresolvedCount = 0;
  const players = featured.map(target => {
    const cachedPlayer = cachedPlayerFor(target, cached);
    if (cachedPlayer) {
      preservedDetailedCount++;
      return {
        ...cachedPlayer,
        priority: Number(target.priority || cachedPlayer.priority || 3),
        regionHint: target.regionHint || cachedPlayer.regionHint || null,
        targetTeam: target.team || cachedPlayer.targetTeam || null,
        page: target.page || cachedPlayer.page || null,
        fallback: false,
        detailedPreservedFrom: cached?.generatedAt || null
      };
    }

    const directoryPlayer = directoryPlayerFor(target, directory);
    if (directoryPlayer) directoryFallbackCount++;
    else unresolvedCount++;
    return basicDirectoryPlayer(target, directoryPlayer, 'Leaguepedia Cargo throttled');
  });

  const result = {
    generatedAt: new Date().toISOString(),
    source: 'Hybrid: preserved Leaguepedia detailed analytics + Worldwide Esports Directory fallback',
    sourceType: 'degraded hybrid; community scoreboard + Oracle/identity directory',
    degraded: true,
    sourceError: String(error?.message || error || 'Leaguepedia unavailable'),
    preservedDetailedAt: cached?.generatedAt || null,
    preservedDetailedCount,
    directoryFallbackCount,
    unresolvedCount,
    watchCount: featured.length,
    detailedPriorityCount: cargoTargets.length,
    rangeDays: cached?.rangeDays || 120,
    perPlayerGames: cached?.perPlayerGames || 30,
    note: 'Leaguepedia Cargo đang giới hạn truy cập. WebLienMinh giữ detailed analytics tốt trước đó và tự bổ sung các tuyển thủ ưu tiên còn thiếu bằng basic stats/current identity từ Worldwide Esports Directory. Không ghi dữ liệu rỗng và không đoán ambiguous identity.',
    players
  };
  await fs.writeFile(output, JSON.stringify(result, null, 2));
  return result;
}

async function fetchCargo() {
  const url = `${API}?${params}`;
  let lastError = null;

  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'WebLienMinh/2.7 featured-pro-analytics (educational project; GitHub DakCuteNe/WebLienMinh)' },
        signal: AbortSignal.timeout(40_000)
      });

      if (response.status === 429 || [502, 503, 504].includes(response.status)) {
        const retryAfter = Number(response.headers.get('retry-after') || 0);
        const wait = retryAfter > 0 ? Math.max(MIN_RETRY_MS, retryAfter * 1000) : MIN_RETRY_MS;
        lastError = new Error(`Leaguepedia HTTP ${response.status}`);
        if (attempt + 1 < RETRY_LIMIT) {
          console.log(`Leaguepedia HTTP ${response.status}; chờ ${Math.ceil(wait / 1000)}s (${attempt + 1}/${RETRY_LIMIT})...`);
          await sleep(wait);
          continue;
        }
        throw lastError;
      }

      if (!response.ok) throw new Error(`Leaguepedia HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
      const payload = await response.json();
      if (payload?.error) {
        const info = String(payload.error.info || payload.error.code || 'Cargo error');
        lastError = new Error(`Leaguepedia Cargo: ${info}`);
        if (isTransientLeaguepediaError(info) && attempt + 1 < RETRY_LIMIT) {
          console.log(`Leaguepedia tạm giới hạn: ${info}. Chờ ${Math.ceil(MIN_RETRY_MS / 1000)}s (${attempt + 1}/${RETRY_LIMIT})...`);
          await sleep(MIN_RETRY_MS);
          continue;
        }
        throw lastError;
      }
      return payload;
    } catch (error) {
      lastError = error;
      const transient = isTransientLeaguepediaError(error?.message) || error?.name === 'TimeoutError';
      if (transient && attempt + 1 < RETRY_LIMIT) {
        console.log(`Leaguepedia tạm lỗi: ${error.message}. Chờ ${Math.ceil(MIN_RETRY_MS / 1000)}s (${attempt + 1}/${RETRY_LIMIT})...`);
        await sleep(MIN_RETRY_MS);
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('Leaguepedia Cargo không phản hồi.');
}

let payload;
try {
  payload = await fetchCargo();
} catch (error) {
  if (isTransientLeaguepediaError(error?.message) || error?.name === 'TimeoutError') {
    const cached = await cachedPros();
    const fallback = await buildHybridFallback(cached, error);
    if (fallback) {
      console.log(`PROS_SOURCE_DEGRADED: ${error.message}`);
      console.log(`Hybrid fallback: ${fallback.preservedDetailedCount} detailed giữ lại + ${fallback.directoryFallbackCount} directory fallback + ${fallback.unresolvedCount} unresolved / ${fallback.watchCount} watchlist.`);
      process.exitCode = 75;
    } else if (cached) {
      console.log(`PROS_SOURCE_DEGRADED: ${error.message}`);
      console.log(`Giữ pros.json tốt trước đó (${cached.generatedAt || 'không rõ thời điểm'}; ${cached.players.length} tuyển thủ).`);
      process.exitCode = 75;
    } else {
      throw error;
    }
  } else {
    throw error;
  }
}

if (payload) {
  const rows = (payload.cargoquery || []).map(x => x.title || x);
  const directory = await directoryData();
  const cached = await cachedPros();

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

  let detailedCount = 0;
  let directoryFallbackCount = 0;
  let preservedCount = 0;
  const players = [];

  for (const target of featured) {
    const isDetailedTarget = cargoTargets.some(item => item === target);
    const targetPage = canonicalPlayer(target);
    const games = isDetailedTarget
      ? rows.filter(x => String(x.player || '').trim().toLowerCase() === targetPage.toLowerCase())
      : [];

    if (!games.length) {
      // If the single shared Cargo query is truncated at 500 rows, do not mark a famous player
      // unavailable. Reuse a previous detailed row first, otherwise use the worldwide directory.
      const old = cachedPlayerFor(target, cached);
      if (old && isDetailedTarget) {
        preservedCount++;
        players.push({
          ...old,
          priority: Number(target.priority || old.priority || 3),
          regionHint: target.regionHint || old.regionHint || null,
          targetTeam: target.team || old.targetTeam || null,
          page: target.page || old.page || null,
          detailedPreservedFrom: cached?.generatedAt || null,
          note: old.note || `Giữ detailed analytics trước đó vì shared Cargo query chưa trả row mới cho ${targetPage}.`
        });
        continue;
      }

      const directoryPlayer = directoryPlayerFor(target, directory);
      if (directoryPlayer) directoryFallbackCount++;
      players.push(basicDirectoryPlayer(target, directoryPlayer, isDetailedTarget ? 'Cargo query missing/truncated' : 'P2 directory-first policy'));
      continue;
    }

    detailedCount++;
    const recent = games.slice(0, 30);
    const wins = recent.filter(x => isWin(x.win)).length;
    const championPool = countBy(recent, x => x.champion).slice(0, 10).map(x => ({ ...x, rate: pct(x.count, recent.length) }));
    const spells = countBy(recent, x => splitList(x.spells, ',').sort().join(' + ')).slice(0, 5).map(x => ({ ...x, rate: pct(x.count, recent.length) }));
    const runePages = countBy(recent, x => [x.keystone, x.primaryTree, x.secondaryTree].filter(Boolean).join(' • ')).slice(0, 5).map(x => ({ ...x, rate: pct(x.count, recent.length) }));
    const builds = countBy(recent, x => splitList(x.items, ';').filter(name => !/warding totem|oracle lens|farsight alteration/i.test(name)).slice(0, 6).join(' → '))
      .filter(x => x.name).slice(0, 5).map(x => ({ ...x, rate: pct(x.count, recent.length) }));
    const itemPool = countBy(recent, x => splitList(x.items, ';').filter(name => !/warding totem|oracle lens|farsight alteration/i.test(name)))
      .slice(0, 10).map(x => ({ ...x, rate: pct(x.count, recent.length) }));
    const bans = countBy(recent, x => splitList(Number(x.side) === 2 ? x.team2Bans : x.team1Bans, ','))
      .slice(0, 10).map(x => ({ ...x, rate: pct(x.count, recent.length) }));

    const role = normalizeRole(recent.find(x => x.role)?.role || target.role);
    const deaths = recent.reduce((s, x) => s + asNum(x.deaths), 0);
    const kda = +(recent.reduce((s, x) => s + asNum(x.kills) + asNum(x.assists), 0) / Math.max(1, deaths)).toFixed(2);
    const vision = avg(recent, 'vision');
    const damage = avg(recent, 'damage');
    const winRate = pct(wins, recent.length);

    players.push({
      name: target.name,
      page: target.page || null,
      targetTeam: target.team || null,
      priority: Number(target.priority || 3),
      regionHint: target.regionHint || null,
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
    source: 'Leaguepedia detailed P1 analytics + Worldwide Esports Directory P2/basic fallback',
    sourceType: 'community scoreboard + Oracle/identity directory',
    degraded: false,
    watchCount: featured.length,
    detailedPriorityCount: cargoTargets.length,
    detailedCount,
    preservedDetailedCount: preservedCount,
    directoryFallbackCount,
    rangeDays: 120,
    perPlayerGames: 30,
    note: 'P1 stars ưu tiên detailed Leaguepedia scoreboard; P2 dùng directory-first để tiết kiệm Cargo quota. Nếu shared query bị giới hạn 500 rows, hệ thống giữ detailed cache cũ hoặc dùng basic directory stats thay vì làm tuyển thủ biến mất.',
    players
  };

  await fs.writeFile(output, JSON.stringify(result, null, 2));
  console.log(`Featured Pros: detailed=${detailedCount}, preserved=${preservedCount}, directoryFallback=${directoryFallbackCount}, total=${players.length}, Cargo rows=${rows.length}.`);
}
