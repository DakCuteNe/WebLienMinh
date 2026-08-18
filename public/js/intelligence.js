import { $, api, esc, score, roleName } from './shared.js';

function parseCoverage(value = '') {
  const text = String(value || '');
  const servers = text.match(/(\d+)\/(\d+)\s*server/i);
  const regions = text.match(/(\d+)\/(\d+)\s*(?:cụm\s*)?khu vực/i);
  return {
    text: text || 'Chưa có coverage',
    servers: servers ? `${servers[1]}/${servers[2]}` : '—',
    regions: regions ? `${regions[1]}/${regions[2]}` : '—'
  };
}

function dateText(value) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Chưa xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh'
  }).format(new Date(value));
}

function relativeAge(value) {
  if (!value || Number.isNaN(Date.parse(value))) return { text: 'Không rõ', state: 'warn' };
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return { text: `${minutes} phút trước`, state: 'ok' };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { text: `${hours} giờ trước`, state: hours <= 8 ? 'ok' : 'warn' };
  return { text: `${Math.floor(hours / 24)} ngày trước`, state: 'warn' };
}

function moverDelta(row) {
  const direct = Number(row.trend);
  if (Number.isFinite(direct) && Math.abs(direct) > 0.001) return direct;
  return Number(row.trendStats?.tierScore || 0);
}

function moverHtml(row) {
  const delta = moverDelta(row);
  const up = delta > 0;
  return `<div class="live-mover ${up ? 'up' : 'down'}">
    <img src="${esc(row.image || '')}" alt="${esc(row.name || row.id)}">
    <div><b>${esc(row.name || row.id)}</b><small>${esc(roleName[row.role] || row.role || '—')} • ${esc(row.tier || '—')} Tier</small></div>
    <strong>${up ? '▲' : '▼'} ${score(Math.abs(delta))}</strong>
  </div>`;
}

function renderMovers(meta) {
  const rows = (meta.champions || [])
    .map(row => ({ ...row, _delta: moverDelta(row) }))
    .filter(row => Math.abs(row._delta) >= 0.05)
    .sort((a, b) => Math.abs(b._delta) - Math.abs(a._delta));

  const up = rows.filter(x => x._delta > 0).slice(0, 4);
  const down = rows.filter(x => x._delta < 0).slice(0, 4);
  const target = $('#liveMovers');
  if (!target) return;

  if (!rows.length) {
    const leaders = [...(meta.champions || [])]
      .sort((a, b) => Number(b.tierScore || 0) - Number(a.tierScore || 0))
      .slice(0, 4);
    target.innerHTML = `<div class="mover-empty"><b>Baseline Global mới</b><span>Snapshot gần nhất chưa có biến động Tier Score đáng kể. Các tướng đang đứng đầu:</span>${leaders.map(x => `<span class="leader-chip">${esc(x.name || x.id)} • ${esc(x.tier)} ${score(x.tierScore)}</span>`).join('')}</div>`;
    return;
  }

  target.innerHTML = `
    <div class="mover-column"><div class="intel-label green">📈 ĐANG TĂNG</div>${up.length ? up.map(moverHtml).join('') : '<span class="intel-muted">Không có tướng vượt ngưỡng.</span>'}</div>
    <div class="mover-column"><div class="intel-label red">📉 ĐANG GIẢM</div>${down.length ? down.map(moverHtml).join('') : '<span class="intel-muted">Không có tướng vượt ngưỡng.</span>'}</div>`;
}

export async function initIntelligence() {
  const meta = await api('/api/meta?role=ALL&tier=ALL&search=');
  const coverage = parseCoverage(meta.methodology?.coverage);
  const age = relativeAge(meta.generatedAt);

  if ($('#coverageLive')) $('#coverageLive').textContent = coverage.servers;
  if ($('#regionsLive')) $('#regionsLive').textContent = coverage.regions;
  if ($('#coverageText')) $('#coverageText').textContent = coverage.text;
  if ($('#datasetTime')) $('#datasetTime').textContent = dateText(meta.generatedAt);
  if ($('#datasetAge')) {
    $('#datasetAge').textContent = age.text;
    $('#datasetAge').className = `freshness ${age.state}`;
  }
  if ($('#datasetMode')) $('#datasetMode').textContent = meta.mode || 'Global High-Elo';
  if ($('#scopeText')) $('#scopeText').textContent = meta.methodology?.scope || 'Ranked High-Elo toàn cầu';

  renderMovers(meta);

  try {
    const patches = await api('/api/patches');
    const latest = patches.patches?.[0];
    const box = $('#latestPatchLive');
    if (box && latest) {
      box.innerHTML = `<div><span class="intel-label">RIOT PATCH NOTES</span><strong>Patch ${esc(latest.patch)}</strong><p>${esc(latest.title || 'Patch Notes chính thức từ Riot Games')}</p></div><a href="${esc(latest.url)}" target="_blank" rel="noreferrer">Đọc Patch Notes ↗</a>`;
    }
  } catch (error) {
    if ($('#latestPatchLive')) $('#latestPatchLive').innerHTML = `<span class="intel-muted">Chưa đọc được Patch Notes: ${esc(error.message)}</span>`;
  }
}
