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

// Oracle's verified 2026 schema. Keep this probe to a single suffix-range request
// so Google Drive quota does not turn a regression test into a 62 MB download.
const col = {
  gameid: 0, league: 3, date: 7, game: 8, participantid: 10,
  side: 11, position: 12, teamname: 15, teamid: 16,
  ban1: 19, ban2: 20, ban3: 21, ban4: 22, ban5: 23
};

const response = await fetch(URL, {
  headers: {
    Range: 'bytes=-4194304',
    'User-Agent': 'WebLienMinh/3.27 oracle-range-probe'
  },
  signal: AbortSignal.timeout(45_000)
});
const raw = await response.text();
if (response.status !== 206) throw new Error(`Oracle range HTTP ${response.status}: ${raw.slice(0, 80)}`);
const lines = raw.split(/\r?\n/);
lines.shift(); // suffix range begins inside a CSV row

let minDate = '9999';
let maxDate = '';
const recent = [];
const latestLck = [];
for (const line of lines) {
  if (!line) continue;
  const row = csvRow(line);
  if (row.length < 24) continue;
  const date = row[col.date] || '';
  if (!/^2026-/.test(date)) continue;
  if (date < minDate) minDate = date;
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
  if (String(row[col.league] || '').toLowerCase().includes('lck')) latestLck.push(record);
}
console.log(JSON.stringify({
  contentRange: response.headers.get('content-range'),
  bytes: raw.length,
  minDate,
  maxDate,
  recentRows: recent,
  latestLckRows: latestLck.slice(-30)
}, null, 2));
