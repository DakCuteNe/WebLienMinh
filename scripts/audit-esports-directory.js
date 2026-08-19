import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const input = path.join(root, 'data', 'esports-directory.json');
const output = path.join(root, 'data', 'esports-audit.json');
const watchFile = path.join(root, 'data', 'pro-watchlist.json');

const directory = JSON.parse(await fs.readFile(input, 'utf8'));
const players = directory.players || [];
const teams = directory.teams || [];
let watch = { players: [] };
try { watch = JSON.parse(await fs.readFile(watchFile, 'utf8')); } catch {}

const has = v => v != null && String(v).trim() !== '';
const norm = v => String(v || '').trim().replaceAll('_', ' ').toLowerCase();
const normMedia = value => String(value || '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replaceAll('_', ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const mediaWords = value => new Set(normMedia(value).split(/\s+/).filter(Boolean));
const realName = p => has(p.name) && norm(p.name) !== norm(p.id);
const hasSocial = p => Object.values(p.socials || {}).some(has);
const hasStats = p => Number(p.games || 0) > 0 && Number.isFinite(Number(p.winRate)) && Number.isFinite(Number(p.kda));
const hasTeamLogo = p => has(p.team?.logo);
const completeCore = p => has(p.image) && realName(p) && has(p.country || p.nationality) && has(p.birthdate);
const looksLikeRosterOrPoster = value => /(?:^|[_\s/%-])(roster|lineup|team[ _-]?photo|teamphoto|poster|squad|players?)(?:[_\s./?&%-]|$)/i.test(decodeURIComponent(String(value || '')));
const looksLegacy = value => /(?:^|[_\s/%-])(old|oldlogo|legacy|former|previous|archive|archived|retired)(?:[_\s./?&%-]|$)|old[_ -]?logo/i.test(decodeURIComponent(String(value || '')));
const majorRegions = new Set((directory.majorMediaRefresh?.regions || ['LCK','LPL','LEC','LCS','LCP','VCS']).map(x => String(x).toUpperCase()));
const currentYear = Number(directory.majorMediaRefresh?.currentYear || new Date().getUTCFullYear());

function distinctiveTeamWords(team) {
  const ignored = new Set(['team', 'gaming', 'esports', 'esport', 'club', 'academy', 'challengers']);
  const out = [...mediaWords(team.name)].filter(x => !ignored.has(x) && x.length >= 2);
  if (team.short) out.push(...mediaWords(team.short));
  const acronym = String(team.name || '').split(/\s+/).filter(Boolean).map(x => x[0]).join('').toLowerCase();
  if (acronym.length >= 2) out.push(acronym);
  return [...new Set(out)];
}

function isTeamEventAsset(value) {
  const text = normMedia(value);
  return /\b(kickoff|kickoffs|home ground|lock in|lockin|split|winter|spring|summer|season|tournament|championship|cup|msi|worlds|first stand|event)\b/.test(text);
}

function teamLogoIdentityMatches(team, value) {
  const filename = String(value || '').replace(/^File:/i, '').replace(/logo/ig, ' logo ');
  const candidateTokens = normMedia(filename).split(/\s+/).filter(Boolean);
  const candidateText = ` ${candidateTokens.join(' ')} `;
  const fullTeamTokens = [...mediaWords(team.name)];
  const distinct = distinctiveTeamWords(team);
  if (!distinct.some(token => candidateText.includes(` ${normMedia(token)} `))) return false;

  const allowed = new Set([
    ...fullTeamTokens,
    ...distinct.map(normMedia),
    'logo','profile','square','icon','crest','wordmark','emblem','mark','official','transparent','new','std','standard',
    'lck','lpl','lec','lcs','lcp','vcs', String(currentYear), String(currentYear - 1)
  ]);
  const extras = candidateTokens.filter(token => token.length > 1 && !allowed.has(token));
  return extras.length === 0;
}

const fields = {
  image: p => has(p.image),
  realName,
  country: p => has(p.country || p.nationality),
  birthdate: p => has(p.birthdate),
  age: p => Number.isFinite(Number(p.age)) && Number(p.age) > 0,
  contract: p => has(p.contract),
  social: hasSocial,
  teamLogo: hasTeamLogo,
  stats: hasStats,
  championPool: p => Array.isArray(p.championPool) && p.championPool.length > 0,
  soloqueueIds: p => has(p.soloqueueIds),
  bioEnriched: p => Boolean(p.bioEnriched),
  completeCore
};

const counts = Object.fromEntries(Object.entries(fields).map(([name, fn]) => [name, players.filter(fn).length]));
const pct = (n, total = players.length) => Number(((n / Math.max(1, total)) * 100).toFixed(1));
const coverage = Object.fromEntries(Object.entries(counts).map(([name, count]) => [name, { count, pct: pct(count) }]));

const missing = {};
for (const [name, fn] of Object.entries(fields)) {
  missing[name] = players.filter(p => !fn(p)).map(p => ({ id: p.id, team: p.team?.name || null, region: p.team?.region || p.residency || null }));
}

const byRegion = {};
for (const p of players) {
  const region = p.team?.region || p.residency || 'UNKNOWN';
  byRegion[region] ||= { total: 0, image: 0, realName: 0, country: 0, birthdate: 0, contract: 0, social: 0, teamLogo: 0, stats: 0, completeCore: 0 };
  const row = byRegion[region];
  row.total++;
  for (const key of ['image','realName','country','birthdate','contract','social','teamLogo','stats','completeCore']) if (fields[key](p)) row[key]++;
}
for (const row of Object.values(byRegion)) {
  for (const key of Object.keys(row)) {
    if (key === 'total') continue;
    row[`${key}Pct`] = Number(((row[key] / Math.max(1, row.total)) * 100).toFixed(1));
  }
}

const duplicateIds = Object.entries(players.reduce((acc, p) => {
  const k = norm(p.id);
  if (k) (acc[k] ||= []).push({ id: p.id, uid: p.uid || null, team: p.team?.name || null, region: p.team?.region || null, identityId: p.identityId || null });
  return acc;
}, {})).filter(([, list]) => list.length > 1).map(([key, list]) => ({ key, entries: list }));

const invalidTeamLogos = teams.filter(team => has(team.logo) && looksLikeRosterOrPoster(team.logo)).map(team => ({
  id: team.id,
  name: team.name,
  logo: team.logo
}));

const pinnedProfileChecks = [];
for (const target of watch.players || []) {
  if (!target.page && !target.realName && !target.team) continue;
  const candidates = players.filter(player => {
    if (norm(player.id) !== norm(target.name)) return false;
    if (!target.team) return true;
    return [player.team?.name, player.currentTeamName, player.preferredTeam].filter(Boolean).some(value => norm(value) === norm(target.team));
  });
  const player = candidates.find(candidate => !target.page || [candidate.overviewPage, candidate.identityId, candidate.profilePageTitle, candidate.preferredPage]
    .filter(Boolean).some(value => norm(value) === norm(target.page))) || null;
  const errors = [];
  if (!player) errors.push('canonical player not found');
  if (player && target.page && ![player.overviewPage, player.identityId, player.profilePageTitle, player.preferredPage].filter(Boolean).some(value => norm(value) === norm(target.page))) {
    errors.push(`wrong canonical page: ${player.overviewPage || player.identityId || 'unknown'}`);
  }
  if (player && target.realName && norm(player.name) !== norm(target.realName)) errors.push(`wrong real name: ${player.name || 'missing'}`);
  if (player && target.team && ![player.team?.name, player.currentTeamName, player.preferredTeam].filter(Boolean).some(value => norm(value) === norm(target.team))) {
    errors.push(`wrong team: ${player.currentTeamName || player.team?.name || 'missing'}`);
  }
  if (player && !has(player.image)) errors.push('missing current player image');
  pinnedProfileChecks.push({
    name: target.name,
    expectedPage: target.page || null,
    expectedRealName: target.realName || null,
    expectedTeam: target.team || null,
    uid: player?.uid || null,
    actualPage: player?.profilePageTitle || player?.overviewPage || null,
    actualRealName: player?.name || null,
    actualTeam: player?.currentTeamName || player?.team?.name || null,
    image: player?.image || null,
    ok: errors.length === 0,
    errors
  });
}
const pinnedProfileFailures = pinnedProfileChecks.filter(check => !check.ok);

// Major-region current-media audit. Curated overrides are allowed to supersede an upstream file,
// otherwise an automatically selected logo must belong to the exact current team identity.
const majorRefresh = directory.majorMediaRefresh || null;
const majorTeams = teams.filter(team => majorRegions.has(String(team.region || '').toUpperCase()));
const refreshedMajorTeams = majorTeams.filter(team => has(team.currentMediaRefreshedAt) || has(team.logoOverrideAppliedAt));
const refreshedMajorPlayers = players.filter(player => majorRegions.has(String(player.team?.region || '').toUpperCase()) && (has(player.currentMediaRefreshedAt) || has(player.profileOverrideAppliedAt)));

const majorMismatchedTeamLogos = majorTeams
  .filter(team => has(team.currentMediaRefreshedAt) && !has(team.logoOverrideAppliedAt))
  .filter(team => !has(team.currentMediaFile) || !teamLogoIdentityMatches(team, team.currentMediaFile) || isTeamEventAsset(team.currentMediaFile))
  .map(team => ({
    id: team.id,
    name: team.name,
    region: team.region,
    logo: team.logo || null,
    file: team.currentMediaFile || null
  }));

const majorLegacyTeamLogos = majorTeams.filter(team => {
  const effective = has(team.logoOverrideAppliedAt) ? team.preferredLogo : (team.currentMediaFile || team.logo);
  return looksLegacy(effective);
}).map(team => ({
  id: team.id,
  name: team.name,
  region: team.region,
  logo: team.logo,
  file: team.currentMediaFile || null,
  curatedOverride: has(team.logoOverrideAppliedAt)
}));

const majorLegacyPlayerImages = refreshedMajorPlayers.filter(player => {
  const effective = has(player.profileOverrideAppliedAt) ? player.preferredImage : (player.currentMediaFile || player.image);
  return looksLegacy(effective);
}).map(player => ({
  id: player.id,
  uid: player.uid || null,
  team: player.team?.name || null,
  region: player.team?.region || null,
  image: player.image,
  file: player.currentMediaFile || null,
  curatedOverride: has(player.profileOverrideAppliedAt)
}));

const majorMedia = {
  regions: [...majorRegions],
  refreshPresent: Boolean(majorRefresh),
  strategy: majorRefresh?.strategy || null,
  activeDays: majorRefresh?.activeDays || null,
  teamTarget: Number(majorRefresh?.teamTotal || majorTeams.length),
  teamUpdated: Number(majorRefresh?.teamUpdated || refreshedMajorTeams.length),
  teamUpdatedPct: pct(Number(majorRefresh?.teamUpdated || refreshedMajorTeams.length), Number(majorRefresh?.teamTotal || majorTeams.length)),
  playerTarget: Number(majorRefresh?.activePlayerTotal || 0),
  playerUpdated: Number(majorRefresh?.playerUpdated || refreshedMajorPlayers.length),
  playerUpdatedPct: pct(Number(majorRefresh?.playerUpdated || refreshedMajorPlayers.length), Number(majorRefresh?.activePlayerTotal || 0)),
  teamUnresolved: Number(majorRefresh?.teamUnresolved || 0),
  playerUnresolved: Number(majorRefresh?.playerUnresolved || 0),
  fallbackPlayerSearches: Number(majorRefresh?.fallbackPlayerSearches || 0),
  mismatchedTeamLogoCount: majorMismatchedTeamLogos.length,
  legacyTeamLogoCount: majorLegacyTeamLogos.length,
  legacyPlayerImageCount: majorLegacyPlayerImages.length
};

const majorMediaFailures = [];
if (!majorRefresh) majorMediaFailures.push('major current-media refresh did not run');
if (majorRefresh && majorMedia.teamTarget > 0 && majorMedia.teamUpdatedPct < 80) majorMediaFailures.push(`major team logo refresh below 80% (${majorMedia.teamUpdatedPct}%)`);
if (majorRefresh && majorMedia.playerTarget > 0 && majorMedia.playerUpdatedPct < 70) majorMediaFailures.push(`major active-player image refresh below 70% (${majorMedia.playerUpdatedPct}%)`);
if (majorMismatchedTeamLogos.length) majorMediaFailures.push(`major team logo identity mismatches=${majorMismatchedTeamLogos.length}`);
if (majorLegacyTeamLogos.length) majorMediaFailures.push(`legacy major team logos remain=${majorLegacyTeamLogos.length}`);
if (majorLegacyPlayerImages.length) majorMediaFailures.push(`legacy major player images remain=${majorLegacyPlayerImages.length}`);

const countries = [...new Set(players.map(p => p.country || p.nationality).filter(has))].sort();
directory.countries = countries;
directory.profileAuditAt = new Date().toISOString();
directory.profileCoverage = coverage;
directory.profileIntegrity = {
  invalidTeamLogoCount: invalidTeamLogos.length,
  pinnedProfileFailureCount: pinnedProfileFailures.length,
  majorMediaFailureCount: majorMediaFailures.length,
  majorMismatchedTeamLogoCount: majorMismatchedTeamLogos.length
};
await fs.writeFile(input, JSON.stringify(directory, null, 2));

const audit = {
  generatedAt: new Date().toISOString(),
  directoryGeneratedAt: directory.generatedAt || null,
  mediaEnrichedAt: directory.mediaEnrichedAt || null,
  totalPlayers: players.length,
  totalTeams: teams.length,
  totalRegions: Object.keys(byRegion).length,
  totalCountries: countries.length,
  coverage,
  duplicateIdCount: duplicateIds.length,
  duplicateIds,
  invalidTeamLogoCount: invalidTeamLogos.length,
  invalidTeamLogos,
  pinnedProfileChecks,
  pinnedProfileFailureCount: pinnedProfileFailures.length,
  pinnedProfileFailures,
  majorMedia,
  majorMediaFailures,
  majorMismatchedTeamLogos,
  majorLegacyTeamLogos,
  majorLegacyPlayerImages,
  byRegion,
  missingCounts: Object.fromEntries(Object.entries(missing).map(([k, v]) => [k, v.length])),
  missing
};

await fs.writeFile(output, JSON.stringify(audit, null, 2));
console.log('Esports audit:', JSON.stringify({
  totalPlayers: players.length,
  totalTeams: teams.length,
  totalCountries: countries.length,
  coverage,
  duplicateIdCount: duplicateIds.length,
  invalidTeamLogoCount: invalidTeamLogos.length,
  pinnedProfileFailureCount: pinnedProfileFailures.length,
  majorMedia,
  majorMediaFailures,
  majorMismatchedTeamLogos: majorMismatchedTeamLogos.slice(0, 20),
  pinnedProfileChecks
}, null, 2));

if (invalidTeamLogos.length || pinnedProfileFailures.length || majorMediaFailures.length) {
  throw new Error(`Esports profile integrity failed: invalid team logos=${invalidTeamLogos.length}, pinned profile failures=${pinnedProfileFailures.length}, major media failures=${majorMediaFailures.length}.`);
}
