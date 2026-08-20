import assert from 'node:assert/strict';
import { __liveMatchTest } from '../server/esports-match-live.js';
import { __liveHistoryTest } from '../server/esports-match-history-cache.js';

const { currentGame, selectViewGame, inferSeriesState, alignLiveTeams, mergeLiveWindows, normalizeWindow } = __liveMatchTest;
const { reconcileHistoricalLive, recoveryStartingTimes, draftScore } = __liveHistoryTest;

const games = [
  { id: 'game-1', number: 1, state: 'completed' },
  { id: 'game-2', number: 2, state: 'inprogress' },
  { id: 'game-3', number: 3, state: 'unstarted' }
];

assert.equal(selectViewGame(games, 'game-1')?.id, 'game-1', 'must allow selecting completed Game 1');
assert.equal(selectViewGame(games)?.id, 'game-2', 'default view must follow the current live game');

const transitionGames = [
  { id: 'game-1', number: 1, state: 'completed' },
  { id: 'game-2', number: 2, state: 'unstarted' },
  { id: 'game-3', number: 3, state: 'unstarted' }
];
const oneZero = [{ id: 'team-a', wins: 1 }, { id: 'team-b', wins: 0 }];
assert.equal(currentGame(transitionGames, 'inprogress', oneZero, 3)?.id, 'game-2');
assert.equal(selectViewGame(transitionGames, '', 0, 'inprogress', oneZero, 3)?.id, 'game-2');

const staleGameState = [
  { id: 'game-1', number: 1, state: 'inprogress' },
  { id: 'game-2', number: 2, state: 'unstarted' },
  { id: 'game-3', number: 3, state: 'unstarted' }
];
assert.equal(
  currentGame(staleGameState, 'inprogress', oneZero, 3)?.id,
  'game-2',
  'a stale Game 1 inprogress flag must not override the 1-0 series score'
);

const twoZero = [{ id: 'team-a', wins: 2 }, { id: 'team-b', wins: 0 }];
assert.equal(inferSeriesState('inprogress', twoZero, 3, false), 'completed');
assert.equal(inferSeriesState('inprogress', twoZero, 3, true), 'completed', 'clinched score must beat a stale getLive event');
const lastPlayedTwoZero = currentGame(transitionGames, 'completed', twoZero, 3);
assert.equal(lastPlayedTwoZero?.id, 'game-2', '2-0 BO3 must identify Game 2 as the last played game even when Riot leaves its state stale');
assert.notEqual(lastPlayedTwoZero?.id, 'game-3', '2-0 BO3 must never jump to unused Game 3');

const sidedGame = {
  id: 'game-2', number: 2, state: 'inprogress',
  teams: [
    { id: 'team-a', side: 'red' },
    { id: 'team-b', side: 'blue' }
  ]
};
const teams = [
  { id: 'team-a', code: 'AAA', wins: 1 },
  { id: 'team-b', code: 'BBB', wins: 0 }
];

const metadataWindow = {
  esportsGameId: 'game-2',
  gameMetadata: {
    patchVersion: '16.16.1',
    blueTeamMetadata: {
      esportsTeamId: 'team-b',
      participantMetadata: [
        { participantId: 1, summonerName: 'TopB', championId: '266', role: 'top' },
        { participantId: 2, summonerName: 'JungleB', championId: '64', role: 'jungle' },
        { participantId: 3, summonerName: 'MidB', championId: '103', role: 'mid' },
        { participantId: 4, summonerName: 'AdcB', championId: '22', role: 'bottom' },
        { participantId: 5, summonerName: 'SupportB', championId: '412', role: 'support' }
      ],
      bans: [238, 517, 150, 555, 84]
    },
    redTeamMetadata: {
      esportsTeamId: 'team-a',
      participantMetadata: [
        { participantId: 6, summonerName: 'TopA', championId: '58', role: 'top' },
        { participantId: 7, summonerName: 'JungleA', championId: '121', role: 'jungle' },
        { participantId: 8, summonerName: 'MidA', championId: '7', role: 'mid' },
        { participantId: 9, summonerName: 'AdcA', championId: '81', role: 'bottom' },
        { participantId: 10, summonerName: 'SupportA', championId: '111', role: 'support' }
      ],
      bans: [24, 39, 268, 777, 89]
    }
  },
  frames: [{
    rfc460Timestamp: '2026-08-20T08:05:00.000Z',
    gameState: 'in_game',
    blueTeam: { totalGold: 5000, totalKills: 1, towers: 0, dragons: [], barons: 0 },
    redTeam: { totalGold: 4900, totalKills: 0, towers: 0, dragons: [], barons: 0 }
  }]
};

const latestWindow = {
  esportsGameId: 'game-2',
  frames: [{
    rfc460Timestamp: '2026-08-20T08:32:10.000Z',
    gameState: 'in_game',
    blueTeam: { totalGold: 39900, totalKills: 9, towers: 3, dragons: ['cloud', 'ocean', 'infernal'], barons: 0 },
    redTeam: { totalGold: 40400, totalKills: 8, towers: 2, dragons: [], barons: 0 }
  }]
};

