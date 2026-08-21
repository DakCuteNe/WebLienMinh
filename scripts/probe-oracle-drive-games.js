const URL = 'https://raw.githubusercontent.com/ChristopherHsu07/league-of-legends-predictor/master/data/2026_LoL_esports_match_data_from_OraclesElixir.csv';

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
  headers: { 'User-Agent': 'WebLienMinh/3.25 oracle-mirror-probe' },
  signal: AbortSignal.timeout(90_000)
});
if (!response.ok) throw new Error(`Oracle mirror HTTP ${response.status}`);
const raw = await response.text();
const lines = raw.split(/\r?\n/).filter(Boolean);
const headers = csvRow(lines.shift());
if (headers.length) headers[0] = headers[0].replace(/^\uFEFF/, '');
const col = Object.fromEntries(headers.map((name, i) => [name, i]));
const wanted = ['gameid','league','date','game','participantid','side','position','teamname','teamid','ban1','ban2','ban3','ban4','ban5'];
for (const name of wanted) if (col[name] == null) throw new Error(`Missing Oracle column ${name}`);

let maxDate = '';
const recent = [];
const lckTail = [];
for (const line of lines) {
  const row = csvRow(line);
  const date = row[col.date] || '';
  if (date > maxDate) maxDate = date;
  const position = String(row[col.position] || '').toLowerCase();
  const participant = Number(row[col.participantid] || 0);
  if (position !== 'team' && participant !== 100 && participant !== 200) continue;
  const record = {
    gameid: row[col.gameid], league: row[col.league], date,
    game: Number(row[col.game] || 0), participantid: participant,
    side: row[col.side], teamname: row[col.teamname], teamid: row[col.teamid],
    bans: [row[col.ban1], row[col.ban2], row[col.ban3], row[col.ban4], row[col.ban5]].filter(Boolean)
  };
  if (date.startsWith('2026-08-20') || date.startsWith('2026-08-21')) recent.push(record);
  if (String(row[col.league] || '').toLowerCase().includes('lck')) lckTail.push(record);
}
console.log(JSON.stringify({
  oracleMirrorBytes: raw.length,
  maxDate,
  recentRows: recent,
  latestLckRows: lckTail.slice(-20)
}, null, 2));
