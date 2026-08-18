import fs from 'node:fs/promises';
import path from 'node:path';
import { EmbedBuilder } from 'discord.js';

const RIOT_NEWS_URL = 'https://www.leagueoflegends.com/en-us/news/';
const DEFAULT_TYPES = ['patch', 'skin', 'hall', 'event', 'esports', 'champion'];
const TYPE_META = {
  patch: { icon: '🛠️', label: 'PATCH MỚI', roleEnv: 'DISCORD_PATCH_ROLE_ID' },
  skin: { icon: '🎨', label: 'SKIN / COSMETIC MỚI', roleEnv: 'DISCORD_SKIN_ROLE_ID' },
  hall: { icon: '🏛️', label: 'HALL OF LEGENDS', roleEnv: 'DISCORD_HALL_ROLE_ID' },
  event: { icon: '📅', label: 'SỰ KIỆN SẮP TỚI', roleEnv: 'DISCORD_EVENT_ROLE_ID' },
  esports: { icon: '🏆', label: 'ESPORTS', roleEnv: 'DISCORD_ESPORTS_ROLE_ID' },
  champion: { icon: '⚔️', label: 'TƯỚNG / GAMEPLAY', roleEnv: 'DISCORD_CHAMPION_ROLE_ID' },
  news: { icon: '📢', label: 'TIN MỚI', roleEnv: 'DISCORD_NEWS_ROLE_ID' }
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function envBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(value = '') {
  return decodeHtml(String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteUrl(href) {
  try { return new URL(href, 'https://www.leagueoflegends.com').toString(); }
  catch { return null; }
}

function titleFromSlug(url) {
  try {
    const slug = new URL(url).pathname.split('/').filter(Boolean).pop() || 'league-news';
    return slug.split('-').map(x => x ? x[0].toUpperCase() + x.slice(1) : x).join(' ');
  } catch {
    return 'League of Legends News';
  }
}

function extractImage(inner) {
  const candidates = [
    /<img\b[^>]*\bsrc=["']([^"']+)["']/i,
    /<img\b[^>]*\bdata-src=["']([^"']+)["']/i,
    /\bbackground-image\s*:\s*url\(["']?([^"')]+)["']?\)/i
  ];
  for (const re of candidates) {
    const match = re.exec(inner);
    if (!match) continue;
    const url = absoluteUrl(decodeHtml(match[1]));
    if (url?.startsWith('http')) return url;
  }
  return null;
}

function extractDate(text, inner) {
  const iso = `${inner} ${text}`.match(/20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/);
  if (iso) return iso[0];
  const dateAttr = inner.match(/(?:datetime|data-date)=["']([^"']+)["']/i);
  if (dateAttr && !Number.isNaN(Date.parse(dateAttr[1]))) return new Date(dateAttr[1]).toISOString();
  return null;
}

function extractTitle(inner, attrs, url) {
  const heading = inner.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (heading) {
    const value = stripTags(heading[1]);
    if (value.length >= 4) return value;
  }

  const aria = attrs.match(/(?:aria-label|title)=["']([^"']+)["']/i);
  if (aria) {
    const value = stripTags(aria[1]);
    if (value.length >= 4) return value;
  }

  const strong = inner.match(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/i);
  if (strong) {
    const value = stripTags(strong[1]);
    if (value.length >= 4) return value;
  }

  return titleFromSlug(url);
}

function categoryFromUrl(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.includes('/game-updates/')) return 'Game Updates';
  if (pathname.includes('/esports/')) return 'Esports';
  if (pathname.includes('/dev/')) return 'Dev';
  if (pathname.includes('/media/')) return 'Media';
  if (pathname.includes('/community/')) return 'Community';
  return 'League News';
}

function classifyArticle(article) {
  const value = `${article.title} ${article.description} ${article.url} ${article.category}`.toLowerCase();

  if (/hall[ -]of[ -]legends|hall-of-legends|immortalized legend|rising legend|đại sảnh huyền thoại/.test(value)) return 'hall';
  if (/league of legends patch|patch\s+\d+[.]\d+|patch notes|patch-\d+-\d+-notes/.test(value)) return 'patch';
  if (/\bskins?\b|prestige|chroma|sanctum|cosmetic|mythic variant|skin trailer|skin reveal/.test(value)) return 'skin';
  if (/\bevent\b|upcoming|tickets?|schedule|fan fest|championship|worlds\s+20\d{2}|\bmsi\b|first stand|showdown|homegrounds|battle pass|tournament|starts?\s+(?:on|this)|coming\s+(?:soon|in)/.test(value)) return 'event';
  if (article.category === 'Esports') return 'esports';
  if (/champion spotlight|champion trailer|new champion|gameplay preview|champion roadmap/.test(value)) return 'champion';
  return 'news';
}

function extractPatchVersion(title = '', url = '') {
  const match = `${title} ${url}`.match(/(?:patch[\s-])((?:\d{2}|\d{1,2})[.-]\d{1,2})/i);
  return match ? match[1].replace('-', '.') : null;
}

function articleKey(article) {
  if (article.type === 'patch') {
    const patch = extractPatchVersion(article.title, article.url);
    if (patch) return `patch:${patch}`;
  }
  return article.url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
}

function parseOfficialNews(html) {
  const articles = [];
  const seen = new Set();
  const anchorRe = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRe.exec(html))) {
    const href = decodeHtml(match[2]);
    if (!/\/en-us\/news\//i.test(href)) continue;
    if (/\/en-us\/news\/?(?:[?#].*)?$/i.test(href)) continue;

    const url = absoluteUrl(href);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const attrs = `${match[1]} ${match[3]}`;
    const inner = match[4];
    const text = stripTags(inner);
    const title = extractTitle(inner, attrs, url);
    if (!title || title.length < 4) continue;

    const withoutTitle = text.toLowerCase().startsWith(title.toLowerCase())
      ? text.slice(title.length).trim()
      : text;

    const article = {
      url,
      title,
      description: withoutTitle.slice(0, 420),
      category: categoryFromUrl(url),
      image: extractImage(inner),
      publishedAt: extractDate(text, inner)
    };
    article.type = classifyArticle(article);
    articles.push(article);
  }

  return articles.slice(0, 80);
}

async function fetchOfficialNews() {
  const response = await fetch(RIOT_NEWS_URL, {
    headers: {
      'User-Agent': 'WebLienMinh-DiscordBot/3.0 Riot-news-watcher',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`Riot News HTTP ${response.status}`);
  const html = await response.text();
  const articles = parseOfficialNews(html);
  if (!articles.length) throw new Error('Không parse được article từ Riot News.');
  return articles;
}

async function fetchPatchFallback(webApiUrl) {
  try {
    const response = await fetch(`${webApiUrl}/api/patches`, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return [];
    const body = await response.json();
    return (body.patches || []).slice(0, 3).map(patch => ({
      type: 'patch',
      title: patch.title || `League of Legends Patch ${patch.patch} Notes`,
      description: 'Patch Notes chính thức từ Riot Games.',
      category: 'Game Updates',
      url: patch.url,
      image: null,
      publishedAt: null
    }));
  } catch {
    return [];
  }
}

async function extractUpcomingSkins(article) {
  if (article.type !== 'patch') return [];
  try {
    const response = await fetch(article.url, {
      headers: { 'User-Agent': 'WebLienMinh-DiscordBot/3.0 patch-skin-parser' },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) return [];
    const html = await response.text();
    const start = html.search(/Upcoming Skins(?:\s*&amp;|\s*&)?\s*Chromas/i);
    if (start < 0) return [];
    const section = html.slice(start, start + 20_000);
    const stopMatch = section.slice(100).search(/<h2\b|<h3\b[^>]*>[^<]*(?:Bugfix|Changes|Chromas)/i);
    const target = stopMatch > 0 ? section.slice(0, stopMatch + 100) : section;
    const names = [];
    const headingRe = /<h4\b[^>]*>([\s\S]*?)<\/h4>/gi;
    let match;
    while ((match = headingRe.exec(target)) && names.length < 12) {
      const name = stripTags(match[1]);
      if (name && !/chroma/i.test(name) && !names.includes(name)) names.push(name);
    }
    return names;
  } catch {
    return [];
  }
}

function configuredTypes() {
  const raw = String(process.env.DISCORD_NOTIFY_TYPES || DEFAULT_TYPES.join(','));
  return new Set(raw.split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
}

function roleForType(type) {
  const specific = TYPE_META[type]?.roleEnv ? String(process.env[TYPE_META[type].roleEnv] || '').trim() : '';
  return specific || String(process.env.DISCORD_NEWS_ROLE_ID || '').trim();
}

function mentionForRole(roleId) {
  return roleId ? `<@&${roleId}>` : '';
}

function typeColor(type) {
  if (type === 'patch') return 0x4A90E2;
  if (type === 'skin') return 0xD96FD8;
  if (type === 'hall') return 0xE0B95B;
  if (type === 'event') return 0x58B368;
  if (type === 'esports') return 0xE34C4C;
  if (type === 'champion') return 0x8E6AD8;
  return 0xC99B3D;
}

async function readState(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return {
      initialized: Boolean(parsed.initialized),
      seen: Array.isArray(parsed.seen) ? parsed.seen : [],
      lastCheckAt: parsed.lastCheckAt || null,
      lastSentAt: parsed.lastSentAt || null
    };
  } catch {
    return { initialized: false, seen: [], lastCheckAt: null, lastSentAt: null };
  }
}

async function writeState(file, state) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const trimmed = { ...state, seen: [...new Set(state.seen)].slice(-600) };
  await fs.writeFile(file, JSON.stringify(trimmed, null, 2));
}

function buildEmbed(article, skins = []) {
  const meta = TYPE_META[article.type] || TYPE_META.news;
  const embed = new EmbedBuilder()
    .setColor(typeColor(article.type))
    .setAuthor({ name: `Riot Games • ${article.category || 'League of Legends'}` })
    .setTitle(`${meta.icon} ${article.title}`)
    .setURL(article.url)
    .setDescription((article.description || 'Có thông tin mới từ League of Legends.').slice(0, 1500))
    .addFields({ name: 'Loại thông báo', value: meta.label, inline: true })
    .setFooter({ text: 'Nguồn chính thức: League of Legends / Riot Games • WebLienMinh Bot' })
    .setTimestamp(article.publishedAt && !Number.isNaN(Date.parse(article.publishedAt)) ? new Date(article.publishedAt) : new Date());

  if (skins.length) {
    embed.addFields({
      name: '🎨 Skin dự kiến trong patch',
      value: skins.slice(0, 10).map(x => `• ${x}`).join('\n').slice(0, 1024),
      inline: false
    });
  }

  if (article.image?.startsWith('http')) embed.setImage(article.image);
  return embed;
}

export function createNewsWatcher(client, { webApiUrl }) {
  const channelId = String(process.env.DISCORD_NEWS_CHANNEL_ID || '').trim();
  const intervalMinutes = Math.max(5, Math.min(180, Number(process.env.NEWS_CHECK_INTERVAL_MINUTES || 10)));
  const intervalMs = intervalMinutes * 60_000;
  const stateFile = path.resolve(String(process.env.BOT_STATE_FILE || '.bot-news-state.json'));
  const types = configuredTypes();
  const notifyOnStartup = envBool('BOT_NOTIFY_ON_STARTUP', false);

  let timer = null;
  let running = false;
  let state = { initialized: false, seen: [], lastCheckAt: null, lastSentAt: null };
  let lastError = null;
  let lastArticle = null;
  let sentCount = 0;

  async function getChannel() {
    if (!channelId) return null;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) throw new Error(`DISCORD_NEWS_CHANNEL_ID=${channelId} không phải text channel bot truy cập được.`);
    return channel;
  }

  async function loadFeed() {
    let official = [];
    let officialError = null;
    try {
      official = await fetchOfficialNews();
    } catch (error) {
      officialError = error;
    }

    const patches = await fetchPatchFallback(webApiUrl);
    const merged = [...official, ...patches];
    const byKey = new Map();
    for (const article of merged) {
      article.type = article.type || classifyArticle(article);
      const key = articleKey(article);
      if (!byKey.has(key)) byKey.set(key, { ...article, key });
    }

    if (!byKey.size && officialError) throw officialError;
    return [...byKey.values()];
  }

  async function sendArticle(channel, article) {
    const roleId = roleForType(article.type);
    const mention = mentionForRole(roleId);
    const skins = await extractUpcomingSkins(article);
    const embed = buildEmbed(article, skins);
    await channel.send({
      content: mention || undefined,
      embeds: [embed],
      allowedMentions: roleId ? { roles: [roleId] } : { parse: [] }
    });
    sentCount++;
    state.lastSentAt = new Date().toISOString();
    lastArticle = article;
  }

  async function check({ forceLatest = false } = {}) {
    if (running) return { skipped: true, reason: 'already-running' };
    running = true;
    try {
      state = await readState(stateFile);
      const feed = await loadFeed();
      const channel = await getChannel();
      const now = new Date().toISOString();
      const currentKeys = feed.map(x => x.key);

      if (!state.initialized) {
        state.initialized = true;
        state.seen = currentKeys;
        state.lastCheckAt = now;
        await writeState(stateFile, state);
        lastError = null;

        if (notifyOnStartup && channel) {
          const latest = feed.find(x => types.has(x.type));
          if (latest) await sendArticle(channel, latest);
        }
        return { initialized: true, articles: feed.length, sent: notifyOnStartup ? 1 : 0 };
      }

      const seen = new Set(state.seen);
      let fresh = feed.filter(article => !seen.has(article.key) && types.has(article.type));
      if (forceLatest && !fresh.length) {
        const latest = feed.find(article => types.has(article.type));
        fresh = latest ? [latest] : [];
      }

      // Riot page is newest-first. Send oldest -> newest when multiple articles arrived between checks.
      fresh = fresh.slice(0, 8).reverse();
      if (channel) {
        for (const article of fresh) {
          await sendArticle(channel, article);
          await sleep(800);
        }
      }

      state.seen = [...state.seen, ...currentKeys];
      state.lastCheckAt = now;
      await writeState(stateFile, state);
      lastError = null;
      return { articles: feed.length, fresh: fresh.length, sent: channel ? fresh.length : 0 };
    } catch (error) {
      lastError = error.message || String(error);
      console.error('[news-watcher]', error);
      return { error: lastError };
    } finally {
      running = false;
    }
  }

  async function sendTest(type = 'event') {
    const channel = await getChannel();
    if (!channel) throw new Error('Chưa cấu hình DISCORD_NEWS_CHANNEL_ID.');
    const safeType = TYPE_META[type] ? type : 'event';
    const roleId = roleForType(safeType);
    const mention = mentionForRole(roleId);
    const article = {
      type: safeType,
      title: 'Thông báo thử nghiệm WebLienMinh Bot',
      description: 'Nếu bạn thấy tin nhắn này, hệ thống tự động tag + thông báo Riot News đã hoạt động.',
      category: 'System Test',
      url: webApiUrl,
      image: null,
      publishedAt: new Date().toISOString()
    };
    await channel.send({
      content: mention || undefined,
      embeds: [buildEmbed(article)],
      allowedMentions: roleId ? { roles: [roleId] } : { parse: [] }
    });
    return true;
  }

  async function sendLatest(type = 'event') {
    if (running) throw new Error('Riot News Watcher đang quét. Hãy thử lại sau vài giây.');
    const safeType = TYPE_META[type] && type !== 'news' ? type : 'event';
    running = true;
    try {
      state = await readState(stateFile);
      const channel = await getChannel();
      if (!channel) throw new Error('Chưa cấu hình DISCORD_NEWS_CHANNEL_ID.');

      const feed = await loadFeed();
      const latest = feed.find(article => article.type === safeType);
      if (!latest) {
        throw new Error(`Chưa tìm thấy tin Riot hiện có thuộc loại ${TYPE_META[safeType].label}.`);
      }

      await sendArticle(channel, latest);
      await writeState(stateFile, state);
      lastError = null;
      return {
        sent: 1,
        type: safeType,
        title: latest.title,
        url: latest.url,
        publishedAt: latest.publishedAt || null
      };
    } catch (error) {
      lastError = error.message || String(error);
      console.error('[news-watcher latest]', error);
      throw error;
    } finally {
      running = false;
    }
  }

  function status() {
    return {
      enabled: Boolean(channelId),
      channelId: channelId || null,
      intervalMinutes,
      types: [...types],
      stateFile,
      lastCheckAt: state.lastCheckAt,
      lastSentAt: state.lastSentAt,
      lastError,
      lastArticle: lastArticle ? { title: lastArticle.title, type: lastArticle.type, url: lastArticle.url } : null,
      sentCount
    };
  }

  async function start() {
    state = await readState(stateFile);
    if (!channelId) {
      console.log('Riot News Watcher: OFF — thiếu DISCORD_NEWS_CHANNEL_ID.');
      return;
    }

    console.log(`Riot News Watcher: ON • channel=${channelId} • mỗi ${intervalMinutes} phút • types=${[...types].join(',')}`);
    await check();
    timer = setInterval(() => check(), intervalMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, check, sendTest, sendLatest, status };
}
