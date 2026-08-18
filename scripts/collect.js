import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'data', 'matches');
const key = process.env.RIOT_API_KEY;
const region = process.env.RIOT_REGION || 'sea';
const ids = String(process.env.RIOT_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
const count = Math.max(1, Math.min(100, Number(process.env.MATCHES_PER_PLAYER || 20)));

if (!key) throw new Error('Thiếu RIOT_API_KEY trong .env');
if (!ids.length) throw new Error('Thiếu RIOT_IDS. Ví dụ RIOT_IDS=TenNguoiChoi#VN2');
await fs.mkdir(outDir, { recursive: true });

async function riot(url) {
  const r = await fetch(url, { headers: { 'X-Riot-Token': key } });
  if (r.status === 429) {
    const wait = Number(r.headers.get('retry-after') || 2) * 1000;
    console.log(`Rate limit, nghỉ ${wait / 1000}s...`);
    await new Promise(resolve => setTimeout(resolve, wait));
    return riot(url);
  }
  if (!r.ok) throw new Error(`${r.status} ${url}: ${await r.text()}`);
  return r.json();
}

const matchIds = new Set();
for (const riotId of ids) {
  const at = riotId.lastIndexOf('#');
  if (at < 1) { console.warn(`Bỏ qua Riot ID không hợp lệ: ${riotId}`); continue; }
  const gameName = riotId.slice(0, at);
  const tagLine = riotId.slice(at + 1);
  console.log(`Đọc PUUID: ${gameName}#${tagLine}`);
  const acc = await riot(`https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);
  const matches = await riot(`https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${acc.puuid}/ids?queue=420&start=0&count=${count}`);
  matches.forEach(x => matchIds.add(x));
}

console.log(`Tổng match unique: ${matchIds.size}`);
let done = 0;
for (const matchId of matchIds) {
  const file = path.join(outDir, `${matchId}.json`);
  try { await fs.access(file); done++; continue; } catch {}
  const data = await riot(`https://${region}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`);
  await fs.writeFile(file, JSON.stringify(data));
  done++;
  console.log(`[${done}/${matchIds.size}] ${matchId}`);
}
console.log('Xong. Chạy: npm run aggregate');
