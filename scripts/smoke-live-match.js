import fs from 'node:fs/promises';

const schedule = JSON.parse(await fs.readFile(new URL('../public/data/esports-schedule.json', import.meta.url), 'utf8'));
const now = Date.now();
const hasTwoTeams = event => Array.isArray(event?.teams)
  && event.teams.length >= 2
  && event.teams.slice(0, 2).every(team => String(team?.code || team?.name || '').trim());
const candidates = (schedule.events || [])
  .filter(event => event.state !== 'completed'
    && event.startTime
    && new Date(event.startTime).getTime() >= now - 6 * 60 * 60_000
    && hasTwoTeams(event))
  .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

const fallbackCandidates = (schedule.events || [])
  .filter(event => event.startTime
    && Math.abs(now - new Date(event.startTime).getTime()) <= 18 * 60 * 60_000
    && hasTwoTeams(event))
  .sort((a, b) => Math.abs(now - new Date(a.startTime).getTime()) - Math.abs(now - new Date(b.startTime).getTime()));

const event = candidates[0] || fallbackCandidates[0];
if (!event) throw new Error('No resolvable recent/upcoming event with two teams available for live-match smoke test.');

const params = new URLSearchParams({
  leagueId: String(event.league?.id || ''),
  leagueSlug: String(event.league?.slug || ''),
  startTime: String(event.startTime || ''),
  teamA: String(event.teams?.[0]?.code || event.teams?.[0]?.name || ''),
  teamB: String(event.teams?.[1]?.code || event.teams?.[1]?.name || ''),
  state: String(event.state || 'unstarted'),
  locale: 'vi-VN',
  detail: '0'
});

