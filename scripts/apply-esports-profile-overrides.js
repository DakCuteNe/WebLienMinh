import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const directoryFile = path.join(root, 'data', 'esports-directory.json');
const overridesFile = path.join(root, 'data', 'esports-profile-overrides.json');

const directory = JSON.parse(await fs.readFile(directoryFile, 'utf8'));
const overrides = JSON.parse(await fs.readFile(overridesFile, 'utf8'));
const players = directory.players || [];
const teams = directory.teams || [];

const norm = value => String(value || '').trim().replaceAll('_', ' ').toLowerCase();
const has = value => value != null && String(value).trim() !== '';

function ageFromBirthdate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const [year, month, day] = value.split('-').map(Number);
  const now = new Date();
  let age = now.getUTCFullYear() - year;
  if (now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day)) age--;
  return age >= 10 && age <= 80 ? age : null;
}

function playerMatches(player, target) {
  if (norm(player.id) !== norm(target.name)) return false;
  if (target.team) {
    const currentTeams = [player.team?.name, player.currentTeamName, player.preferredTeam].filter(Boolean).map(norm);
    if (!currentTeams.includes(norm(target.team))) return false;
  }
  if (target.page) {
    const pages = [player.preferredPage, player.profilePageTitle, player.overviewPage, player.identityId]
      .filter(Boolean).map(norm);
    if (!pages.includes(norm(target.page))) return false;
  }
  return true;
}

function teamMatches(team, target) {
  return [team.id, team.name, team.short, team.profilePageTitle].filter(Boolean).some(value => norm(value) === norm(target.name));
}

function assertHttps(value, label) {
  if (!value) return;
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${label} phải dùng HTTPS.`);
}

function assertOverrideMetadata(target, label) {
  if (!target.source || !target.asOf) throw new Error(`${label}: override phải có source và asOf.`);
  assertHttps(target.source, `${label}.source`);
}

let playerApplied = 0;
let teamApplied = 0;
const details = [];

for (const target of overrides.players || []) {
  const hasOverride = [
    target.imageOverride, target.realName, target.nativeName, target.country,
    target.birthdate, target.contract
  ].some(has);
  if (!hasOverride) continue;
  assertOverrideMetadata(target, `Player override ${target.name}`);
  assertHttps(target.imageOverride, `${target.name}.imageOverride`);

  const matches = players.filter(player => playerMatches(player, target));
  if (matches.length !== 1) {
    throw new Error(`Player override ${target.name}: cần đúng 1 canonical player, tìm thấy ${matches.length}.`);
  }

  const player = matches[0];
  if (target.realName) player.name = target.realName;
  if (target.nativeName) player.nativeName = target.nativeName;
  if (target.country) {
    player.country = target.country;
    player.nationality = target.country;
  }
  if (target.birthdate) {
    player.birthdate = target.birthdate;
    player.birthYear = Number(target.birthdate.slice(0, 4)) || null;
    player.age = ageFromBirthdate(target.birthdate);
  }
  if (target.contract) player.contract = target.contract;
  if (target.imageOverride) {
    player.image = target.imageOverride;
    player.preferredImage = target.imageOverride;
    player.preferredImageSource = target.source;
    player.preferredImageAsOf = target.asOf;
  }
  player.profileOverrideSource = target.source;
  player.profileOverrideAsOf = target.asOf;
  player.profileOverrideAppliedAt = new Date().toISOString();
  playerApplied++;
  details.push({ type: 'player', id: player.id, uid: player.uid || null, page: player.profilePageTitle || player.overviewPage || null, team: player.currentTeamName || player.team?.name || null, media: player.preferredImage || player.image || null, asOf: target.asOf });
}

for (const target of overrides.teams || []) {
  if (!target.logoOverride) continue;
  assertOverrideMetadata(target, `Team override ${target.name}`);
  assertHttps(target.logoOverride, `${target.name}.logoOverride`);
  const matches = teams.filter(team => teamMatches(team, target));
  if (matches.length !== 1) throw new Error(`Team override ${target.name}: cần đúng 1 team, tìm thấy ${matches.length}.`);

  const team = matches[0];
  team.logo = target.logoOverride;
  team.preferredLogo = target.logoOverride;
  team.preferredLogoSource = target.source;
  team.preferredLogoAsOf = target.asOf;
  team.logoOverrideAppliedAt = new Date().toISOString();
  teamApplied++;

  for (const player of players) {
    if (player.team?.id === team.id || norm(player.team?.name) === norm(team.name)) {
      player.team = { ...player.team, ...team };
    }
  }
  details.push({ type: 'team', id: team.id, name: team.name, media: team.preferredLogo, asOf: target.asOf });
}

directory.profileOverridesAppliedAt = new Date().toISOString();
directory.profileOverrideCount = playerApplied;
directory.teamLogoOverrideCount = teamApplied;
await fs.writeFile(directoryFile, JSON.stringify(directory, null, 2));
console.log(`Current-profile overrides: players=${playerApplied}, teams=${teamApplied}.`);
for (const detail of details) console.log('Override:', JSON.stringify(detail));
