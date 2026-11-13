const GUARDED_STATS = [
  'kills', 'gold', 'towers', 'inhibitors', 'dragons', 'barons',
  'elders', 'voidGrubs', 'riftHeralds', 'atakhans'
];

function sanitizeStats(stats, availability = {}) {
  if (!stats || typeof stats !== 'object') return stats || null;
  const next = { ...stats };
  for (const key of GUARDED_STATS) {
    if (next[key] === 0 && availability[key] !== true) next[key] = null;
  }
  return next;
}

function sanitizeRow(row, availability) {
  if (!row) return row;
  return { ...row, stats: sanitizeStats(row.stats, availability) };
}

export function guardUnconfirmedLiveStats(body) {
  if (!body?.ok || !body?.live) return body;
  const availability = body.live.dataAvailability || {};
  body.live.blue = sanitizeRow(body.live.blue, availability);
  body.live.red = sanitizeRow(body.live.red, availability);
  if (Array.isArray(body.live.teams)) {
    body.live.teams = body.live.teams.map(row => sanitizeRow(row, availability));
  }
  return body;
}

export function installEsportsMatchStatGuard(app) {
  app.use('/api/esports/match-live', (req, res, next) => {
    const previousJson = res.json.bind(res);
    res.json = body => previousJson(guardUnconfirmedLiveStats(body));
    next();
  });
}

export const __statGuardTest = { sanitizeStats, guardUnconfirmedLiveStats };
