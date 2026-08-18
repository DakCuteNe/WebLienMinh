import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'public', 'data');
const NEWS_URLS = [
  'https://www.leagueoflegends.com/en-us/news/',
  'https://www.leagueoflegends.com/en-us/news/game-updates/',
  'https://www.leagueoflegends.com/en-us/news/tags/patch-notes/'
];

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
  try { return new URL(decodeHtml(href), 'https://www.leagueoflegends.com').toString(); }
  catch { return null; }
}

function validHttpImage(value) {
  const url = absoluteUrl(value || '');
  return /^https?:\/\//i.test(url || '') ? url : null;
}

function categoryFromUrl(url) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    if (p.includes('/game-updates/')) return 'Game Updates';
    if (p.includes('/esports/')) return 'Esports';
    if (p.includes('/dev/')) return 'Dev';
    if (p.includes('/media/')) return 'Media';
    if (p.includes('/community/')) return 'Community';
  } catch {}
  return 'League News';
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
  const tags = String(inner).match(/<img\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const candidates = [
      tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1],
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1],
      tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1]?.split(',')?.pop()?.trim()?.split(/\s+/)?.[0]
    ];
    for (const candidate of candidates) {
      const image = validHttpImage(candidate);
      if (image) return image;
    }
  }
  return null;
}

