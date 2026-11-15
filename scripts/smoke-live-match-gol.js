import assert from 'node:assert/strict';
import { __golFallbackTest } from '../server/esports-match-gol-fallback.js';

const { parseGolTeamDirectory, resolveGolTeam, parseGolMatchList, parseGolGamePage, golCommunityFromPage } = __golFallbackTest;

const directoryHtml = `
<table>
<tr><td><a href='team-stats/2807/split-ALL/tournament-ALL/'>Nongshim RedForce</a></td></tr>
<tr><td><a href='team-stats/2803/split-ALL/tournament-ALL/'>Kiwoom DRX</a></td></tr>
<tr><td><a href='team-stats/2809/split-ALL/tournament-ALL/'>T1</a></td></tr>
</table>`;
const directory = parseGolTeamDirectory(directoryHtml);
assert.equal(directory.length, 3);
assert.equal(resolveGolTeam({ code: 'NS', name: 'NONGSHIM RED FORCE' }, directory)?.id, '2807');
assert.equal(resolveGolTeam({ code: 'KRX', name: 'KIWOOM DRX' }, directory)?.id, '2803');
assert.equal(resolveGolTeam({ code: 'T1', name: 'T1' }, directory)?.id, '2809');

const listHtml = `
<table>
<tr><td>WIN</td><td>NS</td><td>KRX</td><td><a href='../game/stats/81848/page-game/'>Nongshim RedForce vs Kiwoom DRX (2)</a></td><td>LCK 2026</td></tr>
<tr><td>WIN</td><td>NS</td><td>KRX</td><td><a href='../game/stats/81847/page-game/'>Nongshim RedForce vs Kiwoom DRX (1)</a></td><td>LCK 2026</td></tr>
</table>`;
const list = parseGolMatchList(listHtml);
assert.deepEqual(list.map(row => [row.id, row.number]), [['81848', 2], ['81847', 1]]);

const gameHtml = `
<h1>NS vs KRX</h1><div>2026-08-20 (WEEK13)</div>
<div class="row"><div class="col-2">Bans</div><div class="col-10">
<a><img class='champion_icon_medium rounded-circle' alt='Orianna' src='../_img/champions_icon/Orianna.png'/></a>
<a><img class='champion_icon_medium rounded-circle' alt='Cassiopeia' src='../_img/champions_icon/Cassiopeia.png'/></a>
<a><img class='champion_icon_medium rounded-circle' alt='Vi' src='../_img/champions_icon/Vi.png'/></a>
&nbsp;|&nbsp;
<a><img class='champion_icon_medium rounded-circle' alt='Nautilus' src='../_img/champions_icon/Nautilus.png'/></a>
<a><img class='champion_icon_medium rounded-circle' alt='Karma' src='../_img/champions_icon/Karma.png'/></a>
</div></div>
<div class="row"><div class="col-2">Picks</div><div class="col-10">ignored</div></div>
<div class="row"><div class="col-2">Bans</div><div class="col-10">
<a><img class='champion_icon_medium rounded-circle' alt='Bard' src='../_img/champions_icon/Bard.png'/></a>
<a><img class='champion_icon_medium rounded-circle' alt='Lucian' src='../_img/champions_icon/Lucian.png'/></a>
<a><img class='champion_icon_medium rounded-circle' alt='Lee Sin' src='../_img/champions_icon/LeeSin.png'/></a>
&nbsp;|&nbsp;
<a><img class='champion_icon_medium rounded-circle' alt='Anivia' src='../_img/champions_icon/Anivia.png'/></a>
<a><img class='champion_icon_medium rounded-circle' alt='Syndra' src='../_img/champions_icon/Syndra.png'/></a>
</div></div>`;
const page = parseGolGamePage(gameHtml);
assert.equal(page.date, '2026-08-20');
assert.deepEqual(page.blueBans, ['Orianna', 'Cassiopeia', 'Vi', 'Nautilus', 'Karma']);
assert.deepEqual(page.redBans, ['Bard', 'Lucian', 'Lee Sin', 'Anivia', 'Syndra']);

const body = {
  ok: true,
  startTime: '2026-08-20T10:00:00Z',
  teams: [
    { id: 'riot-ns', code: 'NS', name: 'NONGSHIM RED FORCE' },
    { id: 'riot-krx', code: 'KRX', name: 'KIWOOM DRX' }
  ],
  viewGame: {
    id: 'riot-game-2', number: 2, state: 'completed',
    teams: [{ id: 'riot-ns', side: 'red' }, { id: 'riot-krx', side: 'blue' }]
  }
};
const community = golCommunityFromPage(body, page, '81848');
assert.equal(community.source, 'Games of Legends');
assert.deepEqual(community.games[0].teams.find(row => row.teamId === 'riot-krx').bans, page.blueBans, 'Blue GOL Bans must map to the Riot team that is Blue in this game');
assert.deepEqual(community.games[0].teams.find(row => row.teamId === 'riot-ns').bans, page.redBans, 'Red GOL Bans must map to the Riot team that is Red in this game');

console.log('Games of Legends Ban parser/team/side regression passed.');
