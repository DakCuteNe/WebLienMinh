import { loadCommunityMatchFallback } from './esports-match-community-fallback.js';
import { loadGolMatchFallback } from './esports-match-gol-fallback.js';

const winnersByMatch = new Map();
const text = value => String(value ?? '').trim();
const lower = value => text(value).toLowerCase();

function stateIsCompleted(value) {
  const state = lower(value);
  return state.includes('complete') || state.includes('finished');
}

function matchKey(body) {
  return text(body?.matchId) || [body?.startTime, ...(body?.teams || []).map(team => text(team?.id || team?.code))].filter(Boolean).join(':');
}

function winnersFor(body) {
  const key = matchKey(body);
  if (!key) return null;
  if (!winnersByMatch.has(key)) winnersByMatch.set(key, new Map());
  return winnersByMatch.get(key);
}

function winnerKey(game = {}) {
  return text(game.id) || `number:${Number(game.number || 0)}`;
}

function recordWinner(body, game, winnerTeamId, source = 'live-final-frame', confidence = 'inferred') {
  if (!game || !winnerTeamId) return;
  const winners = winnersFor(body);
  if (!winners) return;
  const key = winnerKey(game);
  const previous = winners.get(key);
  const rank = value => value === 'exact' ? 2 : value === 'inferred' ? 1 : 0;
  if (!previous || rank(confidence) >= rank(previous.confidence)) winners.set(key, { winnerTeamId: text(winnerTeamId), source, confidence });
}

function statsScore(stats = {}) {
  return Number(stats?.towers || 0) * 1_000_000
    + Number(stats?.inhibitors || 0) * 250_000
    + Number(stats?.barons || 0) * 60_000
    + Number(stats?.dragons || 0) * 20_000
    + Number(stats?.gold || 0)
    + Number(stats?.kills || 0) * 500;
}

function inferFinishedWinner(body) {
  const game = body?.viewGame || body?.currentGame;
  const live = body?.live;
  if (!game?.id || !live || text(live.gameId) !== text(game.id)) return null;
  if (!stateIsCompleted(game.state) && !stateIsCompleted(live.gameState)) return null;
  const rows = (live.teams || []).filter(row => row?.teamId && row?.stats);
  if (rows.length < 2) return null;
  const ranked = rows.map(row => ({ row, score: statsScore(row.stats) })).sort((a, b) => b.score - a.score);
  if (!ranked[0] || !ranked[1] || ranked[0].score - ranked[1].score < 25_000) return null;
  return text(ranked[0].row.teamId) || null;
}

function partialMergeStats(existing = {}, fallback = {}) {
  const merged = { ...(existing || {}) };
  for (const key of ['voidGrubs', 'riftHeralds', 'barons']) if (merged[key] == null && fallback?.[key] != null) merged[key] = fallback[key];
  return merged;
}

function sideForTeam(game, teamId, index) {
  const row = (game?.teams || []).find(candidate => text(candidate?.id) === text(teamId));
  return lower(row?.side) || (index === 0 ? 'blue' : 'red');
}

function communityGame(community, game) {
  const number = Number(game?.number || 0);
  return (community?.games || []).find(row => Number(row?.number || 0) === number) || null;
}

function communityTeam(gameData, teamId) {
  return (gameData?.teams || []).find(row => text(row?.teamId) === text(teamId)) || null;
}

function existingLiveRow(body, teamId, index) {
  const live = body?.live;
  return (live?.teams || []).find(row => text(row?.teamId) === text(teamId)) || live?.teams?.[index] || (index === 0 ? live?.blue : live?.red) || null;
}

