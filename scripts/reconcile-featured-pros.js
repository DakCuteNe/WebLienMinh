import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const watchFile = path.join(root, 'data', 'pro-watchlist.json');
const prosFile = path.join(root, 'data', 'pros.json');
const directoryFile = path.join(root, 'data', 'esports-directory.json');

const watch = JSON.parse(await fs.readFile(watchFile, 'utf8'));
const pros = JSON.parse(await fs.readFile(prosFile, 'utf8'));
const directory = JSON.parse(await fs.readFile(directoryFile, 'utf8'));
const targets = watch.players || [];
const existingPlayers = pros.players || [];
const directoryPlayers = directory.players || [];

const norm = value => String(value || '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replaceAll('_', ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function normalizeRole(role) {
  const r = norm(role);
  if (r.includes('top')) return 'TOP';
  if (r.includes('jung')) return 'JUNGLE';
  if (r.includes('mid')) return 'MIDDLE';
  if (r.includes('bot') || r.includes('adc') || r.includes('bottom')) return 'BOTTOM';
  if (r.includes('sup') || r.includes('utility')) return 'UTILITY';
  return String(role || '').toUpperCase();
}

function regionHints(target) {
  return String(target?.regionHint || '')
    .split(/[\/,]/).map(x => x.trim().toUpperCase()).filter(Boolean);
}

function pagesOf(player) {
  return [player?.preferredPage, player?.profilePageTitle, player?.overviewPage, player?.identityId]
    .filter(Boolean);
}

function isDetailed(player) {
  return [
    player?.recentGames,
    player?.commonBuilds,
    player?.commonItems,
    player?.commonRunes,
    player?.commonSpells,
    player?.teamBanPriorities
  ].some(value => Array.isArray(value) && value.length > 0);
}

function existingMatchesTarget(target, player) {
  if (!player || norm(player.name) !== norm(target.name)) return false;
  if (target.team) {
    const teams = [player.targetTeam, player.team].filter(Boolean).map(norm);
    if (!teams.includes(norm(target.team))) return false;
  }
  if (target.page && (!player.page || norm(player.page) !== norm(target.page))) return false;
  return true;
}

function directoryMatchesTarget(target, player) {
  if (norm(player?.id) !== norm(target.name)) return false;

  if (target.team) {
    const teams = [player?.team?.name, player?.currentTeamName, player?.preferredTeam].filter(Boolean).map(norm);
    if (!teams.includes(norm(target.team))) return false;
  }

  const wantedRole = normalizeRole(target.role);
  const actualRole = normalizeRole(player?.role);
  if (wantedRole && actualRole && wantedRole !== actualRole) return false;

  const hints = regionHints(target);
  const region = String(player?.team?.region || player?.residency || '').toUpperCase();
  if (hints.length && region && !hints.includes(region)) return false;

  if (target.page) {
    const pages = pagesOf(player).map(norm);
    if (!pages.includes(norm(target.page))) return false;
  }

  if (target.realName && norm(player?.name) !== norm(target.realName)) return false;
  return true;
}

function directoryPlayerFor(target) {
  const candidates = directoryPlayers.filter(player => directoryMatchesTarget(target, player));
  if (candidates.length === 1) return candidates[0];

  if (!target.team && !target.page && !target.realName && candidates.length > 1) {
    const sorted = [...candidates].sort((a, b) => Date.parse(b.latestGameAt || '') - Date.parse(a.latestGameAt || ''));
    const first = sorted[0];
    const second = sorted[1];
    if (first && (!second || Date.parse(first.latestGameAt || '') > Date.parse(second.latestGameAt || ''))) return first;
  }
  return null;
}

function basicFromDirectory(target, player) {
  if (!player) {
    return {
      name: target.name,
      page: target.page || null,
      targetTeam: target.team || null,
      priority: Number(target.priority || 3),
      regionHint: target.regionHint || null,
      role: target.role,
      available: false,
      games: 0,
      fallback: true,
      fallbackSource: 'directory-reconcile-unresolved',
      note: 'Không tìm thấy đúng canonical active player theo các ràng buộc identity hiện tại; WebLienMinh không tự đoán.'
    };
  }

  const num = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const games = Number(player.games || 0) || 0;
  return {
    name: target.name,
    realName: player.name && norm(player.name) !== norm(player.id) ? player.name : null,
    page: target.page || player.preferredPage || player.profilePageTitle || player.overviewPage || player.identityId || null,
    targetTeam: target.team || null,
    priority: Number(target.priority || 3),
    regionHint: target.regionHint || null,
    profileUid: player.uid || null,
    available: games > 0,
    team: player.currentTeamName || player.team?.name || null,
    region: player.team?.region || null,
    role: normalizeRole(player.role || target.role),
    games,
    winRate: num(player.winRate),
    kda: num(player.kda),
    avgKills: num(player.avgKills),
    avgDeaths: num(player.avgDeaths),
    avgAssists: num(player.avgAssists),
    avgCS: num(player.avgCS),
    avgDamage: num(player.avgDamage),
    avgVision: num(player.avgVision),
    latestPatch: player.latestPatch || null,
    latestGameAt: player.latestGameAt || null,
    styleSummary: player.styleSummary || 'Basic stats lấy từ Worldwide Esports Directory.',
    championPool: Array.isArray(player.championPool) ? player.championPool : [],
    commonBuilds: [],
    commonItems: [],
    commonRunes: [],
    commonSpells: [],
    teamBanPriorities: [],
    recentGames: [],
    image: player.preferredImage || player.image || null,
    fallback: true,
    fallbackSource: 'worldwide-directory-reconcile',
    directoryGeneratedAt: directory.generatedAt || null,
    note: games > 0
      ? 'Basic performance/current identity từ Worldwide Esports Directory; detailed build/rune/spell sẽ được bổ sung khi Leaguepedia Cargo hoạt động lại.'
      : 'Canonical identity đã resolve nhưng chưa có đủ performance stats trong directory.'
  };
}

let detailedPreserved = 0;
let directoryRefreshed = 0;
let unresolved = 0;
const players = targets.map(target => {
  const exactExisting = existingPlayers.filter(player => existingMatchesTarget(target, player));
  const detailed = exactExisting.find(player => isDetailed(player));
  if (detailed) {
    detailedPreserved++;
    return {
      ...detailed,
      priority: Number(target.priority || detailed.priority || 3),
      regionHint: target.regionHint || detailed.regionHint || null,
      targetTeam: target.team || detailed.targetTeam || null,
      page: target.page || detailed.page || null,
      fallback: false
    };
  }

  const current = directoryPlayerFor(target);
  if (current) directoryRefreshed++;
  else unresolved++;
  return basicFromDirectory(target, current);
});

pros.players = players;
pros.watchCount = targets.length;
pros.reconciledAt = new Date().toISOString();
pros.reconcileSource = 'Worldwide Esports Directory current identity/basic stats';
pros.reconcileStats = { detailedPreserved, directoryRefreshed, unresolved };
if (pros.degraded) {
  pros.preservedDetailedCount = detailedPreserved;
  pros.directoryFallbackCount = directoryRefreshed;
  pros.unresolvedCount = unresolved;
}
pros.note = `${pros.note || ''} Reconcile: chỉ giữ cache có detailed match data; basic/fallback luôn được refresh lại theo canonical Worldwide Directory hiện tại.`.trim();

await fs.writeFile(prosFile, JSON.stringify(pros, null, 2));
console.log(`Featured Pros reconcile: detailed=${detailedPreserved}, directory=${directoryRefreshed}, unresolved=${unresolved}, total=${players.length}.`);
