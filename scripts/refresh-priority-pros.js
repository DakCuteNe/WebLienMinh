import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const directoryFile = path.join(root, 'data', 'esports-directory.json');
const watchFile = path.join(root, 'data', 'pro-watchlist.json');
const API = 'https://lol.fandom.com/api.php';
const CURRENT_YEAR = new Date().getUTCFullYear();
const ACTIVE_DAYS = Math.max(60, Number(process.env.ESPORTS_MAJOR_ACTIVE_DAYS || 180));
const DELAY_MS = Math.max(650, Number(process.env.ESPORTS_PRIORITY_MEDIA_DELAY_MS || 850));
const MAJOR_REGIONS = new Set(String(process.env.ESPORTS_MAJOR_REGIONS || 'LCK,LPL,LEC,LCS,LCP,VCS')
  .split(',').map(x => x.trim().toUpperCase()).filter(Boolean));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const directory = JSON.parse(await fs.readFile(directoryFile, 'utf8'));
const watch = JSON.parse(await fs.readFile(watchFile, 'utf8'));
const players = directory.players || [];

function norm(value) {
  return String(value || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replaceAll('_', ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function cleanTitle(value) {
  let title = String(value || '').trim();
  if (!title) return null;
  try {
    const url = new URL(title);
    const marker = '/wiki/';
    const at = url.pathname.indexOf(marker);
    if (at >= 0) title = decodeURIComponent(url.pathname.slice(at + marker.length));
  } catch {}
  return title.replaceAll('_', ' ').trim() || null;
}

function fileName(value) {
  return String(value || '').replace(/^File:/i, '').trim();
}

function embeddedYear(value) {
  const years = [...String(value || '').matchAll(/\b(20\d{2})\b/g)].map(m => Number(m[1]));
  return years.length ? Math.max(...years) : null;
}

function timestampYear(meta) {
  const year = Number(String(meta?.timestamp || '').slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function looksBad(value) {
  const text = norm(value);
  return /\b(roster|lineup|poster|squad|team photo|teamphoto|wallpaper|banner|schedule|match|versus|vs|logo|icon|ward|champion|skin|flag|coach)\b/.test(text);
}

function looksLegacy(value) {
  const text = norm(value);
  return /\b(old|oldlogo|legacy|former|previous|archive|archived|retired)\b/.test(text) || /old[_ -]?logo/i.test(String(value || ''));
}

function roleFamily(value) {
  const text = norm(value);
  if (text.includes('top')) return 'top';
  if (text.includes('jung') || text === 'jng' || text === 'jg') return 'jungle';
  if (text.includes('mid')) return 'middle';
  if (['bottom','bot','adc','ad carry','marksman'].some(token => text.includes(token))) return 'bottom';
  if (text.includes('support') || text.includes('utility') || text === 'sup') return 'support';
  return null;
}

function activeMajor(player) {
  if (!MAJOR_REGIONS.has(String(player.team?.region || '').toUpperCase())) return false;
  const latest = Date.parse(player.latestGameAt || '');
  if (!Number.isFinite(latest)) return true;
  return Date.now() - latest <= ACTIVE_DAYS * 86_400_000;
}

function watchMatchesPlayer(target, player) {
  if (norm(target.name) !== norm(player.id)) return false;
  if (target.team && norm(target.team) !== norm(player.team?.name)) return false;
  const wantedRole = roleFamily(target.role);
  const actualRole = roleFamily(player.role);
  if (wantedRole && actualRole && wantedRole !== actualRole) return false;
  return true;
}

function findPlayer(target) {
  const candidates = players.filter(player => activeMajor(player) && watchMatchesPlayer(target, player));
  if (candidates.length === 1) return candidates[0];
  if (target.page) {
    const exact = candidates.filter(player => [player.preferredPage, player.profilePageTitle, player.overviewPage, player.identityId]
      .filter(Boolean).some(page => norm(page) === norm(target.page)));
    if (exact.length === 1) return exact[0];
  }
  return null;
}

function playerTokenMatches(player, value) {
  const text = norm(fileName(value));
  return norm(player.id).split(/\s+/).filter(Boolean).some(token => text.includes(token));
}

function teamTokenScore(player, value) {
  const text = norm(fileName(value));
  const teamTokens = norm(player.team?.name).split(/\s+/).filter(token => token.length >= 3 && !['team','gaming','esports'].includes(token));
  return teamTokens.filter(token => text.includes(token)).length;
}

function scoreImage(player, meta) {
  const name = fileName(meta.title);
  if (!playerTokenMatches(player, name) || looksBad(name) || looksLegacy(name)) return -999;
  let score = 150;
  score += Math.min(60, teamTokenScore(player, name) * 20);
  if (/player|profile|headshot|portrait|official/.test(norm(name))) score += 30;
  const fileYear = embeddedYear(name);
  if (fileYear === CURRENT_YEAR) score += 110;
  else if (fileYear === CURRENT_YEAR - 1) score += 50;
  else if (fileYear && fileYear <= CURRENT_YEAR - 2) score -= 80;
  const uploaded = timestampYear(meta);
  if (uploaded === CURRENT_YEAR) score += 65;
  else if (uploaded === CURRENT_YEAR - 1) score += 25;
  else if (uploaded && uploaded <= CURRENT_YEAR - 3) score -= 35;
  if (meta.width && meta.height) {
    const ratio = meta.height / Math.max(1, meta.width);
    if (ratio >= 0.7 && ratio <= 2.8) score += 20;
    else if (ratio < 0.45 || ratio > 3.3) score -= 40;
  }
  return score;
}

async function api(params, label) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const query = new URLSearchParams({ action: 'query', format: 'json', origin: '*', maxlag: '5', ...params });
      const response = await fetch(`${API}?${query}`, {
        headers: { 'User-Agent': 'WebLienMinh/2.7 priority-pro-media-refresh' },
        signal: AbortSignal.timeout(35_000)
      });
      if ([429, 502, 503, 504].includes(response.status)) {
        const retryAfter = Number(response.headers.get('retry-after') || 0) * 1000;
        await sleep(Math.max(retryAfter, DELAY_MS * (attempt + 2)));
        continue;
      }
      if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
      const body = await response.json();
      if (body?.error) throw new Error(`${label}: ${body.error.info || body.error.code}`);
      await sleep(DELAY_MS);
      return body;
    } catch (error) {
      lastError = error;
      await sleep(DELAY_MS * (attempt + 2));
    }
  }
  throw lastError || new Error(`${label}: request failed`);
}

async function pageImages(title) {
  if (!title) return [];
  try {
    const body = await api({ redirects: '1', prop: 'images', titles: title, imlimit: 'max' }, `priority images ${title}`);
    const page = Object.values(body.query?.pages || {}).find(row => !row.missing);
    return [...new Set((page?.images || []).map(row => row.title).filter(Boolean))];
  } catch (error) {
    console.log(`Priority page images skipped ${title}: ${error.message}`);
    return [];
  }
}

async function searchFiles(query, limit = 30) {
  try {
    const body = await api({ list: 'search', srnamespace: '6', srsearch: query, srlimit: String(limit) }, `priority search ${query}`);
    return (body.query?.search || []).map(row => row.title).filter(Boolean);
  } catch (error) {
    console.log(`Priority search skipped ${query}: ${error.message}`);
    return [];
  }
}

async function imageInfo(titles) {
  const unique = [...new Set(titles.map(title => title.startsWith('File:') ? title : `File:${title}`).filter(Boolean))].slice(0, 45);
  if (!unique.length) return [];
  try {
    const body = await api({ prop: 'imageinfo', iiprop: 'url|timestamp|size', iiurlwidth: '900', titles: unique.join('|') }, 'priority imageinfo');
    const out = [];
    for (const page of Object.values(body.query?.pages || {})) {
      if (page.missing) continue;
      const info = page.imageinfo?.[0];
      if (!info) continue;
      out.push({
        title: page.title,
        url: info.thumburl || info.url || null,
        timestamp: info.timestamp || null,
        width: Number(info.width || 0),
        height: Number(info.height || 0)
      });
    }
    return out;
  } catch (error) {
    console.log(`Priority imageinfo skipped: ${error.message}`);
    return [];
  }
}

function sourceForFile(meta) {
  const title = String(meta?.title || '').replaceAll(' ', '_');
  return title ? `https://lol.fandom.com/wiki/${encodeURIComponent(title).replace(/%3A/i, ':')}` : null;
}

const targets = (watch.players || [])
  .map(target => ({ ...target, priority: Math.max(1, Number(target.priority || 3)) }))
  .sort((a, b) => a.priority - b.priority || String(a.name).localeCompare(String(b.name)));

const details = [];
let found = 0;
let refreshed = 0;
let unresolved = 0;
let skippedHealthyTier2 = 0;

for (const target of targets) {
  if (target.priority > 2) continue;
  const player = findPlayer(target);
  if (!player) {
    details.push({ name: target.name, priority: target.priority, status: 'not-active-or-ambiguous' });
    continue;
  }
  found++;

  const healthyExisting = Boolean(player.image) && !looksLegacy(player.image) && !looksBad(player.currentMediaFile || player.image);
  if (target.priority === 2 && healthyExisting && (player.currentMediaRefreshedAt || player.profileOverrideAppliedAt)) {
    skippedHealthyTier2++;
    details.push({ name: player.id, team: player.team?.name || null, region: player.team?.region || null, priority: 2, status: 'healthy-existing' });
    continue;
  }

  const pageTitle = target.page || player.preferredPage || player.profilePageTitle || player.overviewPage || player.identityId || player.id;
  const pagePool = await pageImages(cleanTitle(pageTitle));
  const searchPool = [
    ...(await searchFiles(`${player.id} ${player.team?.name || ''} ${CURRENT_YEAR}`, target.priority === 1 ? 35 : 20)),
    ...(target.priority === 1 ? await searchFiles(`${player.id} ${CURRENT_YEAR}`, 20) : [])
  ];
  const names = [...new Set([...pagePool, ...searchPool])]
    .filter(title => playerTokenMatches(player, title) && !looksBad(title) && !looksLegacy(title))
    .sort((a, b) => {
      const ay = embeddedYear(a) || 0;
      const by = embeddedYear(b) || 0;
      return by - ay || teamTokenScore(player, b) - teamTokenScore(player, a);
    })
    .slice(0, target.priority === 1 ? 40 : 25);

  const metas = await imageInfo(names);
  const ranked = metas.map(meta => ({ ...meta, score: scoreImage(player, meta) }))
    .filter(meta => meta.url && meta.score >= 150)
    .sort((a, b) => b.score - a.score || String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  const best = ranked[0] || null;

  if (!best) {
    unresolved++;
    details.push({ name: player.id, team: player.team?.name || null, region: player.team?.region || null, priority: target.priority, status: 'unresolved' });
    continue;
  }

  player.image = best.url;
  player.preferredImage = best.url;
  player.preferredImageSource = sourceForFile(best);
  player.preferredImageAsOf = String(best.timestamp || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  player.currentMediaFile = best.title;
  player.currentMediaScore = best.score;
  player.currentMediaRefreshedAt = new Date().toISOString();
  player.priorityMediaRefreshedAt = new Date().toISOString();
  player.priorityMediaTier = target.priority;
  refreshed++;
  details.push({
    name: player.id,
    team: player.team?.name || null,
    region: player.team?.region || null,
    priority: target.priority,
    status: 'refreshed',
    file: best.title,
    score: best.score
  });
  console.log(`Priority pro media: P${target.priority} ${player.team?.region || '?'} ${player.id} (${player.team?.name || '?'}) -> ${best.title} score=${best.score}`);
}

directory.priorityProRefresh = {
  generatedAt: new Date().toISOString(),
  source: 'Leaguepedia/Fandom targeted current-media search for curated major-region stars',
  currentYear: CURRENT_YEAR,
  activeDays: ACTIVE_DAYS,
  watchCount: targets.filter(target => target.priority <= 2).length,
  activeFound: found,
  refreshed,
  unresolved,
  skippedHealthyTier2,
  details
};

await fs.writeFile(directoryFile, JSON.stringify(directory, null, 2));
console.log(`Priority pro refresh done: activeFound=${found}, refreshed=${refreshed}, unresolved=${unresolved}, healthyTier2Skipped=${skippedHealthyTier2}.`);