function applyCommunityLive(body, community) {
  const game = body?.viewGame || body?.currentGame;
  const gameData = communityGame(community, game);
  if (!game?.id || !gameData) return;
  const hasTeamData = (gameData.teams || []).some(row => (row?.bans?.length || 0) > 0 || Object.values(row?.stats || {}).some(value => value != null));
  if (!hasTeamData && !body.live) return;

  const rows = (body.teams || []).map((team, index) => {
    const existing = existingLiveRow(body, team?.id, index) || {};
    const fallback = communityTeam(gameData, team?.id) || {};
    const existingBans = Array.isArray(existing.bans) ? existing.bans : [];
    const fallbackBans = Array.isArray(fallback.bans) ? fallback.bans : [];
    return {
      ...existing,
      teamId: text(team?.id) || text(existing.teamId) || null,
      side: lower(existing.side) || sideForTeam(game, team?.id, index),
      picks: Array.isArray(existing.picks) ? existing.picks : [],
      bans: fallbackBans.length > existingBans.length ? fallbackBans : existingBans,
      stats: partialMergeStats(existing.stats, fallback.stats)
    };
  });

  const blue = rows.find(row => row.side === 'blue') || body.live?.blue || rows[0] || null;
  const red = rows.find(row => row.side === 'red') || body.live?.red || rows[1] || null;
  const bansAvailable = rows.some(row => (row.bans || []).length > 0);
  const voidGrubsAvailable = rows.some(row => row?.stats?.voidGrubs != null);
  const heraldsAvailable = rows.some(row => row?.stats?.riftHeralds != null);

  body.live = {
    ...(body.live || {}),
    gameId: text(game.id),
    gameNumber: Number(game.number || 0) || body.live?.gameNumber || null,
    gameState: body.live?.gameState || game.state || null,
    blue,
    red,
    teams: rows,
    dataAvailability: {
      ...(body.live?.dataAvailability || {}),
      bans: Boolean(body.live?.dataAvailability?.bans || bansAvailable),
      voidGrubs: Boolean(body.live?.dataAvailability?.voidGrubs || voidGrubsAvailable),
      riftHeralds: Boolean(body.live?.dataAvailability?.riftHeralds || heraldsAvailable)
    },
    secondarySource: community.source || body.live?.secondarySource || null
  };
}

function observeExistingWinners(body) {
  for (const game of body?.games || []) if (game?.winnerTeamId) recordWinner(body, game, game.winnerTeamId, game.winnerSource || 'upstream-result', game.winnerConfidence || 'exact');
}

function applyCommunityWinners(body, community) {
  for (const row of community?.games || []) {
    if (!row?.winnerTeamId) continue;
    const game = (body?.games || []).find(candidate => Number(candidate?.number || 0) === Number(row.number || 0));
    if (game) recordWinner(body, game, row.winnerTeamId, 'community-post-match', 'exact');
  }
}

function applyScoreFloor(body, community) {
  const winners = winnersFor(body);
  const teams = body?.teams || [];
  if (!teams.length) return;
  const indexById = new Map(teams.map((team, index) => [text(team?.id), index]));
  const derived = Array(teams.length).fill(0);
  for (const result of winners?.values() || []) {
    const index = indexById.get(text(result?.winnerTeamId));
    if (index != null) derived[index] += 1;
  }
  body.teams = teams.map((team, index) => {
    const communityWins = Number(community?.scores?.[text(team?.id)]);
    const fallback = Number.isFinite(communityWins) ? communityWins : 0;
    return { ...team, wins: Math.max(Number(team?.wins || 0) || 0, derived[index] || 0, fallback) };
  });
}

function enrichGames(body) {
  const winners = winnersFor(body);
  const teams = body?.teams || [];
  const indexById = new Map(teams.map((team, index) => [text(team?.id), index]));
  const running = Array(teams.length).fill(0);
  let prefixKnown = true;
  body.games = [...(body.games || [])].sort((a, b) => Number(a.number || 0) - Number(b.number || 0)).map(game => {
    const cached = winners?.get(winnerKey(game)) || null;
    const winnerTeamId = cached?.winnerTeamId || game?.winnerTeamId || null;
    if (winnerTeamId && prefixKnown) {
      const index = indexById.get(text(winnerTeamId));
      if (index == null) prefixKnown = false;
      else running[index] += 1;
    } else if (stateIsCompleted(game.state)) prefixKnown = false;
    return {
      ...game,
      winnerTeamId,
      winnerSource: cached?.source || game?.winnerSource || null,
      winnerConfidence: cached?.confidence || game?.winnerConfidence || null,
      scoreAfterGame: prefixKnown && winnerTeamId ? [...running] : (game?.scoreAfterGame || null)
    };
  });
}

