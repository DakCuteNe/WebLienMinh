import { $, $$, api, esc, fmt, score, roleName, trendHtml, openModal, closeModal } from './shared.js';

let championIndex = [];

export async function initMeta() {
  const data = await api('/api/champions');
  championIndex = data.champions || [];
  $('#championList').innerHTML = championIndex.map(c => `<option value="${esc(c.name)}">${esc(c.id)}</option>`).join('');

  $('#role').onchange = loadMeta;
  $('#tier').onchange = loadMeta;
  let timer;
  $('#search').oninput = () => { clearTimeout(timer); timer = setTimeout(loadMeta, 180); };
  $('#counterBtn').onclick = () => runCounter();
  $('#counterInput').addEventListener('keydown', e => { if (e.key === 'Enter') runCounter(); });
  $('#counterRole').onchange = () => { if ($('#counterInput').value) runCounter(); };
  await loadMeta();
}

export function getChampionIndex() { return championIndex; }

async function loadMeta() {
  const qs = new URLSearchParams({ role: $('#role').value, tier: $('#tier').value, search: $('#search').value });
  try {
    const data = await api('/api/meta?' + qs);
    const coverage = data.methodology?.coverage || '';
    const scope = data.methodology?.scope || '';
    const isGlobal = String(data.mode || '').toLowerCase().includes('global') || /toàn thế giới|toàn cầu/i.test(scope);
    $('#metaSubtitle').textContent = `Patch ${data.patch} • ${Number(data.sampleGames || 0).toLocaleString('vi-VN')} trận • ${coverage || data.mode}`;

    if (isGlobal || scope || data.notice) {
      $('#dataWarning').classList.remove('hidden');
      $('#dataWarning').textContent = isGlobal
        ? `🌍 GLOBAL HIGH-ELO • ${coverage || 'nhiều server Riot'}. ${scope || 'Ranked Solo/Duo High-Elo từ nhiều platform Riot trên toàn thế giới.'}`
        : `ⓘ ${data.notice || scope}`;
    } else $('#dataWarning').classList.add('hidden');

    const rows = data.champions || [];
    $('#metaRows').innerHTML = rows.length ? rows.map((x, i) => `<tr>
      <td>${i + 1}</td>
      <td><div class="champ"><img src="${esc(x.image || '')}" alt=""><div><b>${esc(x.name)}</b><small>${esc(x.reason || '')}</small></div></div></td>
      <td><span class="role">${esc(roleName[x.role] || x.role)}</span></td>
      <td><span class="tier tier-${esc(x.tier)}">${esc(x.tier)}</span></td>
      <td><b class="score-num">${score(x.tierScore)}</b></td>
      <td><b>${fmt(x.winRate)}</b><small class="adjusted">Adj ${fmt(x.adjustedWinRate)}</small></td>
      <td>${fmt(x.pickRate)}</td>
      <td>${fmt(x.banRate)}</td>
      <td>${trendHtml(x.trend)}</td>
      <td>${Number(x.games || 0).toLocaleString('vi-VN')}</td>
      <td><button class="detail-btn" data-id="${esc(x.id)}">Chi tiết</button></td>
    </tr>`).join('') : '<tr><td colspan="11" class="loading">Không có dữ liệu phù hợp.</td></tr>';
    $$('.detail-btn').forEach(button => button.onclick = () => openChampion(button.dataset.id));
  } catch (error) {
    $('#metaRows').innerHTML = `<tr><td colspan="11" class="loading">${esc(error.message)}</td></tr>`;
  }
}

function renderItems(items) {
  return items?.length ? `<div class="asset-row">${items.map(item => `<div class="asset"><img src="${esc(item.image || '')}"><span>${esc(item.name)}</span></div>`).join('')}</div>` : '<p class="muted">Chưa đủ sample.</p>';
}

function renderSpells(spells) {
  return spells?.length ? `<div class="asset-row">${spells.map(spell => `<div class="asset small"><img src="${esc(spell.image || '')}"><span>${esc(spell.name)}</span></div>`).join('')}</div>` : '<p class="muted">Chưa đủ sample.</p>';
}

