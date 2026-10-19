const pages = [
  ['game', 'https://gol.gg/game/stats/80641/page-game/'],
  ['team', 'https://gol.gg/teams/team-matchlist/2807/split-ALL/tournament-ALL/']
];

for (const [kind, url] of pages) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 WebLienMinh/3.28 gol-ban-probe' },
    signal: AbortSignal.timeout(20_000)
  });
  const html = await response.text();
  const banAt = html.toLowerCase().indexOf('bans');
  const snippets = [];
  let cursor = 0;
  while (snippets.length < 5) {
    const at = html.toLowerCase().indexOf('bans', cursor);
    if (at < 0) break;
    snippets.push(html.slice(Math.max(0, at - 500), Math.min(html.length, at + 1800)).replace(/\s+/g, ' '));
    cursor = at + 4;
  }
  const gameLinks = [...html.matchAll(/href=["']([^"']*\/game\/stats\/(\d+)\/page-(?:game|summary|fullstats)\/[^"']*)["']/gi)]
    .slice(0, 20)
    .map(match => ({ href: match[1], id: match[2] }));
  const championImgs = [...html.matchAll(/<img\b[^>]*(?:title|alt)=["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[0])
    .filter(tag => /champ|spell|pick|ban|ddragon|img\/champions/i.test(tag))
    .slice(0, 40);
  console.log(JSON.stringify({ kind, url, status: response.status, bytes: html.length, banAt, snippets, gameLinks, championImgs }, null, 2));
}
