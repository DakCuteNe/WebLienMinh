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

async function queryPageImages(titles) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    redirects: '1',
    prop: 'pageimages|info',
    piprop: 'thumbnail|name',
    pithumbsize: '520',
    inprop: 'url',
    titles: titles.join('|')
  });

  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(`${API}?${params}`, {
        headers: { 'User-Agent': 'WebLienMinh/2.3 esports-media-enrichment' },
        signal: AbortSignal.timeout(30_000)
      });
      if ([429, 502, 503, 504].includes(response.status)) {
        const wait = Math.max(DELAY_MS * (attempt + 2), Number(response.headers.get('retry-after') || 0) * 1000);
        await sleep(wait);
        continue;
      }
      if (!response.ok) throw new Error(`Leaguepedia MediaWiki HTTP ${response.status}`);
      const body = await response.json();
      if (body?.error) throw new Error(body.error.info || body.error.code);

      const aliases = new Map();
      for (const item of body.query?.normalized || []) aliases.set(key(item.from), item.to);
      for (const item of body.query?.redirects || []) aliases.set(key(item.from), item.to);
      const pages = Object.values(body.query?.pages || {});
      const pageByTitle = new Map(pages.filter(p => !p.missing).map(p => [key(p.title), p]));
      const result = new Map();

      for (const title of titles) {
        let current = title;
        const visited = new Set();
        while (aliases.has(key(current)) && !visited.has(key(current))) {
          visited.add(key(current));
          current = aliases.get(key(current));
        }
        const page = pageByTitle.get(key(current)) || pageByTitle.get(key(title));
        if (!page) continue;
        result.set(key(title), {
          image: page.thumbnail?.source || null,
          pageTitle: page.title || current,
          sourcePage: page.fullurl || `https://lol.fandom.com/wiki/${encodeURIComponent(page.title || current).replace(/%20/g, '_')}`
        });
      }
      return result;
    } catch (error) {
      lastError = error;
      await sleep(DELAY_MS * (attempt + 1));
    }
  }
  throw lastError || new Error('Leaguepedia media query failed.');
}

async function enrich(items, titleOf, apply) {
  let enriched = 0;
  let failedBatches = 0;
  const unique = [...new Set(items.map(titleOf).map(x => String(x || '').trim()).filter(Boolean))];
  for (const [index, batch] of chunks(unique, BATCH).entries()) {
    try {
      const media = await queryPageImages(batch);
      for (const item of items) {
        const title = titleOf(item);
        const found = media.get(key(title));
        if (!found) continue;
        if (apply(item, found)) enriched++;
      }
      console.log(`Media batch ${index + 1}/${Math.ceil(unique.length / BATCH)}: +${enriched}`);
    } catch (error) {
      failedBatches++;
      console.log(`Media batch lỗi: ${error.message}`);
    }
    await sleep(DELAY_MS);
  }
  return { enriched, failedBatches, totalTitles: unique.length };
}

const directory = JSON.parse(await fs.readFile(file, 'utf8'));
const players = directory.players || [];
const teams = directory.teams || [];

// Ưu tiên người nổi bật/gần đây nhưng vẫn thử toàn bộ directory. Query theo batch nên không cần Cargo.
players.sort((a, b) => Number(b.featured) - Number(a.featured) || String(b.latestGameAt || '').localeCompare(String(a.latestGameAt || '')));

const playerResult = await enrich(
  players,
  p => p.overviewPage || p.id,
  (player, media) => {
    let changed = false;
    if (!player.image && media.image) { player.image = media.image; changed = true; }
    if (media.sourcePage) { player.sourcePage = media.sourcePage; changed = true; }
    return changed;
  }
);

const teamById = new Map(teams.map(t => [t.id, t]));
const teamResult = await enrich(
  teams,
  t => t.name,
  (team, media) => {
    let changed = false;
    if (!team.logo && media.image) { team.logo = media.image; changed = true; }
    if (media.sourcePage) { team.sourcePage = media.sourcePage; changed = true; }
    return changed;
  }
);

for (const player of players) {
  const team = player.team && teamById.get(player.team.id);
  if (team) player.team = { ...player.team, ...team };
}

directory.mediaEnrichedAt = new Date().toISOString();
directory.mediaSource = 'Leaguepedia / League of Legends Esports Wiki page images';
directory.mediaStatus = {
  players: playerResult,
  teams: teamResult,
  partial: playerResult.failedBatches > 0 || teamResult.failedBatches > 0
};

await fs.writeFile(file, JSON.stringify(directory, null, 2));
console.log(`Media enrichment xong: player ${playerResult.enriched}/${playerResult.totalTitles}, team ${teamResult.enriched}/${teamResult.totalTitles}.`);
