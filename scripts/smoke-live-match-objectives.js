import assert from 'node:assert/strict';
import { __liveObjectivesTest } from '../server/esports-match-objectives.js';

const { extractObjectiveStats, applyGameResults } = __liveObjectivesTest;

const officialShape = extractObjectiveStats({
  totalGold: 63358,
  inhibitors: 3,
  towers: 11,
  barons: 1,
  totalKills: 15,
  dragons: ['chemtech', 'chemtech']
});
assert.deepEqual(officialShape, {
  kills: 15,
  gold: 63358,
  towers: 11,
  inhibitors: 3,
  barons: 1,
  dragons: 2,
  dragonTypes: ['chemtech', 'chemtech'],
  voidGrubs: null,
  riftHeralds: null
}, 'missing Riot grub/herald fields must remain null, never fake zero');

const futureShape = extractObjectiveStats({
  totalGold: 10000,
  inhibitors: 0,
  towers: 2,
  barons: 0,
  totalKills: 3,
  dragons: ['infernal'],
  voidGrubs: 4,
  riftHeraldKills: 1
});
assert.equal(futureShape.voidGrubs, 4, 'future Riot Void Grub field should be preserved');
assert.equal(futureShape.riftHeralds, 1, 'future Riot Rift Herald alias should be preserved');

const sweep = {
  ok: true,
  matchId: 'sweep-match',
  state: 'completed',
  teams: [
    { id: 'A', code: 'A', wins: 0 },
    { id: 'B', code: 'B', wins: 2 }
  ],
  games: [
    { id: 'g1', number: 1, state: 'completed' },
    { id: 'g2', number: 2, state: 'completed' },
    { id: 'g3', number: 3, state: 'unneeded' }
  ],
  viewGame: { id: 'g1', number: 1, state: 'completed' }
};
applyGameResults(sweep);
assert.equal(sweep.games[0].winnerTeamId, 'B', '2-0 sweep must identify Game 1 winner exactly');
assert.equal(sweep.games[1].winnerTeamId, 'B', '2-0 sweep must identify Game 2 winner exactly');
assert.equal(sweep.games[0].winnerConfidence, 'exact');
assert.deepEqual(sweep.games[0].scoreAfterGame, [0, 1], 'Game 1 series score must be 0-1');
assert.deepEqual(sweep.games[1].scoreAfterGame, [0, 2], 'Game 2 series score must be 0-2');
assert.equal(sweep.games[2].winnerTeamId, null, 'unused Game 3 must have no winner');
assert.equal(sweep.viewGame.winnerTeamId, 'B', 'viewGame must be rebound to enriched Game 1');

const coldOneZero = {
  ok: true,
  matchId: 'one-zero-match',
  state: 'inprogress',
  teams: [{ id: 'A', wins: 1 }, { id: 'B', wins: 0 }],
  games: [
    { id: 'one-g1', number: 1, state: 'completed' },
    { id: 'one-g2', number: 2, state: 'inprogress' }
  ],
  viewGame: { id: 'one-g1', number: 1, state: 'completed' }
};
applyGameResults(coldOneZero);
assert.equal(coldOneZero.games[0].winnerTeamId, 'A', 'cold 1-0 start still proves Game 1 winner');
assert.deepEqual(coldOneZero.games[0].scoreAfterGame, [1, 0]);

const ambiguous = {
  ok: true,
  matchId: 'ambiguous-match',
  state: 'completed',
  teams: [{ id: 'A', wins: 2 }, { id: 'B', wins: 1 }],
  games: [
    { id: 'a-g1', number: 1, state: 'completed' },
    { id: 'a-g2', number: 2, state: 'completed' },
    { id: 'a-g3', number: 3, state: 'completed' }
  ],
  viewGame: { id: 'a-g2', number: 2, state: 'completed' },
  live: {
    teams: [
      { teamId: 'A', stats: { towers: 10, inhibitors: 2, barons: 1, dragons: 4, gold: 60000, kills: 15 } },
      { teamId: 'B', stats: { towers: 2, inhibitors: 0, barons: 0, dragons: 1, gold: 50000, kills: 7 } }
    ]
  }
};
applyGameResults(ambiguous);
assert.equal(ambiguous.games[0].winnerTeamId, null, '2-1 cold history must not invent Game 1 winner');
assert.equal(ambiguous.games[1].winnerTeamId, 'A', 'selected completed game may use strong final-stat inference');
assert.equal(ambiguous.games[1].winnerConfidence, 'inferred');
assert.equal(ambiguous.games[1].scoreAfterGame, null, 'series score after Game 2 stays unknown when Game 1 winner is unavailable');

console.log('Per-game winner/objective regression smoke passed.');
