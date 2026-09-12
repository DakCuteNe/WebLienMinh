import { esc } from './shared.js';
import { getLanguage, onLanguageChange } from './i18n.js';

let initialized = false;
let scheduled = false;

const COPY = {
  vi: {
    gameResult: 'KẾT QUẢ VÁN', won: 'THẮNG', finished: 'ĐÃ KẾT THÚC', live: 'ĐANG LIVE',
    scoreAfter: 'Tỉ số sau ván', kills: 'Mạng', gold: 'Vàng', towers: 'Trụ', inhibitors: 'Nhà lính',
    dragons: 'Rồng', elders: 'Rồng Ngàn Tuổi', voidGrubs: 'Sâu Hư Không', heralds: 'Sứ Giả', barons: 'Baron', atakhans: 'Atakhan',
    bans: 'Tướng Ban', picks: 'Tướng Pick', unavailable: 'Nguồn trận đấu không cung cấp dữ liệu này',
    inferred: 'Kết quả ước tính từ snapshot cuối', exact: 'Kết quả xác định từ tỉ số series',
    unknownWinner: 'Riot chưa cung cấp winner riêng của ván này'
  },
  en: {
    gameResult: 'GAME RESULT', won: 'WON', finished: 'FINISHED', live: 'LIVE',
    scoreAfter: 'Score after game', kills: 'Kills', gold: 'Gold', towers: 'Towers', inhibitors: 'Inhibitors',
    dragons: 'Dragons', elders: 'Elder Dragons', voidGrubs: 'Void Grubs', heralds: 'Rift Herald', barons: 'Barons', atakhans: 'Atakhan',
    bans: 'Bans', picks: 'Picks', unavailable: 'Match source does not supply this data',
    inferred: 'Result inferred from final snapshot', exact: 'Result confirmed from series score',
    unknownWinner: 'Riot does not publish a per-game winner here'
  }
};

const DRAGONS = {
  infernal: ['🔥', 'Hỏa', 'Infernal'], ocean: ['🌊', 'Đại Dương', 'Ocean'], mountain: ['⛰', 'Đất', 'Mountain'],
  cloud: ['☁', 'Gió', 'Cloud'], hextech: ['⚡', 'Công Nghệ', 'Hextech'], chemtech: ['☣', 'Hóa Kỹ', 'Chemtech'],
  elder: ['🐉', 'Ngàn Tuổi', 'Elder']
};

