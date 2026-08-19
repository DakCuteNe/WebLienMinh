import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const directoryFile = path.join(root, 'data', 'esports-directory.json');
const API = 'https://lol.fandom.com/api.php';
const CURRENT_YEAR = new Date().getUTCFullYear();
const ACTIVE_DAYS = Math.max(60, Number(process.env.ESPORTS_MAJOR_ACTIVE_DAYS || 180));
const DELAY_MS = Math.max(600, Number(process.env.ESPORTS_MAJOR_MEDIA_DELAY_MS || 750));
const PLAYER_BATCH = Math.max(10, Math.min(30, Number(process.env.ESPORTS_MAJOR_PLAYER_BATCH || 20)));
const MAJOR_REGIONS = new Set(String(process.env.ESPORTS_MAJOR_REGIONS || 'LCK,LPL,LEC,LCS,LCP,VCS')
  .split(',').map(x => x.trim().toUpperCase()).filter(Boolean));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const directory = JSON.parse(await fs.readFile(directoryFile, 'utf8'));
const players = directory.players || [];
const teams = directory.teams || [];

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

function words(value) {
  return new Set(norm(value).split(/\s+/).filter(Boolean));
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function distinctiveTeamWords(team) {
  const ignored = new Set(['team', 'gaming', 'esports', 'esport', 'club', 'academy', 'challengers']);
  const out = [...words(team.name)].filter(x => !ignored.has(x) && x.length >= 2);
  if (team.short) out.push(...words(team.short));
  const acronym = String(team.name || '').split(/\s+/).filter(Boolean).map(x => x[0]).join('').toLowerCase();
  if (acronym.length >= 2) out.push(acronym);
  return [...new Set(out)];
}

function isClearlyBad(value) {
  const text = norm(value);
  return /\b(roster|lineup|poster|squad|team photo|teamphoto|wallpaper|banner|schedule|match|versus|vs)\b/.test(text);
}

function isLegacy(value) {
  const text = norm(value);
  return /\b(old|oldlogo|legacy|former|previous|archive|archived|retired)\b/.test(text) || /old[_ -]?logo/i.test(String(value || ''));
}

function isTeamEventAsset(value) {
  const text = norm(value);
  return /\b(kickoff|kickoffs|home ground|lock in|lockin|split|winter|spring|summer|season|tournament|championship|cup|msi|worlds|first stand|event)\b/.test(text);
}

function teamLogoIdentityMatches(team, value) {
  const raw = fileName(value).replace(/logo/ig, ' logo ');
  const candidateTokens = norm(raw).split(/\s+/).filter(Boolean);
  const candidateText = ` ${candidateTokens.join(' ')} `;
  const fullTeamTokens = [...words(team.name)];
  const distinct = distinctiveTeamWords(team);
  if (!distinct.some(token => candidateText.includes(` ${norm(token)} `))) return false;

  const allowed = new Set([
    ...fullTeamTokens,
    ...distinct.map(norm),
    'logo','profile','square','icon','crest','wordmark','emblem','mark','official','transparent','new','std','standard',
    'png','jpg','jpeg','webp','svg',
    'lck','lpl','lec','lcs','lcp','vcs', String(CURRENT_YEAR), String(CURRENT_YEAR - 1)
  ]);
  const extras = candidateTokens.filter(token => token.length > 1 && !allowed.has(token));
  return extras.length === 0;
}

function embeddedYear(value) {
  const years = [...String(value || '').matchAll(/\b(20\d{2})\b/g)].map(m => Number(m[1]));
  return years.length ? Math.max(...years) : null;
}

function timestampYear(meta) {
  const year = Number(String(meta?.timestamp || '').slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function hasPlayerToken(player, value) {
  const text = norm(value);
  const tokens = [...words(player.id)].filter(Boolean);
  return tokens.length > 0 && tokens.some(token => text.includes(token));
}

function teamTokenMatches(team, value) {
  const text = norm(value);
  return distinctiveTeamWords(team).filter(token => text.includes(norm(token))).length;
}

function teamLogoScore(team, meta) {
  const name = fileName(meta.title);
  const text = norm(name);
  if (!teamLogoIdentityMatches(team, name) || isTeamEventAsset(name)) return -999;
  const logoLike = /logo|crest|wordmark|emblem|mark|profile|square|icon/.test(text);
  if (!logoLike) return -999;
  let score = 125 + Math.min(60, teamTokenMatches(team, name) * 20);
  const year = embeddedYear(name);
  if (year === CURRENT_YEAR) score += 50;
  else if (year === CURRENT_YEAR - 1) score += 20;
  else if (year && year <= CURRENT_YEAR - 2) score -= 20;
  const uploaded = timestampYear(meta);
  if (uploaded === CURRENT_YEAR) score += 35;
  else if (uploaded === CURRENT_YEAR - 1) score += 15;
  else if (uploaded && uploaded <= CURRENT_YEAR - 3) score -= 10;
  if (isLegacy(name)) score -= 260;
  if (isClearlyBad(name)) score -= 300;
  if (meta.width && meta.height) {
    const ratio = Math.max(meta.width, meta.height) / Math.max(1, Math.min(meta.width, meta.height));
    if (ratio <= 2.2) score += 15;
    else if (ratio >= 3.2) score -= 30;
  }
  return score;
}

function playerImageScore(player, team, meta) {
  const name = fileName(meta.title);
  const text = norm(name);
  const playerTokens = [...words(player.id)].filter(Boolean);
  let score = 0;
  if (playerTokens.length && playerTokens.every(token => text.includes(token))) score += 140;
  else if (playerTokens.some(token => text.includes(token))) score += 85;
  score += Math.min(55, teamTokenMatches(team, name) * 18);
  if (/player|profile|headshot|portrait|official/.test(text)) score += 30;
  if (/logo|icon|ward|champion|skin|flag|coach/.test(text)) score -= 120;
  const year = embeddedYear(name);
  if (year === CURRENT_YEAR) score += 95;
  else if (year === CURRENT_YEAR - 1) score += 45;
  else if (year && year <= CURRENT_YEAR - 2) score -= 75;
  const uploaded = timestampYear(meta);
  if (uploaded === CURRENT_YEAR) score += 55;
  else if (uploaded === CURRENT_YEAR - 1) score += 25;
  else if (uploaded && uploaded <= CURRENT_YEAR - 3) score -= 30;
  if (isLegacy(name)) score -= 150;
  if (isClearlyBad(name)) score -= 250;
  if (meta.width && meta.height) {
    const ratio = meta.height / Math.max(1, meta.width);
    if (ratio >= 0.7 && ratio <= 2.6) score += 20;
    else if (ratio < 0.45 || ratio > 3.2) score -= 40;
  }
  return score;
}

function playerCandidatePriority(player, team, value) {
  const text = norm(fileName(value));
  let score = 0;
  if (hasPlayerToken(player, value)) score += 100;
  score += Math.min(40, teamTokenMatches(team, value) * 15);
  const year = embeddedYear(value);
  if (year === CURRENT_YEAR) score += 100;
  else if (year === CURRENT_YEAR - 1) score += 45;
  else if (year && year <= CURRENT_YEAR - 2) score -= 50;
  if (/player|profile|headshot|portrait|official/.test(text)) score += 20;
  if (/logo|icon|flag|coach/.test(text)) score -= 80;
  if (isLegacy(value) || isClearlyBad(value)) score -= 200;
  return score;
}

async function api(params, label) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const query = new URLSearchParams({ action: 'query', format: 'json', origin: '*', maxlag: '5', ...params });
      const response = await fetch(`${API}?${query}`, {
        headers: { 'User-Agent': 'WebLienMinh/2.6 major-region-current-media-refresh' },
        signal: AbortSignal.timeout(35_000)
      });
      if ([429, 502, 503, 504].includes(response.status)) {
        const retryAfter = Number(response.headers.get('retry-after') || 0) * 1000;
        await sleep(Math.max(DELAY_MS * (attempt + 2), retryAfter));
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
  const out = [];
  let imcontinue = null;
  for (let page = 0; page < 3; page++) {
    const body = await api({ redirects: '1', prop: 'images', titles: title, imlimit: 'max', ...(imcontinue ? { imcontinue } : {}) }, `images ${title}`);
    const record = Object.values(body.query?.pages || {}).find(x => !x.missing);
    out.push(...(record?.images || []).map(x => x.title).filter(Boolean));
    imcontinue = body.continue?.imcontinue || null;
    if (!imcontinue) break;
  }
  return [...new Set(out)];
}

async function prefetchPlayerPageImages(activePlayers) {
  const result = new Map();
  let calls = 0;
  const batches = chunks(activePlayers, PLAYER_BATCH);
  for (const [index, batch] of batches.entries()) {
    const requested = batch.map(player => player.preferredPage || player.profilePageTitle || player.overviewPage || player.identityId || player.id).map(cleanTitle);
    const aliases = new Map();
    const pageImagesByTitle = new Map();
    let imcontinue = null;

    for (let pass = 0; pass < 3; pass++) {
      try {
        const body = await api({
          redirects: '1',
          prop: 'images',
          titles: requested.join('|'),
          imlimit: 'max',
          ...(imcontinue ? { imcontinue } : {})
        }, `player image batch ${index + 1}/${batches.length}`);
        calls++;
        for (const item of body.query?.normalized || []) aliases.set(norm(item.from), item.to);
        for (const item of body.query?.redirects || []) aliases.set(norm(item.from), item.to);
        for (const page of Object.values(body.query?.pages || {})) {
          if (page.missing) continue;
          const key = norm(page.title);
          const existing = pageImagesByTitle.get(key) || [];
          existing.push(...(page.images || []).map(x => x.title).filter(Boolean));
          pageImagesByTitle.set(key, existing);
        }
        imcontinue = body.continue?.imcontinue || null;
        if (!imcontinue) break;
      } catch (error) {
        console.log(`Player image batch ${index + 1} skipped: ${error.message}`);
        break;
      }
    }

    for (let i = 0; i < batch.length; i++) {
      const player = batch[i];
      let current = requested[i];
      const seen = new Set();
      while (aliases.has(norm(current)) && !seen.has(norm(current))) {
        seen.add(norm(current));
        current = aliases.get(norm(current));
      }
      const images = pageImagesByTitle.get(norm(current)) || pageImagesByTitle.get(norm(requested[i])) || [];
      result.set(player.uid || `${player.id}:${player.team?.name || ''}`, [...new Set(images)]);
    }
    console.log(`Prefetched player media ${index + 1}/${batches.length}: ${batch.length} players.`);
  }
  return { images: result, calls };
}

async function searchFiles(query, limit = 50) {
  try {
    const body = await api({ list: 'search', srnamespace: '6', srsearch: query, srlimit: String(limit) }, `search ${query}`);
    return (body.query?.search || []).map(x => x.title).filter(Boolean);
  } catch (error) {
    console.log(`Search skipped (${query}): ${error.message}`);
    return [];
  }
}

async function imageInfo(titles) {
  const unique = [...new Set(titles.map(title => title.startsWith('File:') ? title : `File:${title}`).filter(Boolean))];
  const out = [];
  for (let i = 0; i < unique.length; i += 35) {
    const batch = unique.slice(i, i + 35);
    try {
      const body = await api({ prop: 'imageinfo', iiprop: 'url|timestamp|size', iiurlwidth: '900', titles: batch.join('|') }, 'imageinfo major media');
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
    } catch (error) {
      console.log(`imageinfo skipped: ${error.message}`);
    }
  }
  return out;
}

function sourceForFile(meta) {
  const title = String(meta?.title || '').replaceAll(' ', '_');
  return title ? `https://lol.fandom.com/wiki/${encodeURIComponent(title).replace(/%3A/i, ':')}` : null;
}

function bestMeta(items, scorer, threshold) {
  const ranked = items.map(meta => ({ ...meta, score: scorer(meta) }))
    .filter(x => x.url)
    .sort((a, b) => b.score - a.score || String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  return ranked[0]?.score >= threshold ? ranked[0] : null;
}

function isActiveMajorPlayer(player) {
  const region = String(player.team?.region || '').toUpperCase();
  if (!MAJOR_REGIONS.has(region)) return false;
  const latest = Date.parse(player.latestGameAt || '');
  if (!Number.isFinite(latest)) return true;
  return Date.now() - latest <= ACTIVE_DAYS * 86_400_000;
}

const majorTeams = teams.filter(team => MAJOR_REGIONS.has(String(team.region || '').toUpperCase()));
const activePlayers = players.filter(isActiveMajorPlayer);
const playersByTeam = new Map();
for (const player of activePlayers) {
  const key = player.team?.id || norm(player.team?.name);
  if (!key) continue;
  if (!playersByTeam.has(key)) playersByTeam.set(key, []);
  playersByTeam.get(key).push(player);
}

console.log(`Major current-media refresh: regions=${[...MAJOR_REGIONS].join(',')} teams=${majorTeams.length} activePlayers=${activePlayers.length} cutoff=${ACTIVE_DAYS}d.`);
const prefetched = await prefetchPlayerPageImages(activePlayers);

let teamUpdated = 0;
let playerUpdated = 0;
let teamUnresolved = 0;
let playerUnresolved = 0;
const details = [];

for (const [index, team] of majorTeams.entries()) {
  const teamKey = team.id || norm(team.name);
  const roster = playersByTeam.get(teamKey) || activePlayers.filter(player => norm(player.team?.name) === norm(team.name));
  const pageTitle = team.profilePageTitle || cleanTitle(team.sourcePage) || team.name;

  let teamPagePool = [];
  try { teamPagePool = await pageImages(pageTitle); }
  catch (error) { console.log(`Team page images ${team.name}: ${error.message}`); }

  const searchPool = [
    ...(await searchFiles(`${team.name} ${CURRENT_YEAR}`, 50)),
    ...(await searchFiles(`${team.name} logo ${CURRENT_YEAR}`, 30))
  ];
  const sharedPool = [...new Set([...teamPagePool, ...searchPool])].filter(title => !isClearlyBad(title));

  const logoNames = sharedPool
    .filter(title => teamLogoIdentityMatches(team, title) && !isTeamEventAsset(title))
    .slice(0, 30);

  const playerNamesByUid = new Map();
  const allPlayerNames = [];
  for (const player of roster) {
    const key = player.uid || `${player.id}:${player.team?.name || ''}`;
    const own = prefetched.images.get(key) || [];
    const candidates = [...new Set([...own, ...sharedPool])]
      .filter(title => hasPlayerToken(player, title) && !isClearlyBad(title))
      .sort((a, b) => playerCandidatePriority(player, team, b) - playerCandidatePriority(player, team, a))
      .slice(0, 20);
    playerNamesByUid.set(key, candidates);
    allPlayerNames.push(...candidates);
  }

  let metaPool = await imageInfo([...new Set([...logoNames, ...allPlayerNames])].slice(0, 130));
  let bestLogo = bestMeta(metaPool.filter(meta => logoNames.includes(meta.title) || logoNames.includes(fileName(meta.title))), meta => teamLogoScore(team, meta), 115);

  if (!bestLogo) {
    const genericLogoNames = (await searchFiles(`${team.name} logo`, 30))
      .filter(title => teamLogoIdentityMatches(team, title) && !isTeamEventAsset(title))
      .slice(0, 25);
    const genericLogoMeta = await imageInfo(genericLogoNames);
    metaPool = [...metaPool, ...genericLogoMeta];
    bestLogo = bestMeta(genericLogoMeta, meta => teamLogoScore(team, meta), 115);
  }

  if (bestLogo) {
    team.logo = bestLogo.url;
    team.preferredLogo = bestLogo.url;
    team.preferredLogoSource = sourceForFile(bestLogo);
    team.preferredLogoAsOf = String(bestLogo.timestamp || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    team.currentMediaFile = bestLogo.title;
    team.currentMediaScore = bestLogo.score;
    team.currentMediaRefreshedAt = new Date().toISOString();
    teamUpdated++;
    details.push({ type: 'team', name: team.name, region: team.region, file: bestLogo.title, score: bestLogo.score });
  } else {
    teamUnresolved++;
  }

  for (const player of roster) {
    const key = player.uid || `${player.id}:${player.team?.name || ''}`;
    const candidateSet = new Set((playerNamesByUid.get(key) || []).map(title => norm(fileName(title))));
    const best = bestMeta(metaPool.filter(meta => candidateSet.has(norm(fileName(meta.title)))), meta => playerImageScore(player, team, meta), 140);
    if (best) {
      player.image = best.url;
      player.preferredImage = best.url;
      player.preferredImageSource = sourceForFile(best);
      player.preferredImageAsOf = String(best.timestamp || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
      player.currentMediaFile = best.title;
      player.currentMediaScore = best.score;
      player.currentMediaRefreshedAt = new Date().toISOString();
      playerUpdated++;
      details.push({ type: 'player', id: player.id, team: team.name, region: team.region, file: best.title, score: best.score });
    } else {
      playerUnresolved++;
    }
  }

  if (bestLogo) {
    for (const player of players) {
      if (player.team?.id === team.id || norm(player.team?.name) === norm(team.name)) player.team = { ...player.team, ...team };
    }
  }

  console.log(`Major media ${index + 1}/${majorTeams.length}: ${team.region} ${team.name} logo=${bestLogo ? bestLogo.title : 'unresolved'} roster=${roster.length}.`);
}

directory.majorMediaRefresh = {
  generatedAt: new Date().toISOString(),
  source: 'Leaguepedia/Fandom current file repository and current team/player pages',
  strategy: 'strict-team-identity + batched-player-page-prefetch + shared-team-media-pool',
  currentYear: CURRENT_YEAR,
  activeDays: ACTIVE_DAYS,
  regions: [...MAJOR_REGIONS],
  teamTotal: majorTeams.length,
  teamUpdated,
  teamUnresolved,
  activePlayerTotal: activePlayers.length,
  playerUpdated,
  playerUnresolved,
  fallbackPlayerSearches: 0,
  playerPrefetchCalls: prefetched.calls,
  details
};

await fs.writeFile(directoryFile, JSON.stringify(directory, null, 2));
console.log(`Major current-media refresh done: teams ${teamUpdated}/${majorTeams.length}, players ${playerUpdated}/${activePlayers.length}, unresolved teams=${teamUnresolved}, players=${playerUnresolved}, prefetchCalls=${prefetched.calls}.`);
