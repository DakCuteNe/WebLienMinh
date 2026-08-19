import { $, api, esc, roleName, fmt, score, openModal, img, esportsMediaUrl } from './shared.js';

let filtersLoaded = false;
let page = 1;
let pages = 1;
let timer;

export function initEsports() {
  $('#playerRole').onchange = () => { page = 1; loadPlayers(); };
  $('#playerRegion').onchange = () => { page = 1; loadPlayers(); };
  $('#playerTeam').onchange = () => { page = 1; loadPlayers(); };
  $('#playerSearch').oninput = () => { clearTimeout(timer); timer = setTimeout(() => { page = 1; loadPlayers(); }, 220); };
  $('#prevPlayers').onclick = () => { if (page > 1) { page--; loadPlayers(); } };
  $('#nextPlayers').onclick = () => { if (page < pages) { page++; loadPlayers(); } };
}

export async function ensureEsports() {
  if (!filtersLoaded) await loadFilters();
  await loadPlayers();
}

async function loadFilters() {
  try {
    const d = await api('/api/esports/filters');
    $('#dirPlayers').textContent = Number(d.playerCount || 0).toLocaleString('vi-VN');
    $('#dirTeams').textContent = Number(d.teamCount || 0).toLocaleString('vi-VN');
    $('#playerRegion').innerHTML = '<option value="ALL">Mọi khu vực</option>' + (d.regions || []).map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    $('#playerTeam').innerHTML = '<option value="ALL">Mọi đội tuyển</option>' + (d.teams || []).map(t => `<option value="${esc(t.id)}">${esc(t.name)}${t.short ? ` (${esc(t.short)})` : ''}</option>`).join('');
    filtersLoaded = true;
  } catch (error) {
    $('#esportsCoverage').textContent = 'Directory chưa sẵn sàng: ' + error.message;
  }
}

async function loadPlayers() {
  $('#playerGrid').innerHTML = '<div class="loading-card">Đang tải tuyển thủ...</div>';
  const qs = new URLSearchParams({ page: String(page), limit: '36', search: $('#playerSearch').value, role: $('#playerRole').value, region: $('#playerRegion').value, team: $('#playerTeam').value });
  try {
    const d = await api('/api/esports?' + qs);
    pages = d.pages || 1;
    page = Math.min(page, pages);
    $('#playerPage').textContent = `${page} / ${pages}`;
    $('#prevPlayers').disabled = page <= 1;
    $('#nextPlayers').disabled = page >= pages;
    $('#esportsCoverage').textContent = `${d.coverage || ''} • ${Number(d.total || 0).toLocaleString('vi-VN')} kết quả`;
    const rows = d.players || [];
    $('#playerGrid').innerHTML = rows.length ? rows.map(playerCard).join('') : '<div class="empty-state">Không tìm thấy tuyển thủ phù hợp.</div>';
    document.querySelectorAll('.player-card').forEach(card => card.onclick = () => openPlayer(card.dataset.profile));
  } catch (error) {
    $('#playerGrid').innerHTML = `<div class="notice">${esc(error.message)}</div>`;
  }
}

function metric(label, value, suffix = '') {
  return value == null || value === '' ? '' : `<span><small>${esc(label)}</small><b>${esc(value)}${suffix}</b></span>`;
}

function playerKey(p) {
  // uid comes from the match dataset and remains unique even when two pros share the same IGN.
  return p.uid || p.identityId || p.overviewPage || p.id;
}

function teamKey(team) {
  return team?.sourcePage || team?.name || team?.id || '';
}

function playerCard(p) {
  const profileKey = playerKey(p);
  const teamName = p.currentTeamName || p.team?.short || p.team?.name || 'Free Agent';
  const teamMediaKey = p.currentTeamName || teamKey(p.team);
  const teamLogo = img(esportsMediaUrl('team', teamMediaKey), p.currentTeamName || p.team?.name || 'Team', 'team-logo');
  const champs = (p.championPool || []).slice(0, 3).map(x => `<span>${esc(x.name)} <b>${x.rate != null ? `${score(x.rate)}%` : ''}</b></span>`).join('');
  const hasStats = Number(p.games || 0) > 0;
  return `<article class="player-card pro-card-23" data-profile="${esc(profileKey)}">
    <div class="player-photo">${img(esportsMediaUrl('player', profileKey), p.id, 'player-image')}</div>
    <div class="player-card-info">
      <div class="player-team-row">${teamLogo}<span>${esc(teamName)}</span>${p.featured ? '<b class="featured-badge">FEATURED</b>' : ''}</div>
      <h3>${esc(p.id)}</h3>
      ${p.name && p.name !== p.id ? `<p class="real-name">${esc(p.name)}</p>` : ''}
      <div class="player-meta"><span>${esc(roleName[p.role] || p.role || '—')}</span><span>${esc(p.team?.region || p.residency || '—')}</span><span>${esc(p.latestPatch ? `Patch ${p.latestPatch}` : 'PRO')}</span></div>
      ${hasStats ? `<div class="pro-card-stats">${metric('Games', Number(p.games).toLocaleString('vi-VN'))}${metric('WR', score(p.winRate), '%')}${metric('KDA', score(p.kda))}</div>` : ''}
      ${champs ? `<div class="mini-pool">${champs}</div>` : ''}
      <div class="pro-card-cta">Xem hồ sơ & thống kê →</div>
    </div>
  </article>`;
}

