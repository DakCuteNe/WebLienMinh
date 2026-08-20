import assert from 'node:assert/strict';
import { __liveMatchTest } from '../server/esports-match-live.js';

const { currentGame, selectViewGame, inferSeriesState, alignLiveTeams, mergeLiveWindows, normalizeWindow } = __liveMatchTest;

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

console.log('Live Match score/state/side/history regression smoke passed.');
