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
    live: 'ĐANG LIVE', upcoming: 'SẮP DIỄN RA', finished: 'ĐÃ KẾT THÚC', source: 'Live • LoL Esports',
    noFeed: 'Feed chi tiết chưa có cho ván này; tỉ số series vẫn tiếp tục được cập nhật.',
    viewing: 'Đang xem', currentLive: 'đang live', feedAt: 'Feed', syncedAt: 'Đồng bộ', followLive: 'Theo ván đang live'
  },
  en: {
    center: 'Live details', close: 'Collapse', watch: 'Watch live', matchPage: 'Open match',
    syncing: 'Syncing live match...', waiting: 'Waiting for LoL Esports match data.',
    draftWaiting: 'Picks will appear when Riot publishes the draft feed.', picks: 'PICKS', bans: 'BANS', game: 'Game',
    series: 'Series', kills: 'Kills', gold: 'Gold', towers: 'Towers', dragons: 'Dragons', barons: 'Barons',
    live: 'LIVE NOW', upcoming: 'UPCOMING', finished: 'FINISHED', source: 'Live • LoL Esports',
    noFeed: 'Detailed feed is not available for this game yet; series score will still keep updating.',
    viewing: 'Viewing', currentLive: 'live now', feedAt: 'Feed', syncedAt: 'Synced', followLive: 'Follow live game'
  }
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
  if (document.querySelector('link[data-live-match-center]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/match-live.css?v=3.2.0';
  link.dataset.liveMatchCenter = 'true';
  document.head.appendChild(link);
}

async function championMap() {
  if (!championPromise) championPromise = fetch('/api/champions', { cache: 'force-cache' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(`champions ${response.status}`)))
    .then(body => new Map((body.champions || []).map(champion => [Number(champion.key), champion])))
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
    const left = card.querySelector('.schedule-team.side-left');
    const right = card.querySelector('.schedule-team.side-right');
    if (left) ensureScore(left, 'left').textContent = String(teams[0]?.wins ?? 0);
    if (right) ensureScore(right, 'right').textContent = String(teams[1]?.wins ?? 0);
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

function teamStats(stats = {}) {
  const gold = Number(stats.gold || 0);
  return `<div class="live-stat-row">
    ${statCell(c().kills, stats.kills)}${statCell(c().gold, gold >= 1000 ? `${(gold / 1000).toFixed(1)}k` : gold)}
    ${statCell(c().towers, stats.towers)}${statCell(c().dragons, stats.dragons)}${statCell(c().barons, stats.barons)}
  </div>`;
}

function championChip(row, map, pick = true) {
  const champion = map.get(Number(row?.championId || row));
  const name = champion?.name || `#${row?.championId || row || '?'}`;
  const player = pick && row?.summonerName ? `<small>${esc(row.summonerName)}</small>` : '';
  return `<div class="live-champion-chip ${pick ? 'is-pick' : 'is-ban'}">
    ${champion?.image ? `<img src="${esc(champion.image)}" alt="${esc(name)}" loading="lazy">` : '<span>?</span>'}
    <b>${esc(name)}</b>${player}
  </div>`;
}

function draftTeam(title, side, map) {
  const picks = side?.picks || [];
  const bans = side?.bans || [];
  return `<div class="live-draft-team">
    <div class="live-draft-title"><b>${esc(title)}</b><span>${esc(c().picks)}</span></div>
    <div class="live-pick-list">${picks.length ? picks.map(row => championChip(row, map, true)).join('') : `<div class="live-draft-placeholder">${esc(c().draftWaiting)}</div>`}</div>
    <div class="live-ban-label">${esc(c().bans)}</div>
    <div class="live-ban-list">${bans.length ? bans.map(id => championChip(id, map, false)).join('') : '<span>—</span>'}</div>
    ${side?.stats ? teamStats(side.stats) : ''}
  </div>`;
}

function gameStateLabel(game) {
  if (!game) return '';
  if (stateIsLive(game.state)) return c().live;
  if (stateIsCompleted(game.state)) return c().finished;
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
  const live = payload.live;
  const score = teams.length >= 2 ? `${teams[0].wins ?? 0} — ${teams[1].wins ?? 0}` : '—';
  const currentIsLive = stateIsLive(current?.state) || String(payload.state || '').toLowerCase().includes('progress');
  const viewingHistorical = Boolean(viewed?.id && current?.id && viewed.id !== current.id);
  const gamesHtml = games.length ? games.map(game => `<button type="button" class="live-game-pill ${viewed?.id && viewed.id === game.id ? 'active' : ''} ${stateIsCompleted(game.state) ? 'done' : ''} ${stateIsLive(game.state) ? 'current-live' : ''}" data-live-game-id="${esc(game.id || '')}" ${game.id ? '' : 'disabled'}><span>${esc(c().game)} ${game.number}</span>${stateIsLive(game.state) ? '<i></i>' : ''}</button>`).join('') : '';
  const followLive = viewingHistorical && currentIsLive ? `<button type="button" class="live-follow-current" data-live-follow-current>● ${esc(c().followLive)} • ${esc(c().game)} ${current.number}</button>` : '';
  const watchUrl = payload.watchUrl || payload.officialUrl || '#';
  const viewedLabel = viewed?.number ? `${c().viewing} ${c().game} ${viewed.number} • ${gameStateLabel(viewed)}` : '';
  const feedClock = clock(live?.timestamp);
  const syncClock = clock(payload.fetchedAt);

  panel.innerHTML = `<div class="live-panel-head">
    <div><span class="live-source-dot"></span><small>${esc(c().source)}</small><b>${esc(c().series)} ${esc(score)}${viewed?.number ? ` • ${esc(c().game)} ${viewed.number}` : ''}</b>${viewedLabel ? `<em class="live-view-state">${esc(viewedLabel)}</em>` : ''}</div>
    <div class="live-game-nav"><div class="live-game-pills">${gamesHtml}</div>${followLive}</div>
    <a href="${esc(watchUrl)}" target="_blank" rel="noreferrer" class="live-watch-big ${payload.watchUrl && currentIsLive ? 'is-stream' : ''}">${payload.watchUrl && currentIsLive ? '▶ ' + esc(c().watch) : esc(c().matchPage)} ↗</a>
  </div>
  ${live ? `<div class="live-draft-grid">${draftTeam(teams[0]?.name || teamCode(card, 'left'), live.blue, map)}${draftTeam(teams[1]?.name || teamCode(card, 'right'), live.red, map)}</div>` : `<div class="live-feed-wait"><span>◉</span><div><b>${esc(c().waiting)}</b><small>${esc(c().noFeed)}</small></div></div>`}
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
