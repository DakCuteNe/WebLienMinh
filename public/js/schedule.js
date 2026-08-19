import { esc } from './shared.js';
import { getLanguage, onLanguageChange } from './i18n.js';

const DATA_URL = '/data/esports-schedule.json';
const PROFILE_KEY = 'rift:user-preferences:v1';
const OFFICIAL_URL = 'https://lolesports.com/en-US/schedule';

const COPY = {
  vi: {
    nav: 'Lịch đấu', eyebrow: 'LOL ESPORTS • LỊCH THI ĐẤU TOÀN CẦU', title: 'Lịch thi đấu <span>esports</span>',
    lead: 'LCK, LPL, LEC, LCS, LCP, VCS và các giải quốc tế như First Stand, MSI, CKTG — thời gian tự đổi theo múi giờ của bạn.',
    all: 'Tất cả', regional: 'Khu vực', international: 'Quốc tế', upcoming: 'Sắp diễn ra', results: 'Kết quả', allMatches: 'Tất cả trận',
    search: 'Tìm đội tuyển...', favorite: 'Đội yêu thích', live: 'ĐANG LIVE', today: 'Hôm nay', tomorrow: 'Ngày mai', yesterday: 'Hôm qua',
    bo: 'BO', noMatches: 'Chưa có trận phù hợp trong cache hiện tại.', official: 'Mở LoL Esports', updated: 'Cập nhật', timezone: 'Múi giờ',
    loading: 'Đang tải lịch thi đấu...', unavailable: 'Lịch thi đấu chưa được đồng bộ. Workflow sẽ tự cập nhật sau khi nguồn Riot sẵn sàng.',
    startsIn: 'Bắt đầu sau', started: 'Đang diễn ra', finished: 'Đã kết thúc', next7: 'Trận 7 ngày tới', cached: 'cache Riot', source: 'Nguồn lịch: LoL Esports.'
  },
  en: {
    nav: 'Schedule', eyebrow: 'LOL ESPORTS • GLOBAL MATCH SCHEDULE', title: 'Esports <span>schedule</span>',
    lead: 'LCK, LPL, LEC, LCS, LCP, VCS and international events including First Stand, MSI and Worlds — shown in your local timezone.',
    all: 'All', regional: 'Regional', international: 'International', upcoming: 'Upcoming', results: 'Results', allMatches: 'All matches',
    search: 'Search teams...', favorite: 'Favorite team', live: 'LIVE NOW', today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday',
    bo: 'BO', noMatches: 'No matching games in the current cache.', official: 'Open LoL Esports', updated: 'Updated', timezone: 'Timezone',
    loading: 'Loading match schedule...', unavailable: 'Schedule has not synced yet. The workflow will update it when the Riot source is available.',
    startsIn: 'Starts in', started: 'In progress', finished: 'Finished', next7: 'Next 7 days', cached: 'Riot cache', source: 'Schedule source: LoL Esports.'
  }
};

let section = null;
let navButton = null;
let data = null;
let loading = null;
let leagueFilter = 'ALL';
let stateFilter = 'UPCOMING';
let searchValue = '';
let favoriteOnly = false;
let timer = null;
let initialized = false;

function lang() { return getLanguage() === 'en' ? 'en' : 'vi'; }
function c() { return COPY[lang()]; }
function locale() { return lang() === 'vi' ? 'vi-VN' : 'en-US'; }

