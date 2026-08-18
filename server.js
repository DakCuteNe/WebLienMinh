import express from 'express';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installEsportsLiveRoutes } from './server/esports-live.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_VERSION = '2.5.1';
const RIOT_DIR = path.join(__dirname, 'data', 'riot');
const LEAGUEPEDIA_API = 'https://lol.fandom.com/api.php';
const DDRAGON_VERSIONS = 'https://ddragon.leagueoflegends.com/api/versions.json';
const PATCH_INDEX = 'https://www.leagueoflegends.com/en-us/news/tags/patch-notes/';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let cache = { version: null, champions: null, championDetails: new Map(), staticLookups: null, at: 0, esportsAt: 0, esports: null };

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

async function getLatestVersion() {
  if (cache.version && Date.now() - cache.at < 10 * 60_000) return cache.version;
  const response = await fetch(DDRAGON_VERSIONS);
  if (!response.ok) throw new Error(`Data Dragon versions: ${response.status}`);
  const versions = await response.json();
  cache.version = versions[0];
  cache.at = Date.now();
  return cache.version;
}

async function getChampionIndex() {
  const version = await getLatestVersion();
  if (cache.champions?.version === version) return cache.champions;
  const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/vi_VN/champion.json`);
  if (!response.ok) throw new Error(`Champion index: ${response.status}`);
  const body = await response.json();
  cache.champions = { version, data: body.data };
  return cache.champions;
}

async function getStaticLookups() {
  if (cache.staticLookups) return cache.staticLookups;
  const [items, runes, spells] = await Promise.all([
    readJson(path.join(RIOT_DIR, 'items.json'), { data: {} }),
    readJson(path.join(RIOT_DIR, 'runes.json'), []),
    readJson(path.join(RIOT_DIR, 'summoner-spells.json'), { data: {} })
  ]);
  const itemById = new Map(Object.entries(items?.data || {}).map(([id, item]) => [Number(id), item]));
  const runeById = new Map();
  for (const tree of runes || []) {
    runeById.set(Number(tree.id), { id: Number(tree.id), name: tree.name, icon: tree.icon, tree: true });
    for (const slot of tree.slots || []) {
      for (const rune of slot.runes || []) runeById.set(Number(rune.id), { ...rune, treeName: tree.name });
    }
  }
  const spellById = new Map(Object.values(spells?.data || {}).map(spell => [Number(spell.key), spell]));
  cache.staticLookups = { items, runes, spells, itemById, runeById, spellById };
  return cache.staticLookups;
}

async function readMeta() {
  for (const file of ['meta.json', 'meta-seed.json']) {
    const result = await readJson(path.join(__dirname, 'data', file));
    if (result) return result;
  }
  return { patch: 'unknown', mode: 'empty', champions: [] };
}

async function readPros() {
  return await readJson(path.join(__dirname, 'data', 'pros.json'), { generatedAt: null, players: [] });
}

async function readEsportsDirectory() {
  if (cache.esports && Date.now() - cache.esportsAt < 5 * 60_000) return cache.esports;
  cache.esports = await readJson(path.join(__dirname, 'data', 'esports-directory.json'), {
    generatedAt: null,
    playerCount: 0,
    teamCount: 0,
    regions: [],
    countries: [],
    teams: [],
    players: [],
    coverage: 'Directory is waiting for the first GitHub Actions update.'
  });
  cache.esportsAt = Date.now();
  return cache.esports;
}

function itemView(id, item, version) {
  return {
    id: Number(id),
    name: item?.name || String(id),
    description: item?.plaintext || '',
    fullDescription: String(item?.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    gold: item?.gold?.total || 0,
    image: item?.image?.full ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.image.full}` : null
  };
}

