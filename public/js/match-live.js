import { esc } from './shared.js';
import { getLanguage, onLanguageChange } from './i18n.js';

const LEAGUES = {
  LCK: ['98767991310872058', 'lck'],
  LPL: ['98767991314006698', 'lpl'],
  LEC: ['98767991302996019', 'lec'],
  LCS: ['98767991299243165', 'lcs'],
  LCP: ['113476371197627891', 'lcp'],
  VCS: ['107213827295848783', 'vcs'],
  'FIRST STAND': ['113464388705111224', 'first_stand'],
  MSI: ['98767991325878492', 'msi'],
  WORLDS: ['98767975604431411', 'worlds']
};

const COPY = {
  vi: {
    center: 'Chi tiết trực tiếp', close: 'Thu gọn', watch: 'Xem trực tiếp', matchPage: 'Mở trận đấu',
    syncing: 'Đang đồng bộ trận đấu...', waiting: 'Đang chờ dữ liệu trận đấu từ LoL Esports.',
    draftWaiting: 'Pick sẽ xuất hiện khi feed draft được Riot công bố.', picks: 'PICK', bans: 'BAN', game: 'Ván',
    series: 'Tỉ số BO', kills: 'Mạng', gold: 'Vàng', towers: 'Trụ', dragons: 'Rồng', barons: 'Baron',
    objectives: 'MỤC TIÊU', inhibitors: 'Nhà lính', goldLead: 'Chênh vàng', dragonsTaken: 'Rồng đã ăn', noDragons: 'Chưa ăn rồng',
    live: 'ĐANG LIVE', upcoming: 'SẮP DIỄN RA', finished: 'ĐÃ KẾT THÚC', source: 'Live • LoL Esports',
    noFeed: 'Feed chi tiết chưa có cho ván này; tỉ số series vẫn tiếp tục được cập nhật.',
    viewing: 'Đang xem', currentLive: 'đang live', feedAt: 'Feed', syncedAt: 'Đồng bộ', followLive: 'Theo ván đang live'
  },
  en: {
    center: 'Live details', close: 'Collapse', watch: 'Watch live', matchPage: 'Open match',
    syncing: 'Syncing live match...', waiting: 'Waiting for LoL Esports match data.',
    draftWaiting: 'Picks will appear when Riot publishes the draft feed.', picks: 'PICKS', bans: 'BANS', game: 'Game',
    series: 'Series', kills: 'Kills', gold: 'Gold', towers: 'Towers', dragons: 'Dragons', barons: 'Barons',
    objectives: 'OBJECTIVES', inhibitors: 'Inhibitors', goldLead: 'Gold diff', dragonsTaken: 'Dragons taken', noDragons: 'No dragons yet',
    live: 'LIVE NOW', upcoming: 'UPCOMING', finished: 'FINISHED', source: 'Live • LoL Esports',
    noFeed: 'Detailed feed is not available for this game yet; series score will still keep updating.',
    viewing: 'Viewing', currentLive: 'live now', feedAt: 'Feed', syncedAt: 'Synced', followLive: 'Follow live game'
  }
};

const DRAGONS = {
  infernal: { icon: '🔥', vi: 'Hỏa', en: 'Infernal' },
  ocean: { icon: '🌊', vi: 'Đại Dương', en: 'Ocean' },
  cloud: { icon: '☁', vi: 'Gió', en: 'Cloud' },
  mountain: { icon: '⛰', vi: 'Đất', en: 'Mountain' },
  hextech: { icon: '⚡', vi: 'Công Nghệ', en: 'Hextech' },
  chemtech: { icon: '☣', vi: 'Hóa Kỹ', en: 'Chemtech' },
  elder: { icon: '🐉', vi: 'Ngàn Tuổi', en: 'Elder' }
};

let initialized = false;
let championPromise = null;
const requests = new WeakMap();
const lastPoll = new WeakMap();

const lang = () => getLanguage() === 'en' ? 'en' : 'vi';
const c = () => COPY[lang()];
const locale = () => lang() === 'vi' ? 'vi-VN' : 'en-US';

