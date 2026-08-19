import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const directoryFile = path.join(root, 'data', 'esports-directory.json');
const watchFile = path.join(root, 'data', 'pro-watchlist.json');

const directory = JSON.parse(await fs.readFile(directoryFile, 'utf8'));
const watch = JSON.parse(await fs.readFile(watchFile, 'utf8'));
const players = directory.players || [];

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

function candidateMatches(player, target) {
  if (norm(player.id) !== norm(target.name)) return false;
  if (target.team) {
    const teams = [player.team?.name, player.currentTeamName, player.preferredTeam].filter(Boolean).map(norm);
    if (!teams.includes(norm(target.team))) return false;
  }
  if (target.page) {
    const pages = [player.preferredPage, player.profilePageTitle, player.overviewPage, player.identityId]
      .filter(Boolean).map(norm);
    if (!pages.includes(norm(target.page))) return false;
  }
  return true;
}

function assertHttps(value, label) {
  if (!value) return;
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${label} phải dùng HTTPS.`);
}

let applied = 0;
const details = [];
for (const target of watch.players || []) {
  const hasOverride = [
    target.imageOverride, target.realName, target.nativeName, target.country,
    target.birthdate, target.contract
  ].some(has) && Boolean(target.asOf || target.imageOverride);
  if (!hasOverride) continue;

  const matches = players.filter(player => candidateMatches(player, target));
  if (matches.length !== 1) {
    throw new Error(`Profile override ${target.name}: cần đúng 1 canonical player, tìm thấy ${matches.length}.`);
  }

  const player = matches[0];
  assertHttps(target.imageOverride, `${target.name}.imageOverride`);
  assertHttps(target.imageSource, `${target.name}.imageSource`);

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
    player.preferredImageSource = target.imageSource || null;
    player.preferredImageAsOf = target.asOf || null;
  }

  player.profileOverrideSource = target.imageSource || player.sourcePage || null;
  player.profileOverrideAsOf = target.asOf || null;
  player.profileOverrideAppliedAt = new Date().toISOString();
  applied++;
  details.push({
    id: player.id,
    uid: player.uid || null,
    page: player.profilePageTitle || player.overviewPage || null,
    team: player.currentTeamName || player.team?.name || null,
    image: player.preferredImage || player.image || null,
    asOf: target.asOf || null
  });
}

directory.profileOverridesAppliedAt = new Date().toISOString();
directory.profileOverrideCount = applied;
await fs.writeFile(directoryFile, JSON.stringify(directory, null, 2));
console.log(`Current-profile overrides: applied=${applied}.`);
for (const detail of details) console.log('Override:', JSON.stringify(detail));
