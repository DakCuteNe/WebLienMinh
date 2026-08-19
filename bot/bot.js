import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';
import { createNewsWatcher } from './news-watcher.js';
import { createMetaWatcher } from './meta-watcher.js';

const TOKEN = String(process.env.DISCORD_TOKEN || '').trim();
const CLIENT_ID = String(process.env.DISCORD_CLIENT_ID || '').trim();
const GUILD_ID = String(process.env.DISCORD_GUILD_ID || '').trim();
const WEB_API_URL = String(process.env.WEB_API_URL || 'https://weblienminh-production.up.railway.app').replace(/\/$/, '');

if (!TOKEN) throw new Error('Thiếu DISCORD_TOKEN');
if (!CLIENT_ID) throw new Error('Thiếu DISCORD_CLIENT_ID');

const LEGACY_COMMAND_NAMES = new Set(['meta', 'counter', 'build', 'pro', 'patch', 'status']);
const MANAGED_COMMAND_NAMES = new Set(['notify', ...LEGACY_COMMAND_NAMES]);

const notifyTypeChoices = [
  { name: 'Patch', value: 'patch' },
  { name: 'Skin / Cosmetic', value: 'skin' },
  { name: 'Hall of Legends', value: 'hall' },
  { name: 'Sự kiện', value: 'event' },
  { name: 'Esports', value: 'esports' },
  { name: 'Tướng / Gameplay', value: 'champion' }
];

const commands = [
  new SlashCommandBuilder()
    .setName('notify')
    .setDescription('Quản lý hệ thống tự động thông báo LoL')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('status').setDescription('Xem trạng thái các watcher'))
    .addSubcommand(s => s.setName('check').setDescription('Quét Riot News ngay bây giờ'))
    .addSubcommand(s => s.setName('meta').setDescription('Quét balance + biến động meta Global ngay'))
    .addSubcommand(s => s.setName('latest').setDescription('Gửi tin Riot thật mới nhất đang có')
      .addStringOption(o => o.setName('type').setDescription('Loại tin muốn lấy').setRequired(true).addChoices(...notifyTypeChoices)))
    .addSubcommand(s => s.setName('test').setDescription('Gửi một thông báo thử')
      .addStringOption(o => o.setName('type').setDescription('Loại thông báo để test').addChoices(...notifyTypeChoices)))
].map(command => command.toJSON());

function trim(text, max = 1024) {
  const value = String(text || '—');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function baseEmbed(title) {
  return new EmbedBuilder()
    .setColor(0xC99B3D)
    .setTitle(title)
    .setFooter({ text: 'WebLienMinh • Riot notification service' })
    .setTimestamp();
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function deleteManagedGlobalCommands() {
  const existing = await rest.get(Routes.applicationCommands(CLIENT_ID));
  let removed = 0;
  for (const command of existing) {
    if (!MANAGED_COMMAND_NAMES.has(command.name)) continue;
    await rest.delete(Routes.applicationCommand(CLIENT_ID, command.id));
    removed += 1;
  }
  return removed;
}

async function deleteManagedGuildCommands(guildId) {
  const existing = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, guildId));
  let removed = 0;
  for (const command of existing) {
    if (!MANAGED_COMMAND_NAMES.has(command.name)) continue;
    await rest.delete(Routes.applicationGuildCommand(CLIENT_ID, guildId, command.id));
    removed += 1;
  }
  return removed;
}

async function registerCommands() {
  if (GUILD_ID) {
    const removedGlobal = await deleteManagedGlobalCommands();
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`Đã đăng ký duy nhất /notify cho guild ${GUILD_ID}. Đã dọn ${removedGlobal} managed global command.`);
    return;
  }

  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('Đã đăng ký duy nhất /notify ở global scope.');
}

async function cleanupOppositeGuildScopes(client) {
  if (GUILD_ID) return;
  let removed = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      removed += await deleteManagedGuildCommands(guild.id);
    } catch (error) {
      console.warn(`Không dọn được guild commands ở ${guild.id}:`, error?.message || error);
    }
  }
  if (removed) console.log(`Đã dọn ${removed} managed guild command cũ khỏi các guild bot đang tham gia.`);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const newsWatcher = createNewsWatcher(client, { webApiUrl: WEB_API_URL });
const metaWatcher = createMetaWatcher(client, { webApiUrl: WEB_API_URL });