const lang = () => getLanguage() === 'en' ? 'en' : 'vi';
const c = () => COPY[lang()];
const teamKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function ensureCss() {
  if (document.querySelector('link[data-live-game-objectives-v2]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/live-game-objectives-v2.css?v=3.30.0';
  link.dataset.liveGameObjectivesV2 = 'true';
  document.head.appendChild(link);
}

function cardTeamCode(card, side) {
  const node = card.querySelector(`.schedule-team.side-${side}`);
  return String(node?.querySelector('small')?.textContent || node?.querySelector('strong')?.textContent || '').trim();
}

function payloadTeamIndex(card, side, teams, fallback) {
  const wanted = teamKey(cardTeamCode(card, side));
  const found = teams.findIndex(team => [team?.code, team?.name].some(value => teamKey(value) === wanted));
  return found >= 0 ? found : fallback;
}

function liveRowFor(live, team, index) {
  const rows = live?.teams || [];
  const id = String(team?.id || '');
  return rows.find(row => id && String(row?.teamId || '') === id)
    || rows[index]
    || (index === 0 ? live?.blue : live?.red)
    || null;
}

function compactGold(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000) return `${(number / 1000).toFixed(1)}k`;
  return String(number);
}

function valueOrDash(value, formatter = value => String(value)) {
  return value == null ? '—' : formatter(value);
}

function dragonTypes(stats = {}) {
  const rows = Array.isArray(stats.dragonTypes) ? stats.dragonTypes : [];
  if (!rows.length) return '';
  return `<div class="live-v2-dragon-types">${rows.map(value => {
    const key = String(value || '').toLowerCase().replace(/dragon|drake/g, '').replace(/[^a-z]/g, '');
    const item = DRAGONS[key] || ['🐲', String(value || '?'), String(value || '?')];
    const label = lang() === 'vi' ? item[1] : item[2];
    return `<span title="${esc(label)}">${item[0]} ${esc(label)}</span>`;
  }).join('')}</div>`;
}

function metric(icon, label, value, formatter) {
  return `<div class="live-v2-metric"><span>${icon}</span><small>${esc(label)}</small><b>${esc(valueOrDash(value, formatter))}</b></div>`;
}

function teamObjectives(team, liveRow, availability = {}) {
  const stats = liveRow?.stats || {};
  const bans = Array.isArray(liveRow?.bans) ? liveRow.bans.length : 0;
  const picks = Array.isArray(liveRow?.picks) ? liveRow.picks.length : 0;
  const banValue = availability.bans === false && !bans ? null : bans;
  const pickValue = availability.picks === false && !picks ? null : picks;
  return `<div class="live-v2-team-block" data-team-id="${esc(team?.id || '')}">
    <div class="live-v2-team-title"><b>${esc(team?.name || team?.code || 'Team')}</b><small>${esc(team?.code || '')}</small></div>
    <div class="live-v2-metrics">
      ${metric('⚔', c().kills, stats.kills)}
      ${metric('💰', c().gold, stats.gold, compactGold)}
      ${metric('🗼', c().towers, stats.towers)}
      ${metric('◆', c().inhibitors, stats.inhibitors)}
      ${metric('🐲', c().dragons, stats.dragons)}
      ${metric('🐉', c().elders, stats.elders)}
      ${metric('🟣', c().voidGrubs, stats.voidGrubs)}
      ${metric('👁', c().heralds, stats.riftHeralds)}
      ${metric('👑', c().barons, stats.barons)}
      ${metric('⚜', c().atakhans, stats.atakhans)}
      ${metric('P', c().picks, pickValue)}
      ${metric('B', c().bans, banValue)}
    </div>
    ${dragonTypes(stats)}
  </div>`;
}

function gameStateDone(game) {
  const state = String(game?.state || '').toLowerCase();
  return state.includes('complete') || state.includes('finished');
}

function sourceLabel(game) {
  if (game?.winnerConfidence === 'inferred') return c().inferred;
  if (game?.winnerTeamId) return c().exact;
  return c().unknownWinner;
}

function unavailableKeys(availability = {}) {
  const optional = [
    ['elders', c().elders], ['voidGrubs', c().voidGrubs], ['riftHeralds', c().heralds], ['atakhans', c().atakhans], ['bans', c().bans]
  ];
  return optional.filter(([key]) => availability[key] === false).map(([, label]) => label);
}

function renderCard(card) {
  const payload = card?._livePayload;
  const panel = card?.querySelector('.schedule-live-panel');
  if (!payload || !panel || !card.classList.contains('live-panel-open')) return;

  const teams = payload.teams || [];
  if (teams.length < 2) return;
  const leftIndex = payloadTeamIndex(card, 'left', teams, 0);
  let rightIndex = payloadTeamIndex(card, 'right', teams, 1);
  if (rightIndex === leftIndex) rightIndex = leftIndex === 0 ? 1 : 0;
  const leftTeam = teams[leftIndex];
  const rightTeam = teams[rightIndex];
  const viewed = payload.gameResult || payload.viewGame || payload.currentGame || null;
  const live = payload.live && (!viewed?.id || String(payload.live.gameId || '') === String(viewed.id || '')) ? payload.live : null;
  if (!viewed) return;

  const leftLive = liveRowFor(live, leftTeam, leftIndex);
  const rightLive = liveRowFor(live, rightTeam, rightIndex);
  const availability = live?.dataAvailability || {};

  const winner = teams.find(team => String(team?.id || '') === String(viewed?.winnerTeamId || '')) || null;
  const scoreAfter = Array.isArray(viewed?.scoreAfterGame) ? viewed.scoreAfterGame : null;
  const leftScore = scoreAfter ? scoreAfter[leftIndex] : null;
  const rightScore = scoreAfter ? scoreAfter[rightIndex] : null;
  const leftKills = leftLive?.stats?.kills;
  const rightKills = rightLive?.stats?.kills;
  const done = gameStateDone(viewed);
  const resultText = winner
    ? `${winner.code || winner.name} ${c().won}`
    : done ? c().unknownWinner : c().live;
  const signature = JSON.stringify({
    id: viewed.id, winner: viewed.winnerTeamId, source: viewed.winnerSource,
    scoreAfter, left: leftLive?.stats, right: rightLive?.stats,
    lp: leftLive?.picks?.length, rp: rightLive?.picks?.length,
    lb: leftLive?.bans?.length, rb: rightLive?.bans?.length,
    availability, lang: lang()
  });

  let summary = panel.querySelector('.live-game-summary-v2');
  if (!summary) {
    summary = document.createElement('section');
    summary.className = 'live-game-summary-v2';
    const head = panel.querySelector('.live-panel-head');
    if (head?.nextSibling) panel.insertBefore(summary, head.nextSibling);
    else panel.prepend(summary);
  }
  if (summary.dataset.signature === signature) return;
  summary.dataset.signature = signature;

  const missing = unavailableKeys(availability);
  summary.innerHTML = `<div class="live-v2-result-row">
      <div><small>${esc(c().gameResult)} • ${esc(lang() === 'vi' ? `Ván ${viewed.number || '?'}` : `Game ${viewed.number || '?'}`)}</small>
        <b class="${winner ? 'has-winner' : ''}">${esc(resultText)}</b>
        <em>${esc(sourceLabel(viewed))}</em></div>
      <div class="live-v2-game-score"><span>${esc(leftTeam?.code || '')}</span><b>${esc(valueOrDash(leftKills))} — ${esc(valueOrDash(rightKills))}</b><span>${esc(rightTeam?.code || '')}</span></div>
      ${scoreAfter ? `<div class="live-v2-series-after"><small>${esc(c().scoreAfter)}</small><b>${esc(String(leftScore ?? 0))} — ${esc(String(rightScore ?? 0))}</b></div>` : ''}
    </div>
    ${live ? `<div class="live-v2-objective-grid">${teamObjectives(leftTeam, leftLive, availability)}${teamObjectives(rightTeam, rightLive, availability)}</div>` : ''}
    ${live && missing.length ? `<div class="live-v2-source-note">${missing.map(label => `${esc(label)}: —`).join(' • ')} <span>${esc(c().unavailable)}</span></div>` : ''}`;

  panel.querySelectorAll('.live-draft-team').forEach(node => node.classList.remove('live-v2-winner-team'));
  if (winner) {
    const winnerIndex = String(winner.id) === String(leftTeam?.id) ? 0 : String(winner.id) === String(rightTeam?.id) ? 1 : -1;
    const draftTeams = panel.querySelectorAll('.live-draft-team');
    if (winnerIndex >= 0 && draftTeams[winnerIndex]) draftTeams[winnerIndex].classList.add('live-v2-winner-team');
  }
}

function renderAll() {
  document.querySelectorAll('#schedule .schedule-match').forEach(renderCard);
}

function scheduleRender() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    renderAll();
  });
}

export function initLiveGameObjectivesV2() {
  ensureCss();
  if (initialized) return;
  initialized = true;
  const observer = new MutationObserver(scheduleRender);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.setInterval(renderAll, 2_500);
  onLanguageChange(scheduleRender);
  scheduleRender();
}