function stateIsLive(value) {
  const state = String(value || '').toLowerCase();
  return state.includes('progress') || state === 'in_game' || state === 'in-game';
}

function stateIsCompleted(value) {
  const state = String(value || '').toLowerCase();
  return state.includes('complete') || state.includes('finished');
}

function ensureCss() {
  if (!document.querySelector('link[data-live-match-center]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/match-live.css?v=3.2.0';
    link.dataset.liveMatchCenter = 'true';
    document.head.appendChild(link);
  }
  if (!document.querySelector('link[data-live-objectives]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/live-objectives.css?v=1.0.0';
    link.dataset.liveObjectives = 'true';
    document.head.appendChild(link);
  }
}

function championAlias(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function championMap() {
  if (!championPromise) championPromise = fetch('/api/champions', { cache: 'force-cache' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(`champions ${response.status}`)))
    .then(body => {
      const map = new Map();
      for (const champion of body.champions || []) {
        const numeric = Number(champion?.key || 0);
        if (numeric > 0) map.set(String(numeric), champion);
        for (const alias of [champion?.id, champion?.name]) {
          const key = championAlias(alias);
          if (key) map.set(key, champion);
        }
      }
      return map;
    })
    .catch(() => new Map());
  return championPromise;
}

function leagueInfo(card) {
  const name = String(card.querySelector('.schedule-league b')?.textContent || '').trim().toUpperCase();
  return LEAGUES[name] || [null, name.toLowerCase().replaceAll(' ', '_')];
}

function teamCode(card, side) {
  const team = card.querySelector(`.schedule-team.side-${side}`);
  return String(team?.querySelector('small')?.textContent || team?.querySelector('strong')?.textContent || '').trim();
}

function teamKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function payloadTeamIndex(card, side, teams = [], fallbackIndex = 0) {
  const wanted = teamKey(teamCode(card, side));
  if (wanted) {
    const exact = teams.findIndex(team => [team?.code, team?.name].some(value => teamKey(value) === wanted));
    if (exact >= 0) return exact;
  }
  return Math.min(fallbackIndex, Math.max(0, teams.length - 1));
}

function cardSeriesContext(card, payload) {
  const teams = payload?.teams || [];
  const leftIndex = payloadTeamIndex(card, 'left', teams, 0);
  let rightIndex = payloadTeamIndex(card, 'right', teams, 1);
  if (rightIndex === leftIndex && teams.length > 1) rightIndex = leftIndex === 0 ? 1 : 0;
  const liveTeams = payload?.live?.teams || [];
  return {
    leftIndex,
    rightIndex,
    leftTeam: teams[leftIndex] || teams[0] || null,
    rightTeam: teams[rightIndex] || teams[1] || null,
    leftLive: liveTeams[leftIndex] || (leftIndex === 0 ? payload?.live?.blue : payload?.live?.red) || null,
    rightLive: liveTeams[rightIndex] || (rightIndex === 0 ? payload?.live?.blue : payload?.live?.red) || null
  };
}

function officialUrl(slug) {
  const base = `https://lolesports.com/${locale()}/`;
  return slug ? `${base}?leagues=${encodeURIComponent(slug)}` : base;
}

function queryFor(card, detail = false) {
  const [leagueId, leagueSlug] = leagueInfo(card);
  const params = new URLSearchParams({
    leagueId: leagueId || '', leagueSlug: leagueSlug || '', startTime: card.dataset.start || '',
    teamA: teamCode(card, 'left'), teamB: teamCode(card, 'right'),
    state: card.classList.contains('is-live') ? 'inprogress' : card.classList.contains('is-completed') ? 'completed' : 'unstarted',
    locale: locale(), detail: detail ? '1' : '0'
  });
  if (card.dataset.eventId) params.set('eventId', card.dataset.eventId);
  if (card.dataset.matchId) params.set('matchId', card.dataset.matchId);
  if (detail && card._livePinnedGameId) params.set('viewGameId', card._livePinnedGameId);
  return params;
}

function withinLiveWindow(card) {
  if (card.classList.contains('is-live')) return true;
  if (card.classList.contains('is-completed')) return false;
  const start = new Date(card.dataset.start || '').getTime();
  if (!Number.isFinite(start)) return false;
  const delta = start - Date.now();
  return delta <= 90 * 60_000 && delta >= -6 * 60 * 60_000;
}

function ensureScore(team, side) {
  let score = team.querySelector('.schedule-score');
  if (score) return score;
  score = document.createElement('b');
  score.className = 'schedule-score schedule-live-score';
  score.textContent = '0';
  const logo = team.querySelector('img,.schedule-team-fallback');
  if (side === 'right' && logo) team.insertBefore(score, logo);
  else team.appendChild(score);
  return score;
}

function applySeries(card, payload) {
  const teams = payload?.teams || [];
  if (teams.length >= 2) {
    const ctx = cardSeriesContext(card, payload);
    const left = card.querySelector('.schedule-team.side-left');
    const right = card.querySelector('.schedule-team.side-right');
    if (left) ensureScore(left, 'left').textContent = String(ctx.leftTeam?.wins ?? 0);
    if (right) ensureScore(right, 'right').textContent = String(ctx.rightTeam?.wins ?? 0);
  }

  const state = String(payload?.state || '').toLowerCase();
  const currentState = payload?.currentGame?.state;
  const live = state.includes('progress') || stateIsLive(currentState);
  const completed = state.includes('complete') || (!live && stateIsCompleted(currentState) && payload?.games?.every(game => stateIsCompleted(game.state)));
  card.classList.toggle('is-live', live);
  card.classList.toggle('is-completed', completed);
  const stateNode = card.querySelector('.schedule-match-state');
  if (stateNode) {
    stateNode.classList.toggle('live', live);
    stateNode.innerHTML = live ? `<i></i>${esc(c().live)}` : completed ? esc(c().finished) : stateNode.textContent;
  }

  const versus = card.querySelector('.schedule-versus>b');
  if (versus && payload?.currentGame?.number && live) versus.textContent = `${c().game} ${payload.currentGame.number}`;

  const watch = card.querySelector('[data-live-watch]');
  if (watch) {
    const url = payload.watchUrl || payload.officialUrl || watch.href;
    watch.href = url;
    watch.textContent = `${payload.watchUrl && live ? '▶ ' + c().watch : c().matchPage} ↗`;
    watch.classList.toggle('is-stream', Boolean(payload.watchUrl && live));
  }
}

function statCell(label, value) {
  return `<div><small>${esc(label)}</small><b>${esc(String(value ?? 0))}</b></div>`;
}

function compactGold(value) {
  const gold = Number(value || 0);
  return Math.abs(gold) >= 1000 ? `${(gold / 1000).toFixed(1)}k` : String(gold);
}

function teamStats(stats = {}) {
  const gold = Number(stats.gold || 0);
  return `<div class="live-stat-row">
    ${statCell(c().kills, stats.kills)}${statCell(c().gold, compactGold(gold))}
    ${statCell(c().towers, stats.towers)}${statCell(c().dragons, stats.dragons)}${statCell(c().barons, stats.barons)}
  </div>`;
}

function dragonBadge(value) {
  const key = String(value || '').toLowerCase().replace(/[^a-z]/g, '');
  const dragon = DRAGONS[key] || { icon: '🐲', vi: String(value || '?'), en: String(value || '?') };
  const label = dragon[lang()] || dragon.en;
  return `<span class="live-dragon-badge dragon-${esc(key || 'unknown')}" title="${esc(label)}"><i>${dragon.icon}</i>${esc(label)}</span>`;
}

function objectivePill(icon, label, value) {
  return `<div class="live-objective-pill"><span>${icon}</span><div><small>${esc(label)}</small><b>${esc(String(value ?? 0))}</b></div></div>`;
}

function objectiveDetails(stats = {}, opponentStats = {}) {
  const dragonTypes = Array.isArray(stats.dragonTypes) ? stats.dragonTypes : [];
  const goldDiff = Number(stats.gold || 0) - Number(opponentStats?.gold || 0);
  const lead = goldDiff === 0 ? '0' : `${goldDiff > 0 ? '+' : '−'}${compactGold(Math.abs(goldDiff))}`;
  return `<div class="live-objective-detail">
    <div class="live-objective-head"><span>${esc(c().objectives)}</span><b class="${goldDiff > 0 ? 'ahead' : goldDiff < 0 ? 'behind' : ''}">${esc(c().goldLead)} ${esc(lead)}</b></div>
    <div class="live-objective-pills">
      ${objectivePill('🗼', c().towers, stats.towers)}
      ${objectivePill('👑', c().barons, stats.barons)}
      ${objectivePill('◆', c().inhibitors, stats.inhibitors)}
    </div>
    <div class="live-dragon-sequence"><small>🐉 ${esc(c().dragonsTaken)} <b>${esc(String(stats.dragons ?? dragonTypes.length ?? 0))}</b></small><div>${dragonTypes.length ? dragonTypes.map(dragonBadge).join('') : `<span class="live-objective-empty">${esc(c().noDragons)}</span>`}</div></div>
  </div>`;
}

function championChip(row, map, pick = true) {
  const ref = row?.championId ?? row;
  const raw = String(ref ?? '').trim();
  const champion = map.get(/^\d+$/.test(raw) ? String(Number(raw)) : championAlias(raw)) || null;
  const name = champion?.name || raw || '?';
  const player = pick && row?.summonerName ? `<small>${esc(row.summonerName)}</small>` : '';
  return `<div class="live-champion-chip ${pick ? 'is-pick' : 'is-ban'}">
    ${champion?.image ? `<img src="${esc(champion.image)}" alt="${esc(name)}" loading="lazy">` : '<span>?</span>'}
    <b>${esc(name)}</b>${player}
  </div>`;
}

function draftTeam(title, side, opponent, map) {
  const picks = side?.picks || [];
  const bans = side?.bans || [];
  return `<div class="live-draft-team">
    <div class="live-draft-title"><b>${esc(title)}</b><span>${esc(c().picks)}</span></div>
    <div class="live-pick-list">${picks.length ? picks.map(row => championChip(row, map, true)).join('') : `<div class="live-draft-placeholder">${esc(c().draftWaiting)}</div>`}</div>
    <div class="live-ban-label">${esc(c().bans)}</div>
    <div class="live-ban-list">${bans.length ? bans.map(id => championChip(id, map, false)).join('') : '<span>—</span>'}</div>
    ${side?.stats ? `${teamStats(side.stats)}${objectiveDetails(side.stats, opponent?.stats || {})}` : ''}
  </div>`;
}

function payloadIsLive(payload) {
  return stateIsLive(payload?.state) || stateIsLive(payload?.currentGame?.state);
}

function gameIsCurrentLive(game, payload) {
  return Boolean(game?.id && payload?.currentGame?.id === game.id && payloadIsLive(payload));
}

function gameIsCompletedForDisplay(game, payload) {
  if (!game) return false;
  if (stateIsCompleted(game.state)) return true;
  const currentNumber = Number(payload?.currentGame?.number || 0);
  const number = Number(game.number || 0);
  if (payloadIsLive(payload) && currentNumber && number && number < currentNumber) return true;
  if (stateIsCompleted(payload?.state) && currentNumber && number && number <= currentNumber) return true;
  return false;
}

function gameStateLabel(game, payload) {
  if (!game) return '';
  if (gameIsCurrentLive(game, payload)) return c().live;
  if (gameIsCompletedForDisplay(game, payload)) return c().finished;
  return c().upcoming;
}

function clock(value) {
  if (!value || Number.isNaN(Date.parse(value))) return '';
  return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
}

function bindGameButtons(card, panel, payload) {
  const current = payload.currentGame;
  panel.querySelectorAll('[data-live-game-id]').forEach(button => {
    button.onclick = async () => {
      const gameId = button.dataset.liveGameId || '';
      const isCurrent = current?.id && current.id === gameId;
      card._livePinnedGameId = isCurrent ? '' : gameId;
      button.classList.add('loading');
      const pending = requests.get(card);
      if (pending) await pending;
      lastPoll.delete(card);
      await pollCard(card, true, true);
    };
  });

  const follow = panel.querySelector('[data-live-follow-current]');
  if (follow) {
    follow.onclick = async () => {
      card._livePinnedGameId = '';
      const pending = requests.get(card);
      if (pending) await pending;
      lastPoll.delete(card);
      await pollCard(card, true, true);
    };
  }
}

async function renderPanel(card, payload) {
  const panel = card.querySelector('.schedule-live-panel');
  if (!panel) return;
  const map = await championMap();
  const teams = payload.teams || [];
  const games = payload.games || [];
  const current = payload.currentGame;
  const viewed = payload.viewGame || current;
  const live = payload.live && (!viewed?.id || !payload.live.gameId || payload.live.gameId === viewed.id) ? payload.live : null;
  const ctx = cardSeriesContext(card, { ...payload, live });
  const score = teams.length >= 2 ? `${ctx.leftTeam?.wins ?? 0} — ${ctx.rightTeam?.wins ?? 0}` : '—';
  const currentIsLive = payloadIsLive(payload);
  const viewingHistorical = Boolean(viewed?.id && current?.id && viewed.id !== current.id);
  const gamesHtml = games.length ? games.map(game => {
    const liveGame = gameIsCurrentLive(game, payload);
    const done = gameIsCompletedForDisplay(game, payload);
    return `<button type="button" class="live-game-pill ${viewed?.id && viewed.id === game.id ? 'active' : ''} ${done ? 'done' : ''} ${liveGame ? 'current-live' : ''}" data-live-game-id="${esc(game.id || '')}" ${game.id ? '' : 'disabled'}><span>${esc(c().game)} ${game.number}</span>${liveGame ? '<i></i>' : ''}</button>`;
  }).join('') : '';
  const followLive = viewingHistorical && currentIsLive ? `<button type="button" class="live-follow-current" data-live-follow-current>● ${esc(c().followLive)} • ${esc(c().game)} ${current.number}</button>` : '';
  const watchUrl = payload.watchUrl || payload.officialUrl || '#';
  const viewedLabel = viewed?.number ? `${c().viewing} ${c().game} ${viewed.number} • ${gameStateLabel(viewed, payload)}` : '';
  const feedClock = clock(live?.timestamp);
  const syncClock = clock(payload.fetchedAt);
  const leftTitle = ctx.leftTeam?.name || teamCode(card, 'left');
  const rightTitle = ctx.rightTeam?.name || teamCode(card, 'right');

  panel.innerHTML = `<div class="live-panel-head">
    <div><span class="live-source-dot"></span><small>${esc(c().source)}</small><b>${esc(c().series)} ${esc(score)}${viewed?.number ? ` • ${esc(c().game)} ${viewed.number}` : ''}</b>${viewedLabel ? `<em class="live-view-state">${esc(viewedLabel)}</em>` : ''}</div>
    <div class="live-game-nav"><div class="live-game-pills">${gamesHtml}</div>${followLive}</div>
    <a href="${esc(watchUrl)}" target="_blank" rel="noreferrer" class="live-watch-big ${payload.watchUrl && currentIsLive ? 'is-stream' : ''}">${payload.watchUrl && currentIsLive ? '▶ ' + esc(c().watch) : esc(c().matchPage)} ↗</a>
  </div>
  ${live ? `<div class="live-draft-grid">${draftTeam(leftTitle, ctx.leftLive, ctx.rightLive, map)}${draftTeam(rightTitle, ctx.rightLive, ctx.leftLive, map)}</div>` : `<div class="live-feed-wait"><span>◉</span><div><b>${esc(c().waiting)}</b><small>${esc(c().noFeed)}</small></div></div>`}
  <div class="live-panel-foot">${feedClock ? `${esc(c().feedAt)} ${esc(feedClock)}` : ''}${feedClock && syncClock ? ' • ' : ''}${syncClock ? `${esc(c().syncedAt)} ${esc(syncClock)}` : ''}${live?.patchVersion ? ` • Patch ${esc(live.patchVersion)}` : ''}</div>`;

  bindGameButtons(card, panel, payload);
}

async function pollCard(card, detail = false, force = false) {
  if (!card?.isConnected) return;
  const now = Date.now();
  const previousAt = lastPoll.get(card) || 0;
  const live = card.classList.contains('is-live');
  const minGap = detail || live ? 4_500 : 25_000;
  if (!force && now - previousAt < minGap) return;
  if (!force && !detail && !withinLiveWindow(card)) return;
  if (requests.has(card)) return requests.get(card);
  lastPoll.set(card, now);

  const request = fetch(`/api/esports/match-live?${queryFor(card, detail)}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }
  })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(`live ${response.status}`)))
    .then(payload => {
      if (payload?.ok) {
        card._livePayload = payload;
        if (card._livePinnedGameId && !payload.games?.some(game => game.id === card._livePinnedGameId)) card._livePinnedGameId = '';
        applySeries(card, payload);
        if (card.classList.contains('live-panel-open')) renderPanel(card, payload);
      }
      return payload;
    })
    .catch(error => {
      console.debug('Live match sync:', error.message);
      return null;
    })
    .finally(() => requests.delete(card));
  requests.set(card, request);
  return request;
}

function attachCard(card) {
  if (card.dataset.liveCenterReady === '1') return;
  card.dataset.liveCenterReady = '1';
  card._livePinnedGameId = '';
  const [, slug] = leagueInfo(card);
  const bar = document.createElement('div');
  bar.className = 'schedule-live-actions';
  bar.innerHTML = `<button type="button" data-live-toggle><span class="live-mini-dot"></span>${esc(c().center)}</button><a data-live-watch href="${esc(officialUrl(slug))}" target="_blank" rel="noreferrer">${esc(c().matchPage)} ↗</a>`;
  card.appendChild(bar);
  const panel = document.createElement('div');
  panel.className = 'schedule-live-panel';
  card.appendChild(panel);

  bar.querySelector('[data-live-toggle]').onclick = async buttonEvent => {
    const open = !card.classList.contains('live-panel-open');
    card.classList.toggle('live-panel-open', open);
    buttonEvent.currentTarget.lastChild.textContent = open ? c().close : c().center;
    if (open) {
      panel.innerHTML = `<div class="live-panel-loading"><span></span>${esc(c().syncing)}</div>`;
      await pollCard(card, true, true);
      if (card._livePayload) renderPanel(card, card._livePayload);
    }
  };
  if (withinLiveWindow(card)) pollCard(card, false, true);
}

function scan() {
  document.querySelectorAll('#schedule .schedule-match').forEach(attachCard);
}

function refreshLanguage() {
  document.querySelectorAll('#schedule .schedule-match').forEach(card => {
    const button = card.querySelector('[data-live-toggle]');
    if (button) button.lastChild.textContent = card.classList.contains('live-panel-open') ? c().close : c().center;
    if (card.classList.contains('live-panel-open') && card._livePayload) renderPanel(card, card._livePayload);
  });
}

export function initLiveMatchCenter() {
  ensureCss();
  if (initialized) return;
  initialized = true;
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
  window.setInterval(() => {
    if (!document.getElementById('schedule')?.classList.contains('active-section')) return;
    scan();
    document.querySelectorAll('#schedule .schedule-match').forEach(card => pollCard(card, card.classList.contains('live-panel-open')));
  }, 5_000);
  onLanguageChange(refreshLanguage);
}