client.once('ready', async () => {
  console.log(`Nô lệ đã tỉnh dậy và làm việc — ${client.user.tag}`);
  client.user.setActivity('Riot News & Meta • /notify');

  try { await cleanupOppositeGuildScopes(client); }
  catch (error) { console.error('Không dọn được slash command scope cũ:', error); }

  try { await newsWatcher.start(); }
  catch (error) { console.error('Không khởi động được Riot News Watcher:', error); }

  try { await metaWatcher.start(); }
  catch (error) { console.error('Không khởi động được Meta Watcher:', error); }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (LEGACY_COMMAND_NAMES.has(interaction.commandName)) {
    return interaction.reply({
      content: 'ℹ️ Lệnh này đã được gỡ. Bot hiện chỉ dùng `/notify` để quản lý hệ thống thông báo tự động.',
      ephemeral: true
    });
  }

  if (interaction.commandName !== 'notify') return;
  await interaction.deferReply({ ephemeral: true });

  try {
    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      const news = newsWatcher.status();
      const meta = metaWatcher.status();
      const embed = baseEmbed('📡 Hệ thống Auto Notification')
        .addFields(
          { name: '📰 Riot News', value: news.enabled ? `✅ ON • ${news.intervalMinutes} phút` : '⚠️ OFF', inline: true },
          { name: '📊 Meta Watcher', value: meta.enabled ? `✅ ON • ${meta.intervalMinutes} phút` : '⚠️ OFF', inline: true },
          { name: '📢 Channel', value: news.channelId ? `<#${news.channelId}>` : (meta.channelId ? `<#${meta.channelId}>` : 'Chưa cấu hình'), inline: true },
          { name: '⚖️ Balance patch gần nhất', value: String(meta.lastBalancePatch || 'Chưa có'), inline: true },
          { name: '🌍 Meta patch hiện tại', value: String(meta.currentPatch || 'Chưa có'), inline: true },
          { name: '🔔 Ngưỡng Meta', value: `Score ±${meta.scoreThreshold} • WR ±${meta.winRateThreshold}đ% • min ${meta.minGames} trận`, inline: false },
          { name: '📰 Tin đã ghi nhận gửi', value: String(news.notifiedCount || 0), inline: true },
          { name: '📈 Biến động lần gần nhất', value: String(meta.lastMovementCount || 0), inline: true },
          { name: 'Lỗi Riot News', value: trim(news.lastError || 'Không có'), inline: false },
          { name: 'Lỗi Meta Watcher', value: trim(meta.lastError || 'Không có'), inline: false }
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'check') {
      const result = await newsWatcher.check();
      if (result.error) throw new Error(result.error);
      return interaction.editReply(`✅ Đã quét Riot News. ${result.fresh || 0} tin mới, ${result.sent || 0} thông báo đã gửi${result.duplicates ? `, ${result.duplicates} tin trùng đã bỏ qua` : ''}.`);
    }

    if (sub === 'meta') {
      const result = await metaWatcher.check({ forceBalance: true });
      if (result.error) throw new Error(result.error);
      const balance = result.balance || {};
      const balanceText = balance.sent
        ? `Balance Alert patch ${balance.patch}: ${balance.buffs || 0} buff, ${balance.nerfs || 0} nerf, ${balance.adjusts || 0} điều chỉnh.`
        : balance.duplicate
          ? `Balance patch ${balance.patch} đã thông báo trước đó.`
          : 'Balance: không có bản tin mới.';
      return interaction.editReply(`✅ Đã quét Balance + Global Meta. ${balanceText}\n📊 Phát hiện **${result.changes || 0}** biến động meta đáng kể; gửi **${result.movementSent || 0}** bản tin mới.`);
    }

    if (sub === 'latest') {
      const type = interaction.options.getString('type', true);
      const result = await newsWatcher.sendLatest(type);
      if (result.duplicate) return interaction.editReply(`ℹ️ Tin **${result.title}** đã được bot thông báo trước đó nên không gửi lại.`);
      return interaction.editReply(`✅ Đã gửi tin Riot thật mới nhất loại **${type}**:\n**${result.title}**`);
    }

    if (sub === 'test') {
      const type = interaction.options.getString('type') || 'event';
      await newsWatcher.sendTest(type);
      return interaction.editReply(`✅ Đã gửi thông báo test loại **${type}** vào channel đã cấu hình.`);
    }

    return interaction.editReply('Lệnh `/notify` chưa hỗ trợ tác vụ này.');
  } catch (error) {
    console.error(`[/notify]`, error);
    const message = error?.name === 'AbortError' ? 'Website API phản hồi quá lâu.' : error?.message || 'Có lỗi khi xử lý lệnh.';
    return interaction.editReply(`❌ ${message}`);
  }
});

client.on('error', error => console.error('Discord client error:', error));

process.once('SIGTERM', () => {
  newsWatcher.stop();
  metaWatcher.stop();
  client.destroy();
});
process.once('SIGINT', () => {
  newsWatcher.stop();
  metaWatcher.stop();
  client.destroy();
});

await registerCommands();
await client.login(TOKEN);
