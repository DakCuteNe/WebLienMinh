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

function roleFamily(value) {
  const text = norm(value);
  if (text.includes('top')) return 'top';
  if (text.includes('jung') || text === 'jng' || text === 'jg') return 'jungle';
  if (text.includes('mid')) return 'middle';
  if (['bottom','bot','adc','ad carry','marksman'].some(token => text.includes(token))) return 'bottom';
  if (text.includes('support') || text.includes('utility') || text === 'sup') return 'support';
  return null;
}

function activeMajor(player) {
  if (!MAJOR_REGIONS.has(String(player.team?.region || '').toUpperCase())) return false;
  const latest = Date.parse(player.latestGameAt || '');
  if (!Number.isFinite(latest)) return true;
  return Date.now() - latest <= ACTIVE_DAYS * 86_400_000;
}

function looksBadMedia(value) {
  const text = norm(decodeURIComponent(String(value || '')));
  return /\b(roster|lineup|poster|squad|team photo|teamphoto|wallpaper|banner|schedule|match|versus|vs|logo|icon|ward|champion|skin|flag|coach)\b/.test(text);
}

function looksLegacy(value) {
  const text = norm(decodeURIComponent(String(value || '')));
  return /\b(old|oldlogo|legacy|former|previous|archive|archived|retired)\b/.test(text) || /old[_ -]?logo/i.test(String(value || ''));
}

function targetCandidates(target) {
  let candidates = players.filter(player => activeMajor(player) && norm(player.id) === norm(target.name));
  if (target.team) candidates = candidates.filter(player => norm(player.team?.name) === norm(target.team));
  const wantedRole = roleFamily(target.role);
  if (wantedRole && candidates.length > 1) {
    const byRole = candidates.filter(player => roleFamily(player.role) === wantedRole);
    if (byRole.length) candidates = byRole;
  }
  if (target.page && candidates.length > 1) {
    const byPage = candidates.filter(player => [player.preferredPage, player.profilePageTitle, player.overviewPage, player.identityId]
      .filter(Boolean).some(page => norm(page) === norm(target.page)));
    if (byPage.length) candidates = byPage;
  }
  return candidates;
}

const checks = [];
for (const target of watch.players || []) {
  const priority = Math.max(1, Number(target.priority || 3));
  if (priority > 2) continue;
  const candidates = targetCandidates(target);
  if (!candidates.length) {
    checks.push({
      name: target.name,
      priority,
      regionHint: target.regionHint || null,
      status: 'inactive-or-not-present',
      blocking: false,
      ok: true,
      errors: []
    });
    continue;
  }

  if (candidates.length > 1) {
    checks.push({
      name: target.name,
      priority,
      regionHint: target.regionHint || null,
      status: 'ambiguous-active-player',
      blocking: priority === 1,
      ok: false,
      errors: [`multiple active major candidates=${candidates.length}`],
      candidates: candidates.map(player => ({ uid: player.uid || null, team: player.team?.name || null, region: player.team?.region || null, role: player.role || null, page: player.profilePageTitle || player.overviewPage || null }))
    });
    continue;
  }

  const player = candidates[0];
  const errors = [];
  const pages = [player.preferredPage, player.profilePageTitle, player.overviewPage, player.identityId].filter(Boolean);
  const image = player.preferredImage || player.image || null;
  const mediaIdentity = player.currentMediaFile || image || '';

  if (target.team && norm(player.team?.name) !== norm(target.team)) errors.push(`wrong team: ${player.team?.name || 'missing'}`);
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
  if (priority === 1 && !has(player.profileOverrideAppliedAt) && has(player.currentMediaFile) && !norm(player.currentMediaFile).includes(norm(player.id))) {
    errors.push(`current media file does not contain IGN: ${player.currentMediaFile}`);
  }

  checks.push({
    name: target.name,
    priority,
    regionHint: target.regionHint || null,
    status: errors.length ? 'failed' : 'ok',
    blocking: priority === 1,
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
const warnings = checks.filter(check => !check.blocking && !check.ok);

const audit = {
  generatedAt: new Date().toISOString(),
  regions: [...MAJOR_REGIONS],
  activeDays: ACTIVE_DAYS,
  watchCount: checks.length,
  activeWatchCount: activeChecks.length,
  tier1Active: tier1Checks.length,
  tier1Ok: tier1Checks.filter(check => check.ok).length,
  tier1FailureCount: blockingFailures.length,
  tier2Active: tier2Checks.length,
  tier2Ok: tier2Checks.filter(check => check.ok).length,
  tier2WarningCount: warnings.length,
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
  tier2WarningCount: audit.tier2WarningCount,
  blockingFailures: blockingFailures.slice(0, 20),
  warnings: warnings.slice(0, 20)
}, null, 2));

if (blockingFailures.length) {
  throw new Error(`Priority-1 pro integrity failed: ${blockingFailures.length} active superstar profile(s) have identity/media errors.`);
}