function refreshSeriesState(body) {
  const wins = (body.teams || []).map(team => Number(team?.wins || 0) || 0);
  const total = wins.reduce((sum, value) => sum + value, 0);
  const bestOf = Number(body.bestOf || 0) || 0;
  const needed = bestOf ? Math.floor(bestOf / 2) + 1 : Number.POSITIVE_INFINITY;
  const clinched = wins.some(value => value >= needed);
  const games = body.games || [];
  if (clinched) {
    body.state = 'completed';
    body.currentGame = games.find(game => Number(game.number || 0) === total) || body.currentGame;
  } else if (lower(body.state).includes('progress')) {
    const expected = Math.max(1, total + 1);
    const next = games.find(game => Number(game.number || 0) === expected);
    if (next) body.currentGame = next;
  }
  const byId = new Map(games.map(game => [text(game.id), game]));
  if (body.viewGame?.id && byId.has(text(body.viewGame.id))) body.viewGame = byId.get(text(body.viewGame.id));
  if (body.currentGame?.id && byId.has(text(body.currentGame.id))) body.currentGame = byId.get(text(body.currentGame.id));
  body.gameResult = body.viewGame?.id ? byId.get(text(body.viewGame.id)) || body.gameResult || null : body.gameResult || null;
}

function liveRows(body) {
  if (Array.isArray(body?.live?.teams) && body.live.teams.length) return body.live.teams;
  return [body?.live?.blue, body?.live?.red].filter(Boolean);
}

function needsBanFallback(body) {
  const rows = liveRows(body);
  if (rows.length < 2) return true;
  return rows.some(row => !Array.isArray(row?.bans) || row.bans.length < 5);
}

function viewedGameFinished(body) {
  const game = body?.viewGame || body?.currentGame;
  return stateIsCompleted(game?.state) || stateIsCompleted(body?.live?.gameState) || stateIsCompleted(body?.state);
}

export function applyCommunityOverlay(body, community = null) {
  if (!body?.ok) return body;
  observeExistingWinners(body);
  const inferred = inferFinishedWinner(body);
  const viewed = body.viewGame || body.currentGame;
  if (inferred && viewed) recordWinner(body, viewed, inferred, 'live-final-frame', 'inferred');
  if (community) {
    applyCommunityWinners(body, community);
    applyCommunityLive(body, community);
  }
  applyScoreFloor(body, community);
  enrichGames(body);
  refreshSeriesState(body);
  return body;
}

async function enrichResponse(body) {
  if (!body?.ok) return body;
  const start = Date.parse(body?.startTime || '');
  const shouldQueryCommunity = Number.isFinite(start) && Date.now() >= start - 10 * 60_000;
  const community = shouldQueryCommunity ? await loadCommunityMatchFallback(body).catch(() => null) : null;
  applyCommunityOverlay(body, community);

  // Riot's public live/window feed does not consistently carry Ban data, while
  // Reddit archives can be stale or incomplete. For finished games only, use
  // Games of Legends as a third source and fill Ban slots that remain missing.
  if (shouldQueryCommunity && viewedGameFinished(body) && needsBanFallback(body)) {
    const gol = await loadGolMatchFallback(body).catch(() => null);
    if (gol) applyCommunityOverlay(body, gol);
  }
  return body;
}

export function installEsportsMatchCommunityOverlay(app) {
  app.use('/api/esports/match-live', (req, res, next) => {
    const previousJson = res.json.bind(res);
    res.json = body => {
      void enrichResponse(body).catch(() => body).then(value => previousJson(value));
      return res;
    };
    next();
  });
}

export const __communityOverlayTest = { applyCommunityOverlay, needsBanFallback, viewedGameFinished };