const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/esports/match-live?${params}`, {
  signal: AbortSignal.timeout(25_000)
});
const body = await response.json().catch(() => ({}));

if (!response.ok) throw new Error(`Live endpoint HTTP ${response.status}: ${JSON.stringify(body)}`);
if (!body.ok) throw new Error(`Live endpoint returned ok=false: ${JSON.stringify(body)}`);
if (!body.resolved) throw new Error(`LoL Esports event did not resolve: ${JSON.stringify({ event: event.id, startTime: event.startTime, teams: event.teams?.map(x => x.code) })}`);
if (!Array.isArray(body.teams) || body.teams.length < 2) throw new Error(`Resolved match has no team score data: ${JSON.stringify(body)}`);
if (!body.matchId) throw new Error(`Resolved match has no Riot matchId: ${JSON.stringify(body)}`);
if (!Array.isArray(body.games) || body.games.length < 1) throw new Error(`Resolved match has no BO game list: ${JSON.stringify(body)}`);
if (!body.officialUrl || !new URL(body.officialUrl).pathname.includes('/schedule')) throw new Error(`Resolved match has no schedule-scoped LoL Esports URL: ${body.officialUrl}`);
if (body.watchUrl) {
  const watch = new URL(body.watchUrl);
  if (watch.hostname.startsWith('static.') || /\.(?:png|jpe?g|gif|webp|svg|ico)$/i.test(watch.pathname)) {
    throw new Error(`Asset URL was incorrectly classified as a stream: ${body.watchUrl}`);
  }
}

console.log(JSON.stringify({
  smoke: 'ok',
  requested: { league: event.league?.name, startTime: event.startTime, teams: event.teams?.map(x => x.code) },
  resolved: { eventId: body.eventId, matchId: body.matchId, state: body.state, bestOf: body.bestOf, games: body.games?.length || 0 },
  score: body.teams.map(team => ({ code: team.code, wins: team.wins })),
  watchUrl: body.watchUrl || null,
  officialUrl: body.officialUrl
}, null, 2));

// Integration diagnostic for the exact live-series failure mode. Prefer the
// KRX vs NS series from the reported screenshot; otherwise use the most recent
// LCK series so CI still exercises a real Riot game id.
const lckRecent = (schedule.events || [])
  .filter(row => row.league?.slug === 'lck'
    && row.startTime
    && hasTwoTeams(row)
    && Math.abs(now - new Date(row.startTime).getTime()) <= 18 * 60 * 60_000)
  .sort((a, b) => Math.abs(now - new Date(a.startTime).getTime()) - Math.abs(now - new Date(b.startTime).getTime()));
const diagnosticEvent = lckRecent.find(row => {
  const codes = (row.teams || []).map(team => String(team.code || '').toUpperCase());
  return codes.includes('KRX') && codes.includes('NS');
}) || lckRecent[0] || null;

if (diagnosticEvent) {
  const diagnosticParams = new URLSearchParams({
    leagueId: String(diagnosticEvent.league?.id || ''),
    leagueSlug: String(diagnosticEvent.league?.slug || ''),
    startTime: String(diagnosticEvent.startTime || ''),
    teamA: String(diagnosticEvent.teams?.[0]?.code || diagnosticEvent.teams?.[0]?.name || ''),
    teamB: String(diagnosticEvent.teams?.[1]?.code || diagnosticEvent.teams?.[1]?.name || ''),
    state: String(diagnosticEvent.state || 'completed'),
    locale: 'vi-VN',
    detail: '0'
  });
  const diagResponse = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/esports/match-live?${diagnosticParams}`, {
    signal: AbortSignal.timeout(30_000)
  });
  const diag = await diagResponse.json().catch(() => ({}));
  console.log('LIVE_DIAGNOSTIC_SERIES', JSON.stringify({
    requested: { startTime: diagnosticEvent.startTime, teams: diagnosticEvent.teams?.map(team => team.code), cachedState: diagnosticEvent.state },
    resolved: { ok: diag.ok, state: diag.state, eventId: diag.eventId, matchId: diag.matchId, currentGame: diag.currentGame, games: diag.games, score: diag.teams?.map(team => ({ id: team.id, code: team.code, wins: team.wins })) }
  }, null, 2));

  const PUBLIC_API_KEY = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
  const seriesStart = new Date(diagnosticEvent.startTime || '').getTime();
  const summarizeWindow = value => {
    const metadata = value?.gameMetadata || {};
    const blueMeta = metadata.blueTeamMetadata || {};
    const redMeta = metadata.redTeamMetadata || {};
    const frame = value?.frames?.at(-1) || null;
    const summarizeMeta = team => ({
      teamId: team?.esportsTeamId || null,
      participantCount: Array.isArray(team?.participantMetadata) ? team.participantMetadata.length : 0,
      championIds: (team?.participantMetadata || []).map(player => player?.championId).filter(Boolean),
      keys: Object.keys(team || {})
    });
    return {
      gameId: value?.esportsGameId || null,
      patchVersion: metadata.patchVersion || null,
      metadataKeys: Object.keys(metadata),
      blueMeta: summarizeMeta(blueMeta),
      redMeta: summarizeMeta(redMeta),
      frameCount: Array.isArray(value?.frames) ? value.frames.length : 0,
      lastFrame: frame ? {
        timestamp: frame.rfc460Timestamp || null,
        gameState: frame.gameState || null,
        keys: Object.keys(frame),
        blueKeys: Object.keys(frame.blueTeam || {}),
        redKeys: Object.keys(frame.redTeam || {}),
        blue: frame.blueTeam ? {
          gold: frame.blueTeam.totalGold,
          kills: frame.blueTeam.totalKills,
          towers: frame.blueTeam.towers,
          dragons: frame.blueTeam.dragons,
          barons: frame.blueTeam.barons
        } : null,
        red: frame.redTeam ? {
          gold: frame.redTeam.totalGold,
          kills: frame.redTeam.totalKills,
          towers: frame.redTeam.towers,
          dragons: frame.redTeam.dragons,
          barons: frame.redTeam.barons
        } : null
      } : null
    };
  };

  for (const game of diag.games || []) {
    if (!game?.id) continue;
    const detailParams = new URLSearchParams(diagnosticParams);
    detailParams.set('detail', '1');
    detailParams.set('viewGameId', String(game.id));
    let local = null;
    try {
      const localResponse = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/esports/match-live?${detailParams}`, {
        signal: AbortSignal.timeout(60_000)
      });
      local = await localResponse.json();
    } catch (error) {
      local = { error: error.message };
    }
    console.log('LIVE_DIAGNOSTIC_LOCAL', JSON.stringify({
      game: { id: game.id, number: game.number, state: game.state, startTime: game.startTime },
      viewGame: local?.viewGame,
      currentGame: local?.currentGame,
      live: local?.live ? {
        gameId: local.live.gameId,
        timestamp: local.live.timestamp,
        patchVersion: local.live.patchVersion,
        blue: { picks: local.live.blue?.picks?.length || 0, bans: local.live.blue?.bans?.length || 0, stats: local.live.blue?.stats },
        red: { picks: local.live.red?.picks?.length || 0, bans: local.live.red?.bans?.length || 0, stats: local.live.red?.stats },
        teams: local.live.teams?.map(team => ({ teamId: team.teamId, side: team.side, picks: team.picks?.length || 0, bans: team.bans?.length || 0, stats: team.stats }))
      } : null,
      error: local?.error || null
    }, null, 2));

    const probes = [];
    if (Number.isFinite(seriesStart)) {
      for (const minute of [0, 5, 10, 20, 30, 40, 50, 60, 75, 90]) probes.push(new Date(seriesStart + minute * 60_000).toISOString());
    }
    probes.push(new Date(Date.now() + 5 * 60_000).toISOString());
    const unique = [...new Set(probes)];
    for (let offset = 0; offset < unique.length; offset += 4) {
      const batch = unique.slice(offset, offset + 4);
      const rows = await Promise.all(batch.map(async startingTime => {
        try {
          const rawResponse = await fetch(`https://feed.lolesports.com/livestats/v1/window/${encodeURIComponent(game.id)}?startingTime=${encodeURIComponent(startingTime)}`, {
            headers: { 'x-api-key': PUBLIC_API_KEY, 'User-Agent': 'WebLienMinh CI live diagnostic' },
            signal: AbortSignal.timeout(8_000)
          });
          const raw = rawResponse.ok ? await rawResponse.json() : null;
          return { startingTime, status: rawResponse.status, summary: raw ? summarizeWindow(raw) : null };
        } catch (error) {
          return { startingTime, status: 'error', error: error.message };
        }
      }));
      console.log('LIVE_DIAGNOSTIC_RAW', JSON.stringify({ gameId: game.id, rows }, null, 2));
    }
  }
}
