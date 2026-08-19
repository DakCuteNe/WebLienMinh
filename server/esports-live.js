const LEAGUEPEDIA_API = 'https://lol.fandom.com/api.php';
const MEDIA_TTL_MS = 60 * 60 * 1000;
const PROFILE_TTL_MS = 6 * 60 * 60 * 1000;
const PROFILE_FRESH_TTL_MS = 5 * 60 * 1000;
const ACHIEVEMENT_TTL_MS = 24 * 60 * 60 * 1000;
const ERROR_TTL_MS = 15 * 60 * 1000;

const profileCache = new Map();
const achievementCache = new Map();
const mediaCache = new Map();

const norm = value => String(value || '').trim().replaceAll('_', ' ').toLowerCase();

function cleanTitle(value) {
  let title = String(value || '').trim();
  if (!title) return null;
  try {
    const url = new URL(title);
    const marker = '/wiki/';
    const at = url.pathname.indexOf(marker);
    if (at >= 0) title = decodeURIComponent(url.pathname.slice(at + marker.length));
  } catch {}
  return title.replaceAll('_', ' ').trim() || null;
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

function cleanWiki(value = '') {
  let text = String(value || '').trim();
  if (!text) return null;
  text = text
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<br\s*\/?\s*>/gi, ', ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[(https?:\/\/\S+)\s+([^\]]+)\]/g, '$2')
    .replace(/'''?/g, '');
  for (let i = 0; i < 5; i++) {
    const next = text.replace(/\{\{[^{}|]+\|([^{}]+)\}\}/g, (_m, inner) => {
      const parts = String(inner).split('|').map(x => x.trim()).filter(Boolean);
      return parts.at(-1) || '';
    });
    if (next === text) break;
    text = next;
  }
  return text.replace(/\{\{[^{}]*\}\}/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

function parseParams(wikitext = '') {
  const params = new Map();
  for (const line of String(wikitext).split(/\r?\n/)) {
    const match = line.match(/^\s*\|\s*([^=|]+?)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const name = norm(match[1]).replaceAll(' ', '');
    if (!params.has(name) || !params.get(name)) params.set(name, match[2]);
  }
  return params;
}

function param(params, ...names) {
  for (const name of names) {
    const raw = params.get(norm(name).replaceAll(' ', ''));
    if (raw != null && String(raw).trim()) return raw;
  }
  return null;
}

function normalizeDate(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;
  const template = raw.match(/\{\{\s*(?:birth\s*date(?:\s*and\s*age)?|date|dts)\s*\|\s*((?:19|20)\d{2})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i);
  if (template) return `${template[1]}-${String(template[2]).padStart(2, '0')}-${String(template[3]).padStart(2, '0')}`;
  const pipeDate = raw.match(/\b((?:19|20)\d{2})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})\b/);
  if (pipeDate) return `${pipeDate[1]}-${String(pipeDate[2]).padStart(2, '0')}-${String(pipeDate[3]).padStart(2, '0')}`;
  const text = cleanWiki(raw)?.replace(/\s*\(age\s+\d+\)\s*/i, ' ').trim();
  if (!text) return null;
  const iso = text.match(/\b((?:19|20)\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

function ageFromDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const [y, m, d] = value.split('-').map(Number);
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--;
  return age >= 10 && age <= 80 ? age : null;
}

function fileName(value) {
  let text = String(value || '').trim();
  if (!text) return null;
  text = text.replace(/^\[\[(?:File|Image):/i, '').replace(/\]\]$/, '').split('|')[0].trim();
  return text.replace(/^(?:File|Image):/i, '').trim() || null;
}

function looksLikeRosterOrPoster(value) {
  return /(?:^|[_\s/%-])(roster|lineup|team[ _-]?photo|teamphoto|poster|squad|players?)(?:[_\s./?&%-]|$)/i.test(String(value || ''));
}

async function wikiApi(params, timeoutMs = 12_000) {
  const query = new URLSearchParams({ format: 'json', ...params });
  const response = await fetch(`${LEAGUEPEDIA_API}?${query}`, {
    headers: { 'User-Agent': 'WebLienMinh/2.5.1 current-esports-profile' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`Leaguepedia ${response.status}`);
  const body = await response.json();
  if (body?.error) throw new Error(body.error.info || body.error.code || 'Leaguepedia API error');
  return body;
}

function wikiQuery(params, timeoutMs = 12_000) {
  return wikiApi({ action: 'query', redirects: '1', ...params }, timeoutMs);
}

async function renderedProfile(pageTitle) {
  try {
    const body = await wikiApi({ action: 'parse', page: pageTitle, prop: 'text|displaytitle' }, 14_000);
    const html = body.parse?.text?.['*'];
    if (!html) return null;

    const lines = decodeHtml(String(html)
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(?:td|th|tr|div|p|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '))
      .split(/\r?\n/)
      .map(x => x.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const field = (...labels) => {
      const wanted = labels.map(x => x.toLowerCase());
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        if (!wanted.some(label => line === label || line.startsWith(`${label} `))) continue;
        for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
          const value = lines[j];
          if (value && !wanted.includes(value.toLowerCase())) return value;
        }
      }
      return null;
    };

    const hrefs = [...String(html).matchAll(/href=["']([^"']+)["']/gi)].map(m => decodeHtml(m[1]));
    const firstLink = re => hrefs.find(href => re.test(href)) || null;
    const birthday = field('Birthday');
    const birthdate = normalizeDate(birthday);
    const contractRaw = field('Contract Expires', 'Contract');

    return {
      name: field('Name'),
      country: field('Country of Birth', 'Country'),
      nationality: field('Nationality') || field('Country of Birth', 'Country'),
      birthdate,
      age: ageFromDate(birthdate),
      residency: field('Residency'),
      currentTeamName: field('Team'),
      contract: normalizeDate(contractRaw) || cleanWiki(contractRaw),
      socials: {
        twitter: firstLink(/(?:twitter\.com|x\.com)\//i),
        instagram: firstLink(/instagram\.com\//i),
        stream: firstLink(/(?:twitch\.tv|sooplive\.co\.kr|sooplive\.com)\//i),
        youtube: firstLink(/youtube\.com\//i)
      }
    };
  } catch {
    return null;
  }
}

async function resolveFileUrl(name) {
  if (!name) return null;
  const body = await wikiQuery({ prop: 'imageinfo', iiprop: 'url', iiurlwidth: '900', titles: `File:${name}` });
  const page = Object.values(body.query?.pages || {}).find(item => !item.missing);
  const info = page?.imageinfo?.[0];
  return info?.thumburl || info?.url || null;
}

async function currentProfile(title, kind = 'player', fresh = false) {
  const pageTitle = cleanTitle(title);
  if (!pageTitle) return null;
  const cacheKey = `${kind}:${norm(pageTitle)}`;
  const hit = profileCache.get(cacheKey);
  const ttl = fresh ? PROFILE_FRESH_TTL_MS : PROFILE_TTL_MS;
  if (hit && Date.now() - hit.at < ttl) return hit.value;

  try {
    const body = await wikiQuery({
      prop: 'pageimages|info|revisions',
      piprop: 'thumbnail|original|name',
      pithumbsize: '900',
      inprop: 'url',
      rvprop: 'content',
      rvslots: 'main',
      titles: pageTitle
    });
    const page = Object.values(body.query?.pages || {}).find(item => !item.missing);
    if (!page) {
      profileCache.set(cacheKey, { at: Date.now(), value: null });
      return null;
    }

    const revision = page.revisions?.[0];
    const wikitext = revision?.slots?.main?.['*'] ?? revision?.slots?.main?.content ?? revision?.['*'] ?? '';
    const params = parseParams(wikitext);
    const rawExplicitImage = fileName(kind === 'team'
      ? param(params, 'logo', 'teamlogo', 'logofile', 'image')
      : param(params, 'image', 'playerimage', 'photo'));
    const explicitImage = kind === 'team' && looksLikeRosterOrPoster(rawExplicitImage) ? null : rawExplicitImage;
    let image = null;
    if (explicitImage) image = await resolveFileUrl(explicitImage).catch(() => null);

    const pageImageName = fileName(page.pageimage);
    const fallbackAllowed = kind === 'team'
      ? Boolean(pageImageName && /logo/i.test(pageImageName) && !looksLikeRosterOrPoster(pageImageName))
      : !looksLikeRosterOrPoster(pageImageName);
    if (!image && fallbackAllowed) image = page.thumbnail?.source || page.original?.source || null;

    const result = {
      pageTitle: page.title || pageTitle,
      sourcePage: page.fullurl || `https://lol.fandom.com/wiki/${encodeURIComponent(page.title || pageTitle).replace(/%20/g, '_')}`,
      image,
      fetchedAt: new Date().toISOString()
    };

    if (kind === 'player') {
      const birthdate = normalizeDate(param(params, 'birthdate', 'birthday', 'dob'));
      const contractRaw = param(params, 'contract', 'contractexpires', 'contractexpiry', 'contractend', 'contractdate');
      result.name = cleanWiki(param(params, 'name', 'namefull', 'realname'));
      result.nativeName = cleanWiki(param(params, 'nativename'));
      result.country = cleanWiki(param(params, 'country', 'countryofbirth'));
      result.nationality = cleanWiki(param(params, 'nationality', 'nationalityprimary')) || result.country;
      result.birthdate = birthdate;
      result.age = ageFromDate(birthdate);
      result.contract = normalizeDate(contractRaw) || cleanWiki(contractRaw);
      result.currentTeamName = cleanWiki(param(params, 'team', 'currentteam', 'teamname'));
      result.residency = cleanWiki(param(params, 'residency'));
      result.socials = {
        twitter: cleanWiki(param(params, 'twitter')),
        instagram: cleanWiki(param(params, 'instagram')),
        stream: cleanWiki(param(params, 'stream', 'twitch')),
        youtube: cleanWiki(param(params, 'youtube'))
      };

      if (!result.birthdate || !result.contract || !result.currentTeamName || !result.name) {
        const rendered = await renderedProfile(page.title || pageTitle);
        if (rendered) {
          for (const field of ['name', 'country', 'nationality', 'birthdate', 'age', 'contract', 'currentTeamName', 'residency']) {
            if ((!result[field] || result[field] === result.pageTitle) && rendered[field]) result[field] = rendered[field];
          }
          result.socials ||= {};
          for (const [key, value] of Object.entries(rendered.socials || {})) if (!result.socials[key] && value) result.socials[key] = value;
        }
      }
    }

    profileCache.set(cacheKey, { at: Date.now(), value: result });
    return result;
  } catch (error) {
    const stale = profileCache.get(cacheKey);
    if (stale?.value) return stale.value;
    profileCache.set(cacheKey, { at: Date.now() - PROFILE_TTL_MS + ERROR_TTL_MS, value: null });
    throw error;
  }
}

function matchPlayer(players, rawKey) {
  const wanted = norm(cleanTitle(rawKey) || rawKey);
  return (players || []).find(player => [player.uid, player.id, player.identityId, player.overviewPage, player.preferredPage, player.profilePageTitle]
    .filter(Boolean).some(value => norm(cleanTitle(value) || value) === wanted));
}

function matchTeam(teams, rawKey) {
  const wanted = norm(cleanTitle(rawKey) || rawKey);
  return (teams || []).find(team => [team.id, team.name, team.short, team.sourcePage]
    .filter(Boolean).some(value => norm(cleanTitle(value) || value) === wanted));
}

async function fetchImageBuffer(url) {
  if (!url) return null;
  const hit = mediaCache.get(url);
  if (hit && Date.now() - hit.at < MEDIA_TTL_MS) return hit.value;
  try {
    const parsed = new URL(url);
    if (!/(^|\.)wikia\.nocookie\.net$/i.test(parsed.hostname)) return null;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WebLienMinh/2.5.1 esports-media-proxy',
        'Referer': 'https://lol.fandom.com/'
      },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/')) return null;
    const value = { type, buffer: Buffer.from(await response.arrayBuffer()) };
    mediaCache.set(url, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

async function getAchievements(player, leaguepediaCargo, escapeCargo) {
  const title = player.preferredPage || player.overviewPage || player.identityId || player.id;
  const key = norm(title);
  const hit = achievementCache.get(key);
  if (hit && Date.now() - hit.at < ACHIEVEMENT_TTL_MS) return hit;

  try {
    const value = await leaguepediaCargo({
      tables: 'TournamentPlayers=TP,TournamentResults=TR',
      fields: 'TR.Event=event,TR.Tier=tier,TR.Date=date,TR.Place=place,TR.Place_Number=placeNumber,TR.Team=team,TR.Prize_USD=prizeUSD,TR.Phase=phase',
      join_on: 'TP.PageAndTeam=TR.PageAndTeam',
      where: `TP.Player='${escapeCargo(title)}' AND TR.IsAchievement=1`,
      order_by: 'TR.Date DESC,TR.Place_Number ASC',
      limit: '100'
    });
    const row = { at: Date.now(), value, warning: null };
    achievementCache.set(key, row);
    return row;
  } catch (error) {
    if (hit?.value?.length) return { ...hit, warning: `Nguồn thành tích đang giới hạn truy cập; đang dùng cache trước đó. ${error.message}` };
    const row = { at: Date.now() - ACHIEVEMENT_TTL_MS + ERROR_TTL_MS, value: [], warning: `Nguồn thành tích đang giới hạn truy cập; thử lại sau. ${error.message}` };
    achievementCache.set(key, row);
    return row;
  }
}

export function installEsportsLiveRoutes(app, { readEsportsDirectory, readPros, leaguepediaCargo, escapeCargo }) {
  app.get('/api/esports/media', async (req, res) => {
    try {
      const kind = String(req.query.kind || 'player').toLowerCase() === 'team' ? 'team' : 'player';
      const rawKey = String(req.query.key || '').trim();
      const fresh = String(req.query.fresh || '') === '1';
      if (!rawKey || rawKey.length > 220) return res.status(400).send('Invalid media key');
      const directory = await readEsportsDirectory();

      let storedUrl = null;
      let title = cleanTitle(rawKey) || rawKey;
      if (kind === 'player') {
        const player = matchPlayer(directory.players, rawKey);
        if (player) {
          storedUrl = player.image || null;
          title = player.preferredPage || player.overviewPage || player.identityId || player.id || title;
        }
      } else {
        const team = matchTeam(directory.teams, rawKey);
        if (team) {
          storedUrl = team.logo || null;
          title = cleanTitle(team.sourcePage) || team.name || title;
        }
      }

      let image = null;
      let source = null;
      if (fresh) {
        const live = await currentProfile(title, kind, true).catch(() => null);
        image = await fetchImageBuffer(live?.image);
        source = image ? 'leaguepedia-live' : null;
      }
      if (!image) {
        image = await fetchImageBuffer(storedUrl);
        source = image ? 'directory-current-sync' : source;
      }
      if (!image && !fresh) {
        const live = await currentProfile(title, kind, false).catch(() => null);
        image = await fetchImageBuffer(live?.image);
        source = image ? 'leaguepedia-live' : source;
      }
      if (!image) return res.status(404).send('Current image unavailable');

      const ttl = fresh ? PROFILE_FRESH_TTL_MS : MEDIA_TTL_MS;
      res.setHeader('Content-Type', image.type);
      res.setHeader('Cache-Control', `public, max-age=${Math.floor(ttl / 1000)}, s-maxage=${Math.floor(ttl / 1000)}, stale-while-revalidate=86400`);
      res.setHeader('X-Esports-Media-Source', source || 'unknown');
      return res.send(image.buffer);
    } catch (error) {
      return res.status(502).send(`Esports media unavailable: ${error.message}`);
    }
  });

  app.get('/api/esports/player/:id/achievements', async (req, res) => {
    try {
      const directory = await readEsportsDirectory();
      const player = matchPlayer(directory.players, req.params.id);
      if (!player) return res.status(404).json({ error: 'Không tìm thấy tuyển thủ trong directory hiện tại.' });
      const state = await getAchievements(player, leaguepediaCargo, escapeCargo);
      const achievements = state.value || [];
      const titles = achievements.filter(a => Number(a.placeNumber || 999) === 1);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ achievements, titles, titleCount: titles.length, warning: state.warning });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/esports/player/:id', async (req, res) => {
    try {
      const directory = await readEsportsDirectory();
      const base = matchPlayer(directory.players, req.params.id);
      if (!base) return res.status(404).json({ error: 'Không tìm thấy tuyển thủ trong directory hiện tại.' });

      const player = {
        ...base,
        team: base.team ? { ...base.team } : null,
        socials: { ...(base.socials || {}) }
      };
      const title = player.preferredPage || player.overviewPage || player.identityId || player.id;
      let liveWarning = null;
      let live = null;
      try { live = await currentProfile(title, 'player', true); } catch (error) { liveWarning = error.message; }

      if (live) {
        const fields = ['name', 'nativeName', 'country', 'nationality', 'birthdate', 'age', 'contract', 'residency'];
        for (const field of fields) if (live[field] != null && live[field] !== '') player[field] = live[field];
        for (const [name, value] of Object.entries(live.socials || {})) if (value) player.socials[name] = value;
        player.currentProfileFetchedAt = live.fetchedAt;
        player.currentProfileSource = live.sourcePage;

        if (live.currentTeamName) {
          const currentTeam = matchTeam(directory.teams, live.currentTeamName);
          player.currentTeamName = live.currentTeamName;
          player.team = currentTeam
            ? { ...currentTeam }
            : {
                id: null,
                name: live.currentTeamName,
                short: null,
                region: null,
                location: null,
                logo: null,
                sourcePage: `https://lol.fandom.com/wiki/${encodeURIComponent(live.currentTeamName).replace(/%20/g, '_')}`,
                website: null,
                socials: {}
              };
        }
      }

      const pros = await readPros();
      const featuredStats = player.featured
        ? (pros.players || []).find(p => {
            if (p.page && player.preferredPage) return norm(p.page) === norm(player.preferredPage);
            return norm(p.name) === norm(player.id);
          }) || null
        : null;

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        player,
        achievements: [],
        titles: [],
        titleCount: null,
        achievementsDeferred: true,
        featuredStats,
        achievementWarning: null,
        liveProfileWarning: liveWarning,
        sourceNote: 'Hồ sơ/ảnh hiện tại ưu tiên Leaguepedia hiện tại; thống kê thi đấu dùng Oracle’s Elixir. Thành tích chỉ tải khi người dùng yêu cầu để giảm rate-limit.'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
