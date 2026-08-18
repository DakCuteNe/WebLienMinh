const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let championIndex = [];
let status = {};

const roleName = {TOP:'TOP',JUNGLE:'JUNGLE',MIDDLE:'MID',BOTTOM:'ADC',UTILITY:'SUPPORT'};

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
  window.scrollTo({top:65,behavior:'smooth'});
}

$$('.nav-btn').forEach(b=>b.onclick=()=>switchSection(b.dataset.section));
$('#openCounter').onclick=()=>switchSection('counter');

async function loadStatus(){
  status = await api('/api/status');
  $('#ddVersion').textContent=status.ddragon;
  $('#patchLive').textContent=status.metaPatch==='live-data' ? 'LIVE' : status.metaPatch;
  $('#datasetMode').textContent=status.metaMode==='demo'?'DEMO':status.metaMode.toUpperCase();
  $('#datasetNote').textContent=status.riotApiConfigured?'Riot API đã kết nối':'Chưa cấu hình Riot API key';
  $('#statusBadge').textContent=`VN2 • ${status.riotApiConfigured?'RIOT API ON':'DEMO DATA'}`;
}

async function loadChampionIndex(){
  const data=await api('/api/champions');
  championIndex=data.champions;
  $('#championList').innerHTML=championIndex.map(c=>`<option value="${c.name}">${c.id}</option>`).join('');
}

function fmt(n){return Number(n||0).toFixed(1)+'%'}
function renderRows(data){
  if(data.mode==='demo'){$('#dataWarning').classList.remove('hidden');$('#dataWarning').textContent='⚠ '+data.notice}else{$('#dataWarning').classList.add('hidden')}
  const rows=data.champions;
  $('#metaRows').innerHTML=rows.length?rows.map((x,i)=>`<tr>
    <td>${i+1}</td>
    <td><div class="champ"><img src="${x.image||''}" alt=""><div><b>${x.name}</b><small>${x.reason||''}</small></div></div></td>
    <td><span class="role">${roleName[x.role]||x.role}</span></td>
    <td><span class="tier tier-${x.tier}">${x.tier}</span></td>
    <td><b>${fmt(x.winRate)}</b></td><td>${fmt(x.pickRate)}</td>
    <td><span class="trend ${x.trend>=0?'up':'down'}">${x.trend>=0?'▲':'▼'} ${Math.abs(x.trend||0).toFixed(1)}</span></td>
    <td><span class="verdict">${x.verdict}</span></td>
    <td><button class="detail-btn" data-id="${x.id}">Chi tiết</button></td>
  </tr>`).join(''):'<tr><td colspan="9" class="loading">Không có dữ liệu phù hợp.</td></tr>';
  $$('.detail-btn').forEach(b=>b.onclick=()=>openChampion(b.dataset.id));
}

async function loadMeta(){
  const qs=new URLSearchParams({role:$('#role').value,tier:$('#tier').value,search:$('#search').value});
  try{renderRows(await api('/api/meta?'+qs))}catch(e){$('#metaRows').innerHTML=`<tr><td colspan="9" class="loading">${e.message}</td></tr>`}
}
$('#role').onchange=loadMeta;$('#tier').onchange=loadMeta;let st;$('#search').oninput=()=>{clearTimeout(st);st=setTimeout(loadMeta,180)};

async function openChampion(id){
  const data=await api('/api/champion/'+encodeURIComponent(id));
  const c=data.champion,m=data.meta;
  const splash=`https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${c.id}_0.jpg`;
  $('#modalContent').innerHTML=`
    <div class="detail-head" style="background-image:url('${splash}')"><div><div class="eyebrow">${m?`${m.tier} TIER • ${m.verdict}`:'CHAMPION'}</div><h2>${c.name}</h2><span>${c.title}</span></div></div>
    <div class="detail-body"><div><h3>Phân tích</h3><p>${m?.reason||c.lore}</p><h3>Kỹ năng</h3><div class="spell-list">${c.spells.map(s=>`<div class="spell"><img src="https://ddragon.leagueoflegends.com/cdn/${data.version}/img/spell/${s.image.full}"><b>${s.name}</b></div>`).join('')}</div></div>
    <div class="matchup-box"><h3>Chỉ số dataset</h3>${m?`<p>Win rate <b>${fmt(m.winRate)}</b></p><p>Pick rate <b>${fmt(m.pickRate)}</b></p><p>Vị trí <b>${roleName[m.role]}</b></p><button class="primary" onclick="showCounterById('${c.id}')">Xem counter</button>`:'<p>Chưa có dữ liệu meta cho tướng này.</p>'}</div></div>`;
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
    const d=await api('/api/counter/'+encodeURIComponent(c.id));
    const list=(arr,label)=>arr.map((x,i)=>`<div class="mini-champ"><img src="${x.image||''}"><div><b>${i+1}. ${x.name}</b><br><span>${x.stats?`${x.stats.tier} tier • ${fmt(x.stats.winRate)} WR`:label}</span></div></div>`).join('')||'<p>Chưa đủ sample.</p>';
    $('#counterResult').innerHTML=`<div class="counter-hero"><img src="${c.image}"><div><div class="eyebrow">ĐỐI THỦ ĐÃ PICK</div><h2>${c.name}</h2><span>${roleName[d.champion.role]||d.champion.role} • Patch ${d.patch}</span></div></div>
    ${d.mode==='demo'?'<div class="notice">Matchup hiện là dữ liệu minh họa. Collector Match‑V5 sẽ thay thế tự động khi bạn build dataset thật.</div>':''}
    <div class="counter-columns"><div class="matchup-box"><h3>🔥 Nên pick để counter</h3>${list(d.counters,'Counter')}</div><div class="matchup-box"><h3>⚠ ${c.name} thường đánh tốt vào</h3>${list(d.goodAgainst,'Good matchup')}</div></div>`;
  }catch(e){$('#counterResult').innerHTML=`<div class="notice">${e.message}</div>`}
}
$('#counterBtn').onclick=()=>runCounter();$('#counterInput').addEventListener('keydown',e=>{if(e.key==='Enter')runCounter()});

let patchesLoaded=false;
async function loadPatches(){
  if(patchesLoaded)return;patchesLoaded=true;
  try{const d=await api('/api/patches');$('#patchGrid').innerHTML=d.patches.map((p,i)=>`<a class="patch-card" target="_blank" rel="noreferrer" href="${p.url}"><div class="eyebrow">${i===0?'LATEST • RIOT GAMES':'RIOT GAMES'}</div><div class="patch-num">${p.patch}</div><p>${p.title}</p><b>Đọc patch notes ↗</b></a>`).join('')}catch(e){$('#patchGrid').innerHTML=`<div class="notice">${e.message}</div>`}
}

(async()=>{try{await Promise.all([loadStatus(),loadChampionIndex()]);await loadMeta()}catch(e){console.error(e);$('#statusBadge').textContent='Lỗi đồng bộ'}})();
