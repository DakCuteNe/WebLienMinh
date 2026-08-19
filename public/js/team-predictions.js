import { getLanguage, onLanguageChange } from './i18n.js';

const DATA_URL = '/data/esports-schedule.json';
const BASE_RATING = 1500;
const RECENT_WINDOW = 5;

const COPY = {
  vi: {
    label: 'Dự đoán trước trận',
    model: 'Elo + phong độ gần đây',
    low: 'Dữ liệu ít',
    medium: 'Độ tin cậy vừa',
    high: 'Độ tin cậy tốt',
    note: 'Ước tính thống kê • không phải odds cá cược'
  },
  en: {
    label: 'Pre-match prediction',
    model: 'Elo + recent form',
    low: 'Limited data',
    medium: 'Medium confidence',
    high: 'Good confidence',
    note: 'Statistical estimate • not betting odds'
  }
};

let initialized = false;
let loading = null;
let model = null;
let eventMap = new Map();

const language = () => getLanguage() === 'en' ? 'en' : 'vi';
const copy = () => COPY[language()];
const normalize = value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function ensureCss() {
  if (document.querySelector('link[data-team-predictions]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/team-predictions.css?v=3.2.0';
  link.dataset.teamPredictions = 'true';
  document.head.appendChild(link);
}

function teamKey(team) {
  return normalize(team?.code || team?.name);
}

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function getTeam(ratings, team) {
  const key = teamKey(team);
  if (!key || key === 'TBD') return null;
  if (!ratings.has(key)) {
    ratings.set(key, {
      key,
      name: team?.name || team?.code || key,
      code: team?.code || team?.name || key,
      rating: BASE_RATING,
      games: 0,
      wins: 0,
      losses: 0,
      recent: []
    });
  }
  const row = ratings.get(key);
  row.name = team?.name || row.name;
  row.code = team?.code || row.code;
  return row;
}

function seriesWinner(event) {
  const teams = event?.teams || [];
  if (teams.length < 2) return null;
  if (teams[0]?.outcome === 'win') return 0;
  if (teams[1]?.outcome === 'win') return 1;
  const a = Number(teams[0]?.wins || 0);
  const b = Number(teams[1]?.wins || 0);
  if (a === b) return null;
  return a > b ? 0 : 1;
}

function pushRecent(team, win) {
  team.recent.push(win ? 1 : 0);
  if (team.recent.length > RECENT_WINDOW) team.recent.shift();
}

function formScore(team) {
  if (!team?.recent?.length) return 0.5;
  return team.recent.reduce((sum, value) => sum + value, 0) / team.recent.length;
}

function buildModel(events = []) {
  const ratings = new Map();
  const completed = events
    .filter(event => event?.state === 'completed' && (event.teams || []).length >= 2 && seriesWinner(event) != null)
    .sort((a, b) => new Date(a.startTime || 0) - new Date(b.startTime || 0));

  for (const event of completed) {
    const left = getTeam(ratings, event.teams[0]);
    const right = getTeam(ratings, event.teams[1]);
    if (!left || !right) continue;

    const winner = seriesWinner(event);
    const actualLeft = winner === 0 ? 1 : 0;
    const expectedLeft = expectedScore(left.rating, right.rating);
    const margin = Math.abs(Number(event.teams[0]?.wins || 0) - Number(event.teams[1]?.wins || 0));
    const bestOf = Math.max(1, Number(event.bestOf || 0) || Number(event.teams[0]?.wins || 0) + Number(event.teams[1]?.wins || 0));
    const dominance = clamp(margin / bestOf, 0, 1);
    const k = 26 * (1 + dominance * 0.35);
    const delta = k * (actualLeft - expectedLeft);

    left.rating += delta;
    right.rating -= delta;
    left.games += 1;
    right.games += 1;
    if (winner === 0) {
      left.wins += 1;
      right.losses += 1;
    } else {
      right.wins += 1;
      left.losses += 1;
    }
    pushRecent(left, winner === 0);
    pushRecent(right, winner === 1);
  }

  return {
    ratings,
    predict(event) {
      const teams = event?.teams || [];
      if (teams.length < 2) return null;
      const leftKey = teamKey(teams[0]);
      const rightKey = teamKey(teams[1]);
      if (!leftKey || !rightKey || leftKey === 'TBD' || rightKey === 'TBD') return null;

      const left = ratings.get(leftKey) || { rating: BASE_RATING, games: 0, recent: [] };
      const right = ratings.get(rightKey) || { rating: BASE_RATING, games: 0, recent: [] };
      const minGames = Math.min(left.games || 0, right.games || 0);
      const sampleConfidence = clamp(minGames / 6, 0, 1);
      const elo = expectedScore(left.rating, right.rating);
      const formDifference = formScore(left) - formScore(right);
      const formAdjustment = formDifference * 0.08 * sampleConfidence;
      const raw = clamp(elo + formAdjustment, 0.05, 0.95);

      // Regress low-sample predictions toward 50/50 and cap visual certainty.
      const evidenceWeight = 0.45 + sampleConfidence * 0.55;
      const probability = clamp(0.5 + (raw - 0.5) * evidenceWeight, 0.18, 0.82);
      const leftPercent = Math.round(probability * 100);
      const rightPercent = 100 - leftPercent;
      const confidence = minGames >= 6 ? 'high' : minGames >= 3 ? 'medium' : 'low';

      return {
        leftPercent,
        rightPercent,
        confidence,
        leftGames: left.games || 0,
        rightGames: right.games || 0,
        leftRating: Math.round(left.rating),
        rightRating: Math.round(right.rating),
        leftForm: left.recent || [],
        rightForm: right.recent || []
      };
    }
  };
}

function eventKey(startTime, left, right) {
  return `${String(startTime || '')}|${normalize(left)}|${normalize(right)}`;
}

function dataEventKey(event) {
  return eventKey(
    event?.startTime,
    event?.teams?.[0]?.code || event?.teams?.[0]?.name,
    event?.teams?.[1]?.code || event?.teams?.[1]?.name
  );
}

function cardTeam(card, side) {
  const team = card.querySelector(`.schedule-team.side-${side}`);
  return team?.querySelector('small')?.textContent || team?.querySelector('strong')?.textContent || '';
}

function cardEvent(card) {
  const key = eventKey(card.dataset.start, cardTeam(card, 'left'), cardTeam(card, 'right'));
  return eventMap.get(key) || null;
}

function confidenceText(level) {
  return copy()[level] || copy().low;
}

function formText(values = []) {
  if (!values.length) return '—';
  return values.map(value => value ? 'W' : 'L').join('');
}

function predictionNode(event, prediction) {
  const left = event.teams?.[0] || {};
  const right = event.teams?.[1] || {};
  const node = document.createElement('div');
  node.className = 'schedule-prediction';
  node.dataset.teamPrediction = '1';
  node.title = `${copy().note} • Elo ${prediction.leftRating}–${prediction.rightRating} • ${prediction.leftGames}/${prediction.rightGames} series`;
  node.innerHTML = `
    <div class="schedule-prediction-head">
      <span><i></i><b>${copy().label}</b><small>${copy().model}</small></span>
      <em>${confidenceText(prediction.confidence)}</em>
    </div>
    <div class="schedule-prediction-values">
      <strong><span>${left.code || left.name || 'A'}</span><b>${prediction.leftPercent}%</b></strong>
      <small>${formText(prediction.leftForm)} • Elo ${prediction.leftRating}</small>
      <small>${formText(prediction.rightForm)} • Elo ${prediction.rightRating}</small>
      <strong><b>${prediction.rightPercent}%</b><span>${right.code || right.name || 'B'}</span></strong>
    </div>
    <div class="schedule-prediction-bar" aria-label="${left.name || left.code || 'Team A'} ${prediction.leftPercent}%, ${right.name || right.code || 'Team B'} ${prediction.rightPercent}%">
      <span class="prediction-left" style="width:${prediction.leftPercent}%"></span>
      <span class="prediction-right" style="width:${prediction.rightPercent}%"></span>
      <i style="left:${prediction.leftPercent}%"></i>
    </div>
    <div class="schedule-prediction-note">${copy().note}</div>`;
  return node;
}

function attach(card) {
  const existing = card.querySelector('[data-team-prediction]');
  if (card.classList.contains('is-completed')) {
    existing?.remove();
    return;
  }
  if (existing || !model) return;
  const event = cardEvent(card);
  if (!event) return;
  const prediction = model.predict(event);
  if (!prediction) return;

  const node = predictionNode(event, prediction);
  card.querySelector('.schedule-match-main')?.insertAdjacentElement('afterend', node);
}

function scan() {
  document.querySelectorAll('#schedule .schedule-match').forEach(attach);
}

async function load() {
  if (loading) return loading;
  loading = fetch(`${DATA_URL}?prediction=${Date.now()}`, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(`schedule ${response.status}`)))
    .then(body => {
      const events = body.events || [];
      model = buildModel(events);
      eventMap = new Map(events.map(event => [dataEventKey(event), event]));
      scan();
      return body;
    })
    .catch(error => {
      console.debug('Team prediction model:', error.message);
      return null;
    });
  return loading;
}

function rerenderLanguage() {
  document.querySelectorAll('[data-team-prediction]').forEach(node => node.remove());
  scan();
}

export function initTeamPredictions() {
  ensureCss();
  if (initialized) return;
  initialized = true;
  const observer = new MutationObserver(() => scan());
  observer.observe(document.body, { childList: true, subtree: true });
  onLanguageChange(rerenderLanguage);
  load();
  window.setInterval(() => {
    if (document.getElementById('schedule')?.classList.contains('active-section')) scan();
  }, 30_000);
}
