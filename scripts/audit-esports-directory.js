import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const input = path.join(root, 'data', 'esports-directory.json');
const output = path.join(root, 'data', 'esports-audit.json');

const directory = JSON.parse(await fs.readFile(input, 'utf8'));
const players = directory.players || [];
const teams = directory.teams || [];

const has = v => v != null && String(v).trim() !== '';
const realName = p => has(p.name) && String(p.name).trim().toLowerCase() !== String(p.id || '').trim().toLowerCase();
const hasSocial = p => Object.values(p.socials || {}).some(has);
const hasStats = p => Number(p.games || 0) > 0 && Number.isFinite(Number(p.winRate)) && Number.isFinite(Number(p.kda));
const hasTeamLogo = p => has(p.team?.logo);
const completeCore = p => has(p.image) && realName(p) && has(p.country || p.nationality) && has(p.birthdate);

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
  const k = String(p.id || '').trim().toLowerCase();
  if (k) (acc[k] ||= []).push({ id: p.id, team: p.team?.name || null, region: p.team?.region || null });
  return acc;
}, {})).filter(([, list]) => list.length > 1).map(([key, list]) => ({ key, entries: list }));

const countries = [...new Set(players.map(p => p.country || p.nationality).filter(has))].sort();
directory.countries = countries;
directory.profileAuditAt = new Date().toISOString();
directory.profileCoverage = coverage;
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
  byRegion,
  missingCounts: Object.fromEntries(Object.entries(missing).map(([k, v]) => [k, v.length])),
  missing
};

await fs.writeFile(output, JSON.stringify(audit, null, 2));
console.log('Esports audit:', JSON.stringify({ totalPlayers: players.length, totalTeams: teams.length, totalCountries: countries.length, coverage, duplicateIdCount: duplicateIds.length }, null, 2));
