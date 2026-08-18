import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';

const TOKEN = String(process.env.DISCORD_TOKEN || '').trim();
const CLIENT_ID = String(process.env.DISCORD_CLIENT_ID || '').trim();
const GUILD_ID = String(process.env.DISCORD_GUILD_ID || '').trim();
const WEB_API_URL = String(process.env.WEB_API_URL || 'https://weblienminh-production.up.railway.app').replace(/\/$/, '');

if (!TOKEN) throw new Error('Thiếu DISCORD_TOKEN');
if (!CLIENT_ID) throw new Error('Thiếu DISCORD_CLIENT_ID');

const ROLE_MAP = {
  top: 'TOP',
  jungle: 'JUNGLE',
  mid: 'MIDDLE',
  adc: 'BOTTOM',
  support: 'UTILITY'
};

const ROLE_LABEL = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Mid',
  BOTTOM: 'ADC',
  UTILITY: 'Support'
};

const commands = [
  new SlashCommandBuilder()
    .setName('meta')
    .setDescription('Xem meta tướng hiện tại')
    .addStringOption(o => o.setName('role').setDescription('Vị trí').addChoices(
      { name: 'Top', value: 'top' },
      { name: 'Jungle', value: 'jungle' },
      { name: 'Mid', value: 'mid' },
      { name: 'ADC', value: 'adc' },
      { name: 'Support', value: 'support' }
    ))
    .addIntegerOption(o => o.setName('limit').setDescription('Số tướng hiển thị').setMinValue(1).setMaxValue(10)),

  new SlashCommandBuilder()
    .setName('counter')
    .setDescription('Tìm counter theo lane')
    .addStringOption(o => o.setName('champion').setDescription('Tên tướng, ví dụ Gwen').setRequired(true))
    .addStringOption(o => o.setName('role').setDescription('Vị trí').addChoices(
      { name: 'Top', value: 'top' },
      { name: 'Jungle', value: 'jungle' },
      { name: 'Mid', value: 'mid' },
      { name: 'ADC', value: 'adc' },
      { name: 'Support', value: 'support' }
    )),

  new SlashCommandBuilder()
    .setName('build')
    .setDescription('Xem build, rune và spell phổ biến của tướng')
    .addStringOption(o => o.setName('champion').setDescription('Tên tướng, ví dụ Jinx').setRequired(true)),

  new SlashCommandBuilder()
    .setName('pro')
    .setDescription('Xem dữ liệu tuyển thủ nổi bật')
    .addStringOption(o => o.setName('player').setDescription('Ví dụ Faker, Chovy, Ruler').setRequired(true)),

  new SlashCommandBuilder()
    .setName('patch')
    .setDescription('Xem patch Riot mới nhất'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Kiểm tra trạng thái Rift Meta VN')
].map(x => x.toJSON());

async function api(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${WEB_API_URL}${path}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'RiftMetaVN-DiscordBot/1.0' }
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { error: text.slice(0, 500) }; }
    if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function pct(v) {
  return `${Number(v || 0).toFixed(1)}%`;
}

function num(v, digits = 1) {
  return Number(v || 0).toFixed(digits);
}

