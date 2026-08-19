import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const directoryFile = path.join(root, 'data', 'esports-directory.json');
const API = 'https://lol.fandom.com/api.php';
const CURRENT_YEAR = new Date().getUTCFullYear();
const ACTIVE_DAYS = Math.max(60, Number(process.env.ESPORTS_MAJOR_ACTIVE_DAYS || 180));
const DELAY_MS = Math.max(700, Number(process.env.ESPORTS_MAJOR_MEDIA_DELAY_MS || 900));
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

function teamLogoScore(team, meta) {
  const name = fileName(meta.title);
  const text = norm(name);
  if (!teamLogoIdentityMatches(team, name) || isTeamEventAsset(name)) return -999;
  const logoLike = /logo|crest|wordmark|emblem|mark|profile|square|icon/.test(text);
  if (!logoLike) return -999;
  let score = 125;
  const matched = distinctiveTeamWords(team).filter(token => text.includes(norm(token))).length;
  score += Math.min(60, matched * 20);
  const year = embeddedYear(name);
  if (year === CURRENT_YEAR) score += 75;
  else if (year === CURRENT_YEAR - 1) score += 35;
  else if (year && year <= CURRENT_YEAR - 2) score -= 80;
  const uploaded = timestampYear(meta);
  if (uploaded === CURRENT_YEAR) score += 45;
  else if (uploaded === CURRENT_YEAR - 1) score += 20;
  else if (uploaded && uploaded <= CURRENT_YEAR - 3) score -= 25;
  if (isLegacy(name)) score -= 240;
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
  if (playerTokens.length && playerTokens.every(token => text.includes(token))) score += 135;
  else if (playerTokens.some(token => text.includes(token))) score += 80;
  const teamMatches = distinctiveTeamWords(team).filter(token => text.includes(norm(token))).length;
  score += Math.min(55, teamMatches * 18);
  if (/player|profile|headshot|portrait|official/.test(text)) score += 30;
  if (/logo|icon|ward|champion|skin|flag|coach/.test(text)) score -= 110;
  const year = embeddedYear(name);
  if (year === CURRENT_YEAR) score += 90;
  else if (year === CURRENT_YEAR - 1) score += 40;
  else if (year && year <= CURRENT_YEAR - 2) score -= 70;
  const uploaded = timestampYear(meta);
  if (uploaded === CURRENT_YEAR) score += 50;
  else if (uploaded === CURRENT_YEAR - 1) score += 22;
  else if (uploaded && uploaded <= CURRENT_YEAR - 3) score -= 30;
  if (isLegacy(name)) score -= 140;
  if (isClearlyBad(name)) score -= 240;
  if (meta.width && meta.height) {
    const ratio = meta.height / Math.max(1, meta.width);
    if (ratio >= 0.7 && ratio <= 2.6) score += 20;
    else if (ratio < 0.45 || ratio > 3.2) score -= 40;
  }
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
    const body = await api({ prop: 'images', titles: title, imlimit: 'max', ...(imcontinue ? { imcontinue } : {}) }, `images ${title}`);
    const record = Object.values(body.query?.pages || {}).find(x => !x.missing);
    out.push(...(record?.images || []).map(x => x.title).filter(Boolean));
    imcontinue = body.continue?.imcontinue || null;
    if (!imcontinue) break;
  }
  return [...new Set(out)];
}

