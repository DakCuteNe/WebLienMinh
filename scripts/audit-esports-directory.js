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
const realName = p => has(p.name) && norm(p.name) !== norm(p.id);
const hasSocial = p => Object.values(p.socials || {}).some(has);
const hasStats = p => Number(p.games || 0) > 0 && Number.isFinite(Number(p.winRate)) && Number.isFinite(Number(p.kda));
const hasTeamLogo = p => has(p.team?.logo);
const completeCore = p => has(p.image) && realName(p) && has(p.country || p.nationality) && has(p.birthdate);
const looksLikeRosterOrPoster = value => /(?:^|[_\s/%-])(roster|lineup|team[ _-]?photo|teamphoto|poster|squad|players?)(?:[_\s./?&%-]|$)/i.test(decodeURIComponent(String(value || '')));

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
const pct = n => Number(((n / Math.max(1, players.length)) * 100).toFixed(1));
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

const countries = [...new Set(players.map(p => p.country || p.nationality).filter(has))].sort();
directory.countries = countries;
directory.profileAuditAt = new Date().toISOString();
directory.profileCoverage = coverage;
directory.profileIntegrity = {
  invalidTeamLogoCount: invalidTeamLogos.length,
  pinnedProfileFailureCount: pinnedProfileFailures.length
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
  pinnedProfileChecks
}, null, 2));

if (invalidTeamLogos.length || pinnedProfileFailures.length) {
  throw new Error(`Esports profile integrity failed: invalid team logos=${invalidTeamLogos.length}, pinned profile failures=${pinnedProfileFailures.length}.`);
}
