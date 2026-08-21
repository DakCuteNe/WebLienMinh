const FILE_ID = '1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm';
const URL = `https://drive.usercontent.google.com/download?id=${FILE_ID}&export=download&confirm=t`;

function csvRow(line) {
  const out = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(cell); cell = '';
    } else cell += ch;
  }
  out.push(cell);
  return out;
}

const response = await fetch(URL, {
  headers: { 'User-Agent': 'WebLienMinh/3.24 oracle-game-probe' },
  signal: AbortSignal.timeout(90_000)
});
if (!response.ok) throw new Error(`Oracle Drive HTTP ${response.status}`);
const raw = await response.text();
const lines = raw.split(/\r?\n/).filter(Boolean);
const headers = csvRow(lines.shift());
if (headers.length) headers[0] = headers[0].replace(/^\uFEFF/, '');
const col = Object.fromEntries(headers.map((name, i) => [name, i]));
const wanted = ['gameid','league','date','game','participantid','side','position','teamname','teamid','ban1','ban2','ban3','ban4','ban5'];
for (const name of wanted) if (col[name] == null) throw new Error(`Missing Oracle column ${name}`);

const rows = [];
for (const line of lines) {
  const row = csvRow(line);
  const date = row[col.date] || '';
  if (!date.startsWith('2026-08-20') && !date.startsWith('2026-08-21')) continue;
  const league = String(row[col.league] || '').toLowerCase();
  if (!league.includes('lck')) continue;
  const position = String(row[col.position] || '').toLowerCase();
  const participant = Number(row[col.participantid] || 0);
  if (position !== 'team' && participant !== 100 && participant !== 200) continue;
  rows.push({
    gameid: row[col.gameid], league: row[col.league], date,
    game: Number(row[col.game] || 0), participantid: participant,
    side: row[col.side], teamname: row[col.teamname], teamid: row[col.teamid],
    bans: [row[col.ban1], row[col.ban2], row[col.ban3], row[col.ban4], row[col.ban5]].filter(Boolean)
  });
}
console.log(JSON.stringify({ oracleRecentLckRows: rows.length, rows }, null, 2));