function ensureCss() {
  if (document.querySelector('link[data-esports-schedule]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/schedule.css';
  link.dataset.esportsSchedule = 'true';
  document.head.appendChild(link);
}

function favoriteTeam() {
  try {
    const value = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    return { id: value?.teamId || '', name: value?.teamName || '' };
  } catch { return { id: '', name: '' }; }
}

function ensureStructure() {
  ensureCss();
  const nav = document.getElementById('nav');
  if (nav && !document.querySelector('.nav-btn[data-section="schedule"]')) {
    navButton = document.createElement('button');
    navButton.className = 'nav-btn';
    navButton.dataset.section = 'schedule';
    const anchor = nav.querySelector('[data-section="worlds"], [data-section="patch"]');
    nav.insertBefore(navButton, anchor || null);
  } else navButton = document.querySelector('.nav-btn[data-section="schedule"]');

  const main = document.querySelector('main');
  if (main && !document.getElementById('schedule')) {
    section = document.createElement('section');
    section.id = 'schedule';
    section.className = 'page-section schedule-section';
    main.appendChild(section);
  } else section = document.getElementById('schedule');
}

function isLive(event) { return event.state === 'inprogress'; }
function isCompleted(event) { return event.state === 'completed'; }
function eventTime(event) { return event.startTime ? new Date(event.startTime).getTime() : Number.POSITIVE_INFINITY; }

function relativeTime(startTime) {
  if (!startTime) return 'TBD';
  const delta = new Date(startTime).getTime() - Date.now();
  if (Math.abs(delta) < 60_000) return lang() === 'vi' ? 'ngay bây giờ' : 'now';
  const abs = Math.abs(delta);
  const units = abs >= 86_400_000 ? ['day', 86_400_000] : abs >= 3_600_000 ? ['hour', 3_600_000] : ['minute', 60_000];
  const value = Math.round(delta / units[1]);
  try { return new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(value, units[0]); } catch { return `${value} ${units[0]}`; }
}

function formatTime(startTime) {
  if (!startTime) return 'TBD';
  return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(startTime));
}

function dateKey(startTime) {
  if (!startTime) return 'TBD';
  const d = new Date(startTime);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateLabel(startTime) {
  if (!startTime) return 'TBD';
  const target = new Date(startTime);
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const diff = Math.round((b - a) / 86_400_000);
  if (diff === 0) return c().today;
  if (diff === 1) return c().tomorrow;
  if (diff === -1) return c().yesterday;
  return new Intl.DateTimeFormat(locale(), { weekday: 'long', day: '2-digit', month: '2-digit', year: target.getFullYear() !== now.getFullYear() ? 'numeric' : undefined }).format(target);
}

function teamMatchesFavorite(team, favorite) {
  if (!favorite.name && !favorite.id) return false;
  const hay = `${team?.name || ''} ${team?.code || ''} ${team?.slug || ''}`.toLowerCase();
  const needles = [favorite.name, favorite.id].filter(Boolean).map(x => String(x).toLowerCase());
  return needles.some(x => x.length > 1 && (hay.includes(x) || x.includes(String(team?.name || '').toLowerCase())));
}

function teamLogo(team) {
  return team?.image
    ? `<img src="${esc(team.image)}" alt="${esc(team.name || team.code || '')}" loading="lazy">`
    : `<span class="schedule-team-fallback">${esc(String(team?.code || team?.name || '?').slice(0, 3).toUpperCase())}</span>`;
}

function teamHtml(team, side, showScore = false) {
  const score = showScore ? `<b class="schedule-score">${Number(team?.wins || 0)}</b>` : '';
  const outcome = team?.outcome === 'win' ? 'is-winner' : team?.outcome === 'loss' ? 'is-loser' : '';
  return `<div class="schedule-team side-${side} ${outcome}">
    ${side === 'left' ? teamLogo(team) : ''}
    <div><strong>${esc(team?.name || 'TBD')}</strong><small>${esc(team?.code || '')}</small></div>
    ${score}
    ${side === 'right' ? teamLogo(team) : ''}
  </div>`;
}

function versusHtml(event, left, right, completed, live) {
  if (completed) {
    const leftWin = left?.outcome === 'win';
    const rightWin = right?.outcome === 'win';
    return `<div class="schedule-versus is-final">
      <div class="schedule-final-score" aria-label="${esc(`${left?.name || 'Team A'} ${Number(left?.wins || 0)} - ${Number(right?.wins || 0)} ${right?.name || 'Team B'}`)}">
        <strong class="${leftWin ? 'winner' : ''}">${Number(left?.wins || 0)}</strong><span>—</span><strong class="${rightWin ? 'winner' : ''}">${Number(right?.wins || 0)}</strong>
      </div>
      <div class="schedule-final-meta"><time>${esc(formatTime(event.startTime))}</time>${event.bestOf ? `<small>${c().bo}${event.bestOf}</small>` : ''}</div>
    </div>`;
  }
  return `<div class="schedule-versus"><time>${esc(formatTime(event.startTime))}</time><b>${live ? '—' : 'VS'}</b><small>${event.bestOf ? `${c().bo}${event.bestOf}` : ''}</small></div>`;
}

function matchCard(event, favorite) {
  const teams = event.teams || [];
  const left = teams[0] || { name: 'TBD', code: 'TBD' };
  const right = teams[1] || { name: 'TBD', code: 'TBD' };
  const completed = isCompleted(event);
  const live = isLive(event);
  const fav = teamMatchesFavorite(left, favorite) || teamMatchesFavorite(right, favorite);
  const state = live ? c().live : completed ? c().finished : relativeTime(event.startTime);
  return `<article class="schedule-match ${live ? 'is-live' : ''} ${completed ? 'is-completed' : ''} ${fav ? 'is-favorite' : ''}" data-start="${esc(event.startTime || '')}">
    <div class="schedule-match-top">
      <div class="schedule-league">${event.league?.image ? `<img src="${esc(event.league.image)}" alt="">` : ''}<b>${esc(event.league?.name || '')}</b><span>${esc(event.blockName || '')}</span></div>
      <div class="schedule-match-state ${live ? 'live' : ''}">${live ? '<i></i>' : ''}${esc(state)}</div>
    </div>
    <div class="schedule-match-main">
      ${teamHtml(left, 'left', live)}
      ${versusHtml(event, left, right, completed, live)}
      ${teamHtml(right, 'right', live)}
    </div>
    ${fav ? `<div class="schedule-favorite-mark">★ ${esc(c().favorite)}</div>` : ''}
  </article>`;
}

function filteredEvents() {
  if (!data?.events) return [];
  const favorite = favoriteTeam();
  const q = searchValue.trim().toLowerCase();
  const now = Date.now();
  return data.events.filter(event => {
    if (leagueFilter === 'INTERNATIONAL' && event.league?.group !== 'INTERNATIONAL') return false;
    if (leagueFilter === 'REGIONAL' && event.league?.group !== 'REGIONAL') return false;
    if (!['ALL', 'INTERNATIONAL', 'REGIONAL'].includes(leagueFilter) && event.league?.slug !== leagueFilter) return false;
    if (stateFilter === 'UPCOMING' && isCompleted(event)) return false;
    if (stateFilter === 'RESULTS' && !isCompleted(event)) return false;
    if (stateFilter === 'ALL' && eventTime(event) < now - 21 * 86_400_000) return false;
    if (q && !(event.teams || []).some(team => `${team.name || ''} ${team.code || ''}`.toLowerCase().includes(q))) return false;
    if (favoriteOnly && !(event.teams || []).some(team => teamMatchesFavorite(team, favorite))) return false;
    return true;
  }).sort((a, b) => {
    if (isLive(a) !== isLive(b)) return isLive(a) ? -1 : 1;
    if (stateFilter === 'RESULTS') return eventTime(b) - eventTime(a);
    return eventTime(a) - eventTime(b);
  });
}

function leagueButtons() {
  const rows = data?.leagues || [];
  const important = rows.filter(x => ['lck','lpl','lec','lcs','lcp','vcs','msi','worlds','first_stand'].includes(x.slug));
  const buttons = [
    ['ALL', c().all], ['INTERNATIONAL', c().international],
    ...important.map(x => [x.slug, x.name])
  ];
  return buttons.map(([value, label]) => `<button type="button" class="schedule-chip ${leagueFilter === value ? 'active' : ''}" data-schedule-league="${esc(value)}">${esc(label)}</button>`).join('');
}

function renderMatches() {
  const body = section?.querySelector('#scheduleBody');
  if (!body) return;
  const rows = filteredEvents();
  const favorite = favoriteTeam();
  if (!rows.length) {
    body.innerHTML = `<div class="schedule-empty"><span>◌</span><b>${esc(c().noMatches)}</b></div>`;
    return;
  }

  const groups = new Map();
  for (const event of rows) {
    const key = dateKey(event.startTime);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  body.innerHTML = [...groups.values()].map(events => `<div class="schedule-day">
    <div class="schedule-day-head"><div><small>${esc(events[0]?.startTime ? new Intl.DateTimeFormat(locale(), { month: 'short', day: '2-digit' }).format(new Date(events[0].startTime)) : 'TBD')}</small><h3>${esc(dateLabel(events[0]?.startTime))}</h3></div><span>${events.length}</span></div>
    <div class="schedule-day-matches">${events.map(event => matchCard(event, favorite)).join('')}</div>
  </div>`).join('');
}

function render() {
  if (!section) return;
  if (navButton) navButton.textContent = c().nav;
  if (!data) {
    section.innerHTML = `<div class="schedule-loading"><div class="schedule-orbit"></div><b>${esc(c().loading)}</b></div>`;
    return;
  }
  const favorite = favoriteTeam();
  const now = Date.now();
  const next7 = (data.events || []).filter(x => !isCompleted(x) && eventTime(x) >= now - 3_600_000 && eventTime(x) <= now + 7 * 86_400_000).length;
  const live = (data.events || []).filter(isLive).length;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
  const updated = data.generatedAt ? new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generatedAt)) : '—';

  section.innerHTML = `<div class="schedule-hero">
    <div><div class="eyebrow">${esc(c().eyebrow)}</div><h1>${c().title}</h1><p>${esc(c().lead)}</p></div>
    <div class="schedule-hero-stats"><div><small>${esc(c().next7)}</small><b>${next7}</b></div><div class="live-stat"><small>${esc(c().live)}</small><b>${live}</b></div><div><small>${esc(c().timezone)}</small><b>${esc(zone)}</b></div></div>
  </div>
  <div class="schedule-toolbar">
    <div class="schedule-league-chips">${leagueButtons()}</div>
    <div class="schedule-controls">
      <div class="schedule-state-tabs"><button data-schedule-state="UPCOMING" class="${stateFilter === 'UPCOMING' ? 'active' : ''}">${esc(c().upcoming)}</button><button data-schedule-state="RESULTS" class="${stateFilter === 'RESULTS' ? 'active' : ''}">${esc(c().results)}</button><button data-schedule-state="ALL" class="${stateFilter === 'ALL' ? 'active' : ''}">${esc(c().allMatches)}</button></div>
      <input id="scheduleSearch" type="search" value="${esc(searchValue)}" placeholder="${esc(c().search)}" autocomplete="off">
      ${favorite.name ? `<button class="schedule-favorite-filter ${favoriteOnly ? 'active' : ''}" id="scheduleFavorite">★ ${esc(favorite.name)}</button>` : ''}
    </div>
  </div>
  <div id="scheduleBody"></div>
  <div class="schedule-footer"><span>${esc(c().source)} ${esc(c().updated)}: ${esc(updated)} • ${esc(c().cached)}</span><a href="${OFFICIAL_URL}" target="_blank" rel="noreferrer">${esc(c().official)} ↗</a></div>`;

  section.querySelectorAll('[data-schedule-league]').forEach(button => button.onclick = () => { leagueFilter = button.dataset.scheduleLeague; render(); });
  section.querySelectorAll('[data-schedule-state]').forEach(button => button.onclick = () => { stateFilter = button.dataset.scheduleState; render(); });
  const search = section.querySelector('#scheduleSearch');
  if (search) search.oninput = () => { searchValue = search.value; renderMatches(); };
  const favoriteButton = section.querySelector('#scheduleFavorite');
  if (favoriteButton) favoriteButton.onclick = () => { favoriteOnly = !favoriteOnly; render(); };
  renderMatches();
}

async function load() {
  if (loading) return loading;
  loading = fetch(`${DATA_URL}?v=${Date.now()}`, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`Schedule ${response.status}`);
      return response.json();
    })
    .then(body => { data = body; render(); return body; })
    .catch(error => {
      console.warn(error);
      data = { generatedAt: null, leagues: [], events: [] };
      render();
      const body = section?.querySelector('#scheduleBody');
      if (body) body.innerHTML = `<div class="schedule-empty"><span>!</span><b>${esc(c().unavailable)}</b></div>`;
      return data;
    });
  return loading;
}

export function initSchedule() {
  ensureStructure();
  if (initialized) return;
  initialized = true;
  render();
  onLanguageChange(render);
  timer = window.setInterval(() => {
    if (document.getElementById('schedule')?.classList.contains('active-section')) renderMatches();
  }, 30_000);
}

export async function ensureSchedule() {
  ensureStructure();
  return load();
}
