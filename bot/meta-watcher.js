import fs from 'node:fs/promises';
import path from 'node:path';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';

const TIER_POWER = { S: 5, A: 4, B: 3, C: 2, D: 1 };
const ROLE_LABEL = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Mid',
  BOTTOM: 'ADC',
  UTILITY: 'Support'
};

function envNumber(name, fallback, min, max) {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function stripTags(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(url = '') {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return String(url || '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
  }
}

function snapshotKey(meta) {
  return [meta.patch || 'unknown', meta.generatedAt || '', meta.sampleGames || 0, meta.mode || ''].join('|');
}

function championKey(row) {
  return `${row.id}:${row.role || 'UNKNOWN'}`;
}

function compactSnapshot(meta) {
  const rows = (meta.champions || []).map(row => ({
    id: row.id,
    name: row.name || row.id,
    role: row.role || 'UNKNOWN',
    tier: row.tier || 'D',
    tierScore: Number(row.tierScore || 0),
    winRate: Number(row.winRate || 0),
    pickRate: Number(row.pickRate || 0),
    banRate: Number(row.banRate || 0),
    games: Number(row.games || 0),
    image: row.image || null
  }));
  return {
    key: snapshotKey(meta),
    patch: meta.patch || null,
    generatedAt: meta.generatedAt || null,
    sampleGames: Number(meta.sampleGames || 0),
    rows
  };
}

function compareSnapshots(previous, current, { scoreThreshold, winRateThreshold, minGames }) {
  const oldMap = new Map((previous?.rows || []).map(row => [championKey(row), row]));
  const changes = [];

  for (const row of current.rows || []) {
    const old = oldMap.get(championKey(row));
    if (!old) continue;
    if (Math.min(old.games || 0, row.games || 0) < minGames) continue;

    const oldTier = TIER_POWER[old.tier] || 0;
    const newTier = TIER_POWER[row.tier] || 0;
    const tierDelta = newTier - oldTier;
    const scoreDelta = row.tierScore - old.tierScore;
    const winDelta = row.winRate - old.winRate;
    const significant = tierDelta !== 0 || Math.abs(scoreDelta) >= scoreThreshold || Math.abs(winDelta) >= winRateThreshold;
    if (!significant) continue;

    const directionScore = tierDelta * 20 + scoreDelta + winDelta * 2;
    if (Math.abs(directionScore) < 0.01) continue;
    changes.push({
      ...row,
      previous: old,
      tierDelta,
      scoreDelta,
      winDelta,
      direction: directionScore > 0 ? 'up' : 'down',
      impact: Math.abs(tierDelta) * 25 + Math.abs(scoreDelta) + Math.abs(winDelta) * 2
    });
  }

  changes.sort((a, b) => b.impact - a.impact);
  return changes;
}

function formatMover(change) {
  const arrow = change.direction === 'up' ? '📈' : '📉';
  const signScore = change.scoreDelta >= 0 ? '+' : '';
  const signWin = change.winDelta >= 0 ? '+' : '';
  const tierText = change.previous.tier !== change.tier ? `${change.previous.tier}→${change.tier} • ` : '';
  return `${arrow} **${change.name}** · ${ROLE_LABEL[change.role] || change.role}\n${tierText}Score ${signScore}${change.scoreDelta.toFixed(1)} · WR ${signWin}${change.winDelta.toFixed(1)}đ% · ${change.games} trận`;
}

function classifyBalance(segment) {
  const text = stripTags(segment).toLowerCase();
  let buff = 0;
  let nerf = 0;

  const buffSignals = [
    /\bbuff(?:ed|ing|s)?\b/g,
    /underperform/g,
    /underwhelming/g,
    /\btoo weak\b/g,
    /giving (?:him|her|them|it) (?:more|some) power/g,
    /more power/g,
    /compensation buff/g,
    /damage[^.]{0,60}increased/g,
    /healing[^.]{0,60}increased/g,
    /shield[^.]{0,60}increased/g,
    /armor[^.]{0,60}increased/g,
    /health[^.]{0,60}increased/g,
    /cooldown[^.]{0,60}decreased/g,
    /cost[^.]{0,60}decreased/g
  ];
  const nerfSignals = [
    /\bnerf(?:ed|ing|s)?\b/g,
    /overperform/g,
    /\btoo strong\b/g,
    /oppressive/g,
    /dominant/g,
    /bringing (?:him|her|them|it) down/g,
    /damage[^.]{0,60}decreased/g,
    /healing[^.]{0,60}decreased/g,
    /shield[^.]{0,60}decreased/g,
    /armor[^.]{0,60}decreased/g,
    /health[^.]{0,60}decreased/g,
    /cooldown[^.]{0,60}increased/g,
    /cost[^.]{0,60}increased/g
  ];

  for (const re of buffSignals) buff += (text.match(re) || []).length;
  for (const re of nerfSignals) nerf += (text.match(re) || []).length;
  if (buff > nerf) return 'buff';
  if (nerf > buff) return 'nerf';
  return 'adjust';
}

function extractChampionBalance(html) {
  const source = String(html || '');
  const heading = /<h2\b[^>]*(?:id=["']champions["'])?[^>]*>\s*Champions\s*<\/h2>/i.exec(source)
    || /<h2\b[^>]*>[^<]*Champions[^<]*<\/h2>/i.exec(source);
  if (!heading) return [];

  const start = heading.index + heading[0].length;
  const rest = source.slice(start);
  const nextH2 = rest.search(/<h2\b/i);
  const section = nextH2 >= 0 ? rest.slice(0, nextH2) : rest.slice(0, 180000);
  const matches = [...section.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];
  const rows = [];

  for (let i = 0; i < matches.length && rows.length < 30; i++) {
    const name = stripTags(matches[i][1]);
    if (!name || name.length > 40 || /system|item|rune|arena|aram|mode/i.test(name)) continue;
    const segStart = matches[i].index + matches[i][0].length;
    const segEnd = i + 1 < matches.length ? matches[i + 1].index : section.length;
    const segment = section.slice(segStart, segEnd);
    const summaryMatch = segment.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    const summary = summaryMatch ? stripTags(summaryMatch[1]).slice(0, 220) : '';
    rows.push({ name, type: classifyBalance(segment), summary });
  }

  return rows;
}

async function readState(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return {
      snapshot: parsed.snapshot || null,
      announcedSnapshots: Array.isArray(parsed.announcedSnapshots) ? parsed.announcedSnapshots : [],
      lastBalancePatch: parsed.lastBalancePatch || null,
      lastCheckAt: parsed.lastCheckAt || null,
      lastSentAt: parsed.lastSentAt || null
    };
  } catch {
    return { snapshot: null, announcedSnapshots: [], lastBalancePatch: null, lastCheckAt: null, lastSentAt: null };
  }
}

async function writeState(file, state) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({
    ...state,
    announcedSnapshots: [...new Set(state.announcedSnapshots || [])].slice(-200)
  }, null, 2));
}

export function createMetaWatcher(client, { webApiUrl }) {
  const channelId = String(process.env.DISCORD_META_CHANNEL_ID || process.env.DISCORD_NEWS_CHANNEL_ID || '').trim();
  const roleId = String(process.env.DISCORD_META_ROLE_ID || process.env.DISCORD_NEWS_ROLE_ID || '').trim();
  const intervalMinutes = envNumber('META_CHECK_INTERVAL_MINUTES', 30, 15, 180);
  const intervalMs = intervalMinutes * 60_000;
  const scoreThreshold = envNumber('META_SCORE_DELTA_THRESHOLD', 5, 1, 25);
  const winRateThreshold = envNumber('META_WINRATE_DELTA_THRESHOLD', 1.5, 0.5, 8);
  const minGames = envNumber('META_MIN_GAMES', 10, 3, 200);
  const stateFile = path.resolve(String(process.env.META_STATE_FILE || '.bot-meta-state.json'));
  const balanceNotifyOnStartup = String(process.env.BALANCE_NOTIFY_ON_STARTUP || 'false').toLowerCase() === 'true';

  let state = { snapshot: null, announcedSnapshots: [], lastBalancePatch: null, lastCheckAt: null, lastSentAt: null };
  let timer = null;
  let running = false;
  let lastError = null;
  let lastMovementCount = 0;

  async function getChannel() {
    if (!channelId) return null;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) throw new Error(`Meta watcher không truy cập được channel ${channelId}.`);
    return channel;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'WebLienMinh-DiscordBot/5.0 meta-watcher' },
      signal: AbortSignal.timeout(18_000)
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { error: text.slice(0, 300) }; }
    if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
    return body;
  }

  async function fetchMeta() {
    const qs = new URLSearchParams({ role: 'ALL', tier: 'ALL', search: '' });
    return fetchJson(`${webApiUrl}/api/meta?${qs}`);
  }

  async function fetchLatestPatch() {
    const data = await fetchJson(`${webApiUrl}/api/patches`);
    return data.patches?.[0] || null;
  }

  async function alreadyHasBalanceMessage(channel, patch) {
    if (!channel?.messages?.fetch || !client.user?.id) return false;
    try {
      const recent = await channel.messages.fetch({ limit: 50 });
      return recent.some(message => message.author?.id === client.user.id && message.embeds?.some(embed =>
        String(embed.title || '').includes(`Patch ${patch}`) && String(embed.title || '').includes('Balance Alert')
      ));
    } catch {
      return false;
    }
  }

  async function maybeSendBalance(channel, { force = false } = {}) {
    const patchInfo = await fetchLatestPatch().catch(() => null);
    if (!patchInfo?.patch || !patchInfo?.url) return { sent: 0, reason: 'no-patch' };

    if (!state.lastBalancePatch) {
      state.lastBalancePatch = patchInfo.patch;
      if (!balanceNotifyOnStartup && !force) return { sent: 0, initialized: true, patch: patchInfo.patch };
    }
    if (!force && state.lastBalancePatch === patchInfo.patch) return { sent: 0, patch: patchInfo.patch, unchanged: true };
    if (await alreadyHasBalanceMessage(channel, patchInfo.patch)) {
      state.lastBalancePatch = patchInfo.patch;
      return { sent: 0, duplicate: true, patch: patchInfo.patch };
    }

    const response = await fetch(patchInfo.url, {
      headers: { 'User-Agent': 'WebLienMinh-DiscordBot/5.0 balance-parser' },
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) throw new Error(`Patch Notes HTTP ${response.status}`);
    const html = await response.text();
    const changes = extractChampionBalance(html);
    const buffs = changes.filter(x => x.type === 'buff');
    const nerfs = changes.filter(x => x.type === 'nerf');
    const adjusts = changes.filter(x => x.type === 'adjust');

    const embed = new EmbedBuilder()
      .setColor(0xD6A84A)
      .setTitle(`⚖️ Balance Alert • Patch ${patchInfo.patch}`)
      .setURL(patchInfo.url)
      .setDescription('Tóm tắt tự động các tướng được Riot thay đổi sức mạnh trong Patch Notes. Phân loại buff/nerf dựa trên mô tả chính thức; thay đổi hỗn hợp được xếp vào **Điều chỉnh**.')
      .addFields(
        { name: `📈 Buff (${buffs.length})`, value: buffs.length ? buffs.slice(0, 12).map(x => `• **${x.name}**${x.summary ? ` — ${x.summary}` : ''}`).join('\n').slice(0, 1024) : 'Không phát hiện rõ.', inline: false },
        { name: `📉 Nerf (${nerfs.length})`, value: nerfs.length ? nerfs.slice(0, 12).map(x => `• **${x.name}**${x.summary ? ` — ${x.summary}` : ''}`).join('\n').slice(0, 1024) : 'Không phát hiện rõ.', inline: false },
        { name: `🔄 Điều chỉnh (${adjusts.length})`, value: adjusts.length ? adjusts.slice(0, 10).map(x => `• **${x.name}**${x.summary ? ` — ${x.summary}` : ''}`).join('\n').slice(0, 1024) : 'Không có.', inline: false }
      )
      .setFooter({ text: 'Nguồn: Riot Games Patch Notes • WebLienMinh Bot' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Đọc Patch Notes').setEmoji('🛠️').setURL(patchInfo.url),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Xem Meta Global').setEmoji('🌍').setURL(webApiUrl)
    );

    await channel.send({
      content: roleId ? `<@&${roleId}>` : undefined,
      embeds: [embed],
      components: [row],
      allowedMentions: roleId ? { roles: [roleId] } : { parse: [] }
    });
    state.lastBalancePatch = patchInfo.patch;
    state.lastSentAt = new Date().toISOString();
    return { sent: 1, patch: patchInfo.patch, buffs: buffs.length, nerfs: nerfs.length, adjusts: adjusts.length };
  }

  async function sendMovement(channel, previous, current, changes) {
    const up = changes.filter(x => x.direction === 'up').slice(0, 6);
    const down = changes.filter(x => x.direction === 'down').slice(0, 6);
    const top = changes[0];
    const patchChanged = previous?.patch && current.patch && previous.patch !== current.patch;

    const embed = new EmbedBuilder()
      .setColor(0x4D9DE0)
      .setTitle(`🌍 Global Meta Movement • Patch ${current.patch || '—'}`)
      .setURL(webApiUrl)
      .setDescription(`${patchChanged ? `🆕 Dataset chuyển từ patch **${previous.patch}** sang **${current.patch}**.\n` : ''}Bot phát hiện biến động đáng kể từ dữ liệu **Global High‑Elo Ranked**. Đây là xu hướng thống kê, không phải buff/nerf chính thức của Riot.`)
      .addFields(
        { name: `📈 Tăng sức mạnh / độ ưu tiên (${up.length})`, value: up.length ? up.map(formatMover).join('\n\n').slice(0, 1024) : 'Không có biến động tăng vượt ngưỡng.', inline: false },
        { name: `📉 Giảm sức mạnh / độ ưu tiên (${down.length})`, value: down.length ? down.map(formatMover).join('\n\n').slice(0, 1024) : 'Không có biến động giảm vượt ngưỡng.', inline: false },
        { name: '📊 Ngưỡng cảnh báo', value: `Tier thay đổi hoặc Tier Score ±${scoreThreshold}+ hoặc Win Rate ±${winRateThreshold} điểm % • tối thiểu ${minGames} trận/tướng`, inline: false },
        { name: '🧪 Sample', value: `${current.sampleGames || 0} trận toàn cầu`, inline: true }
      )
      .setFooter({ text: 'WebLienMinh • Global High‑Elo Analytics • Không đồng nghĩa thay đổi cân bằng chính thức' })
      .setTimestamp(current.generatedAt && !Number.isNaN(Date.parse(current.generatedAt)) ? new Date(current.generatedAt) : new Date());

    if (top?.image?.startsWith('http')) embed.setThumbnail(top.image);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Xem Meta Global').setEmoji('📊').setURL(webApiUrl)
    );

    await channel.send({
      content: roleId ? `<@&${roleId}>` : undefined,
      embeds: [embed],
      components: [row],
      allowedMentions: roleId ? { roles: [roleId] } : { parse: [] }
    });
    state.lastSentAt = new Date().toISOString();
  }

  async function check({ forceBalance = false } = {}) {
    if (running) return { skipped: true, reason: 'already-running' };
    running = true;
    try {
      state = await readState(stateFile);
      const channel = await getChannel();
      if (!channel) return { enabled: false, reason: 'no-channel' };

      const balance = await maybeSendBalance(channel, { force: forceBalance }).catch(error => ({ sent: 0, error: error.message }));
      const meta = await fetchMeta();
      const current = compactSnapshot(meta);
      const previous = state.snapshot;
      let movementSent = 0;
      let changes = [];

      if (!previous) {
        state.snapshot = current;
      } else if (previous.key !== current.key) {
        changes = compareSnapshots(previous, current, { scoreThreshold, winRateThreshold, minGames });
        if (changes.length && !state.announcedSnapshots.includes(current.key)) {
          await sendMovement(channel, previous, current, changes);
          movementSent = 1;
          state.announcedSnapshots.push(current.key);
        }
        state.snapshot = current;
      }

      lastMovementCount = changes.length;
      state.lastCheckAt = new Date().toISOString();
      await writeState(stateFile, state);
      lastError = balance.error || null;
      return {
        enabled: true,
        balance,
        movementSent,
        changes: changes.length,
        patch: current.patch,
        snapshot: current.key
      };
    } catch (error) {
      lastError = error.message || String(error);
      console.error('[meta-watcher]', error);
      return { error: lastError };
    } finally {
      running = false;
    }
  }

  async function start() {
    state = await readState(stateFile);
    if (!channelId) {
      console.log('Meta Watcher: OFF — thiếu DISCORD_META_CHANNEL_ID/DISCORD_NEWS_CHANNEL_ID.');
      return;
    }
    console.log(`Meta Watcher: ON • channel=${channelId} • mỗi ${intervalMinutes} phút`);
    await check();
    timer = setInterval(() => check(), intervalMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function status() {
    return {
      enabled: Boolean(channelId),
      channelId: channelId || null,
      roleId: roleId || null,
      intervalMinutes,
      scoreThreshold,
      winRateThreshold,
      minGames,
      currentPatch: state.snapshot?.patch || null,
      lastBalancePatch: state.lastBalancePatch || null,
      lastCheckAt: state.lastCheckAt,
      lastSentAt: state.lastSentAt,
      lastMovementCount,
      lastError
    };
  }

  return { start, stop, check, status };
}