async function searchFiles(query, limit = 20) {
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

let teamUpdated = 0;
let playerUpdated = 0;
let teamUnresolved = 0;
let playerUnresolved = 0;
let fallbackPlayerSearches = 0;
const details = [];

console.log(`Major current-media refresh: regions=${[...MAJOR_REGIONS].join(',')} teams=${majorTeams.length} activePlayers=${activePlayers.length} cutoff=${ACTIVE_DAYS}d.`);

for (const [index, team] of majorTeams.entries()) {
  const teamKey = team.id || norm(team.name);
  const roster = playersByTeam.get(teamKey) || activePlayers.filter(player => norm(player.team?.name) === norm(team.name));
  const pageTitle = team.profilePageTitle || cleanTitle(team.sourcePage) || team.name;

  let pagePool = [];
  try { pagePool = await pageImages(pageTitle); }
  catch (error) { console.log(`Team page images ${team.name}: ${error.message}`); }

  const searchPool = [
    ...(await searchFiles(`${team.name} ${CURRENT_YEAR}`)),
    ...(await searchFiles(`${team.name} logo ${CURRENT_YEAR}`))
  ];
  const sharedNames = [...new Set([...pagePool, ...searchPool])].filter(title => {
    if (isClearlyBad(title)) return false;
    const text = norm(fileName(title));
    if (/logo|crest|wordmark|emblem|mark|profile|square|icon/.test(text)) return true;
    return roster.some(player => hasPlayerToken(player, title));
  }).slice(0, 90);
  let sharedMeta = await imageInfo(sharedNames);

  let bestLogo = bestMeta(sharedMeta, meta => teamLogoScore(team, meta), 125);
  if (!bestLogo) {
    const extraLogoNames = await searchFiles(`${team.name} logo`, 20);
    const extraLogoMeta = await imageInfo(extraLogoNames);
    sharedMeta = [...sharedMeta, ...extraLogoMeta];
    bestLogo = bestMeta(sharedMeta, meta => teamLogoScore(team, meta), 125);
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
    let best = bestMeta(sharedMeta.filter(meta => hasPlayerToken(player, meta.title)), meta => playerImageScore(player, team, meta), 135);

    if (!best) {
      fallbackPlayerSearches++;
      const playerPage = player.preferredPage || player.profilePageTitle || player.overviewPage || player.identityId || player.id;
      let ownPool = [];
      try { ownPool = await pageImages(playerPage); }
      catch (error) { console.log(`Player page images ${player.id}: ${error.message}`); }
      let fallbackNames = [...ownPool.filter(title => hasPlayerToken(player, title)), ...(await searchFiles(`${player.id} ${CURRENT_YEAR}`))];
      let fallbackMeta = await imageInfo([...new Set(fallbackNames)].slice(0, 35));
      best = bestMeta(fallbackMeta, meta => playerImageScore(player, team, meta), 135);
      if (!best) {
        fallbackNames = await searchFiles(`${player.id} ${team.name}`);
        fallbackMeta = await imageInfo(fallbackNames.slice(0, 25));
        best = bestMeta(fallbackMeta, meta => playerImageScore(player, team, meta), 135);
      }
    }

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
      if (player.team?.id === team.id || norm(player.team?.name) === norm(team.name)) {
        player.team = { ...player.team, ...team };
      }
    }
  }

  console.log(`Major media ${index + 1}/${majorTeams.length}: ${team.region} ${team.name} logo=${bestLogo ? bestLogo.title : 'unresolved'} roster=${roster.length}.`);
}

directory.majorMediaRefresh = {
  generatedAt: new Date().toISOString(),
  source: 'Leaguepedia/Fandom current file repository and current team/player pages',
  strategy: 'strict-team-identity + shared-team-media-pool + player fallback search',
  currentYear: CURRENT_YEAR,
  activeDays: ACTIVE_DAYS,
  regions: [...MAJOR_REGIONS],
  teamTotal: majorTeams.length,
  teamUpdated,
  teamUnresolved,
  activePlayerTotal: activePlayers.length,
  playerUpdated,
  playerUnresolved,
  fallbackPlayerSearches,
  details
};

await fs.writeFile(directoryFile, JSON.stringify(directory, null, 2));
console.log(`Major current-media refresh done: teams ${teamUpdated}/${majorTeams.length}, players ${playerUpdated}/${activePlayers.length}, unresolved teams=${teamUnresolved}, players=${playerUnresolved}, playerFallbacks=${fallbackPlayerSearches}.`);
