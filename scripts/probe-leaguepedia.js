const today = new Date();
const ymd = date => date.toISOString().slice(0, 10).replaceAll('-', '');
const yesterday = new Date(today.getTime() - 24 * 60 * 60_000);

const hosts = [
  'https://wiki.leagueoflegends.com/en-us/api.php',
  'https://wiki.leagueoflegends.com/api.php',
  'https://lol.fandom.com/api.php'
];

for (const base of hosts) {
  const query = new URLSearchParams({
    action: 'cargoquery',
    format: 'json',
    tables: 'ScoreboardGames=SG',
    fields: 'SG.DateTime_UTC,SG.Team1,SG.Team2,SG.Team1Bans,SG.Team2Bans,SG.GameId',
    where: "SG.DateTime_UTC >= '2026-08-20'",
    order_by: 'SG.DateTime_UTC DESC',
    limit: '3'
  });
  try {
    const response = await fetch(`${base}?${query}`, {
      headers: { 'User-Agent': 'WebLienMinh/3.22 ban-source-probe' },
      signal: AbortSignal.timeout(12_000)
    });
    const raw = await response.text();
    let rows = [];
    let apiError = null;
    try {
      const body = JSON.parse(raw);
      rows = (body?.cargoquery || []).map(row => row?.title || row).slice(0, 3);
      apiError = body?.error || null;
    } catch {}
    console.log(JSON.stringify({ sourceProbe: base, status: response.status, rows, apiError }));
  } catch (error) {
    console.log(JSON.stringify({ sourceProbe: base, error: error.message, cause: error?.cause?.message || null }));
  }
}

for (const stamp of [ymd(today), ymd(yesterday)]) {
  const url = `https://oracleselixir-downloadable-match-data.s3-us-west-2.amazonaws.com/2026_LoL_esports_match_data_from_OraclesElixir_${stamp}.csv`;
  try {
    const response = await fetch(url, {
      headers: { Range: 'bytes=0-32767', 'User-Agent': 'WebLienMinh/3.22 ban-source-probe' },
      signal: AbortSignal.timeout(15_000)
    });
    const raw = await response.text();
    const firstLine = raw.split(/\r?\n/, 1)[0] || '';
    console.log(JSON.stringify({
      oracleCsvProbe: stamp,
      status: response.status,
      contentLength: response.headers.get('content-length'),
      contentRange: response.headers.get('content-range'),
      headerHasBans: /(?:^|,)ban1(?:,|$)/i.test(firstLine) && /(?:^|,)ban5(?:,|$)/i.test(firstLine),
      headerPreview: firstLine.slice(0, 500)
    }));
  } catch (error) {
    console.log(JSON.stringify({ oracleCsvProbe: stamp, error: error.message, cause: error?.cause?.message || null }));
  }
}

for (const url of [
  'https://oe.datalisk.io/matchData',
  'https://oe.datalisk.io/matches/recentResults/'
]) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'WebLienMinh/3.22 ban-source-probe' },
      signal: AbortSignal.timeout(12_000)
    });
    const raw = await response.text();
    console.log(JSON.stringify({
      oracleApiProbe: url,
      status: response.status,
      contentType: response.headers.get('content-type'),
      bytes: raw.length,
      preview: raw.slice(0, 240).replace(/\s+/g, ' ')
    }));
  } catch (error) {
    console.log(JSON.stringify({ oracleApiProbe: url, error: error.message, cause: error?.cause?.message || null }));
  }
}
