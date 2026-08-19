import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const directoryFile = path.join(root, 'data', 'esports-directory.json');
const watchFile = path.join(root, 'data', 'pro-watchlist.json');
const outputFile = path.join(root, 'data', 'priority-pro-audit.json');
const ACTIVE_DAYS = Math.max(60, Number(process.env.ESPORTS_MAJOR_ACTIVE_DAYS || 180));
const MAJOR_REGIONS = new Set(String(process.env.ESPORTS_MAJOR_REGIONS || 'LCK,LPL,LEC,LCS,LCP,VCS')
  .split(',').map(x => x.trim().toUpperCase()).filter(Boolean));

const directory = JSON.parse(await fs.readFile(directoryFile, 'utf8'));
const watch = JSON.parse(await fs.readFile(watchFile, 'utf8'));
const players = directory.players || [];

const has = value => value != null && String(value).trim() !== '';
const norm = value => String(value || '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replaceAll('_', ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = value => norm(value).split(/\s+/).filter(Boolean);

function roleFamily(value) {
  const text = norm(value);
  if (text.includes('top')) return 'top';
  if (text.includes('jung') || text === 'jng' || text === 'jg') return 'jungle';
  if (text.includes('mid')) return 'middle';
  if (['bottom','bot','adc','ad carry','marksman'].some(token => text.includes(token))) return 'bottom';
  if (text.includes('support') || text.includes('utility') || text === 'sup') return 'support';
  return null;
}

function regionHints(target) {
  return String(target?.regionHint || '')
    .split(/[\/,]/).map(x => x.trim().toUpperCase()).filter(Boolean);
}

function activeMajor(player) {
  if (!MAJOR_REGIONS.has(String(player.team?.region || '').toUpperCase())) return false;
  const latest = Date.parse(player.latestGameAt || '');
  if (!Number.isFinite(latest)) return true;
  return Date.now() - latest <= ACTIVE_DAYS * 86_400_000;
}

function safeNormMedia(value) {
  try { return norm(decodeURIComponent(String(value || ''))); }
  catch { return norm(value); }
}
function looksBadMedia(value) {
  return /\b(roster|lineup|poster|squad|team photo|teamphoto|wallpaper|banner|schedule|match|versus|vs|logo|icon|ward|champion|skin|flag|coach)\b/.test(safeNormMedia(value));
}
function looksLegacy(value) {
  const text = safeNormMedia(value);
  return /\b(old|oldlogo|legacy|former|previous|archive|archived|retired)\b/.test(text) || /old[_ -]?logo/i.test(String(value || ''));
}
function mediaHasExactIgn(player, value) {
  const mediaTokens = new Set(tokens(value));
  const ignTokens = tokens(player.id);
  return ignTokens.length > 0 && ignTokens.every(token => mediaTokens.has(token));
}

function playerPages(player) {
  return [player.preferredPage, player.profilePageTitle, player.overviewPage, player.identityId].filter(Boolean);
}

function candidateSummary(player) {
  return {
    uid: player.uid || null,
    name: player.name || null,
    team: player.team?.name || null,
    region: player.team?.region || null,
    role: player.role || null,
    page: player.profilePageTitle || player.overviewPage || player.identityId || null,
    identityStatus: player.identityStatus || null
  };
}

function sameIgnCandidates(target) {
  return players.filter(player => activeMajor(player) && norm(player.id) === norm(target.name));
}

function constrainedCandidates(target, source) {
  let candidates = [...source];
  if (target.team) candidates = candidates.filter(player => norm(player.team?.name) === norm(target.team));

  const hints = regionHints(target);
  if (hints.length) candidates = candidates.filter(player => hints.includes(String(player.team?.region || '').toUpperCase()));

  const wantedRole = roleFamily(target.role);
  if (wantedRole) candidates = candidates.filter(player => !roleFamily(player.role) || roleFamily(player.role) === wantedRole);

  if (target.page) candidates = candidates.filter(player => playerPages(player).some(page => norm(page) === norm(target.page)));
  if (target.realName) candidates = candidates.filter(player => norm(player.name) === norm(target.realName));
  return candidates;
}

const checks = [];
for (const target of watch.players || []) {
  const priority = Math.max(1, Number(target.priority || 3));
  if (priority > 2) continue;
  const pinned = Boolean(target.team || target.page || target.realName);
  const blockingByPolicy = priority === 1 || pinned;
  const sameIgn = sameIgnCandidates(target);

  if (!sameIgn.length) {
    checks.push({
      name: target.name,
      priority,
      regionHint: target.regionHint || null,
      pinned,
      status: 'inactive-or-not-present',
      blocking: false,
      ok: true,
      errors: []
    });
    continue;
  }

  const candidates = constrainedCandidates(target, sameIgn);
  if (!candidates.length) {
    const errors = [];
    if (target.team && !sameIgn.some(player => norm(player.team?.name) === norm(target.team))) errors.push(`expected team not found: ${target.team}`);
    const hints = regionHints(target);
    if (hints.length && !sameIgn.some(player => hints.includes(String(player.team?.region || '').toUpperCase()))) errors.push(`expected region not found: ${hints.join('/')}`);
    if (target.page && !sameIgn.some(player => playerPages(player).some(page => norm(page) === norm(target.page)))) errors.push(`expected canonical page not found: ${target.page}`);
    if (target.realName && !sameIgn.some(player => norm(player.name) === norm(target.realName))) errors.push(`expected real name not found: ${target.realName}`);
    const wantedRole = roleFamily(target.role);
    if (wantedRole && !sameIgn.some(player => roleFamily(player.role) === wantedRole)) errors.push(`expected role not found: ${target.role}`);
    if (!errors.length) errors.push('active same-IGN player does not satisfy the pinned identity constraints');

    checks.push({
      name: target.name,
      priority,
      regionHint: target.regionHint || null,
      pinned,
      status: 'active-player-does-not-match-pin',
      blocking: blockingByPolicy,
      ok: false,
      errors,
      candidates: sameIgn.map(candidateSummary)
    });
    continue;
  }

  if (candidates.length > 1) {
    checks.push({
      name: target.name,
      priority,
      regionHint: target.regionHint || null,
      pinned,
      status: 'ambiguous-active-player',
      blocking: blockingByPolicy,
      ok: false,
      errors: [`multiple constrained active major candidates=${candidates.length}`],
      candidates: candidates.map(candidateSummary)
    });
    continue;
  }

  const player = candidates[0];
  const errors = [];
  const pages = playerPages(player);
  const image = player.preferredImage || player.image || null;
  const mediaIdentity = player.currentMediaFile || image || '';
  const hints = regionHints(target);
  const currentRegion = String(player.team?.region || '').toUpperCase();

  if (target.team && norm(player.team?.name) !== norm(target.team)) errors.push(`wrong team: ${player.team?.name || 'missing'}`);
  if (hints.length && !hints.includes(currentRegion)) errors.push(`wrong region: ${currentRegion || 'missing'}; expected ${hints.join('/')}`);
  if (target.page && !pages.some(page => norm(page) === norm(target.page))) errors.push(`wrong canonical page: ${pages[0] || 'missing'}`);
  if (target.realName && norm(player.name) !== norm(target.realName)) errors.push(`wrong real name: ${player.name || 'missing'}`);
  const wantedRole = roleFamily(target.role);
  const actualRole = roleFamily(player.role);
  if (wantedRole && actualRole && wantedRole !== actualRole) errors.push(`wrong role: ${player.role || 'missing'}`);
  if (!has(image)) errors.push('missing current image');
  if (has(image) && looksLegacy(image)) errors.push('legacy image URL');
  if (has(mediaIdentity) && looksLegacy(mediaIdentity)) errors.push('legacy media file');
  if (has(mediaIdentity) && looksBadMedia(mediaIdentity)) errors.push('non-player media selected');
  if (['ambiguous','not-found'].includes(String(player.identityStatus || '').toLowerCase())) errors.push(`identity status=${player.identityStatus}`);
  if (priority === 1 && !has(player.currentMediaRefreshedAt) && !has(player.profileOverrideAppliedAt) && !has(player.priorityMediaRefreshedAt)) {
    errors.push('priority-1 player has no verified current-media refresh');
  }
  if ((priority === 1 || pinned) && !has(player.profileOverrideAppliedAt) && has(player.currentMediaFile) && !mediaHasExactIgn(player, player.currentMediaFile)) {
    errors.push(`current media file does not contain exact IGN tokens: ${player.currentMediaFile}`);
  }

  checks.push({
    name: target.name,
    priority,
    regionHint: target.regionHint || null,
    pinned,
    status: errors.length ? 'failed' : 'ok',
    blocking: blockingByPolicy,
    ok: errors.length === 0,
    uid: player.uid || null,
    actualName: player.name || null,
    team: player.team?.name || null,
    region: player.team?.region || null,
    role: player.role || null,
    page: player.profilePageTitle || player.overviewPage || player.identityId || null,
    image,
    mediaFile: player.currentMediaFile || null,
    mediaRefreshedAt: player.priorityMediaRefreshedAt || player.currentMediaRefreshedAt || player.profileOverrideAppliedAt || null,
    errors
  });
}

const activeChecks = checks.filter(check => check.status !== 'inactive-or-not-present');
const tier1Checks = activeChecks.filter(check => check.priority === 1);
const tier2Checks = activeChecks.filter(check => check.priority === 2);
const blockingFailures = checks.filter(check => check.blocking && !check.ok);
const tier1Failures = tier1Checks.filter(check => !check.ok);
const pinnedTier2Failures = tier2Checks.filter(check => check.pinned && !check.ok);
const warnings = checks.filter(check => !check.blocking && !check.ok);

const audit = {
  generatedAt: new Date().toISOString(),
  regions: [...MAJOR_REGIONS],
  activeDays: ACTIVE_DAYS,
  watchCount: checks.length,
  activeWatchCount: activeChecks.length,
  tier1Active: tier1Checks.length,
  tier1Ok: tier1Checks.filter(check => check.ok).length,
  tier1FailureCount: tier1Failures.length,
  tier2Active: tier2Checks.length,
  tier2Ok: tier2Checks.filter(check => check.ok).length,
  tier2PinnedFailureCount: pinnedTier2Failures.length,
  tier2WarningCount: warnings.length,
  blockingFailureCount: blockingFailures.length,
  checks
};

await fs.writeFile(outputFile, JSON.stringify(audit, null, 2));
console.log('Priority pro audit:', JSON.stringify({
  activeWatchCount: audit.activeWatchCount,
  tier1Active: audit.tier1Active,
  tier1Ok: audit.tier1Ok,
  tier1FailureCount: audit.tier1FailureCount,
  tier2Active: audit.tier2Active,
  tier2Ok: audit.tier2Ok,
  tier2PinnedFailureCount: audit.tier2PinnedFailureCount,
  tier2WarningCount: audit.tier2WarningCount,
  blockingFailureCount: audit.blockingFailureCount,
  blockingFailures: blockingFailures.slice(0, 20),
  warnings: warnings.slice(0, 20)
}, null, 2));

if (blockingFailures.length) {
  throw new Error(`Priority pro integrity failed: ${blockingFailures.length} blocking superstar/pinned profile identity or media error(s).`);
}
