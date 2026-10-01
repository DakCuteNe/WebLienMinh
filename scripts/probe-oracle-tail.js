const FILE_ID = '1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm';
const URL = `https://drive.usercontent.google.com/download?id=${FILE_ID}&export=download&confirm=t`;
const response = await fetch(URL, {
  headers: { Range: 'bytes=-65536', 'User-Agent': 'WebLienMinh/3.31 oracle-tail-probe' },
  signal: AbortSignal.timeout(30_000)
});
const raw = await response.text();
const lines = raw.split(/\r?\n/).filter(Boolean);
const dates = [...raw.matchAll(/2026-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g)].map(m => m[0]);
console.log(JSON.stringify({
  status: response.status,
  contentRange: response.headers.get('content-range'),
  bytes: raw.length,
  firstDate: dates[0] || null,
  lastDate: dates.at(-1) || null,
  hasAug20: raw.includes('2026-08-20'),
  hasAug21: raw.includes('2026-08-21'),
  lineCount: lines.length,
  tailPreview: lines.slice(-3)
}, null, 2));
if (response.status !== 206) process.exitCode = 2;
