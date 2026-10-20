import assert from 'node:assert/strict';
import { eventStableKey, keepEvent, mergeLeagueEvents, reconcileScheduleState } from './update-esports-schedule.js';

const teams20 = [{ id: 'A', wins: 2, outcome: 'win' }, { id: 'B', wins: 0, outcome: 'loss' }];
assert.equal(reconcileScheduleState('inprogress', teams20, 3), 'completed', 'clinched BO3 must override stale inprogress state');
assert.equal(reconcileScheduleState('unstarted', teams20, 3), 'completed', 'winner/outcome must override stale unstarted state');
assert.equal(reconcileScheduleState('inprogress', [{ wins: 1 }, { wins: 0 }], 3), 'inprogress');

const now = Date.parse('2026-08-23T00:00:00Z');
const league = { id: 'lck', slug: 'lck', name: 'LCK' };
const oldCompleted = {
  id: 'old-cache-id', riotEventId: 'event-old', matchId: 'match-old',
  startTime: '2026-08-10T10:00:00Z', state: 'completed', type: 'match', league,
  teams: [{ name: 'A', code: 'A' }, { name: 'B', code: 'B' }]
};
const staleUpcoming = {
  id: 'stale', riotEventId: 'event-stale', matchId: 'match-stale',
  startTime: '2026-08-22T10:00:00Z', state: 'unstarted', type: 'match', league,
  teams: [{ name: 'C', code: 'C' }, { name: 'D', code: 'D' }]
};
const fresh = {
  id: 'fresh', riotEventId: 'event-fresh', matchId: 'match-fresh',
  startTime: '2026-08-24T10:00:00Z', state: 'unstarted', type: 'match', league,
  teams: [{ name: 'E', code: 'E' }, { name: 'F', code: 'F' }]
};
const merged = mergeLeagueEvents([fresh], [oldCompleted, staleUpcoming], now);
assert.equal(merged.some(row => row.riotEventId === 'event-old'), true, 'completed result inside retention window must survive page-window refresh');
assert.equal(merged.some(row => row.riotEventId === 'event-stale'), false, 'stale upcoming row must not survive a successful refresh');
assert.equal(merged.some(row => row.riotEventId === 'event-fresh'), true);
assert.equal(eventStableKey(oldCompleted), 'event:event-old');
assert.equal(keepEvent(oldCompleted, now), true);

const freshCorrection = { ...oldCompleted, id: 'different-cache-id', state: 'completed', teams: [{ name: 'A', code: 'A', wins: 2 }, { name: 'B', code: 'B', wins: 1 }] };
const replaced = mergeLeagueEvents([freshCorrection], [oldCompleted], now);
assert.equal(replaced.length, 1, 'stable Riot event id must dedupe cache id drift');
assert.equal(replaced[0].teams[0].wins, 2, 'fresh Riot row must replace preserved history when same event returns');

console.log('Esports schedule retention/state regression passed.');