async function openChampion(id) {
  const data = await api('/api/champion/' + encodeURIComponent(id));
  const c = data.champion;
  const m = data.meta;
  const splash = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${c.id}_0.jpg`;
  const topBuild = m?.coreBuilds?.[0];
  const topRune = m?.runes?.[0];
  const topSpell = m?.spells?.[0];

  openModal(`
    <div class="detail-head" style="background-image:url('${splash}')"><div><div class="eyebrow">${m ? `${esc(m.tier)} TIER • SCORE ${score(m.tierScore)}` : 'CHAMPION'}</div><h2>${esc(c.name)}</h2><span>${esc(c.title)}</span></div></div>
    <div class="stat-strip">${m ? `<div><small>WR</small><b>${fmt(m.winRate)}</b><span>Adj ${fmt(m.adjustedWinRate)}</span></div><div><small>PICK</small><b>${fmt(m.pickRate)}</b></div><div><small>BAN</small><b>${fmt(m.banRate)}</b></div><div><small>SAMPLE</small><b>${m.games}</b></div><div><small>TREND</small><b>${m.trend >= 0 ? '+' : ''}${score(m.trend)}</b></div>` : '<div>Chưa có meta</div>'}</div>
    <div class="detail-body">
      <div>
        <h3>Phân tích</h3><p>${esc(m?.reason || c.lore)}</p>
        ${m ? `<div class="analytics-grid">
          <div class="analysis-card"><h3>Core build phổ biến</h3>${topBuild ? `${renderItems(topBuild.items)}<small>${topBuild.games} game • ${fmt(topBuild.rate)} usage • ${fmt(topBuild.winRate)} WR</small>` : '<p class="muted">Chưa đủ sample.</p>'}</div>
          <div class="analysis-card"><h3>Ngọc phổ biến</h3>${topRune ? `<div class="rune-head"><img src="${esc(topRune.primary?.icon || '')}"><b>${esc(topRune.primary?.name || '')}</b><span> + ${esc(topRune.secondary?.name || '')}</span></div><div class="rune-list">${(topRune.perks || []).map(r => `<span title="${esc(r.name)}"><img src="${esc(r.icon || '')}"></span>`).join('')}</div><small>${topRune.games} game • ${fmt(topRune.rate)} usage</small>` : '<p class="muted">Chưa đủ sample.</p>'}</div>
          <div class="analysis-card"><h3>Phép bổ trợ</h3>${topSpell ? `${renderSpells(topSpell.spells)}<small>${topSpell.games} game • ${fmt(topSpell.rate)} usage</small>` : '<p class="muted">Chưa đủ sample.</p>'}</div>
          <div class="analysis-card"><h3>Trend</h3><p>Tier ${m.trend >= 0 ? '+' : ''}${score(m.trendStats?.tierScore)} • WR ${score(m.trendStats?.winRate)} • Pick ${score(m.trendStats?.pickRate)} • Ban ${score(m.trendStats?.banRate)}</p></div>
        </div>` : ''}
        <h3>Kỹ năng</h3><div class="spell-list">${(c.spells || []).map(s => `<div class="spell"><img src="https://ddragon.leagueoflegends.com/cdn/${data.version}/img/spell/${s.image.full}"><b>${esc(s.name)}</b></div>`).join('')}</div>
      </div>
      <div class="matchup-box"><h3>Tier Score</h3>${m ? `<div class="big-score">${score(m.tierScore)}</div><p>WR hiệu chỉnh <b>${fmt(m.adjustedWinRate)}</b></p><p>Presence <b>${fmt(m.presenceRate)}</b></p><p>Matchup edge <b>${m.matchupEdge >= 0 ? '+' : ''}${score(m.matchupEdge)}</b></p><p>Confidence <b>${score(m.tierScoreComponents?.sampleConfidence)}%</b></p><button class="primary" id="modalCounter">Xem counter</button>` : '<p>Chưa có dữ liệu meta cho tướng này.</p>'}</div>
    </div>`);

  const counterBtn = $('#modalCounter');
  if (counterBtn) counterBtn.onclick = () => {
    closeModal();
    $('#counterInput').value = c.name;
    document.dispatchEvent(new CustomEvent('rift:navigate', { detail: 'counter' }));
    runCounter(c.id);
  };
}

function findChampion(query) {
  const q = String(query || '').trim().toLowerCase();
  return championIndex.find(c => c.id.toLowerCase() === q || c.name.toLowerCase() === q);
}

export async function runCounter(forceId) {
  const c = forceId ? championIndex.find(x => x.id === forceId) : findChampion($('#counterInput').value);
  if (!c) {
    $('#counterResult').innerHTML = '<div class="notice">Không tìm thấy tướng. Hãy chọn đúng tên trong danh sách.</div>';
    return;
  }
  $('#counterResult').innerHTML = '<div class="empty-state">Đang phân tích matchup...</div>';
  try {
    const role = $('#counterRole').value;
    const d = await api('/api/counter/' + encodeURIComponent(c.id) + (role ? '?role=' + encodeURIComponent(role) : ''));
    const list = arr => (arr || []).map((x, i) => `<div class="mini-champ"><img src="${esc(x.image || '')}"><div><b>${i + 1}. ${esc(x.name)}</b><br><span>${x.matchup?.games ? `${x.matchup.games} game • WR ${fmt(x.matchup.winRate)} • Δ ${x.matchup.delta >= 0 ? '+' : ''}${score(x.matchup.delta)} • ${esc(x.matchup.confidenceLabel || '')}` : (x.stats ? `${esc(x.stats.tier)} tier • Score ${score(x.stats.tierScore)}` : 'Chưa đủ sample')}</span></div></div>`).join('') || '<p>Chưa đủ sample matchup cùng lane.</p>';
    $('#counterResult').innerHTML = `<div class="counter-hero"><img src="${esc(c.image)}"><div><div class="eyebrow">ĐỐI THỦ ĐÃ PICK</div><h2>${esc(c.name)}</h2><span>${esc(roleName[d.champion.role] || d.champion.role)} • Patch ${esc(d.patch)} • ${d.champion.games} game</span></div></div><div class="notice subtle">${esc(d.methodology || 'Counter cùng lane có hiệu chỉnh sample.')}</div><div class="counter-columns"><div class="matchup-box"><h3>🔥 Gây khó cho ${esc(c.name)}</h3>${list(d.counters)}</div><div class="matchup-box"><h3>⚠ ${esc(c.name)} có lợi thế</h3>${list(d.goodAgainst)}</div></div>`;
  } catch (error) {
    $('#counterResult').innerHTML = `<div class="notice">${esc(error.message)}</div>`;
  }
}