function runeView(id, rune) {
  return {
    id: Number(id),
    name: rune?.name || String(id),
    icon: rune?.icon ? `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}` : null,
    treeName: rune?.treeName || (rune?.tree ? rune.name : null),
    shortDesc: String(rune?.shortDesc || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  };
}

function spellView(id, spell, version) {
  return {
    id: Number(id),
    name: spell?.name || String(id),
    description: spell?.description || '',
    image: spell?.image?.full ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${spell.image.full}` : null
  };
}

async function decorateMeta(row, version) {
  if (!row) return null;
  const { itemById, runeById, spellById } = await getStaticLookups();
  return {
    ...row,
    items: (row.items || []).map(x => ({ ...x, ...itemView(x.id, itemById.get(Number(x.id)), version) })),
    coreBuilds: (row.coreBuilds || []).map(build => ({
      ...build,
      items: (build.items || []).map(id => itemView(id, itemById.get(Number(id)), version))
    })),
    runes: (row.runes || []).map(page => ({
      ...page,
      primary: runeView(page.primaryStyle, runeById.get(Number(page.primaryStyle))),
      secondary: runeView(page.secondaryStyle, runeById.get(Number(page.secondaryStyle))),
      perks: (page.perks || []).map(id => runeView(id, runeById.get(Number(id))))
    })),
    spells: (row.spells || []).map(combo => ({
      ...combo,
      spells: (combo.ids || []).map(id => spellView(id, spellById.get(Number(id)), version))
    }))
  };
}

function escapeCargo(value) {
  return String(value || '').replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

async function leaguepediaCargo(params) {
  const query = new URLSearchParams({ action: 'cargoquery', format: 'json', ...params });
  const response = await fetch(`${LEAGUEPEDIA_API}?${query}`, {
    headers: { 'User-Agent': `WebLienMinh/${APP_VERSION} achievements-on-demand` }
  });
  if (!response.ok) throw new Error(`Leaguepedia ${response.status}`);
  const body = await response.json();
  if (body?.error) throw new Error(body.error.info || body.error.code);
  return (body.cargoquery || []).map(x => x.title || x);
}

// Current player/media routes are installed before the rest of the API. Achievements are
// intentionally loaded only through the dedicated on-demand endpoint in this module.
installEsportsLiveRoutes(app, { readEsportsDirectory, readPros, leaguepediaCargo, escapeCargo });

app.get('/api/status', async (_req, res) => {
  try {
    const [meta, esports] = await Promise.all([readMeta(), readEsportsDirectory()]);
    const isGlobal = String(meta.mode || '').toLowerCase().includes('global') || String(meta.scope || '').toUpperCase() === 'GLOBAL';
    res.json({
      ok: true,
      version: APP_VERSION,
      ddragon: await getLatestVersion(),
      metaPatch: meta.patch,
      metaMode: meta.mode,
      metaScope: isGlobal ? 'GLOBAL' : (meta.scope || null),
      sampleGames: meta.sampleGames || 0,
      generatedAt: meta.generatedAt || null,
      esportsPlayers: esports.playerCount || esports.players?.length || 0,
      esportsTeams: esports.teamCount || esports.teams?.length || 0,
      esportsGeneratedAt: esports.generatedAt || null,
      riotApiConfigured: Boolean(process.env.RIOT_API_KEY),
      platform: isGlobal ? 'GLOBAL' : (process.env.RIOT_PLATFORM || 'vn2'),
      region: isGlobal ? 'GLOBAL' : (process.env.RIOT_REGION || 'sea')
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/champions', async (_req, res) => {
  try {
    const { version, data } = await getChampionIndex();
    const meta = await readMeta();
    const byId = new Map(meta.champions.map(x => [x.id, x]));
    const champions = Object.values(data).map(champion => ({
      id: champion.id,
      key: champion.key,
      name: champion.name,
      title: champion.title,
      tags: champion.tags,
      image: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.image.full}`,
      splash: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_0.jpg`,
      meta: byId.get(champion.id) || null
    }));
    res.json({ version, metaMode: meta.mode, patch: meta.patch, champions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/assets/items', async (req, res) => {
  try {
    const version = await getLatestVersion();
    const { items } = await getStaticLookups();
    const q = String(req.query.search || '').trim().toLowerCase();
    let rows = Object.entries(items?.data || {})
      .filter(([, item]) => item?.maps?.['11'] && item?.gold?.purchasable !== false && item?.inStore !== false)
      .map(([id, item]) => itemView(id, item, version));
    if (q) rows = rows.filter(x => `${x.name} ${x.description}`.toLowerCase().includes(q));
    rows.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    res.json({ version, count: rows.length, items: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/assets/runes', async (req, res) => {
  try {
    const { runes } = await getStaticLookups();
    const q = String(req.query.search || '').trim().toLowerCase();
    const trees = (runes || []).map(tree => ({
      id: tree.id,
      name: tree.name,
      icon: `https://ddragon.leagueoflegends.com/cdn/img/${tree.icon}`,
      runes: (tree.slots || []).flatMap(slot => slot.runes || []).map(rune => runeView(rune.id, { ...rune, treeName: tree.name }))
    })).map(tree => q ? { ...tree, runes: tree.runes.filter(r => `${r.name} ${r.shortDesc}`.toLowerCase().includes(q)) } : tree)
      .filter(tree => !q || tree.name.toLowerCase().includes(q) || tree.runes.length);
    res.json({ trees });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/meta', async (req, res) => {
  try {
    const meta = await readMeta();
    const { version, data } = await getChampionIndex();
    const role = String(req.query.role || 'ALL').toUpperCase();
    const search = String(req.query.search || '').trim().toLowerCase();
    const tier = String(req.query.tier || 'ALL').toUpperCase();
    let rows = meta.champions.map(row => {
      const champion = data[row.id];
      return {
        ...row,
        name: champion?.name || row.id,
        image: champion ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.image.full}` : null
      };
    });
    if (role !== 'ALL') rows = rows.filter(x => x.role === role);
    if (tier !== 'ALL') rows = rows.filter(x => x.tier === tier);
    if (search) rows = rows.filter(x => `${x.name} ${x.id}`.toLowerCase().includes(search));
    rows.sort((a, b) => ['S','A','B','C','D'].indexOf(a.tier) - ['S','A','B','C','D'].indexOf(b.tier) || Number(b.tierScore || 0) - Number(a.tierScore || 0));
    res.json({ ...meta, champions: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/champion/:id', async (req, res) => {
  try {
    const version = await getLatestVersion();
    const id = req.params.id;
    const key = `${version}:${id}`;
    let data = cache.championDetails.get(key);
    if (!data) {
      const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/vi_VN/champion/${encodeURIComponent(id)}.json`);
      if (!response.ok) return res.status(404).json({ error: 'Không tìm thấy tướng' });
      const body = await response.json();
      data = body.data[id];
      cache.championDetails.set(key, data);
    }
    const meta = await readMeta();
    const stats = meta.champions.find(x => x.id === id) || null;
    res.json({ version, champion: data, meta: await decorateMeta(stats, version), methodology: meta.methodology || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/counter/:id', async (req, res) => {
  try {
    const meta = await readMeta();
    const { version, data } = await getChampionIndex();
    const requestedRole = String(req.query.role || '').toUpperCase();
    const candidates = meta.champions.filter(x => x.id.toLowerCase() === req.params.id.toLowerCase());
    const row = candidates.find(x => !requestedRole || x.role === requestedRole) || candidates.sort((a,b) => b.games - a.games)[0];
    if (!row) return res.status(404).json({ error: 'Tướng này chưa có dữ liệu matchup trong dataset hiện tại.' });
    const decorate = (matchups, fallbackIds = []) => {
      const source = matchups?.length ? matchups : fallbackIds.map(id => ({ id }));
      return source.map(matchup => {
        const id = matchup.id;
        return {
          id,
          name: data[id]?.name || id,
          image: data[id] ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${data[id].image.full}` : null,
          matchup,
          stats: meta.champions.find(x => x.id === id && x.role === row.role) || meta.champions.find(x => x.id === id) || null
        };
      });
    };
    res.json({
      champion: { id: row.id, name: data[row.id]?.name || row.id, role: row.role, games: row.games, tierScore: row.tierScore },
      counters: decorate(row.counterMatchups, row.counters || []),
      goodAgainst: decorate(row.goodMatchups, row.goodAgainst || []),
      mode: meta.mode,
      patch: meta.patch,
      methodology: meta.methodology?.counter || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/pros', async (_req, res) => {
  try {
    const pros = await readPros();
    const { version, data } = await getChampionIndex();
    const players = (pros.players || []).map(player => ({
      ...player,
      championPool: (player.championPool || []).map(x => ({
        ...x,
        image: data[x.name] ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${data[x.name].image.full}` : null,
        displayName: data[x.name]?.name || x.name
      }))
    }));
    res.json({ ...pros, players });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/esports', async (req, res) => {
  try {
    const directory = await readEsportsDirectory();
    const search = String(req.query.search || '').trim().toLowerCase();
    const role = String(req.query.role || 'ALL').toUpperCase();
    const region = String(req.query.region || 'ALL');
    const team = String(req.query.team || 'ALL');
    const country = String(req.query.country || 'ALL');
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(60, Number(req.query.limit || 36)));
    let players = [...(directory.players || [])];
    if (search) players = players.filter(p => `${p.id} ${p.name} ${p.currentTeamName || ''} ${p.team?.name || ''} ${p.country || ''}`.toLowerCase().includes(search));
    if (role !== 'ALL') players = players.filter(p => p.role === role);
    if (region !== 'ALL') players = players.filter(p => (p.team?.region || p.residency) === region);
    if (team !== 'ALL') players = players.filter(p => p.team?.id === team);
    if (country !== 'ALL') players = players.filter(p => (p.country || p.nationality) === country);
    players.sort((a,b) => Number(b.featured) - Number(a.featured) || (a.currentTeamName || a.team?.name || '').localeCompare(b.currentTeamName || b.team?.name || '') || a.id.localeCompare(b.id));
    const total = players.length;
    const start = (page - 1) * limit;
    res.json({
      generatedAt: directory.generatedAt,
      mediaEnrichedAt: directory.mediaEnrichedAt || null,
      source: directory.source,
      coverage: directory.coverage,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      players: players.slice(start, start + limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/esports/filters', async (_req, res) => {
  try {
    const directory = await readEsportsDirectory();
    res.json({
      generatedAt: directory.generatedAt,
      mediaEnrichedAt: directory.mediaEnrichedAt || null,
      regions: directory.regions || [],
      countries: directory.countries || [],
      teams: (directory.teams || []).map(t => ({ id: t.id, name: t.name, short: t.short, region: t.region, logo: t.logo }))
        .sort((a,b) => a.name.localeCompare(b.name)),
      playerCount: directory.playerCount || directory.players?.length || 0,
      teamCount: directory.teamCount || directory.teams?.length || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/patches', async (_req, res) => {
  let liveWarning = null;
  try {
    const response = await fetch(PATCH_INDEX, { headers: { 'user-agent': `RiftMetaGlobal/${APP_VERSION}` } });
    if (!response.ok) throw new Error(`Riot patch page: ${response.status}`);
    const html = await response.text();
    const re = /href="([^"]*league-of-legends-patch-([0-9-]+)-notes[^"]*)"[^>]*>[\s\S]{0,800}?League of Legends Patch\s+([0-9.]+)/gi;
    const seen = new Set();
    const patches = [];
    let match;
    while ((match = re.exec(html)) && patches.length < 8) {
      const patch = match[3];
      if (seen.has(patch)) continue;
      seen.add(patch);
      const href = match[1].startsWith('http') ? match[1] : `https://www.leagueoflegends.com${match[1]}`;
      patches.push({ patch, title: `League of Legends Patch ${patch} Notes`, url: href });
    }
    if (patches.length) return res.json({ source: 'Riot Games', sourceMode: 'live', patches });
    liveWarning = 'Riot live parser không tìm thấy Patch Notes.';
  } catch (error) {
    liveWarning = error.message;
  }

  const cached = await readJson(path.join(__dirname, 'public', 'data', 'patches.json'), { patches: [] });
  if (cached?.patches?.length) {
    return res.json({ ...cached, source: cached.source || 'Riot Games', sourceMode: 'cache', warning: liveWarning });
  }
  return res.json({ source: 'Riot Games', sourceMode: 'unavailable', warning: liveWarning || 'Chưa đọc được Patch Notes.', patches: [] });
});

app.get('/api/riot/account', async (req, res) => {
  const key = process.env.RIOT_API_KEY;
  if (!key) return res.status(503).json({ error: 'Chưa cấu hình RIOT_API_KEY trong environment.' });
  const gameName = String(req.query.gameName || '').trim();
  const tagLine = String(req.query.tagLine || '').trim();
  if (!gameName || !tagLine) return res.status(400).json({ error: 'Thiếu gameName hoặc tagLine' });
  const region = process.env.RIOT_REGION || 'sea';
  const url = `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const response = await fetch(url, { headers: { 'X-Riot-Token': key } });
  const body = await response.json().catch(() => ({}));
  res.status(response.status).json(body);
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint không tồn tại' }));
app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Rift Meta Global ${APP_VERSION}: http://localhost:${PORT}`));
