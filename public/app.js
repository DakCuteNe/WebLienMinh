const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let championIndex = [];
let status = {};
let prosLoaded = false;
let patchesLoaded = false;

const roleName = {TOP:'TOP',JUNGLE:'JUNGLE',MIDDLE:'MID',BOTTOM:'ADC',UTILITY:'SUPPORT'};
const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

async function api(url){
  const r = await fetch(url);
  const body = await r.json();
  if(!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body;
}

function switchSection(id){
  $$('.page-section').forEach(x=>x.classList.toggle('active-section',x.id===id));
  $$('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.section===id));
  if(id==='patch') loadPatches();
  if(id==='pros') loadPros();
  window.scrollTo({top:65,behavior:'smooth'});
}

$$('.nav-btn').forEach(b=>b.onclick=()=>switchSection(b.dataset.section));
$('#openCounter').onclick=()=>switchSection('counter');

async function loadStatus(){
  status = await api('/api/status');
  $('#ddVersion').textContent=status.ddragon;
  $('#patchLive').textContent=status.metaPatch==='live-data' ? 'LIVE' : status.metaPatch;
  $('#sampleGames').textContent=Number(status.sampleGames||0).toLocaleString('vi-VN');
  $('#datasetNote').textContent=status.riotApiConfigured?`${status.metaMode} • Riot API ON`:'Chưa cấu hình Riot API key';
  $('#statusBadge').textContent=`VN2 • ${status.riotApiConfigured?'RIOT API ON':'DEMO DATA'}`;
}

async function loadChampionIndex(){
  const data=await api('/api/champions');
  championIndex=data.champions;
  $('#championList').innerHTML=championIndex.map(c=>`<option value="${esc(c.name)}">${esc(c.id)}</option>`).join('');
}

function fmt(n){return Number(n||0).toFixed(1)+'%'}
function score(n){return Number(n||0).toFixed(1)}
function trendHtml(n){
  const v=Number(n||0);
  if(Math.abs(v)<0.05)return '<span class="trend flat">• 0.0</span>';
  return `<span class="trend ${v>0?'up':'down'}">${v>0?'▲':'▼'} ${Math.abs(v).toFixed(1)}</span>`;
}

function renderRows(data){
  if(data.notice){$('#dataWarning').classList.remove('hidden');$('#dataWarning').textContent='ⓘ '+data.notice}else{$('#dataWarning').classList.add('hidden')}
  const rows=data.champions;
  $('#metaRows').innerHTML=rows.length?rows.map((x,i)=>`<tr>
    <td>${i+1}</td>
    <td><div class="champ"><img src="${esc(x.image||'')}" alt=""><div><b>${esc(x.name)}</b><small>${esc(x.reason||'')}</small></div></div></td>
    <td><span class="role">${esc(roleName[x.role]||x.role)}</span></td>
    <td><span class="tier tier-${esc(x.tier)}">${esc(x.tier)}</span></td>
    <td><b class="score-num">${score(x.tierScore)}</b><small class="confidence-mini">${score(x.tierScoreComponents?.sampleConfidence)}% conf.</small></td>
    <td><b>${fmt(x.winRate)}</b><small class="adjusted">Adj ${fmt(x.adjustedWinRate)}</small></td>
    <td>${fmt(x.pickRate)}</td>
    <td>${fmt(x.banRate)}</td>
    <td>${trendHtml(x.trend)}</td>
    <td><span class="verdict">${esc(x.verdict)}</span></td>
    <td><button class="detail-btn" data-id="${esc(x.id)}">Chi tiết</button></td>
  </tr>`).join(''):'<tr><td colspan="11" class="loading">Không có dữ liệu phù hợp.</td></tr>';
  $$('.detail-btn').forEach(b=>b.onclick=()=>openChampion(b.dataset.id));
}

async function loadMeta(){
  const qs=new URLSearchParams({role:$('#role').value,tier:$('#tier').value,search:$('#search').value});
  try{renderRows(await api('/api/meta?'+qs))}catch(e){$('#metaRows').innerHTML=`<tr><td colspan="11" class="loading">${esc(e.message)}</td></tr>`}
}
$('#role').onchange=loadMeta;$('#tier').onchange=loadMeta;let st;$('#search').oninput=()=>{clearTimeout(st);st=setTimeout(loadMeta,180)};

function renderItemRow(items){
  return items?.length?`<div class="asset-row">${items.map(item=>`<div class="asset" title="${esc(item.name)}"><img src="${esc(item.image||'')}"><span>${esc(item.name)}</span></div>`).join('')}</div>`:'<p class="muted">Chưa đủ sample build.</p>';
}
function renderSpellRow(spells){
  return spells?.length?`<div class="asset-row">${spells.map(spell=>`<div class="asset small"><img src="${esc(spell.image||'')}"><span>${esc(spell.name)}</span></div>`).join('')}</div>`:'<p class="muted">Chưa đủ sample spell.</p>';
}

async function openChampion(id){
  const data=await api('/api/champion/'+encodeURIComponent(id));
  const c=data.champion,m=data.meta;
  const splash=`https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${c.id}_0.jpg`;
  const topBuild=m?.coreBuilds?.[0];
  const topRune=m?.runes?.[0];
  const topSpell=m?.spells?.[0];
  $('#modalContent').innerHTML=`
    <div class="detail-head" style="background-image:url('${splash}')"><div><div class="eyebrow">${m?`${esc(m.tier)} TIER • SCORE ${score(m.tierScore)}`:'CHAMPION'}</div><h2>${esc(c.name)}</h2><span>${esc(c.title)}</span></div></div>
    <div class="stat-strip">${m?`<div><small>WR</small><b>${fmt(m.winRate)}</b><span>Adj ${fmt(m.adjustedWinRate)}</span></div><div><small>PICK</small><b>${fmt(m.pickRate)}</b></div><div><small>BAN</small><b>${fmt(m.banRate)}</b></div><div><small>SAMPLE</small><b>${m.games}</b></div><div><small>TREND</small><b>${m.trend>=0?'+':''}${score(m.trend)}</b></div>`:'<div>Chưa có meta</div>'}</div>
    <div class="detail-body">
      <div>
        <h3>Phân tích</h3><p>${esc(m?.reason||c.lore)}</p>
        ${m?`<div class="analytics-grid">
          <div class="analysis-card"><h3>Core build phổ biến</h3>${topBuild?`${renderItemRow(topBuild.items)}<small>${topBuild.games} game • ${fmt(topBuild.rate)} usage • ${fmt(topBuild.winRate)} WR</small>`:'<p class="muted">Chưa đủ sample.</p>'}</div>
          <div class="analysis-card"><h3>Ngọc phổ biến</h3>${topRune?`<div class="rune-head"><img src="${esc(topRune.primary?.icon||'')}"><b>${esc(topRune.primary?.name||'')}</b><span> + ${esc(topRune.secondary?.name||'')}</span></div><div class="rune-list">${(topRune.perks||[]).map(r=>`<span title="${esc(r.name)}"><img src="${esc(r.icon||'')}"></span>`).join('')}</div><small>${topRune.games} game • ${fmt(topRune.rate)} usage</small>`:'<p class="muted">Chưa đủ sample.</p>'}</div>
          <div class="analysis-card"><h3>Phép bổ trợ</h3>${topSpell?`${renderSpellRow(topSpell.spells)}<small>${topSpell.games} game • ${fmt(topSpell.rate)} usage</small>`:'<p class="muted">Chưa đủ sample.</p>'}</div>
          <div class="analysis-card"><h3>Trend so với lần trước</h3><p>Tier Score ${m.trend>=0?'+':''}${score(m.trendStats?.tierScore)} • WR ${m.trendStats?.winRate>=0?'+':''}${score(m.trendStats?.winRate)} • Pick ${m.trendStats?.pickRate>=0?'+':''}${score(m.trendStats?.pickRate)} • Ban ${m.trendStats?.banRate>=0?'+':''}${score(m.trendStats?.banRate)}</p></div>
        </div>`:''}
        <h3>Kỹ năng</h3><div class="spell-list">${c.spells.map(s=>`<div class="spell"><img src="https://ddragon.leagueoflegends.com/cdn/${data.version}/img/spell/${s.image.full}"><b>${esc(s.name)}</b></div>`).join('')}</div>
      </div>
      <div class="matchup-box"><h3>Tier Score</h3>${m?`<div class="big-score">${score(m.tierScore)}</div><p>WR hiệu chỉnh <b>${fmt(m.adjustedWinRate)}</b></p><p>Presence <b>${fmt(m.presenceRate)}</b></p><p>Matchup edge <b>${m.matchupEdge>=0?'+':''}${score(m.matchupEdge)}</b></p><p>Confidence <b>${score(m.tierScoreComponents?.sampleConfidence)}%</b></p><button class="primary" onclick="showCounterById('${c.id}')">Xem counter</button>`:'<p>Chưa có dữ liệu meta cho tướng này.</p>'}</div>
    </div>`;
  $('#modal').classList.remove('hidden');
}
window.showCounterById=(id)=>{ $('#modal').classList.add('hidden'); const c=championIndex.find(x=>x.id===id); $('#counterInput').value=c?.name||id; switchSection('counter'); runCounter(id); };
$('#closeModal').onclick=()=>$('#modal').classList.add('hidden');$('#modal').onclick=e=>{if(e.target.id==='modal')$('#modal').classList.add('hidden')};

function findChampion(query){const q=query.trim().toLowerCase();return championIndex.find(c=>c.id.toLowerCase()===q||c.name.toLowerCase()===q)}
async function runCounter(forceId){
  const c=forceId?championIndex.find(x=>x.id===forceId):findChampion($('#counterInput').value);
  if(!c){$('#counterResult').innerHTML='<div class="notice">Không tìm thấy tướng. Hãy chọn đúng tên trong danh sách.</div>';return}
  $('#counterResult').innerHTML='<div class="empty-state">Đang phân tích matchup…</div>';
  try{
    const role=$('#counterRole').value;
    const d=await api('/api/counter/'+encodeURIComponent(c.id)+(role?'?role='+encodeURIComponent(role):''));
    const list=(arr)=>arr.map((x,i)=>`<div class="mini-champ"><img src="${esc(x.image||'')}"><div><b>${i+1}. ${esc(x.name)}</b><br><span>${x.matchup?.games?`${x.matchup.games} game • matchup WR ${fmt(x.matchup.winRate)} • Δ ${x.matchup.delta>=0?'+':''}${score(x.matchup.delta)} • tin cậy ${esc(x.matchup.confidenceLabel)}`:(x.stats?`${esc(x.stats.tier)} tier • Score ${score(x.stats.tierScore)}`:'Chưa đủ sample')}</span></div></div>`).join('')||'<p>Chưa đủ sample matchup cùng lane.</p>';
    $('#counterResult').innerHTML=`<div class="counter-hero"><img src="${esc(c.image)}"><div><div class="eyebrow">ĐỐI THỦ ĐÃ PICK</div><h2>${esc(c.name)}</h2><span>${esc(roleName[d.champion.role]||d.champion.role)} • Patch ${esc(d.patch)} • ${d.champion.games} game</span></div></div>
    <div class="notice subtle">${esc(d.methodology||'Counter cùng lane có hiệu chỉnh sample.')}</div>
    <div class="counter-columns"><div class="matchup-box"><h3>🔥 Matchup gây khó cho ${esc(c.name)}</h3>${list(d.counters)}</div><div class="matchup-box"><h3>⚠ ${esc(c.name)} có lợi thế hơn</h3>${list(d.goodAgainst)}</div></div>`;
  }catch(e){$('#counterResult').innerHTML=`<div class="notice">${esc(e.message)}</div>`}
}
$('#counterBtn').onclick=()=>runCounter();$('#counterInput').addEventListener('keydown',e=>{if(e.key==='Enter')runCounter()});$('#counterRole').onchange=()=>{if($('#counterInput').value)runCounter()};

function chips(items, limit=5){return (items||[]).slice(0,limit).map(x=>`<span class="chip">${esc(x.name||x)}${x.rate!=null?` <b>${fmt(x.rate)}</b>`:''}</span>`).join('')||'<span class="muted">Chưa có dữ liệu</span>'}
async function loadPros(){
  if(prosLoaded)return;prosLoaded=true;
  try{
    const d=await api('/api/pros');
    $('#proNotice').textContent=`${d.note||''} • Nguồn: ${d.source||'Leaguepedia'} • Cập nhật: ${d.generatedAt?new Date(d.generatedAt).toLocaleString('vi-VN'):'chưa có'}`;
    $('#proGrid').innerHTML=(d.players||[]).map(p=>p.available?`<article class="pro-card">
      <div class="pro-head"><div><div class="eyebrow">${esc(roleName[p.role]||p.role)} • ${esc(p.team||'PRO')}</div><h3>${esc(p.name)}</h3></div><div class="pro-score"><b>${fmt(p.winRate)}</b><small>WR • ${p.games} game</small></div></div>
      <p class="pro-style">${esc(p.styleSummary)}</p>
      <div class="pro-metrics"><span>KDA <b>${score(p.kda)}</b></span><span>K <b>${score(p.avgKills)}</b></span><span>D <b>${score(p.avgDeaths)}</b></span><span>A <b>${score(p.avgAssists)}</b></span></div>
      <h4>Champion pool</h4><div class="champ-pool">${(p.championPool||[]).slice(0,5).map(c=>`<div><img src="${esc(c.image||'')}"><span>${esc(c.displayName||c.name)}<small>${fmt(c.rate)}</small></span></div>`).join('')}</div>
      <h4>Build cuối trận phổ biến</h4><div class="chips">${chips(p.commonBuilds,3)}</div>
      <h4>Ngọc / Spell</h4><div class="chips">${chips(p.commonRunes,2)}${chips(p.commonSpells,2)}</div>
      <h4>Ban priority của đội</h4><div class="chips">${chips(p.teamBanPriorities,5)}</div>
      <details><summary>8 game gần nhất</summary><div class="recent-games">${(p.recentGames||[]).map(g=>`<div class="recent-game"><img src="${esc(g.championImage||'')}"><div><b>${esc(g.championName)}</b><span class="${g.win?'win':'loss'}">${g.win?'WIN':'LOSS'}</span><small>${esc(g.kda)} • vs ${esc(g.opponent||'')} • ${esc(g.patch||'')}</small></div></div>`).join('')}</div></details>
    </article>`:`<article class="pro-card unavailable"><h3>${esc(p.name)}</h3><p>${esc(p.note||'Chưa có dữ liệu gần đây.')}</p></article>`).join('')||'<div class="notice">Chưa có dữ liệu tuyển thủ. Workflow sẽ thử đồng bộ lại.</div>';
  }catch(e){$('#proGrid').innerHTML=`<div class="notice">${esc(e.message)}</div>`}
}

async function loadPatches(){
  if(patchesLoaded)return;patchesLoaded=true;
  try{const d=await api('/api/patches');$('#patchGrid').innerHTML=d.patches.length?d.patches.map((p,i)=>`<a class="patch-card" target="_blank" rel="noreferrer" href="${esc(p.url)}"><div class="eyebrow">${i===0?'LATEST • RIOT GAMES':'RIOT GAMES'}</div><div class="patch-num">${esc(p.patch)}</div><p>${esc(p.title)}</p><b>Đọc patch notes ↗</b></a>`).join(''):'<div class="notice">Không đọc được danh sách patch lúc này.</div>'}catch(e){$('#patchGrid').innerHTML=`<div class="notice">${esc(e.message)}</div>`}
}

(async()=>{try{await Promise.all([loadStatus(),loadChampionIndex()]);await loadMeta()}catch(e){console.error(e);$('#statusBadge').textContent='Lỗi đồng bộ'}})();