function socialLink(label, value, type) {
  if (!value) return '';
  let href = value;
  if (type === 'twitter' && !/^https?:/i.test(value)) href = `https://x.com/${value}`;
  if (type === 'instagram' && !/^https?:/i.test(value)) href = `https://instagram.com/${value}`;
  if (type === 'youtube' && !/^https?:/i.test(value)) href = `https://youtube.com/${value}`;
  return `<a class="social-link" href="${esc(href)}" target="_blank" rel="noreferrer">${esc(label)}</a>`;
}

function statChips(items, limit = 6) {
  return (items || []).slice(0, limit).map(x => `<span class="chip">${esc(x.displayName || x.name || x)}${x.rate != null ? ` <b>${fmt(x.rate)}</b>` : ''}</span>`).join('') || '<span class="muted">Chưa có dữ liệu</span>';
}

function performanceBlock(p, featured) {
  const s = featured?.available ? featured : p;
  if (!Number(s?.games || 0)) return '<p class="muted">Chưa có thống kê thi đấu gần đây.</p>';
  const pool = featured?.available ? featured.championPool : p.championPool;
  return `<div class="pro-metrics pro-metrics-rich">
    <span>Games <b>${Number(s.games || 0).toLocaleString('vi-VN')}</b></span><span>WR <b>${fmt(s.winRate)}</b></span><span>KDA <b>${score(s.kda)}</b></span><span>K/D/A <b>${score(s.avgKills)} / ${score(s.avgDeaths)} / ${score(s.avgAssists)}</b></span>
    ${s.avgCS != null ? `<span>CS <b>${score(s.avgCS)}</b></span>` : ''}${s.avgDPM != null ? `<span>DPM <b>${score(s.avgDPM)}</b></span>` : ''}<span>Patch <b>${esc(s.latestPatch || '—')}</b></span>
  </div><h4>Champion pool gần đây</h4><div class="chips">${statChips(pool, 8)}</div>${featured?.available && featured.styleSummary ? `<p>${esc(featured.styleSummary)}</p>` : ''}`;
}

function achievementsHtml(achievements, warning) {
  if (!achievements?.length) return `<p class="muted">${esc(warning || 'Không có thành tích được đánh dấu trong nguồn hiện tại.')}</p>`;
  return `<div class="achievement-list">${achievements.slice(0, 30).map(a => `<div class="achievement"><b class="place place-${Number(a.placeNumber || 99) <= 3 ? Number(a.placeNumber) : 'other'}">${esc(a.place || '—')}</b><div><strong>${esc(a.event || '')}</strong><span>${esc(a.team || '')} • ${esc(a.tier || '')} • ${esc(a.date || '')}</span></div></div>`).join('')}</div>`;
}

async function loadAchievements(profileKey) {
  const button = $('#loadAchievements');
  const body = $('#achievementBody');
  if (!button || !body) return;
  button.disabled = true;
  button.textContent = 'Đang tải...';
  body.innerHTML = '<p class="muted">Đang đọc thành tích từ Leaguepedia...</p>';
  try {
    const data = await api('/api/esports/player/' + encodeURIComponent(profileKey) + '/achievements');
    body.innerHTML = achievementsHtml(data.achievements || [], data.warning);
    button.textContent = `Đã tải ${Number(data.achievements?.length || 0)} thành tích`;
  } catch (error) {
    body.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
    button.disabled = false;
    button.textContent = 'Thử tải lại thành tích';
  }
}

