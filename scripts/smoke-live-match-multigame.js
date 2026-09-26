import assert from 'node:assert/strict';
import { buildChampionIndex, parseCommunityPosts } from '../server/esports-match-community-fallback.js';
import { __multiGameCommunityTest } from '../server/esports-match-community-multigame.js';

const { expandPostMatchSections } = __multiGameCommunityTest;
const teams = [
  { id: 't1', code: 'T1', name: 'T1' },
  { id: 'kt', code: 'KT', name: 'KT Rolster' }
];
const champions = buildChampionIndex([
  { key: 69, name: 'Cassiopeia', id: 'Cassiopeia' },
  { key: 61, name: 'Orianna', id: 'Orianna' },
  { key: 254, name: 'Vi', id: 'Vi' },
  { key: 111, name: 'Nautilus', id: 'Nautilus' },
  { key: 43, name: 'Karma', id: 'Karma' },
  { key: 432, name: 'Bard', id: 'Bard' },
  { key: 236, name: 'Lucian', id: 'Lucian' },
  { key: 64, name: 'Lee Sin', id: 'LeeSin' },
  { key: 34, name: 'Anivia', id: 'Anivia' },
  { key: 134, name: 'Syndra', id: 'Syndra' },
  { key: 51, name: 'Caitlyn', id: 'Caitlyn' },
  { key: 498, name: 'Xayah', id: 'Xayah' },
  { key: 78, name: 'Poppy', id: 'Poppy' },
  { key: 80, name: 'Pantheon', id: 'Pantheon' },
  { key: 517, name: 'Sylas', id: 'Sylas' }
]);

const post = {
  id: 'postmatch',
  created_utc: 300,
  title: 'KT Rolster vs. T1 / Post-Match Discussion',
  selftext: `T1 2-1 KT Rolster

###MATCH 1: T1 vs. KT
**Winner: KT Rolster** in 35m
| - | Bans 1 | Bans 2 | G | K | T | D/B |
|---|---|---|---|---|---|---|
|**T1**|Cassiopeia Orianna Vi|Nautilus Karma||||[O](#mt-ocean)^1 [H](#mt-herald)^2|
|**KT**|Bard Lucian Lee Sin|Anivia Syndra||||[B](#mt-barons)^5|

###MATCH 2: KT vs. T1
**Winner: T1** in 32m
| - | Bans 1 | Bans 2 | G | K | T | D/B |
|---|---|---|---|---|---|---|
|**KT**|Bard Lucian Cassiopeia|Caitlyn Xayah||||[H](#mt-herald)^3|
|**T1**|Poppy Karma Orianna|Pantheon Sylas||||[B](#mt-barons)^6|

###MATCH 3: T1 vs. KT
**Winner: T1** in 34m
| - | Bans 1 | Bans 2 | G | K | T | D/B |
|---|---|---|---|---|---|---|
|**T1**|Cassiopeia Orianna Vi|Pantheon Sylas||||[H](#mt-herald)^3 [B](#mt-barons)^7|
|**KT**|Bard Lucian Lee Sin|Caitlyn Xayah||||[O](#mt-ocean)^2|`
};

const expanded = expandPostMatchSections([post]);
assert.equal(expanded.length, 4, 'full Post-Match post + three per-game sections expected');
const parsed = parseCommunityPosts(expanded, teams, champions);
assert.ok(parsed, 'expanded Post-Match post must parse');
assert.equal(parsed.games.length, 3, 'all three games must survive parsing');
assert.deepEqual(parsed.scores, { t1: 2, kt: 1 });
for (const number of [1, 2, 3]) {
  const game = parsed.games.find(row => row.number === number);
  assert.ok(game, `Game ${number} missing`);
  assert.equal(game.teams.length, 2, `Game ${number} must have two team rows`);
  assert.equal(game.teams.reduce((sum, row) => sum + row.bans.length, 0), 10, `Game ${number} must recover all ten bans`);
}
assert.equal(parsed.games.find(row => row.number === 3).winnerTeamId, 't1');
assert.equal(parsed.games.find(row => row.number === 3).teams.find(row => row.teamId === 't1').stats.riftHeralds, 1);

console.log('Multi-game Post-Match Ban/Herald regression passed.');
