const FILE_ID = '1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm';
const URL = `https://drive.usercontent.google.com/download?id=${FILE_ID}&export=download&confirm=t`;
const UA = { 'User-Agent': 'WebLienMinh/3.26 oracle-range-probe' };

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

async function range(start, end) {
  const response = await fetch(URL, {
    headers: { ...UA, Range: `bytes=${start}-${end}` },
    signal: AbortSignal.timeout(45_000)
  });
  const raw = await response.text();
  if (response.status !== 206) throw new Error(`Oracle range HTTP ${response.status}: ${raw.slice(0, 80)}`);
  return { raw, contentRange: response.headers.get('content-range') || '' };
}

const head = await range(0, 65535);
const total = Number(head.contentRange.match(/\/(\d+)$/)?.[1] || 0);
if (!total) throw new Error(`Missing Oracle total size: ${head.contentRange}`);
const headerLine = head.raw.split(/\r?\n/, 1)[0].replace(/^\uFEFF/, '');
const headers = csvRow(headerLine);
const col = Object.fromEntries(headers.map((name, i) => [name, i]));
const wanted = ['gameid','league','date','game','participantid','side','position','teamname','teamid','ban1','ban2','ban3','ban4','ban5'];
for (const name of wanted) if (col[name] == null) throw new Error(`Missing Oracle column ${name}`);

const tailBytes = Math.min(12 * 1024 * 1024, total - 1);
const tail = await range(Math.max(0, total - tailBytes), total - 1);
const lines = tail.raw.split(/\r?\n/);
lines.shift(); // range starts inside a CSV row

let minDate = '9999';
let maxDate = '';
const recent = [];
const latestLck = [];
for (const line of lines) {
  if (!line) continue;
  const row = csvRow(line);
  if (row.length < headers.length / 2) continue;
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
  oracleTotalBytes: total,
  tailBytes,
  minDate,
  maxDate,
  recentRows: recent,
  latestLckRows: latestLck.slice(-30)
}, null, 2));
