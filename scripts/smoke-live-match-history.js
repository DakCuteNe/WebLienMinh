import assert from 'node:assert/strict';
import { __liveMatchTest } from '../server/esports-match-live.js';

const { currentGame, selectViewGame, mergeLiveWindows, normalizeWindow } = __liveMatchTest;

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

assert.equal(
  currentGame(transitionGames, 'inprogress')?.id,
  'game-2',
  'live series must advance from completed Game 1 to the next non-completed game while Riot game state catches up'
);
assert.equal(
  currentGame(transitionGames, 'completed')?.id,
  'game-1',
  'completed series must stay on its last completed game instead of selecting an unused placeholder'
);
assert.equal(
  selectViewGame(transitionGames, '', 0, 'inprogress')?.id,
  'game-2',
  'default detailed view must follow the advancing live game during a game-state transition'
);

const metadataWindow = {
  esportsGameId: 'game-2',
  gameMetadata: {
    patchVersion: '16.16.1',
    blueTeamMetadata: {
      esportsTeamId: 'blue-team',
      participantMetadata: [
        { participantId: 1, summonerName: 'TopA', championId: '266', role: 'top' },
        { participantId: 2, summonerName: 'JungleA', championId: '64', role: 'jungle' },
        { participantId: 3, summonerName: 'MidA', championId: '103', role: 'mid' },
        { participantId: 4, summonerName: 'AdcA', championId: '22', role: 'bottom' },
        { participantId: 5, summonerName: 'SupportA', championId: '412', role: 'support' }
      ],
      bans: [238, 517, 150, 555, 84]
    },
    redTeamMetadata: {
      esportsTeamId: 'red-team',
      participantMetadata: [
        { participantId: 6, summonerName: 'TopB', championId: '58', role: 'top' },
        { participantId: 7, summonerName: 'JungleB', championId: '121', role: 'jungle' },
        { participantId: 8, summonerName: 'MidB', championId: '7', role: 'mid' },
        { participantId: 9, summonerName: 'AdcB', championId: '81', role: 'bottom' },
        { participantId: 10, summonerName: 'SupportB', championId: '111', role: 'support' }
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

// This reproduces the production bug: the newest Riot window has fresh stats,
// but its rolling response can omit gameMetadata / champion draft data.
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
const normalized = normalizeWindow(merged, games[1]);

assert.equal(normalized.gameId, 'game-2');
assert.equal(normalized.blue.picks.length, 5, 'fresh frame must retain blue picks from metadata window');
assert.equal(normalized.red.picks.length, 5, 'fresh frame must retain red picks from metadata window');
assert.equal(normalized.blue.bans.length, 5, 'blue bans should survive metadata merge');
assert.equal(normalized.red.bans.length, 5, 'red bans should survive metadata merge');
assert.equal(normalized.blue.stats.gold, 39900, 'stats must come from newest frame');
assert.equal(normalized.red.stats.gold, 40400, 'stats must come from newest frame');
assert.equal(normalized.blue.stats.kills, 9);
assert.equal(normalized.red.stats.kills, 8);
assert.equal(normalized.timestamp, '2026-08-20T08:32:10.000Z');

console.log('Live Match history + transition + rolling metadata regression smoke passed.');