async function openPlayer(id) {
  openModal('<div class="loading-card">Đang tải hồ sơ tuyển thủ hiện tại...</div>');
  try {
    const d = await api('/api/esports/player/' + encodeURIComponent(id));
    const p = d.player;
    const f = d.featuredStats;
    const profileKey = playerKey(p);
    const teamName = p.currentTeamName || p.team?.name || 'Không rõ đội';
    const teamMediaKey = p.currentTeamName || teamKey(p.team);
    const teamLogo = img(esportsMediaUrl('team', teamMediaKey, true), teamName, 'profile-team-logo');
    const favorite = (p.championPool || p.favoriteChampions || []).length ? statChips(p.championPool?.length ? p.championPool : p.favoriteChampions, 8) : '<span class="muted">Chưa có dữ liệu.</span>';
    const socials = [socialLink('X / Twitter', p.socials?.twitter, 'twitter'), socialLink('Instagram', p.socials?.instagram, 'instagram'), socialLink('Stream', p.socials?.stream, 'stream'), socialLink('YouTube', p.socials?.youtube, 'youtube')].filter(Boolean).join('');
    const missing = 'Chưa có dữ liệu công khai';
    const sourceUrl = p.currentProfileSource || p.sourcePage || '';

    $('#modalContent').innerHTML = `
      <div class="player-profile-hero rich-pro-hero">
        <div class="profile-photo">${img(esportsMediaUrl('player', profileKey, true), p.id, 'profile-player-image')}</div>
        <div class="profile-main"><div class="eyebrow">${esc(roleName[p.role] || p.role || 'PRO PLAYER')} • ${esc(p.team?.region || p.residency || '')}</div><h2>${esc(p.id)}</h2><p>${p.name && p.name !== p.id ? esc(p.name) : 'Tuyển thủ chuyên nghiệp'}${p.nativeName ? ` • ${esc(p.nativeName)}` : ''}</p><div class="profile-team">${teamLogo}<div><b>${esc(teamName)}</b><span>${esc(p.team?.short || '')}</span></div></div></div>
        <div class="profile-badges"><span>Hồ sơ hiện tại</span>${p.featured ? '<span>Featured</span>' : ''}${p.latestPatch ? `<span>Patch ${esc(p.latestPatch)}</span>` : ''}</div>
      </div>
      <div class="profile-grid">
        <div class="profile-card"><h3>Hồ sơ công khai</h3><dl><dt>IGN</dt><dd>${esc(p.id)}</dd><dt>Tên thật</dt><dd>${esc(p.name && p.name !== p.id ? p.name : missing)}</dd><dt>Ngày sinh</dt><dd>${esc(p.birthdate || missing)}</dd><dt>Tuổi</dt><dd>${esc(p.age || '—')}</dd><dt>Quốc gia</dt><dd>${esc(p.country || p.nationality || missing)}</dd><dt>Giải / khu vực</dt><dd>${esc(p.team?.region || p.residency || '—')}</dd><dt>Vị trí</dt><dd>${esc(roleName[p.role] || p.role || '—')}</dd><dt>Đội hiện tại</dt><dd>${esc(teamName)}</dd><dt>Trận gần nhất trong dataset</dt><dd>${esc(p.latestGameAt || '—')}</dd><dt>Hợp đồng</dt><dd>${esc(p.contract || missing)}</dd></dl></div>
        <div class="profile-card"><h3>Champion pool</h3><div class="chips">${favorite}</div><p class="source-note">${esc(p.interestsNote || '')}</p><h3>Liên kết công khai</h3><div class="socials">${socials || '<span class="muted">Chưa có social công khai trong nguồn tự động.</span>'}</div></div>
        <div class="profile-card wide"><h3>Phong độ chuyên nghiệp</h3>${performanceBlock(p, f)}</div>
        ${f?.available ? `<div class="profile-card wide"><h3>Build / ngọc / spell nổi bật</h3><h4>Build phổ biến</h4><div class="chips">${statChips(f.commonBuilds, 5)}</div><h4>Ngọc</h4><div class="chips">${statChips(f.commonRunes, 4)}</div><h4>Spell</h4><div class="chips">${statChips(f.commonSpells, 4)}</div></div>` : ''}
        <div class="profile-card wide"><div class="profile-title-row"><h3>Danh hiệu & thành tích</h3><button class="secondary" id="loadAchievements">Tải thành tích</button></div><div id="achievementBody"><p class="muted">Không tự tải phần này để tránh Leaguepedia rate-limit. Bấm “Tải thành tích” khi cần.</p></div></div>
      </div>
      <div class="profile-source"><span>${p.currentProfileFetchedAt ? `Hồ sơ hiện tại được kiểm tra lúc ${esc(p.currentProfileFetchedAt)}. ` : ''}Ảnh/logo được proxy qua WebLienMinh. Thống kê trận dùng Oracle’s Elixir; trường thiếu không được suy đoán.</span>${sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noreferrer">Mở nguồn hồ sơ ↗</a>` : ''}</div>`;

    const achievementButton = $('#loadAchievements');
    if (achievementButton) achievementButton.onclick = () => loadAchievements(profileKey);
  } catch (error) {
    $('#modalContent').innerHTML = `<div class="notice">${esc(error.message)}</div>`;
  }
}
