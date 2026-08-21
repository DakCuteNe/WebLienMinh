const hosts = [
  'https://lol.fandom.com/api.php',
  'https://leaguepedia.net/api.php',
  'https://wiki.leaguepedia.com/api.php',
  'https://lolwiki.org/api.php'
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
      headers: { 'User-Agent': 'WebLienMinh/3.21 leaguepedia-probe' },
      signal: AbortSignal.timeout(12_000)
    });
    const raw = await response.text();
    let rows = [];
    try {
      const body = JSON.parse(raw);
      rows = (body?.cargoquery || []).map(row => row?.title || row).slice(0, 3);
    } catch {}
    console.log(JSON.stringify({ leaguepediaProbe: base, status: response.status, bytes: raw.length, rows }));
  } catch (error) {
    console.log(JSON.stringify({ leaguepediaProbe: base, error: error.message }));
  }
}