function trim(text, max = 1024) {
  const value = String(text || '—');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function baseEmbed(title) {
  return new EmbedBuilder()
    .setColor(0xC99B3D)
    .setTitle(title)
    .setFooter({ text: 'Rift Meta VN • Dữ liệu tự động, sample nhỏ có thể dao động' })
    .setTimestamp();
}

async function resolveChampion(query) {
  const data = await api('/api/champions');
  const q = String(query).trim().toLowerCase();
  const champion = data.champions.find(c =>
    c.id.toLowerCase() === q || c.name.toLowerCase() === q
  );
  if (!champion) throw new Error(`Không tìm thấy tướng “${query}”.`);
  return champion;
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`Đã đăng ký ${commands.length} slash commands cho guild ${GUILD_ID}.`);
  } else {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log(`Đã đăng ký ${commands.length} slash commands global.`);
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Nô lệ đã tỉnh dậy và làm việc — ${client.user.tag}`);
  client.user.setActivity('meta Liên Minh • /meta');
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply();

  try {
    if (interaction.commandName === 'status') {
      const s = await api('/api/status');
      const embed = baseEmbed('Rift Meta VN — Status')
        .addFields(
          { name: 'Patch', value: String(s.metaPatch || '—'), inline: true },
          { name: 'Data Dragon', value: String(s.ddragon || '—'), inline: true },
          { name: 'Sample', value: `${Number(s.sampleGames || 0)} trận`, inline: true },
          { name: 'Riot API', value: s.riotApiConfigured ? '✅ ON' : '⚠️ OFF', inline: true },
          { name: 'Platform', value: String(s.platform || 'vn2').toUpperCase(), inline: true },
          { name: 'Website', value: WEB_API_URL, inline: false }
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (interaction.commandName === 'patch') {
      const d = await api('/api/patches');
      const patches = (d.patches || []).slice(0, 5);
      const embed = baseEmbed('Patch Riot mới')
        .setDescription(patches.length
          ? patches.map((p, i) => `**${i + 1}. Patch ${p.patch}** — ${p.title}`).join('\n')
          : 'Chưa đọc được danh sách patch từ Riot.');
      return interaction.editReply({ embeds: [embed] });
    }

    if (interaction.commandName === 'meta') {
      const roleValue = interaction.options.getString('role');
      const role = roleValue ? ROLE_MAP[roleValue] : 'ALL';
      const limit = interaction.options.getInteger('limit') || 8;
      const qs = new URLSearchParams({ role, tier: 'ALL', search: '' });
      const d = await api(`/api/meta?${qs}`);
      const rows = (d.champions || []).slice(0, limit);

      const embed = baseEmbed(`Meta ${role === 'ALL' ? 'tổng' : ROLE_LABEL[role]} • Patch ${d.patch}`)
        .setDescription(rows.length ? rows.map((x, i) =>
          `**${i + 1}. ${x.name}** — ${x.tier} • Score ${num(x.tierScore)} • WR ${pct(x.winRate)} • PR ${pct(x.pickRate)} • BR ${pct(x.banRate)} • ${x.games} games`
        ).join('\n') : 'Chưa có dữ liệu phù hợp.');

      return interaction.editReply({ embeds: [embed] });
    }

    if (interaction.commandName === 'counter') {
      const query = interaction.options.getString('champion', true);
      const champ = await resolveChampion(query);
      const roleValue = interaction.options.getString('role');
      const role = roleValue ? ROLE_MAP[roleValue] : '';
      const d = await api(`/api/counter/${encodeURIComponent(champ.id)}${role ? `?role=${encodeURIComponent(role)}` : ''}`);

      const list = (d.counters || []).slice(0, 5).map((x, i) => {
        const m = x.matchup || {};
        const wr = Number.isFinite(Number(m.winRate)) ? ` • matchup WR ${pct(m.winRate)}` : '';
        const games = m.games ? ` • ${m.games} games` : '';
        const edge = Number.isFinite(Number(m.edge)) ? ` • Δ ${num(m.edge)}` : '';
        const conf = m.confidence ? ` • ${String(m.confidence).toUpperCase()}` : '';
        return `**${i + 1}. ${x.name}**${wr}${edge}${games}${conf}`;
      }).join('\n') || 'Chưa đủ sample matchup.';

      const good = (d.goodAgainst || []).slice(0, 3).map(x => `• ${x.name}`).join('\n') || 'Chưa đủ sample.';

      const embed = baseEmbed(`Counter ${d.champion.name} • ${ROLE_LABEL[d.champion.role] || d.champion.role}`)
        .setThumbnail(champ.image)
        .addFields(
          { name: '🔥 Nên cân nhắc pick', value: trim(list), inline: false },
          { name: `⚠️ ${d.champion.name} thường đánh tốt vào`, value: trim(good), inline: false },
          { name: 'Patch', value: String(d.patch), inline: true },
          { name: 'Tier Score', value: num(d.champion.tierScore), inline: true }
        );

      return interaction.editReply({ embeds: [embed] });
    }

    if (interaction.commandName === 'build') {
      const query = interaction.options.getString('champion', true);
      const champ = await resolveChampion(query);
      const d = await api(`/api/champion/${encodeURIComponent(champ.id)}`);
      const m = d.meta;
      if (!m) throw new Error(`${champ.name} chưa có đủ dữ liệu meta trong sample hiện tại.`);

      const core = (m.coreBuilds?.[0]?.items || []).map(x => x.name).join(' → ') ||
        (m.items || []).slice(0, 5).map(x => x.name).join(' → ') || 'Chưa đủ sample';
      const rune = m.runes?.[0];
      const runeText = rune
        ? `${rune.primary?.name || '—'} + ${rune.secondary?.name || '—'}\n${(rune.perks || []).slice(0, 6).map(x => x.name).join(' • ')}`
        : 'Chưa đủ sample';
      const spell = m.spells?.[0]?.spells?.map(x => x.name).join(' + ') || 'Chưa đủ sample';

      const embed = baseEmbed(`${champ.name} • ${ROLE_LABEL[m.role] || m.role} • ${m.tier} Tier`)
        .setThumbnail(champ.image)
        .addFields(
          { name: 'Tier Score', value: num(m.tierScore), inline: true },
          { name: 'Win Rate', value: pct(m.winRate), inline: true },
          { name: 'Ban Rate', value: pct(m.banRate), inline: true },
          { name: '🛒 Core Build', value: trim(core), inline: false },
          { name: '🔷 Rune', value: trim(runeText), inline: false },
          { name: '✨ Summoner Spell', value: spell, inline: false }
        );

      return interaction.editReply({ embeds: [embed] });
    }

    if (interaction.commandName === 'pro') {
      const query = interaction.options.getString('player', true).trim().toLowerCase();
      const d = await api('/api/pros');
      const p = (d.players || []).find(x => String(x.name || '').toLowerCase() === query);
      if (!p) throw new Error(`Không có “${interaction.options.getString('player')}” trong Featured Pros.`);
      if (!p.available) throw new Error(`${p.name}: ${p.note || 'chưa có scoreboard gần đây.'}`);

      const champs = (p.championPool || []).slice(0, 5).map(x => `${x.displayName || x.name} ${pct(x.rate)}`).join(' • ') || '—';
      const build = p.commonBuilds?.[0]?.name || '—';
      const rune = p.commonRunes?.[0]?.name || '—';
      const spells = p.commonSpells?.[0]?.name || '—';
      const bans = (p.teamBanPriorities || []).slice(0, 5).map(x => `${x.name} ${pct(x.rate)}`).join(' • ') || '—';

      const embed = baseEmbed(`${p.name} • ${p.team || 'Pro'} • ${ROLE_LABEL[p.role] || p.role}`)
        .addFields(
          { name: 'Games', value: String(p.games || 0), inline: true },
          { name: 'Win Rate', value: pct(p.winRate), inline: true },
          { name: 'KDA', value: num(p.kda, 2), inline: true },
          { name: 'Champion Pool', value: trim(champs), inline: false },
          { name: 'Build phổ biến', value: trim(build), inline: false },
          { name: 'Rune phổ biến', value: trim(rune), inline: false },
          { name: 'Spell phổ biến', value: trim(spells), inline: false },
          { name: 'Ban priority của đội', value: trim(bans), inline: false },
          { name: 'Xu hướng lối chơi', value: trim(p.styleSummary), inline: false }
        );

      return interaction.editReply({ embeds: [embed] });
    }

    return interaction.editReply('Lệnh chưa được hỗ trợ.');
  } catch (error) {
    console.error(`[/${interaction.commandName}]`, error);
    const message = error?.name === 'AbortError'
      ? 'Website API phản hồi quá lâu.'
      : error?.message || 'Có lỗi khi xử lý lệnh.';
    return interaction.editReply(`❌ ${message}`);
  }
});

client.on('error', error => console.error('Discord client error:', error));

await registerCommands();
await client.login(TOKEN);
