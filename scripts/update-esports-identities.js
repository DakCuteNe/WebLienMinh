import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const directoryFile = path.join(root, 'data', 'esports-directory.json');
const HF_BASE = 'https://huggingface.co/datasets/gptilt/lol-esports-entities/resolve/main';
const FILES = {
  figures: `${HF_BASE}/public_figures/public_figures.parquet?download=true`,
  aliases: `${HF_BASE}/entity_aliases/entity_aliases.parquet?download=true`
};

function norm(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');
}

function pageKeyFromUrl(value) {
  try {
    const url = new URL(value);
    const marker = '/wiki/';
    const i = url.pathname.indexOf(marker);
    if (i < 0) return null;
    return decodeURIComponent(url.pathname.slice(i + marker.length)).replaceAll('_', ' ');
  } catch {
    return null;
  }
}

async function download(url, file) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'WebLienMinh/2.4 global-esports-identity-resolver' },
    signal: AbortSignal.timeout(90_000)
  });
  if (!response.ok) throw new Error(`Hugging Face ${response.status}: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 10_000) throw new Error(`Parquet tải về quá nhỏ (${buffer.length} bytes): ${url}`);
  await fs.writeFile(file, buffer);
  return buffer.length;
}

async function readParquet(file) {
  const mod = await import('parquetjs-lite');
  const ParquetReader = mod.ParquetReader || mod.default?.ParquetReader;
  if (!ParquetReader) throw new Error('Không load được ParquetReader từ parquetjs-lite.');
  const reader = await ParquetReader.openFile(file);
  const cursor = reader.getCursor();
  const rows = [];
  try {
    while (true) {
      const row = await cursor.next();
      if (!row) break;
      rows.push(row);
    }
  } finally {
    await reader.close();
  }
  return rows;
}

function leagueFamily(league) {
  const v = String(league || '').toUpperCase();
  if (/^(LCK|LCKC|LAS)$/.test(v)) return ['korea', 'kr'];
  if (v === 'LPL') return ['china', 'cn'];
  if (/^(LEC|LFL|LIT|NLC|PRM|EBL|EM|HLL|TCL)$/.test(v)) return ['europe', 'emea', 'eu'];
  if (/^(LCS|NACL)$/.test(v)) return ['north america', 'na'];
  if (/^(CBLOL|CD)$/.test(v)) return ['brazil', 'br'];
  if (/^(LCP|VCS|LJL|PCS)$/.test(v)) return ['asia', 'pacific', 'sea', 'vietnam', 'japan', 'taiwan'];
  if (/^(LRN|LRS|LES|LAS)$/.test(v)) return ['latin america', 'latam'];
  return [];
}

function chooseCandidate(player, candidates, figures) {
  const uniq = [...new Set(candidates.map(x => x.entity_id).filter(Boolean))];
  if (!uniq.length) return null;
  if (uniq.length === 1) return uniq[0];

  const currentPage = norm(pageKeyFromUrl(player.sourcePage));
  if (currentPage) {
    const exactPage = uniq.find(id => norm(id) === currentPage);
    if (exactPage) return exactPage;
  }

  const exactCanonical = uniq.find(id => norm(id) === norm(player.overviewPage) || norm(id) === norm(player.id));
  if (exactCanonical) return exactCanonical;

  const preferred = candidates.filter(x => String(x.alias_type || '').toLowerCase() === 'ign');
  const preferredUniq = [...new Set(preferred.map(x => x.entity_id))];
  if (preferredUniq.length === 1) return preferredUniq[0];

  const families = leagueFamily(player.team?.region || player.residency);
  if (families.length) {
    const regionMatches = uniq.filter(id => {
      const fig = figures.get(id);
      const region = norm(fig?.region);
      return families.some(x => region.includes(norm(x)));
    });
    if (regionMatches.length === 1) return regionMatches[0];
  }

  return null;
}

const directory = JSON.parse(await fs.readFile(directoryFile, 'utf8'));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'rift-esports-identities-'));
const figuresFile = path.join(temp, 'public_figures.parquet');
const aliasesFile = path.join(temp, 'entity_aliases.parquet');

try {
  const [figureBytes, aliasBytes] = await Promise.all([
    download(FILES.figures, figuresFile),
    download(FILES.aliases, aliasesFile)
  ]);
  console.log(`GPTilt identity dataset: figures ${(figureBytes / 1024).toFixed(0)} KB, aliases ${(aliasBytes / 1024).toFixed(0)} KB.`);

  const [figureRows, aliasRows] = await Promise.all([readParquet(figuresFile), readParquet(aliasesFile)]);
  const figures = new Map(figureRows.map(row => [String(row.person_id || ''), row]).filter(([id]) => id));
  const aliasesByText = new Map();
  const aliasesByEntity = new Map();

  for (const row of aliasRows) {
    if (String(row.entity_type || '').toLowerCase() !== 'person') continue;
    const alias = String(row.alias || '').trim();
    const entityId = String(row.entity_id || '').trim();
    if (!alias || !entityId) continue;
    const k = norm(alias);
    if (!aliasesByText.has(k)) aliasesByText.set(k, []);
    aliasesByText.get(k).push({ ...row, entity_id: entityId });
    if (!aliasesByEntity.has(entityId)) aliasesByEntity.set(entityId, []);
    aliasesByEntity.get(entityId).push({ ...row, alias });
  }

  let matched = 0;
  let realNames = 0;
  let ambiguous = 0;
  let notFound = 0;

  for (const player of directory.players || []) {
    const rawCandidates = [
      ...(aliasesByText.get(norm(player.id)) || []),
      ...(aliasesByText.get(norm(player.overviewPage)) || [])
    ];
    const entityId = chooseCandidate(player, rawCandidates, figures);
    if (!entityId) {
      if (rawCandidates.length) ambiguous++;
      else notFound++;
      player.identityStatus = rawCandidates.length ? 'ambiguous' : 'not-found';
      continue;
    }

    const figure = figures.get(entityId) || {};
    const entityAliases = aliasesByEntity.get(entityId) || [];
    const realNameAliases = entityAliases
      .filter(x => String(x.alias_type || '').toLowerCase() === 'real_name')
      .map(x => String(x.alias || '').replace(/&nbsp;/gi, ' ').trim())
      .filter(Boolean);
    const realName = realNameAliases[0] || null;

    player.identityId = entityId;
    player.identityStatus = 'matched';
    player.identitySource = 'GPTilt Leaguepedia entity directory';
    player.identitySourceUrl = String(figure.source_url || rawCandidates[0]?.source_url || '').trim() || null;
    player.overviewPage = entityId;
    if (player.identitySourceUrl) player.sourcePage = player.identitySourceUrl;
    if (realName && norm(realName) !== norm(player.id)) {
      player.name = realName;
      realNames++;
    }
    if (figure.display_name) player.displayName = String(figure.display_name);
    if (figure.canonical_name) player.canonicalName = String(figure.canonical_name);
    if (figure.region) player.identityRegion = String(figure.region);
    matched++;
  }

  directory.identityEnrichedAt = new Date().toISOString();
  directory.identitySource = 'GPTilt League of Legends Esports Directory (Leaguepedia-derived, CC BY-SA 3.0)';
  directory.identitySourceUrl = 'https://huggingface.co/datasets/gptilt/lol-esports-entities';
  directory.identityStatus = { matched, realNames, ambiguous, notFound, total: directory.players?.length || 0 };

  await fs.writeFile(directoryFile, JSON.stringify(directory, null, 2));
  console.log(`Identity resolution xong: matched=${matched}, realName=${realNames}, ambiguous=${ambiguous}, notFound=${notFound}, total=${directory.players?.length || 0}.`);
} finally {
  await fs.rm(temp, { recursive: true, force: true }).catch(() => {});
}
