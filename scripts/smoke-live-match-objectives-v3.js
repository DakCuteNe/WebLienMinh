import assert from 'node:assert/strict';
import { __strictObjectivesTest } from '../server/esports-match-objectives-v3.js';

const { extractStrictObjectiveStats, mergeStrictObjectiveStats, applyStrictObjectives, statsAvailability } = __strictObjectivesTest;

const missing = extractStrictObjectiveStats({ totalGold: 12000 });
assert.equal(missing.gold, 12000);
assert.equal(missing.kills, null, 'missing kills must stay unknown, not fake zero');
assert.equal(missing.towers, null, 'missing towers must stay unknown, not fake zero');
assert.equal(missing.dragons, null, 'missing dragons must stay unknown, not fake zero');
assert.equal(missing.elders, null, 'Elder must stay unknown without explicit count or dragon sequence');
assert.equal(missing.voidGrubs, null);
assert.equal(missing.riftHeralds, null);

const explicitZero = extractStrictObjectiveStats({
  totalKills: 0, totalGold: 500, towers: 0, inhibitors: 0, barons: 0, dragons: []
});
assert.equal(explicitZero.kills, 0, 'explicit Riot zero must remain zero');
assert.equal(explicitZero.towers, 0);
assert.equal(explicitZero.dragons, 0);
assert.deepEqual(explicitZero.dragonTypes, []);
assert.equal(explicitZero.elders, 0, 'known empty dragon sequence proves zero Elders');

const elder = extractStrictObjectiveStats({
  totalKills: 18,
  totalGold: 70123,
  towers: 10,
  inhibitors: 2,
  barons: 2,
  dragons: ['infernal', 'ocean', 'mountain', 'hextech', 'elder'],
  voidGrubs: 4,
  riftHeraldKills: 1,
  atakhans: 1
});
assert.equal(elder.dragons, 5);
assert.equal(elder.elders, 1, 'Elder must be counted from Riot dragon sequence');
assert.equal(elder.voidGrubs, 4);
assert.equal(elder.riftHeralds, 1);
assert.equal(elder.atakhans, 1);

const numericDragons = extractStrictObjectiveStats({ dragonKills: 4 });
assert.equal(numericDragons.dragons, 4);
assert.equal(numericDragons.dragonTypes, null, 'numeric total does not prove dragon types');
assert.equal(numericDragons.elders, null, 'numeric total alone must not guess Elder count');

const merged = mergeStrictObjectiveStats(
  { kills: 12, gold: 50000, towers: 7, dragons: 3, dragonTypes: ['ocean', 'hextech', 'hextech'], barons: 1, voidGrubs: 5 },
  { kills: 10, gold: 48000, towers: 6, dragons: 2, dragonTypes: ['ocean', 'hextech'], barons: 1, voidGrubs: null }
);
assert.equal(merged.kills, 12, 'older partial snapshot must not regress kills');
assert.equal(merged.gold, 50000, 'older partial snapshot must not regress gold');
assert.equal(merged.towers, 7, 'older partial snapshot must not regress towers');
assert.equal(merged.dragons, 3, 'older partial snapshot must not regress dragons');
assert.deepEqual(merged.dragonTypes, ['ocean', 'hextech', 'hextech']);
assert.equal(merged.voidGrubs, 5, 'missing official optional field must preserve fallback value');

const body = {
  ok: true,
  teams: [{ id: 'A' }, { id: 'B' }],
  viewGame: {
    id: 'g2', number: 2,
    teams: [{ id: 'A', side: 'red' }, { id: 'B', side: 'blue' }]
  },
  live: {
    gameId: 'g2',
    blue: { teamId: 'B', stats: { voidGrubs: 3 } },
    red: { teamId: 'A', stats: { riftHeralds: 1 } },
    teams: [
      { teamId: 'A', side: 'red', stats: { riftHeralds: 1 } },
      { teamId: 'B', side: 'blue', stats: { voidGrubs: 3 } }
    ],
    dataAvailability: { bans: true }
  }
};
applyStrictObjectives(body, {
  gameId: 'g2', timestamp: '2026-08-22T12:30:00Z', gameState: 'completed',
  blue: { kills: 8, gold: 55000, towers: 9, inhibitors: 1, barons: 1, dragons: 4, dragonTypes: ['ocean','cloud','hextech','hextech'], elders: 0, voidGrubs: null, riftHeralds: null, atakhans: null },
  red: { kills: 3, gold: 43000, towers: 2, inhibitors: 0, barons: 0, dragons: 1, dragonTypes: ['mountain'], elders: 0, voidGrubs: null, riftHeralds: null, atakhans: null }
});
assert.equal(body.live.teams[0].teamId, 'A');
assert.equal(body.live.teams[0].side, 'red');
assert.equal(body.live.teams[0].stats.kills, 3, 'series team A must receive Red-side Game 2 stats');
assert.equal(body.live.teams[0].stats.riftHeralds, 1, 'community Herald fallback must survive strict Riot merge');
assert.equal(body.live.teams[1].teamId, 'B');
assert.equal(body.live.teams[1].stats.kills, 8, 'series team B must receive Blue-side Game 2 stats');
assert.equal(body.live.teams[1].stats.voidGrubs, 3, 'community Grub fallback must survive strict Riot merge');
assert.equal(body.live.dataAvailability.elders, true);
assert.equal(body.live.dataAvailability.voidGrubs, true);
assert.equal(body.live.dataAvailability.riftHeralds, true);
assert.equal(body.live.objectiveSource, 'riot-window-strict');

const availability = statsAvailability([missing, elder]);
assert.equal(availability.gold, true);
assert.equal(availability.elders, true);
assert.equal(availability.riftHeralds, true);

console.log('Strict objective null/Elder/side regression passed.');
