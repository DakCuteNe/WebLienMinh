import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'data', 'riot');
const stateFile = path.join(outDir, 'patch.json');
const locale = process.env.DDRAGON_LOCALE || 'vi_VN';

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'WebLienMinh/1.1 (+GitHub Actions)' }
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return response.json();
}

await fs.mkdir(outDir, { recursive: true });

let previous = null;
try {
  previous = JSON.parse(await fs.readFile(stateFile, 'utf8'));
} catch {}

const versions = await fetchJson('https://ddragon.leagueoflegends.com/api/versions.json');
if (!Array.isArray(versions) || !versions.length) {
  throw new Error('Không lấy được version Data Dragon từ Riot.');
}

const dataDragonVersion = versions[0];
const patch = dataDragonVersion.split('.').slice(0, 2).join('.');
const base = `https://ddragon.leagueoflegends.com/cdn/${dataDragonVersion}/data/${locale}`;

console.log(`Data Dragon mới nhất: ${dataDragonVersion} (patch ${patch})`);

const [champions, items, runes, summonerSpells] = await Promise.all([
  fetchJson(`${base}/champion.json`),
  fetchJson(`${base}/item.json`),
  fetchJson(`${base}/runesReforged.json`),
  fetchJson(`${base}/summoner.json`)
]);

await Promise.all([
  fs.writeFile(path.join(outDir, 'champions.json'), JSON.stringify(champions, null, 2)),
  fs.writeFile(path.join(outDir, 'items.json'), JSON.stringify(items, null, 2)),
  fs.writeFile(path.join(outDir, 'runes.json'), JSON.stringify(runes, null, 2)),
  fs.writeFile(path.join(outDir, 'summoner-spells.json'), JSON.stringify(summonerSpells, null, 2))
]);

const changed = previous?.dataDragonVersion !== dataDragonVersion;
const state = {
  patch,
  dataDragonVersion,
  locale,
  changed,
  previousVersion: previous?.dataDragonVersion || null,
  updatedAt: new Date().toISOString(),
  source: 'Riot Data Dragon'
};

await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
console.log(changed
  ? `Phát hiện dữ liệu Riot mới: ${previous?.dataDragonVersion || 'chưa có'} -> ${dataDragonVersion}`
  : `Chưa có version Data Dragon mới. Đang ở ${dataDragonVersion}.`);

if (process.env.GITHUB_OUTPUT) {
  await fs.appendFile(process.env.GITHUB_OUTPUT, `patch=${patch}\nversion=${dataDragonVersion}\nchanged=${changed}\n`);
}
