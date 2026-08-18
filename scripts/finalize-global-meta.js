import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const metaFile = path.join(root, 'data', 'meta.json');
const coverageFile = path.join(root, 'data', 'global-coverage.json');

const meta = JSON.parse(await fs.readFile(metaFile, 'utf8'));
const coverage = JSON.parse(await fs.readFile(coverageFile, 'utf8'));

if (!coverage?.accepted) {
  throw new Error('Global coverage chưa được chấp nhận; không ghi đè metadata meta.json.');
}

const platformCount = Number(coverage.platformCount || 0);
const totalPlatforms = Number(coverage.attemptedPlatforms?.length || 16);
const macroCount = Number(coverage.macroRegionCount || 0);
const sourceLabel = `${platformCount}/${totalPlatforms} server Riot • ${macroCount}/4 cụm khu vực`;

meta.mode = 'match-v5-global-high-elo-v3';
meta.scope = 'GLOBAL';
meta.scopeLabel = 'Global High-Elo';
meta.coverage = coverage;
meta.methodology = {
  ...(meta.methodology || {}),
  scope: 'Dữ liệu Ranked Solo/Duo high-elo được lấy từ nhiều platform Riot trên toàn thế giới và gộp theo cùng patch.',
  coverage: sourceLabel,
  sampling: 'Mỗi platform lấy một nhóm người chơi high-elo từ Challenger, fallback Grandmaster/Master/cache khi leaderboard tạm lỗi. Match được de-duplicate toàn cầu.'
};

for (const champion of meta.champions || []) {
  champion.reason = `Tier Score ${champion.tierScore}/100 từ WR đã hiệu chỉnh ${champion.adjustedWinRate}%, presence ${champion.presenceRate}% và ${champion.games} lượt pick Global High-Elo (${sourceLabel}).`;
}

await fs.writeFile(metaFile, JSON.stringify(meta, null, 2));
console.log(`Đã finalize meta toàn cầu: ${meta.sampleGames || coverage.matchesSaved} trận • ${sourceLabel}.`);
