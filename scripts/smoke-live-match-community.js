import assert from 'node:assert/strict';
import { __communityFallbackTest } from '../server/esports-match-community-fallback.js';
import { __communityOverlayTest } from '../server/esports-match-community-overlay.js';

const { buildChampionIndex, parseCommunityPosts, postSearchWindows } = __communityFallbackTest;
const { applyCommunityOverlay } = __communityOverlayTest;

const teams = [
  { id: 't1', code: 'T1', name: 'T1' },
  { id: 'kt', code: 'KT', name: 'KT Rolster' }
];
const champions = buildChampionIndex([
  { key: 69, name: 'Cassiopeia', id: 'Cassiopeia' }, { key: 61, name: 'Orianna', id: 'Orianna' },
  { key: 254, name: 'Vi', id: 'Vi' }, { key: 111, name: 'Nautilus', id: 'Nautilus' },
  { key: 43, name: 'Karma', id: 'Karma' }, { key: 432, name: 'Bard', id: 'Bard' },
  { key: 236, name: 'Lucian', id: 'Lucian' }, { key: 64, name: 'Lee Sin', id: 'LeeSin' },
  { key: 34, name: 'Anivia', id: 'Anivia' }, { key: 134, name: 'Syndra', id: 'Syndra' },
  { key: 51, name: 'Caitlyn', id: 'Caitlyn' }, { key: 498, name: 'Xayah', id: 'Xayah' },
  { key: 78, name: 'Poppy', id: 'Poppy' }, { key: 80, name: 'Pantheon', id: 'Pantheon' },
  { key: 517, name: 'Sylas', id: 'Sylas' }
]);

const baseStart = '2026-08-21T10:00:00Z';
const g1Windows = postSearchWindows({ startTime: baseStart, viewGame: { number: 1 } });
const g2Windows = postSearchWindows({ startTime: baseStart, viewGame: { number: 2 } });
const g3Windows = postSearchWindows({ startTime: baseStart, viewGame: { number: 3 } });
assert.equal(g1Windows.length, 2);
assert.equal(g2Windows.length, 2);
assert.equal(g3Windows.length, 2);
assert.ok(g2Windows[0].after > g1Windows[0].after, 'Game 2 search must move forward from Game 1');
assert.ok(g3Windows[0].after > g2Windows[0].after, 'Game 3 search must have its own later window');
assert.equal(g1Windows[1].sort, 'desc', 'wide fallback window must keep the newest post-match result');

const parsed = parseCommunityPosts([
  {
    id: 'g1post', created_utc: 100, title: 'T1 vs. KT Rolster / Game 1 Discussion',
    selftext: `## **KT Rolster 1-0 T1**\n### GAME 1: T1 vs. KT\n**Winner: KT Rolster** in 36m\n| |Bans 1|Bans 2|Gold|Kills|Towers|Dragons|VG, RH, BN|\n|-|:-|:-|:-:|:-:|:-:|:-:|:-:|\n|**T1**|Cassiopeia Orianna Vi|Nautilus Karma|0k|0|0|Ocean|0, 0, **0**|\n|**KT**|Bard Lucian Lee Sin|Anivia Syndra|0k|0|0||3, 0, **0**|`
  },
  {
    id: 'g2post', created_utc: 200, title: 'KT Rolster vs. T1 / Game 2 Discussion',
    selftext: `###T1 1-1 KT Rolster\n###MATCH 2: KT vs. T1\n**Winner: T1** in 32m\n|-|Bans 1|Bans 2|G|K|T|D/B|\n|:--|:--:|:--:|:--:|:--:|:--:|:--:|\n|**KT**|bard lucian cassiopeia|caitlyn xayah||||[H](#mt-herald)^3 [O](#mt-ocean)^4 |\n|**T1**|poppy karma orianna|pantheon sylas||||[CT](#mt-chemtech)^1 [B](#mt-barons)^6 |`
  },
  {
    id: 'final', created_utc: 300, title: 'KT Rolster vs. T1 / Post-Match Discussion',
    selftext: `T1 2-1 KT\n\nKT Rolster wins game 1\n\nT1 wins game 2\n\nT1 wins game 3`
  }
], teams, champions);

assert.deepEqual(parsed.scores, { t1: 2, kt: 1 });
assert.deepEqual(parsed.games[0].teams.find(row => row.teamId === 't1').bans, [69, 61, 254, 111, 43]);
assert.deepEqual(parsed.games[0].teams.find(row => row.teamId === 'kt').bans, [432, 236, 64, 34, 134]);
assert.equal(parsed.games[0].teams.find(row => row.teamId === 'kt').stats.voidGrubs, 3);
assert.equal(parsed.games[1].teams.find(row => row.teamId === 'kt').stats.riftHeralds, 1);
assert.equal(parsed.games[2].winnerTeamId, 't1');

const body = {
  ok: true, matchId: 'm1', state: 'inprogress', bestOf: 3,
  teams: [{ id: 't1', code: 'T1', wins: 0 }, { id: 'kt', code: 'KT', wins: 1 }],
  games: [
    { id: 'g1', number: 1, state: 'completed', winnerTeamId: 'kt', winnerSource: 'series-score', winnerConfidence: 'exact', teams: [{ id: 't1', side: 'blue' }, { id: 'kt', side: 'red' }] },
    { id: 'g2', number: 2, state: 'inprogress', teams: [{ id: 'kt', side: 'blue' }, { id: 't1', side: 'red' }] },
    { id: 'g3', number: 3, state: 'unstarted', teams: [{ id: 't1', side: 'blue' }, { id: 'kt', side: 'red' }] }
  ],
  currentGame: { id: 'g2', number: 2, state: 'inprogress', teams: [{ id: 'kt', side: 'blue' }, { id: 't1', side: 'red' }] },
  viewGame: { id: 'g2', number: 2, state: 'inprogress', teams: [{ id: 'kt', side: 'blue' }, { id: 't1', side: 'red' }] },
  live: {
    gameId: 'g2', gameNumber: 2, gameState: 'finished',
    teams: [
      { teamId: 't1', side: 'red', picks: [], bans: [], stats: { kills: 19, gold: 63750, towers: 7, inhibitors: 1, dragons: 4, barons: 1, voidGrubs: null, riftHeralds: null } },
      { teamId: 'kt', side: 'blue', picks: [], bans: [], stats: { kills: 11, gold: 56738, towers: 3, inhibitors: 0, dragons: 1, barons: 0, voidGrubs: null, riftHeralds: null } }
    ]
  }
};

applyCommunityOverlay(body, {
  source: 'Reddit Post-Match archive (Arctic Shift)', scores: { t1: 1, kt: 1 },
  games: [
    { number: 1, winnerTeamId: 'kt', teams: [] },
    { number: 2, winnerTeamId: 't1', teams: [
      { teamId: 'kt', bans: [432, 236, 69, 51, 498], stats: { riftHeralds: 1 } },
      { teamId: 't1', bans: [78, 43, 61, 80, 517], stats: { riftHeralds: 0 } }
    ] }
  ]
});

assert.deepEqual(body.teams.map(team => team.wins), [1, 1]);
assert.equal(body.currentGame.id, 'g3');
assert.deepEqual(body.games[1].scoreAfterGame, [1, 1]);
assert.equal(body.live.teams.find(row => row.teamId === 'kt').stats.riftHeralds, 1);
assert.equal(body.live.dataAvailability.bans, true);

console.log('Community ban/objective/live-score regression passed.');
