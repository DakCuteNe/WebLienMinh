import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const output = path.join(root, 'data', 'esports-directory.json');
const watchFile = path.join(root, 'data', 'pro-watchlist.json');
const ORACLE_BASE = 'https://oracleselixir-downloadable-match-data.s3-us-west-2.amazonaws.com';

function normalizeRole(value) {
  const role = String(value || '').toLowerCase();
  if (role === 'top' || role.includes('top')) return 'TOP';
  if (role === 'jng' || role.includes('jung')) return 'JUNGLE';
  if (role === 'mid' || role.includes('mid')) return 'MIDDLE';
  if (role === 'bot' || role.includes('adc') || role.includes('bottom')) return 'BOTTOM';
  if (role === 'sup' || role.includes('support')) return 'UTILITY';
  return String(value || '').toUpperCase();
}

function slug(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function parseCsvLine(line) {
  const out = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      out.push(value);
      value = '';
    } else {
      value += ch;
    }
  }
  out.push(value);
  return out;
}

function ymd(date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

async function loadFeatured() {
  try {
    const watch = JSON.parse(await fs.readFile(watchFile, 'utf8'));
    return new Set((watch.players || []).map(x => String(x.name || '').toLowerCase()).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function downloadOracleCsv() {
  const now = new Date();
  const year = now.getUTCFullYear();
  let lastError = null;

  // Oracle's Elixir publishes dated snapshots. Try today then walk backwards.
  for (let daysAgo = 0; daysAgo <= 14; daysAgo++) {
    const d = new Date(now.getTime() - daysAgo * 86_400_000);
    const stamp = ymd(d);
    const url = `${ORACLE_BASE}/${year}_LoL_esports_match_data_from_OraclesElixir_${stamp}.csv`;
    console.log(`Oracle's Elixir: thử snapshot ${stamp}...`);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'WebLienMinh/2.2 global-esports-directory' },
        signal: AbortSignal.timeout(90_000)
      });
      if (response.status === 404) continue;
      if (!response.ok) {
        lastError = new Error(`Oracle's Elixir HTTP ${response.status}`);
        continue;
      }
      const text = await response.text();
      if (text.length < 100_000 || !/playername/i.test(text.slice(0, 5000))) {
        lastError = new Error(`Oracle snapshot ${stamp} không giống CSV esports hợp lệ.`);
        continue;
      }
      console.log(`Đã tải Oracle's Elixir snapshot ${stamp}: ${(text.length / 1024 / 1024).toFixed(1)} MB.`);
      return { text, stamp, url };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Không tìm thấy Oracle's Elixir snapshot trong 14 ngày gần nhất.");
}

function buildDirectoryFromOracle(text, source) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('Oracle CSV không có dữ liệu.');

  const header = parseCsvLine(lines[0]).map(x => x.trim().toLowerCase());
  const index = new Map(header.map((name, i) => [name, i]));
  const get = (row, name) => row[index.get(name)] ?? '';
  const required = ['playername', 'teamname', 'position', 'champion', 'date'];
  for (const col of required) {
    if (!index.has(col)) throw new Error(`Oracle CSV thiếu cột ${col}.`);
  }

  const featured = source.featured;
  const players = new Map();
  const teams = new Map();

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const playerName = String(get(row, 'playername')).trim();
    const teamName = String(get(row, 'teamname')).trim();
    const position = String(get(row, 'position')).trim();
    const participantId = Number(get(row, 'participantid'));
    if (!playerName || !teamName || !position) continue;
    if (Number.isFinite(participantId) && participantId > 10) continue;

    const role = normalizeRole(position);
    if (!['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'].includes(role)) continue;

    const playerIdRaw = String(get(row, 'playerid')).trim();
    const playerKey = (playerIdRaw || playerName).toLowerCase();
    const teamIdRaw = String(get(row, 'teamid')).trim();
    const teamId = teamIdRaw || slug(teamName);
    const league = String(get(row, 'league')).trim() || 'PRO';
    const date = String(get(row, 'date')).trim();
    const champion = String(get(row, 'champion')).trim();
    const gameId = String(get(row, 'gameid')).trim();
    const patch = String(get(row, 'patch')).trim();

    let p = players.get(playerKey);
    if (!p) {
      p = {
        key: playerKey,
        id: playerName,
        overviewPage: playerName,
        name: playerName,
        nativeName: null,
        image: null,
        country: null,
        nationality: null,
        age: null,
        birthdate: null,
        birthYear: null,
        residency: null,
        role,
        contract: null,
        latestAt: '',
        latestPatch: null,
        team: null,
        teams: new Set(),
        champions: new Map(),
        games: new Set(),
        featured: featured.has(playerName.toLowerCase()),
        socials: { twitter: null, instagram: null, stream: null, youtube: null }
      };
      players.set(playerKey, p);
    }

    p.role = role || p.role;
    p.teams.add(teamName);
    if (champion) p.champions.set(champion, (p.champions.get(champion) || 0) + 1);
    if (gameId) p.games.add(gameId);

    if (!p.latestAt || date > p.latestAt) {
      p.latestAt = date;
      p.latestPatch = patch || p.latestPatch;
      p.team = {
        id: teamId,
        name: teamName,
        short: null,
        region: league,
        location: null,
        logo: null,
        sourcePage: 'https://lol.timsevenhuysen.com/',
        website: null,
        socials: {}
      };
    }

    const existingTeam = teams.get(teamId);
    if (!existingTeam || date > existingTeam.latestAt) {
      teams.set(teamId, {
        id: teamId,
        name: teamName,
        short: null,
        region: league,
        location: null,
        logo: null,
        sourcePage: 'https://lol.timsevenhuysen.com/',
        website: null,
        socials: {},
        latestAt: date
      });
    }
  }

  const playerList = [...players.values()]
    .filter(p => p.team && p.games.size > 0)
    .map(p => {
      const championPool = [...p.champions.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 8);
      const total = [...p.champions.values()].reduce((a, b) => a + b, 0) || 1;
      return {
        id: p.id,
        overviewPage: p.overviewPage,
        name: p.name,
        nativeName: null,
        image: null,
        country: null,
        nationality: null,
        age: null,
        birthdate: null,
        birthYear: null,
        residency: p.team?.region || null,
        role: p.role,
        contract: null,
        team: p.team,
        currentTeams: [...p.teams],
        favoriteChampions: championPool.map(([name]) => name),
        championPool: championPool.map(([name, count]) => ({
          name,
          count,
          rate: Number(((count / total) * 100).toFixed(1))
        })),
        interestsNote: `Các tướng hiển thị là champion pool từ dữ liệu thi đấu ${new Date().getUTCFullYear()} của Oracle's Elixir, không phải sở thích cá nhân.`,
        soloqueueIds: null,
        substitute: false,
        trainee: false,
        featured: p.featured,
        socials: p.socials,
        latestGameAt: p.latestAt || null,
        latestPatch: p.latestPatch,
        games: p.games.size,
        sourcePage: 'https://lol.timsevenhuysen.com/'
      };
    })
    .sort((a, b) => Number(b.featured) - Number(a.featured) || (a.team?.region || '').localeCompare(b.team?.region || '') || a.id.localeCompare(b.id));

  const activeTeamIds = new Set(playerList.map(p => p.team?.id).filter(Boolean));
  const teamList = [...teams.values()]
    .filter(t => activeTeamIds.has(t.id))
    .map(({ latestAt, ...team }) => team)
    .sort((a, b) => (a.region || '').localeCompare(b.region || '') || a.name.localeCompare(b.name));
  const regions = [...new Set(playerList.map(p => p.team?.region).filter(Boolean))].sort();

  return {
    generatedAt: new Date().toISOString(),
    source: "Oracle's Elixir 2026 professional match data",
    sourceType: 'community analytics dataset, not Riot official',
    licenseNote: "Game statistics are property of Riot Games; directory rows are derived from Oracle's Elixir downloadable match data.",
    coverage: `Tuyển thủ xuất hiện trong dữ liệu thi đấu chuyên nghiệp ${new Date().getUTCFullYear()} của Oracle's Elixir • snapshot ${source.stamp}.`,
    sourceSnapshot: source.stamp,
    sourceUrl: source.url,
    playerCount: playerList.length,
    teamCount: teamList.length,
    regions,
    countries: [],
    teams: teamList,
    players: playerList
  };
}

const featured = await loadFeatured();
console.log("Đang xây dựng Worldwide Esports Directory từ Oracle's Elixir...");
const source = await downloadOracleCsv();
source.featured = featured;
const result = buildDirectoryFromOracle(source.text, source);

if (result.playerCount < 50 || result.teamCount < 10) {
  throw new Error(`Directory quá nhỏ: ${result.playerCount} tuyển thủ / ${result.teamCount} đội. Không ghi đè dữ liệu cũ.`);
}

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(result, null, 2));
console.log(`Đã tạo ${output}: ${result.playerCount} tuyển thủ, ${result.teamCount} đội, ${result.regions.length} league/khu vực.`);