const merged = mergeLiveWindows(metadataWindow, latestWindow);
const normalized = normalizeWindow(merged, sidedGame);
const aligned = alignLiveTeams(normalized, sidedGame, teams);

assert.equal(normalized.gameId, 'game-2');
assert.equal(normalized.blue.picks.length, 5);
assert.equal(normalized.red.picks.length, 5);
assert.equal(normalized.blue.bans.length, 5);
assert.equal(normalized.red.bans.length, 5);
assert.equal(normalized.blue.stats.gold, 39900);
assert.equal(normalized.red.stats.gold, 40400);
assert.equal(normalized.timestamp, '2026-08-20T08:32:10.000Z');
assert.equal(aligned.teams[0].side, 'red', 'series team A must render its red-side data in this game');
assert.equal(aligned.teams[0].stats.gold, 40400);
assert.equal(aligned.teams[0].picks[0].summonerName, 'TopA');
assert.equal(aligned.teams[1].side, 'blue', 'series team B must render its blue-side data in this game');
assert.equal(aligned.teams[1].stats.gold, 39900);
assert.equal(aligned.teams[1].picks[0].summonerName, 'TopB');

const cachedGame1 = {
  gameId: 'game-1',
  gameNumber: 1,
  patchVersion: '16.16.1',
  timestamp: '2026-08-20T07:40:00.000Z',
  blue: {
    teamId: 'team-a',
    picks: [{ championId: 266, summonerName: 'TopA' }],
    bans: [238],
    stats: { gold: 38000, kills: 8 }
  },
  red: {
    teamId: 'team-b',
    picks: [{ championId: 58, summonerName: 'TopB' }],
    bans: [24],
    stats: { gold: 36000, kills: 5 }
  },
  teams: [
    { teamId: 'team-a', side: 'blue', picks: [{ championId: 266, summonerName: 'TopA' }], bans: [238], stats: { gold: 38000, kills: 8 } },
    { teamId: 'team-b', side: 'red', picks: [{ championId: 58, summonerName: 'TopB' }], bans: [24], stats: { gold: 36000, kills: 5 } }
  ]
};

const recoveryTimes = recoveryStartingTimes(
  { id: 'game-1', number: 1, state: 'completed' },
  '2026-08-20T10:00:00.000Z',
  '2026-08-20T10:33:20.000Z'
);
assert.ok(recoveryTimes.includes('2026-08-20T10:05:00.000Z'), 'Game 1 recovery must probe shortly after the scheduled series start');
assert.ok(recoveryTimes.includes('2026-08-20T10:13:20.000Z'), 'Game 1 recovery must walk backward from its surviving same-game frame');
assert.equal(draftScore(cachedGame1), 4, 'draft score counts picks and bans from the exact cached game only');

const restoredGame1 = reconcileHistoricalLive(null, cachedGame1, 'game-1');
assert.equal(restoredGame1?.gameId, 'game-1', 'completed Game 1 draft must remain available when Riot temporarily returns no window');
assert.equal(restoredGame1?.teams?.[0]?.picks?.[0]?.championId, 266, 'Game 1 cached picks must be retained');
assert.equal(restoredGame1?.historyCached, true, 'restored history should be marked as cached');

const wrongGameFresh = { ...aligned, gameId: 'game-2' };
const protectedGame1 = reconcileHistoricalLive(wrongGameFresh, cachedGame1, 'game-1');
assert.equal(protectedGame1?.gameId, 'game-1', 'Game 2 live payload must never replace Game 1 history');
assert.equal(protectedGame1?.teams?.[0]?.picks?.[0]?.championId, 266, 'Game 1 ban/pick must not leak from another game');

const statsOnlyGame1 = {
  gameId: 'game-1',
  timestamp: '2026-08-20T07:45:00.000Z',
  blue: { teamId: 'team-a', picks: [], bans: [], stats: { gold: 40100, kills: 10 } },
  red: { teamId: 'team-b', picks: [], bans: [], stats: { gold: 38900, kills: 7 } },
  teams: [
    { teamId: 'team-a', side: 'blue', picks: [], bans: [], stats: { gold: 40100, kills: 10 } },
    { teamId: 'team-b', side: 'red', picks: [], bans: [], stats: { gold: 38900, kills: 7 } }
  ]
};
const mergedGame1History = reconcileHistoricalLive(statsOnlyGame1, cachedGame1, 'game-1');
assert.equal(mergedGame1History?.teams?.[0]?.picks?.[0]?.championId, 266, 'fresh stats-only windows must keep the archived Game 1 draft');
assert.equal(mergedGame1History?.teams?.[0]?.stats?.gold, 40100, 'fresh same-game stats should still update over archived history');

console.log('Live Match score/state/side/exact-game draft history regression smoke passed.');
