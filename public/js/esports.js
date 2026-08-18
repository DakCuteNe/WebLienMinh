import { $, api, esc, roleName, fmt, score, openModal, img } from './shared.js';

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
  const qs = new URLSearchParams({
    page: String(page),
    limit: '36',
    search: $('#playerSearch').value,
    role: $('#playerRole').value,
    region: $('#playerRegion').value,
    team: $('#playerTeam').value
  });
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
    document.querySelectorAll('.player-card').forEach(card => card.onclick = () => openPlayer(card.dataset.id));
  } catch (error) {
    $('#playerGrid').innerHTML = `<div class="notice">${esc(error.message)}</div>`;
  }
}

function playerCard(p) {
  const teamLogo = p.team?.logo ? `<img class="team-logo" src="${esc(p.team.logo)}" alt="${esc(p.team.name)}" loading="lazy">` : '<span class="team-logo fallback">—</span>';
  return `<article class="player-card" data-id="${esc(p.id)}">
    <div class="player-photo">${img(p.image, p.id, 'player-image')}</div>
    <div class="player-card-info">
      <div class="player-team-row">${teamLogo}<span>${esc(p.team?.short || p.team?.name || 'Free Agent')}</span>${p.featured ? '<b class="featured-badge">FEATURED</b>' : ''}</div>
      <h3>${esc(p.id)}</h3>
      <p>${esc(p.name || '')}</p>
      <div class="player-meta"><span>${esc(roleName[p.role] || p.role || '—')}</span><span>${esc(p.team?.region || p.residency || '—')}</span><span>${esc(p.country || p.nationality || '—')}</span></div>
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

async function openPlayer(id) {
  openModal('<div class="loading-card">Đang tải hồ sơ tuyển thủ...</div>');
  try {
    const d = await api('/api/esports/player/' + encodeURIComponent(id));
    const p = d.player;
    const f = d.featuredStats;
    const achievements = d.achievements || [];
    const titles = d.titles || [];
    const teamLogo = p.team?.logo ? `<img class="profile-team-logo" src="${esc(p.team.logo)}">` : '';
    const favorite = (p.favoriteChampions || []).length ? p.favoriteChampions.map(x => `<span class="chip">${esc(x)}</span>`).join('') : '<span class="muted">Chưa có dữ liệu công khai chuẩn hóa.</span>';
    const socials = [
      socialLink('X / Twitter', p.socials?.twitter, 'twitter'),
      socialLink('Instagram', p.socials?.instagram, 'instagram'),
      socialLink('Stream', p.socials?.stream, 'stream'),
      socialLink('YouTube', p.socials?.youtube, 'youtube')
    ].filter(Boolean).join('');

    $('#modalContent').innerHTML = `
      <div class="player-profile-hero">
        <div class="profile-photo">${img(p.image, p.id, 'profile-player-image')}</div>
        <div class="profile-main"><div class="eyebrow">${esc(roleName[p.role] || p.role || 'PRO PLAYER')} • ${esc(p.team?.region || p.residency || '')}</div><h2>${esc(p.id)}</h2><p>${esc(p.name || '')}${p.nativeName ? ` • ${esc(p.nativeName)}` : ''}</p><div class="profile-team">${teamLogo}<div><b>${esc(p.team?.name || 'Không rõ đội')}</b><span>${esc(p.team?.short || '')}</span></div></div></div>
        <div class="profile-badges"><span>${titles.length} danh hiệu hạng nhất</span>${p.substitute ? '<span>Substitute</span>' : ''}${p.trainee ? '<span>Trainee</span>' : ''}</div>
      </div>
      <div class="profile-grid">
        <div class="profile-card"><h3>Hồ sơ</h3><dl><dt>Ngày sinh</dt><dd>${esc(p.birthdate || 'Chưa công khai')}</dd><dt>Năm sinh</dt><dd>${esc(p.birthYear || '—')}</dd><dt>Tuổi</dt><dd>${esc(p.age || '—')}</dd><dt>Quốc gia</dt><dd>${esc(p.country || p.nationality || '—')}</dd><dt>Residency</dt><dd>${esc(p.residency || '—')}</dd><dt>Vị trí</dt><dd>${esc(roleName[p.role] || p.role || '—')}</dd><dt>Hợp đồng đến</dt><dd>${esc(p.contract || 'Chưa công khai')}</dd></dl></div>
        <div class="profile-card"><h3>Sở thích / tướng yêu thích</h3><div class="chips">${favorite}</div><p class="source-note">${esc(p.interestsNote || '')}</p><h3>Liên kết</h3><div class="socials">${socials || '<span class="muted">Chưa có social công khai.</span>'}</div></div>
        ${f?.available ? `<div class="profile-card wide"><h3>Phong độ chuyên nghiệp gần đây</h3><div class="pro-metrics"><span>WR <b>${fmt(f.winRate)}</b></span><span>KDA <b>${score(f.kda)}</b></span><span>Games <b>${f.games}</b></span><span>Patch <b>${esc(f.latestPatch || '—')}</b></span></div><p>${esc(f.styleSummary || '')}</p><h4>Champion pool</h4><div class="chips">${statChips(f.championPool, 8)}</div><h4>Build phổ biến</h4><div class="chips">${statChips(f.commonBuilds, 4)}</div><h4>Ngọc / Spell</h4><div class="chips">${statChips(f.commonRunes, 3)}${statChips(f.commonSpells, 3)}</div></div>` : ''}
        <div class="profile-card wide"><div class="profile-title-row"><h3>Danh hiệu & thành tích</h3><span>${achievements.length} thành tích được đánh dấu</span></div>${achievements.length ? `<div class="achievement-list">${achievements.slice(0, 30).map(a => `<div class="achievement"><b class="place place-${Number(a.placeNumber || 99) <= 3 ? Number(a.placeNumber) : 'other'}">${esc(a.place || '—')}</b><div><strong>${esc(a.event || '')}</strong><span>${esc(a.team || '')} • ${esc(a.tier || '')} • ${esc(a.date || '')}</span></div></div>`).join('')}</div>` : `<p class="muted">${esc(d.achievementWarning || 'Chưa có thành tích được đánh dấu trong nguồn.')}</p>`}</div>
      </div>
      <div class="profile-source"><span>Không suy đoán dữ liệu cá nhân bị thiếu.</span><a href="${esc(p.sourcePage || '#')}" target="_blank" rel="noreferrer">Mở nguồn Leaguepedia ↗</a></div>`;
  } catch (error) {
    $('#modalContent').innerHTML = `<div class="notice">${esc(error.message)}</div>`;
  }
}
