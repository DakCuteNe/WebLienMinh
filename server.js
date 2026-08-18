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

let cache = { version: null, champions: null, championDetails: new Map(), at: 0 };

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

async function readMeta() {
  for (const file of ['meta.json', 'meta-seed.json']) {
    try {
      const raw = await fs.readFile(path.join(__dirname, 'data', file), 'utf8');
      return JSON.parse(raw);
    } catch {}
  }
  return { patch: 'unknown', mode: 'empty', champions: [] };
}

app.get('/api/status', async (_req, res) => {
  try {
    const meta = await readMeta();
    res.json({
      ok: true,
      ddragon: await getLatestVersion(),
      metaPatch: meta.patch,
      metaMode: meta.mode,
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
    rows.sort((a, b) => ['S','A','B','C','D'].indexOf(a.tier) - ['S','A','B','C','D'].indexOf(b.tier) || b.winRate - a.winRate);

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
    res.json({ version, champion: data, meta: stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/counter/:id', async (req, res) => {
  try {
    const meta = await readMeta();
    const { version, data } = await getChampionIndex();
    const row = meta.champions.find(x => x.id.toLowerCase() === req.params.id.toLowerCase());
    if (!row) return res.status(404).json({ error: 'Tướng này chưa có dữ liệu matchup trong dataset hiện tại.' });

    const decorate = ids => ids.map(id => ({
      id,
      name: data[id]?.name || id,
      image: data[id] ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${data[id].image.full}` : null,
      stats: meta.champions.find(x => x.id === id) || null
    }));

    res.json({
      champion: { id: row.id, name: data[row.id]?.name || row.id, role: row.role },
      counters: decorate(row.counters || []),
      goodAgainst: decorate(row.goodAgainst || []),
      mode: meta.mode,
      patch: meta.patch
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/patches', async (_req, res) => {
  try {
    const r = await fetch(PATCH_INDEX, { headers: { 'user-agent': 'RiftMetaVN/1.0' } });
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
    if (!patches.length) {
      patches.push({ patch: '26.16', title: 'League of Legends Patch 26.16 Notes', url: 'https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-16-notes/' });
    }
    res.json({ source: 'Riot Games', patches });
  } catch (e) {
    res.json({ source: 'Riot Games', warning: e.message, patches: [{ patch: '26.16', title: 'League of Legends Patch 26.16 Notes', url: 'https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-16-notes/' }] });
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

app.listen(PORT, () => {
  console.log(`Rift Meta VN: http://localhost:${PORT}`);
});
