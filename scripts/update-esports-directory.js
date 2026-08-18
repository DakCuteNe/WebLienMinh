import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const output = path.join(root, 'data', 'esports-directory.json');
const watchFile = path.join(root, 'data', 'pro-watchlist.json');
const API = 'https://lol.fandom.com/api.php';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const bool = v => ['1','true','yes'].includes(String(v ?? '').toLowerCase());
const split = (v, sep = ',') => String(v || '').split(sep).map(x => x.trim()).filter(Boolean);
const fileUrl = file => file ? `https://lol.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(file)}` : null;
const pageUrl = page => page ? `https://lol.fandom.com/wiki/${encodeURIComponent(page).replace(/%2F/g, '/')}` : null;

async function cargoQuery(params) {
  const query = new URLSearchParams({ action: 'cargoquery', format: 'json', ...params });
  const response = await fetch(`${API}?${query}`, {
    headers: { 'User-Agent': 'WebLienMinh/2.0 global-esports-directory (educational project)' }
  });
  if (!response.ok) throw new Error(`Leaguepedia HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  if (payload?.error) throw new Error(`Leaguepedia Cargo: ${payload.error.info || payload.error.code}`);
  return (payload.cargoquery || []).map(x => x.title || x);
}

async function cargoPaged(base, maxRows = 3000) {
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += 500) {
    const page = await cargoQuery({ ...base, limit: '500', offset: String(offset) });
    rows.push(...page);
    if (page.length < 500) break;
    await sleep(350);
  }
  return rows;
}

function normalizeRole(value) {
  const role = String(value || '').toLowerCase();
  if (role.includes('top')) return 'TOP';
  if (role.includes('jung')) return 'JUNGLE';
  if (role.includes('mid')) return 'MIDDLE';
  if (role.includes('bot') || role.includes('adc')) return 'BOTTOM';
  if (role.includes('sup')) return 'UTILITY';
  return String(value || '').toUpperCase();
}

let featured = new Set();
try {
  const watch = JSON.parse(await fs.readFile(watchFile, 'utf8'));
  featured = new Set((watch.players || []).map(x => String(x.name).toLowerCase()));
} catch {}

console.log('Đang tải danh sách đội tuyển toàn cầu...');
const teamRows = await cargoPaged({
  tables: 'Teams=T',
  fields: [
    'T.OverviewPage=overviewPage','T.Name=name','T.Short=short','T.Region=region',
    'T.Location=location','T.TeamLocation=teamLocation','T.Image=image',
    'T.Website=website','T.Twitter=twitter','T.Instagram=instagram','T.IsDisbanded=isDisbanded'
  ].join(','),
  order_by: 'T.Region ASC,T.Name ASC'
}, 2500);

const teams = new Map();
for (const row of teamRows) {
  if (!row.overviewPage || bool(row.isDisbanded)) continue;
  teams.set(row.overviewPage, {
    id: row.overviewPage,
    name: row.name || row.overviewPage,
    short: row.short || null,
    region: row.region || null,
    location: row.teamLocation || row.location || null,
    logo: fileUrl(row.image),
    sourcePage: pageUrl(row.overviewPage),
    website: row.website || null,
    socials: {
      twitter: row.twitter || null,
      instagram: row.instagram || null
    }
  });
}

console.log('Đang tải tuyển thủ chuyên nghiệp đang hoạt động...');
const playerRows = await cargoPaged({
  tables: 'Players=P',
  fields: [
    'P.ID=id','P.OverviewPage=overviewPage','P.Image=image','P.NameFull=nameFull','P.Name=name',
    'P.NativeName=nativeName','P.Country=country','P.NationalityPrimary=nationality','P.Age=age',
    'P.Birthdate=birthdate','P.Team=team','P.CurrentTeams=currentTeams','P.Residency=residency',
    'P.Role=role','P.Contract=contract','P.FavChamps=favChamps','P.SoloqueueIds=soloqueueIds',
    'P.Twitter=twitter','P.Instagram=instagram','P.Stream=stream','P.Youtube=youtube',
    'P.IsSubstitute=isSubstitute','P.IsTrainee=isTrainee','P.IsRetired=isRetired','P.IsPersonality=isPersonality'
  ].join(','),
  where: "P.Team != '' AND P.IsRetired=0 AND P.IsPersonality=0",
  order_by: 'P.Team ASC,P.Role ASC,P.ID ASC'
}, 3000);

const players = playerRows
  .filter(row => row.id && row.team && !bool(row.isRetired) && !bool(row.isPersonality))
  .map(row => {
    const team = teams.get(row.team) || {
      id: row.team,
      name: row.team,
      short: null,
      region: row.residency || null,
      location: null,
      logo: null,
      sourcePage: pageUrl(row.team),
      website: null,
      socials: {}
    };
    return {
      id: row.id,
      overviewPage: row.overviewPage || row.id,
      name: row.nameFull || row.name || row.id,
      nativeName: row.nativeName || null,
      image: fileUrl(row.image),
      country: row.country || null,
      nationality: row.nationality || null,
      age: Number(row.age || 0) || null,
      birthdate: row.birthdate || null,
      birthYear: row.birthdate ? Number(String(row.birthdate).slice(0, 4)) || null : null,
      residency: row.residency || null,
      role: normalizeRole(row.role),
      contract: row.contract || null,
      team,
      currentTeams: split(row.currentTeams),
      favoriteChampions: split(row.favChamps),
      interestsNote: row.favChamps ? 'Tướng yêu thích được nhập thủ công trên Leaguepedia; không suy diễn thành sở thích cá nhân ngoài game.' : 'Chưa có dữ liệu sở thích công khai được chuẩn hóa.',
      soloqueueIds: row.soloqueueIds || null,
      substitute: bool(row.isSubstitute),
      trainee: bool(row.isTrainee),
      featured: featured.has(String(row.id).toLowerCase()),
      socials: {
        twitter: row.twitter || null,
        instagram: row.instagram || null,
        stream: row.stream || null,
        youtube: row.youtube || null
      },
      sourcePage: pageUrl(row.overviewPage || row.id)
    };
  });

const regions = [...new Set(players.map(x => x.team?.region || x.residency).filter(Boolean))].sort();
const countries = [...new Set(players.map(x => x.country || x.nationality).filter(Boolean))].sort();
const teamList = [...teams.values()].filter(t => players.some(p => p.team?.id === t.id));

const result = {
  generatedAt: new Date().toISOString(),
  source: 'Leaguepedia / League of Legends Esports Wiki Cargo',
  sourceType: 'community-maintained, not Riot official',
  licenseNote: 'Leaguepedia content is available under CC BY-SA 3.0 unless otherwise noted. Images/logos remain subject to their respective rights holders.',
  coverage: 'Active players with a current team available in the Leaguepedia Players table.',
  playerCount: players.length,
  teamCount: teamList.length,
  regions,
  countries,
  teams: teamList,
  players
};

await fs.writeFile(output, JSON.stringify(result, null, 2));
console.log(`Đã tạo ${output}: ${players.length} tuyển thủ, ${teamList.length} đội, ${regions.length} khu vực.`);