function extractMeta(html, names) {
  const wanted = new Set(names.map(x => x.toLowerCase()));
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = tag.match(/\b(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (!name || !wanted.has(name)) continue;
    const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
    if (content) return decodeHtml(content).trim();
  }
  return null;
}

function extractDate(text) {
  const iso = String(text).match(/20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/);
  return iso ? iso[0] : null;
}

function patchVersion(title = '', url = '') {
  const text = `${title} ${url}`;
  const dotted = text.match(/(?:patch[\s-])((?:\d{2}|\d{1,2})[.-]\d{1,2})/i);
  if (dotted) return dotted[1].replace('-', '.');
  const slugged = text.match(/patch-(\d+)-(\d+)-notes/i);
  return slugged ? `${Number(slugged[1])}.${Number(slugged[2])}` : null;
}

function classify(article) {
  const v = `${article.title} ${article.description} ${article.url} ${article.category}`.toLowerCase();
  if (/hall[ -]of[ -]legends|hall-of-legends/.test(v)) return 'hall';
  if (/league of legends patch|patch\s+\d+[.]\d+|patch notes|patch-\d+-\d+-notes/.test(v)) return 'patch';
  if (/\bskins?\b|prestige|chroma|cosmetic|skin trailer|skin reveal/.test(v)) return 'skin';
  if (article.category === 'Esports') return 'esports';
  if (/champion spotlight|champion trailer|new champion|gameplay preview/.test(v)) return 'champion';
  if (/\bevent\b|tickets?|worlds\s+20\d{2}|\bmsi\b|first stand|championship|fan fest|tournament/.test(v)) return 'event';
  return 'news';
}

function parseArticles(html) {
  const out = [];
  const seen = new Set();
  const anchorRe = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRe.exec(html))) {
    const href = decodeHtml(match[2]);
    if (!/\/en-us\/news\//i.test(href) && !/^https?:\/\/(?:www\.)?lolesports\.com\/en-us\/news\//i.test(href)) continue;
    if (/\/en-us\/news\/?(?:[?#].*)?$/i.test(href)) continue;
    const url = absoluteUrl(href);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const inner = match[4];
    const text = stripTags(inner);
    const heading = inner.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1];
    const attrs = `${match[1]} ${match[3]}`;
    const attrTitle = attrs.match(/(?:aria-label|title)=["']([^"']+)["']/i)?.[1];
    const title = stripTags(heading || attrTitle || '') || titleFromSlug(url);
    const description = text.toLowerCase().startsWith(title.toLowerCase()) ? text.slice(title.length).trim() : text;
    const article = {
      title,
      description: description.slice(0, 500),
      url,
      category: categoryFromUrl(url),
      image: extractImage(inner),
      publishedAt: extractDate(`${inner} ${text}`)
    };
    article.type = classify(article);
    out.push(article);
  }

  const rawUrlRe = /(?:https?:\\?\/\\?\/www\.leagueoflegends\.com)?(\\?\/en-us\\?\/news\\?\/game-updates\\?\/league-of-legends-patch-(\d+)-(\d+)-notes\\?\/?)/gi;
  while ((match = rawUrlRe.exec(html))) {
    const href = match[1].replaceAll('\\/', '/');
    const url = absoluteUrl(href);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const patch = `${Number(match[2])}.${Number(match[3])}`;
    out.push({
      title: `League of Legends Patch ${patch} Notes`,
      description: 'Patch Notes chính thức từ Riot Games.',
      url,
      category: 'Game Updates',
      image: null,
      publishedAt: null,
      type: 'patch'
    });
  }

  return out;
}

function patchSort(a, b) {
  const va = patchVersion(a.title, a.url)?.split('.').map(Number) || [0, 0];
  const vb = patchVersion(b.title, b.url)?.split('.').map(Number) || [0, 0];
  return vb[0] - va[0] || vb[1] - va[1];
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'WebLienMinh/2.2 Riot-content-cache',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    signal: AbortSignal.timeout(25_000)
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

async function enrichArticle(article) {
  try {
    const html = await fetchPage(article.url);
    const title = extractMeta(html, ['og:title', 'twitter:title']);
    const description = extractMeta(html, ['og:description', 'description', 'twitter:description']);
    const image = validHttpImage(extractMeta(html, ['og:image', 'twitter:image', 'twitter:image:src']));
    const published = extractMeta(html, ['article:published_time', 'date', 'datepublished']);
    return {
      ...article,
      title: title ? stripTags(title).replace(/\s*[-|]\s*League of Legends\s*$/i, '').trim() : article.title,
      description: description ? stripTags(description).slice(0, 700) : article.description,
      image: image || validHttpImage(article.image),
      publishedAt: published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : article.publishedAt
    };
  } catch (error) {
    console.log(`[riot-content] enrich fail ${article.url}: ${error.message}`);
    return { ...article, image: validHttpImage(article.image) };
  }
}

const all = [];
const seen = new Set();
const errors = [];
for (const url of NEWS_URLS) {
  try {
    const html = await fetchPage(url);
    for (const article of parseArticles(html)) {
      if (seen.has(article.url)) continue;
      seen.add(article.url);
      all.push(article);
    }
  } catch (error) {
    errors.push(error.message);
  }
}

if (!all.length) throw new Error(`Không parse được Riot News. ${errors.join(' | ')}`);

const patchCandidates = all
  .filter(a => a.type === 'patch')
  .map(a => ({
    patch: patchVersion(a.title, a.url),
    title: a.title,
    url: a.url,
    image: validHttpImage(a.image),
    publishedAt: a.publishedAt,
    description: a.description
  }))
  .filter(a => a.patch)
  .sort(patchSort)
  .filter((item, index, arr) => arr.findIndex(x => x.patch === item.patch) === index)
  .slice(0, 12);

if (!patchCandidates.length) throw new Error('Riot News có article nhưng không tìm được Patch Notes.');

const patches = [];
for (const patch of patchCandidates) {
  patches.push(await enrichArticle(patch));
}

const importantUrls = new Set(all.filter(a => ['hall', 'skin', 'event', 'esports', 'champion'].includes(a.type)).slice(0, 18).map(a => a.url));
const enrichedAll = [];
for (const article of all) {
  enrichedAll.push(importantUrls.has(article.url) ? await enrichArticle(article) : { ...article, image: validHttpImage(article.image) });
}
enrichedAll.sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'patches.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'Riot Games / League of Legends official News',
  warning: errors.length ? errors.join(' | ') : null,
  patches
}, null, 2));
await fs.writeFile(path.join(outDir, 'riot-news.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'Riot Games / League of Legends official News',
  articles: enrichedAll.slice(0, 80)
}, null, 2));

console.log(`Riot content cache: ${patches.length} patch notes • ${enrichedAll.length} articles.`);
console.log(`Latest patch parsed: ${patches[0].patch} • ${patches[0].title} • image=${patches[0].image ? 'yes' : 'no'}`);
