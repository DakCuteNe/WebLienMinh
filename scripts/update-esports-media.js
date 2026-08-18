import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const file = path.join(root, 'data', 'esports-directory.json');
const API = 'https://lol.fandom.com/api.php';
const BATCH = 25;
const DELAY_MS = Math.max(1100, Number(process.env.ESPORTS_MEDIA_DELAY_MS || 1400));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function key(value) {
  return String(value || '').trim().replaceAll('_', ' ').toLowerCase();
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function cleanWiki(value = '') {
  let text = String(value || '').trim();
  if (!text) return null;
  text = text
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<br\s*\/?\s*>/gi, ', ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[(https?:\/\/\S+)\s+([^\]]+)\]/g, '$2')
    .replace(/'''?/g, '');

  for (let i = 0; i < 4; i++) {
    const next = text.replace(/\{\{[^{}|]+\|([^{}]+)\}\}/g, (_m, inner) => {
      const parts = String(inner).split('|').map(x => x.trim()).filter(Boolean);
      return parts.at(-1) || '';
    });
    if (next === text) break;
    text = next;
  }

  text = text
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function parseParams(wikitext = '') {
  const params = new Map();
  for (const line of String(wikitext).split(/\r?\n/)) {
    const match = line.match(/^\s*\|\s*([^=|]+?)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const name = key(match[1]).replaceAll(' ', '');
    if (!params.has(name) || !params.get(name)) params.set(name, match[2]);
  }
  return params;
}

function param(params, ...names) {
  for (const name of names) {
    const raw = params.get(key(name).replaceAll(' ', ''));
    if (raw != null && String(raw).trim()) return raw;
  }
  return null;
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const template = raw.match(/\{\{\s*(?:birth\s*date(?:\s*and\s*age)?|date|dts)\s*\|\s*((?:19|20)\d{2})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i);
  if (template) return `${template[1]}-${String(template[2]).padStart(2, '0')}-${String(template[3]).padStart(2, '0')}`;
  const pipeDate = raw.match(/\b((?:19|20)\d{2})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})\b/);
  if (pipeDate) return `${pipeDate[1]}-${String(pipeDate[2]).padStart(2, '0')}-${String(pipeDate[3]).padStart(2, '0')}`;
  const text = cleanWiki(raw)?.replace(/\s*\(age\s+\d+\)\s*/i, ' ').trim();
  if (!text) return null;
  const iso = text.match(/\b((?:19|20)\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

function ageFromBirthdate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = (now.getUTCMonth() + 1 < m) || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d);
  if (beforeBirthday) age--;
  return age >= 10 && age <= 80 ? age : null;
}

function fileName(value) {
  let text = String(value || '').trim();
  if (!text) return null;
  text = text.replace(/^\[\[(?:File|Image):/i, '').replace(/\]\]$/, '').split('|')[0].trim();
  text = text.replace(/^(?:File|Image):/i, '').trim();
  return text || null;
}

async function apiQuery(params, label = 'Leaguepedia MediaWiki') {
  const query = new URLSearchParams({ action: 'query', format: 'json', origin: '*', ...params });
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(`${API}?${query}`, {
        headers: { 'User-Agent': 'WebLienMinh/2.5.1 esports-profile-enrichment' },
        signal: AbortSignal.timeout(35_000)
      });
      if ([429, 502, 503, 504].includes(response.status)) {
        const wait = Math.max(DELAY_MS * (attempt + 2), Number(response.headers.get('retry-after') || 0) * 1000);
        await sleep(wait);
        continue;
      }
      if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
      const body = await response.json();
      if (body?.error) throw new Error(body.error.info || body.error.code);
      return body;
    } catch (error) {
      lastError = error;
      await sleep(DELAY_MS * (attempt + 1));
    }
  }
  throw lastError || new Error(`${label} query failed.`);
}

async function resolveFiles(names) {
  const unique = [...new Set(names.map(fileName).filter(Boolean))];
  if (!unique.length) return new Map();
  const body = await apiQuery({
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '520',
    titles: unique.map(name => `File:${name}`).join('|')
  }, 'Leaguepedia imageinfo');
  const map = new Map();
  for (const page of Object.values(body.query?.pages || {})) {
    if (page.missing) continue;
    const name = String(page.title || '').replace(/^File:/i, '');
    const info = page.imageinfo?.[0];
    if (name && info) map.set(key(name), info.thumburl || info.url || null);
  }
  return map;
}

async function queryProfiles(titles) {
  const body = await apiQuery({
    redirects: '1',
    prop: 'pageimages|info|revisions',
    piprop: 'thumbnail|name',
    pithumbsize: '520',
    inprop: 'url',
    rvprop: 'content',
    rvslots: 'main',
    titles: titles.join('|')
  }, 'Leaguepedia profile');

  const aliases = new Map();
  for (const item of body.query?.normalized || []) aliases.set(key(item.from), item.to);
  for (const item of body.query?.redirects || []) aliases.set(key(item.from), item.to);
  const pages = Object.values(body.query?.pages || {});
  const pageByTitle = new Map(pages.filter(p => !p.missing).map(p => [key(p.title), p]));
  const records = new Map();
  const explicitImages = [];

  for (const title of titles) {
    let current = title;
    const visited = new Set();
    while (aliases.has(key(current)) && !visited.has(key(current))) {
      visited.add(key(current));
      current = aliases.get(key(current));
    }
    const page = pageByTitle.get(key(current)) || pageByTitle.get(key(title));
    if (!page) continue;
    const revision = page.revisions?.[0];
    const wikitext = revision?.slots?.main?.['*'] ?? revision?.slots?.main?.content ?? revision?.['*'] ?? '';
    const params = parseParams(wikitext);
    const explicitImage = fileName(param(params, 'image', 'playerimage', 'photo', 'logo'));
    if (explicitImage) explicitImages.push(explicitImage);
    records.set(key(title), {
      pageTitle: page.title || current,
      sourcePage: page.fullurl || `https://lol.fandom.com/wiki/${encodeURIComponent(page.title || current).replace(/%20/g, '_')}`,
      pageImage: page.thumbnail?.source || null,
      explicitImage,
      params
    });
  }

  let files = new Map();
  try {
    files = await resolveFiles(explicitImages);
  } catch (error) {
    console.log(`Resolve ảnh explicit lỗi: ${error.message}`);
  }

  for (const record of records.values()) {
    record.image = (record.explicitImage && files.get(key(record.explicitImage))) || record.pageImage || null;
  }
  return records;
}

function enrichPlayer(player, profile) {
  const p = profile.params;
  let changed = false;
  const set = (field, value, overwrite = false) => {
    if (value == null || value === '') return;
    if (!overwrite && player[field]) return;
    if (player[field] !== value) { player[field] = value; changed = true; }
  };

  const realName = cleanWiki(param(p, 'name', 'namefull', 'realname'));
  const nativeName = cleanWiki(param(p, 'nativename'));
  const country = cleanWiki(param(p, 'country', 'countryofbirth'));
  const nationality = cleanWiki(param(p, 'nationality', 'nationalityprimary'));
  const birthdate = normalizeDate(param(p, 'birthdate', 'birthday', 'dob'));
  const contractRaw = param(p, 'contract', 'contractexpires', 'contractexpiry', 'contractend', 'contractdate');
  const contract = normalizeDate(contractRaw) || cleanWiki(contractRaw);
  const residency = cleanWiki(param(p, 'residency'));
  const currentTeamName = cleanWiki(param(p, 'team', 'currentteam', 'teamname'));
  const soloqueueIds = cleanWiki(param(p, 'ids', 'soloquequeueids', 'soloqueueids'));

  set('name', realName && key(realName) !== key(player.id) ? realName : null);
  set('nativeName', nativeName);
  set('country', country);
  set('nationality', nationality || country);
  set('birthdate', birthdate, true);
  set('birthYear', birthdate ? Number(birthdate.slice(0, 4)) : null, true);
  set('age', ageFromBirthdate(birthdate), true);
  set('contract', contract, true);
  set('residency', residency);
  set('currentTeamName', currentTeamName, true);
  set('soloqueueIds', soloqueueIds);
  set('image', profile.image, true);
  set('sourcePage', profile.sourcePage, true);

  const socials = { ...(player.socials || {}) };
  const socialValues = {
    twitter: cleanWiki(param(p, 'twitter')),
    instagram: cleanWiki(param(p, 'instagram')),
    stream: cleanWiki(param(p, 'stream', 'twitch')),
    youtube: cleanWiki(param(p, 'youtube'))
  };
  for (const [name, value] of Object.entries(socialValues)) {
    if (value && socials[name] !== value) { socials[name] = value; changed = true; }
  }
  player.socials = socials;
  player.bioEnriched = Boolean(realName || country || birthdate || nativeName || contract || currentTeamName || Object.values(socialValues).some(Boolean));
  player.bioSource = player.bioEnriched ? 'Leaguepedia player infobox' : player.bioSource || null;
  return changed;
}

function enrichTeam(team, profile) {
  let changed = false;
  if (profile.image && team.logo !== profile.image) { team.logo = profile.image; changed = true; }
  if (profile.sourcePage && team.sourcePage !== profile.sourcePage) { team.sourcePage = profile.sourcePage; changed = true; }
  return changed;
}

async function enrich(items, titleOf, apply, label) {
  let enriched = 0;
  let failedBatches = 0;
  let withImage = 0;
  let withBio = 0;
  const unique = [...new Set(items.map(titleOf).map(x => String(x || '').trim()).filter(Boolean))];
  const allBatches = chunks(unique, BATCH);

  for (const [index, batch] of allBatches.entries()) {
    try {
      const profiles = await queryProfiles(batch);
      for (const item of items) {
        const title = titleOf(item);
        if (!batch.some(x => key(x) === key(title))) continue;
        const found = profiles.get(key(title));
        if (!found) continue;
        if (found.image) withImage++;
        if (apply(item, found)) enriched++;
        if (item.bioEnriched) withBio++;
      }
      console.log(`${label} batch ${index + 1}/${allBatches.length}: changed=${enriched}, image=${withImage}, bio=${withBio}`);
    } catch (error) {
      failedBatches++;
      console.log(`${label} batch lỗi: ${error.message}`);
    }
    await sleep(DELAY_MS);
  }
  return { enriched, withImage, withBio, failedBatches, totalTitles: unique.length };
}

const directory = JSON.parse(await fs.readFile(file, 'utf8'));
const players = directory.players || [];
const teams = directory.teams || [];
players.sort((a, b) => Number(b.featured) - Number(a.featured) || String(b.latestGameAt || '').localeCompare(String(a.latestGameAt || '')));

const playerResult = await enrich(players, p => p.overviewPage || p.id, enrichPlayer, 'Player');
const teamById = new Map(teams.map(t => [t.id, t]));
const teamResult = await enrich(teams, t => t.name, enrichTeam, 'Team');

for (const player of players) {
  const team = player.team && teamById.get(player.team.id);
  if (team) player.team = { ...player.team, ...team };
}

directory.mediaEnrichedAt = new Date().toISOString();
directory.mediaSource = 'Leaguepedia / League of Legends Esports Wiki current infobox + MediaWiki images';
directory.mediaStatus = {
  players: playerResult,
  teams: teamResult,
  partial: playerResult.failedBatches > 0 || teamResult.failedBatches > 0
};

directory.countries = [...new Set(players.map(p => p.country || p.nationality).filter(Boolean))].sort((a, b) => a.localeCompare(b));

await fs.writeFile(file, JSON.stringify(directory, null, 2));
console.log(`Profile enrichment xong: player changed=${playerResult.enriched}/${playerResult.totalTitles}, image=${playerResult.withImage}, bio=${playerResult.withBio}; team changed=${teamResult.enriched}/${teamResult.totalTitles}.`);
