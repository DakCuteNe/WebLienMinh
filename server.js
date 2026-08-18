import express from 'express';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DDRAGON_VERSIONS = 'https://ddragon.leagueoflegends.com/api/versions.json';
const PATCH_INDEX = 'https://www.leagueoflegends.com/en-us/news/tags/patch-notes/';
const RIOT_DIR = path.join(__dirname, 'data', 'riot');

let cache = { version: null, champions: null, championDetails: new Map(), at: 0, staticLookups: null };

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

async function getLatestVersion() {
  if (cache.version && Date.now() - cache.at < 10 * 60_000) return cache.version;
  const r = await fetch(DDRAGON_VERSIONS);
  if (!r.ok) throw new Error(`Data Dragon versions: ${r.status}`);
  const versions = await r.json();
  cache.version = versions[0];
  cache.at = Date.now();
  return cache.version;
}

async function getChampionIndex() {
  const version = await getLatestVersion();
  if (cache.champions?.version === version) return cache.champions;
  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/vi_VN/champion.json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Champion index: ${r.status}`);
  const body = await r.json();
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
  const spellById = new Map(Object.values(spells?.data || {}).map(s => [Number(s.key), s]));
  cache.staticLookups = { itemById, runeById, spellById };
  return cache.staticLookups;
}

async function readMeta() {
  for (const file of ['meta.json', 'meta-seed.json']) {
    try {
      const raw = await fs.readFile(path.join(__dirname, 'data', file), 'utf8');
      return JSON.parse(raw);
    } catch {}
  }
  return { patch: 'unknown', mode: 'empty', champions: [] };
}

async function readPros() {
  return await readJson(path.join(__dirname, 'data', 'pros.json'), {
    generatedAt: null,
    source: 'Leaguepedia',
    note: 'Chưa có dữ liệu tuyển thủ. Workflow sẽ thử cập nhật tự động.',
    players: []
  });
}

function itemView(id, item, version) {
  return {
    id: Number(id),
    name: item?.name || String(id),
    description: item?.plaintext || '',
    image: item?.image?.full ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.image.full}` : null
  };
}

function runeView(id, rune) {
  return {
    id: Number(id),
    name: rune?.name || String(id),
    icon: rune?.icon ? `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}` : null,
    treeName: rune?.treeName || (rune?.tree ? rune.name : null)
  };
}

function spellView(id, spell, version) {
  return {
    id: Number(id),
    name: spell?.name || String(id),
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

app.get('/api/status', async (_req, res) => {
  try {
    const meta = await readMeta();
    res.json({
      ok: true,
      ddragon: await getLatestVersion(),
      metaPatch: meta.patch,
      metaMode: meta.mode,
      sampleGames: meta.sampleGames || 0,
      generatedAt: meta.generatedAt || null,
      riotApiConfigured: Boolean(process.env.RIOT_API_KEY),
      platform: process.env.RIOT_PLATFORM || 'vn2',
      region: process.env.RIOT_REGION || 'sea'
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/champions', async (_req, res) => {
  try {
    const { version, data } = await getChampionIndex();
    const meta = await readMeta();
    const byId = new Map(meta.champions.map(x => [x.id, x]));
    const champions = Object.values(data).map(c => ({
      id: c.id,
      key: c.key,
      name: c.name,
      title: c.title,
      tags: c.tags,
      image: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${c.image.full}`,
      splash: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${c.id}_0.jpg`,
      meta: byId.get(c.id) || null
    }));
    res.json({ version, metaMode: meta.mode, patch: meta.patch, champions });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
      const c = data[row.id];
      return {
        ...row,
        name: c?.name || row.id,
        image: c ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${c.image.full}` : null
      };
    });
    if (role !== 'ALL') rows = rows.filter(x => x.role === role);
    if (tier !== 'ALL') rows = rows.filter(x => x.tier === tier);
    if (search) rows = rows.filter(x => `${x.name} ${x.id}`.toLowerCase().includes(search));
    rows.sort((a, b) => ['S','A','B','C','D'].indexOf(a.tier) - ['S','A','B','C','D'].indexOf(b.tier) || Number(b.tierScore || 0) - Number(a.tierScore || 0));
    res.json({ ...meta, champions: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/champion/:id', async (req, res) => {
  try {
    const version = await getLatestVersion();
    const id = req.params.id;
    const key = `${version}:${id}`;
    let data = cache.championDetails.get(key);
    if (!data) {
      const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/vi_VN/champion/${encodeURIComponent(id)}.json`;
      const r = await fetch(url);
      if (!r.ok) return res.status(404).json({ error: 'Không tìm thấy tướng' });
      const body = await r.json();
      data = body.data[id];
      cache.championDetails.set(key, data);
    }
    const meta = await readMeta();
    const stats = meta.champions.find(x => x.id === id) || null;
    res.json({ version, champion: data, meta: await decorateMeta(stats, version), methodology: meta.methodology || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
  } catch (e) {
    res.status(500).json({ error: e.message });
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
      })),
      recentGames: (player.recentGames || []).map(x => ({
        ...x,
        championImage: data[x.champion] ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${data[x.champion].image.full}` : null,
        championName: data[x.champion]?.name || x.champion
      }))
    }));
    res.json({ ...pros, players });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/patches', async (_req, res) => {
  try {
    const r = await fetch(PATCH_INDEX, { headers: { 'user-agent': 'RiftMetaVN/1.2' } });
    if (!r.ok) throw new Error(`Riot patch page: ${r.status}`);
    const html = await r.text();
    const re = /href="([^"]*league-of-legends-patch-([0-9-]+)-notes[^"]*)"[^>]*>[\s\S]{0,800}?League of Legends Patch\s+([0-9.]+)/gi;
    const seen = new Set();
    const patches = [];
    let m;
    while ((m = re.exec(html)) && patches.length < 8) {
      const patch = m[3];
      if (seen.has(patch)) continue;
      seen.add(patch);
      const href = m[1].startsWith('http') ? m[1] : `https://www.leagueoflegends.com${m[1]}`;
      patches.push({ patch, title: `League of Legends Patch ${patch} Notes`, url: href });
    }
    res.json({ source: 'Riot Games', patches });
  } catch (e) {
    res.json({ source: 'Riot Games', warning: e.message, patches: [] });
  }
});

app.get('/api/riot/account', async (req, res) => {
  const key = process.env.RIOT_API_KEY;
  if (!key) return res.status(503).json({ error: 'Chưa cấu hình RIOT_API_KEY trong .env' });
  const gameName = String(req.query.gameName || '').trim();
  const tagLine = String(req.query.tagLine || '').trim();
  if (!gameName || !tagLine) return res.status(400).json({ error: 'Thiếu gameName hoặc tagLine' });
  const region = process.env.RIOT_REGION || 'sea';
  const url = `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const r = await fetch(url, { headers: { 'X-Riot-Token': key } });
  const body = await r.json().catch(() => ({}));
  res.status(r.status).json(body);
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint không tồn tại' }));
app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Rift Meta VN: http://localhost:${PORT}`));
