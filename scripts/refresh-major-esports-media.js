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

function embeddedYear(value) {
  const years = [...String(value || '').matchAll(/\b(20\d{2})\b/g)].map(m => Number(m[1]));
  return years.length ? Math.max(...years) : null;
}

function timestampYear(meta) {
  const year = Number(String(meta?.timestamp || '').slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function containsToken(value, token) {
  const hay = ` ${norm(value)} `;
  return hay.includes(` ${norm(token)} `);
}

function teamLogoScore(team, meta) {
  const name = fileName(meta.title);
  const text = norm(name);
  let score = 0;
  if (/logo/.test(text)) score += 90;
  if (/profile|square|icon|crest|mark/.test(text)) score += 25;
  if (/wordmark/.test(text)) score += 10;
  const teamTokens = distinctiveTeamWords(team);
  const matched = teamTokens.filter(token => text.includes(norm(token))).length;
  score += Math.min(50, matched * 18);
  const year = embeddedYear(name);
  if (year === CURRENT_YEAR) score += 70;
  else if (year === CURRENT_YEAR - 1) score += 30;
  else if (year && year <= CURRENT_YEAR - 2) score -= 55;
  const uploaded = timestampYear(meta);
  if (uploaded === CURRENT_YEAR) score += 45;
  else if (uploaded === CURRENT_YEAR - 1) score += 20;
  else if (uploaded && uploaded <= CURRENT_YEAR - 3) score -= 25;
  if (isLegacy(name)) score -= 180;
  if (isClearlyBad(name)) score -= 240;
  if (meta.width && meta.height && Math.max(meta.width, meta.height) / Math.max(1, Math.min(meta.width, meta.height)) <= 2.4) score += 10;
  return score;
}

function playerImageScore(player, team, meta) {
  const name = fileName(meta.title);
  const text = norm(name);
  const playerTokens = [...words(player.id)].filter(Boolean);
  let score = 0;
  if (playerTokens.length && playerTokens.every(token => containsToken(name, token) || text.includes(token))) score += 125;
  else if (playerTokens.some(token => text.includes(token))) score += 70;
  const teamTokens = distinctiveTeamWords(team);
  score += Math.min(50, teamTokens.filter(token => text.includes(norm(token))).length * 15);
  if (/player|profile|headshot|portrait|official/.test(text)) score += 25;
  if (/logo|icon|ward|champion|skin|flag/.test(text)) score -= 100;
  const year = embeddedYear(name);
  if (year === CURRENT_YEAR) score += 85;
  else if (year === CURRENT_YEAR - 1) score += 35;
  else if (year && year <= CURRENT_YEAR - 2) score -= 65;
  const uploaded = timestampYear(meta);
  if (uploaded === CURRENT_YEAR) score += 50;
  else if (uploaded === CURRENT_YEAR - 1) score += 20;
  else if (uploaded && uploaded <= CURRENT_YEAR - 3) score -= 30;
  if (isLegacy(name)) score -= 120;
  if (isClearlyBad(name)) score -= 220;
  if (meta.width && meta.height) {
    const ratio = meta.height / Math.max(1, meta.width);
    if (ratio >= 0.75 && ratio <= 2.4) score += 20;
    if (ratio < 0.45 || ratio > 3.2) score -= 35;
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
  for (let page = 0; page < 4; page++) {
    const body = await api({
      prop: 'images',
      titles: title,
      imlimit: 'max',
      ...(imcontinue ? { imcontinue } : {})
    }, `images ${title}`);
    const record = Object.values(body.query?.pages || {}).find(x => !x.missing);
    out.push(...(record?.images || []).map(x => x.title).filter(Boolean));
    imcontinue = body.continue?.imcontinue || null;
    if (!imcontinue) break;
  }
  return [...new Set(out)];
}

async function searchFiles(query) {
  try {
    const body = await api({
      list: 'search',
      srnamespace: '6',
      srsearch: query,
      srlimit: '20'
    }, `search ${query}`);
    return (body.query?.search || []).map(x => x.title).filter(Boolean);
  } catch (error) {
    console.log(`Search media skipped (${query}): ${error.message}`);
    return [];
  }
}

async function imageInfo(titles) {
  const unique = [...new Set(titles.map(title => title.startsWith('File:') ? title : `File:${title}`).filter(Boolean))];
  const out = [];
  for (let i = 0; i < unique.length; i += 35) {
    const batch = unique.slice(i, i + 35);
    try {
      const body = await api({
        prop: 'imageinfo',
        iiprop: 'url|timestamp|size',
        iiurlwidth: '900',
        titles: batch.join('|')
      }, 'imageinfo major media');
      for (const page of Object.values(body.query?.pages || {})) {
        if (page.missing) continue;
        const info = page.imageinfo?.[0];
        if (!info) continue;
        out.push({
          title: page.title,
          url: info.thumburl || info.url || null,
          originalUrl: info.url || null,
          timestamp: info.timestamp || null,
          width: Number(info.width || 0),
          height: Number(info.height || 0)
        });
      }
    } catch (error) {
      console.log(`imageinfo batch skipped: ${error.message}`);
    }
  }
  return out;
}

function topCandidates(names, predicate, limit = 18) {
  return [...new Set(names.filter(predicate))].slice(0, limit);
}

function teamCandidateNames(team, names) {
  const teamTokens = distinctiveTeamWords(team);
  return topCandidates(names, title => {
    const text = norm(fileName(title));
    if (isClearlyBad(title)) return false;
    return /logo|profile|square|crest|icon|wordmark/.test(text) || teamTokens.some(token => text.includes(norm(token)));
  }, 24);
}

function playerCandidateNames(player, names) {
  const playerTokens = [...words(player.id)].filter(Boolean);
  return topCandidates(names, title => {
    const text = norm(fileName(title));
    if (isClearlyBad(title)) return false;
    return playerTokens.length && playerTokens.some(token => text.includes(token));
  }, 18);
}

function bestMeta(items, scorer, threshold) {
  const ranked = items.map(meta => ({ ...meta, score: scorer(meta) }))
    .filter(x => x.url).sort((a, b) => b.score - a.score || String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  return ranked[0]?.score >= threshold ? ranked[0] : null;
}

function sourceForFile(meta) {
  const title = String(meta?.title || '').replaceAll(' ', '_');
  return title ? `https://lol.fandom.com/wiki/${encodeURIComponent(title).replace(/%3A/i, ':')}` : null;
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
  const teamKey = player.team?.id || norm(player.team?.name);
  if (!teamKey) continue;
  if (!playersByTeam.has(teamKey)) playersByTeam.set(teamKey, []);
  playersByTeam.get(teamKey).push(player);
}

let teamUpdated = 0;
let playerUpdated = 0;
let teamUnresolved = 0;
let playerUnresolved = 0;
const details = [];
const cutoffText = `${ACTIVE_DAYS}d`;

console.log(`Major current-media refresh: regions=${[...MAJOR_REGIONS].join(',')} teams=${majorTeams.length} activePlayers=${activePlayers.length} cutoff=${cutoffText}.`);

for (const [index, team] of majorTeams.entries()) {
  const pageTitle = team.profilePageTitle || cleanTitle(team.sourcePage) || team.name;
  let teamImages = [];
  try { teamImages = await pageImages(pageTitle); }
  catch (error) { console.log(`Team page images ${team.name}: ${error.message}`); }

  let logoNames = teamCandidateNames(team, teamImages);
  logoNames.push(...await searchFiles(`${team.name} logo ${CURRENT_YEAR}`));
  logoNames.push(...await searchFiles(`${team.name} logo`));
  const logoMeta = await imageInfo([...new Set(logoNames)].slice(0, 30));
  const bestLogo = bestMeta(logoMeta, meta => teamLogoScore(team, meta), 95);
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

  const teamKey = team.id || norm(team.name);
  const roster = playersByTeam.get(teamKey) || activePlayers.filter(player => norm(player.team?.name) === norm(team.name));
  for (const player of roster) {
    let candidateNames = playerCandidateNames(player, teamImages);
    let candidateMeta = await imageInfo(candidateNames);
    let best = bestMeta(candidateMeta, meta => playerImageScore(player, team, meta), 125);

    if (!best) {
      const playerPage = player.preferredPage || player.profilePageTitle || player.overviewPage || player.identityId || player.id;
      try {
        const ownImages = await pageImages(playerPage);
        candidateNames = [...candidateNames, ...playerCandidateNames(player, ownImages)];
      } catch (error) {
        console.log(`Player page images ${player.id}: ${error.message}`);
      }
      candidateNames.push(...await searchFiles(`${player.id} ${team.name} ${CURRENT_YEAR}`));
      candidateNames.push(...await searchFiles(`${player.id} ${team.name}`));
      candidateMeta = await imageInfo([...new Set(candidateNames)].slice(0, 32));
      best = bestMeta(candidateMeta, meta => playerImageScore(player, team, meta), 125);
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

  // Propagate the selected team logo into every current roster record.
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
  currentYear: CURRENT_YEAR,
  activeDays: ACTIVE_DAYS,
  regions: [...MAJOR_REGIONS],
  teamTotal: majorTeams.length,
  teamUpdated,
  teamUnresolved,
  activePlayerTotal: activePlayers.length,
  playerUpdated,
  playerUnresolved,
  details
};

await fs.writeFile(directoryFile, JSON.stringify(directory, null, 2));
console.log(`Major current-media refresh done: teams ${teamUpdated}/${majorTeams.length}, players ${playerUpdated}/${activePlayers.length}, unresolved teams=${teamUnresolved}, players=${playerUnresolved}.`);
