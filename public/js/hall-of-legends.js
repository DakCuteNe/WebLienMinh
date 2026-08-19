import { api, esc, esportsMediaUrl, initials } from './shared.js';
import { getLanguage, onLanguageChange } from './i18n.js';

const VERSION = '3.13.1';
const OFFICIAL_HALL = 'https://halloflegends.leagueoflegends.com/';

const INDUCTEES = [
  {
    year: 2024,
    player: 'Faker',
    realName: 'Lee Sang-hyeok',
    role: 'MID',
    region: 'KOREA',
    legacyTeam: 'T1',
    mark: 'I',
    accent: '#d6aa57',
    title: { vi: 'Quỷ Vương Bất Tử', en: 'The Unkillable Demon King' },
    summary: {
      vi: 'Tuyển thủ đầu tiên được ghi danh. Faker trở thành chuẩn mực của sự bền bỉ, khả năng thích nghi và thành công ở sân khấu lớn nhất của Liên Minh Huyền Thoại.',
      en: 'The inaugural inductee. Faker became the benchmark for longevity, adaptation, and winning on League of Legends’ biggest stages.'
    },
    highlights: {
      vi: ['Người đầu tiên của Hall of Legends', '6× World Champion • 2× MSI Champion', 'Biểu tượng định nghĩa nhiều kỷ nguyên của T1 và LoL Esports'],
      en: ['First Hall of Legends inductee', '6× World Champion • 2× MSI Champion', 'An icon who defined multiple eras of T1 and LoL Esports']
    },
    cosmetics: { vi: 'Ahri Huyền Thoại Bất Tử • Ahri / LeBlanc Huyền Thoại Trỗi Dậy', en: 'Immortalized Legend Ahri • Risen Legend Ahri / LeBlanc' }
  },
  {
    year: 2025,
    player: 'Uzi',
    realName: 'Jian Zi-Hao',
    role: 'ADC',
    region: 'CHINA',
    legacyTeam: 'Royal Never Give Up',
    mark: 'II',
    accent: '#e24d45',
    title: { vi: 'Mad Dog', en: 'The Mad Dog' },
    summary: {
      vi: 'Tuyển thủ thứ hai được vinh danh. Uzi là một trong những xạ thủ có ảnh hưởng lớn nhất lịch sử, nổi tiếng với cơ chế cá nhân, áp lực đường dưới và sức hút với người hâm mộ LPL.',
      en: 'The second inductee. Uzi is one of the most influential bot laners ever, renowned for mechanical precision, lane pressure, and his impact on the LPL fanbase.'
    },
    highlights: {
      vi: ['Tuyển thủ thứ hai của Hall of Legends', 'MSI 2018 Champion • đỉnh cao quốc nội năm 2018', 'Hai lần vào Chung kết CKTG 2013 và 2014'],
      en: ['Second Hall of Legends inductee', 'MSI 2018 Champion • dominant domestic 2018 season', 'Back-to-back Worlds finalist in 2013 and 2014']
    },
    cosmetics: { vi: "Kai'Sa Huyền Thoại Bất Tử • Kai'Sa / Vayne Huyền Thoại Trỗi Dậy", en: "Immortalized Legend Kai'Sa • Risen Legend Kai'Sa / Vayne" }
  }
];

const COPY = {
  vi: {
    nav: 'Huyền Thoại',
    eyebrow: 'LOL ESPORTS • HALL OF LEGENDS',
    title: 'Đại Sảnh <span>Huyền Thoại</span>',
    lead: 'Nơi LoL Esports lưu danh những tuyển thủ đã định hình lịch sử thi đấu chuyên nghiệp và truyền cảm hứng cho hàng triệu người hâm mộ.',
    inductees: 'Tuyển thủ được vinh danh', regions: 'Khu vực đã có đại diện', since: 'Bắt đầu từ', latest: 'Mới nhất',
    inducted: 'HALL OF LEGENDS INDUCTEE', legacy: 'Di sản', career: 'Dấu ấn sự nghiệp', cosmetics: 'Nội dung kỷ niệm',
    profile: 'Mở hồ sơ tuyển thủ', official: 'Trang Hall of Legends chính thức', all: 'Những cái tên đã được lưu danh',
    source: 'Nguồn chính: Hall of Legends / LoL Esports. Web chỉ đánh dấu tuyển thủ 2026 sau khi Riot công bố chính thức.',
    current: 'MỚI NHẤT',
    upcoming: '2026 • SẮP TỚI',
    pending: 'Chưa công bố',
    upcomingNote: 'Riot đã xác nhận Hall of Legends sẽ trở lại trước CKTG 2026, nhưng tuyển thủ thứ ba hiện chưa được công bố. Mục này sẽ được cập nhật ngay khi có thông báo chính thức.'
  },
  en: {
    nav: 'Legends',
    eyebrow: 'LOL ESPORTS • HALL OF LEGENDS',
    title: 'Hall of <span>Legends</span>',
    lead: 'LoL Esports’ hall of fame for the pros who shaped competitive League history and inspired millions of fans around the world.',
    inductees: 'Inductees', regions: 'Represented regions', since: 'Established', latest: 'Latest',
    inducted: 'HALL OF LEGENDS INDUCTEE', legacy: 'Legacy', career: 'Career marks', cosmetics: 'Commemorative content',
    profile: 'Open pro profile', official: 'Official Hall of Legends', all: 'The legends enshrined so far',
    source: 'Primary sources: Hall of Legends / LoL Esports. The site only marks a 2026 inductee after Riot officially announces one.',
    current: 'LATEST',
    upcoming: '2026 • UPCOMING',
    pending: 'Not announced',
    upcomingNote: 'Riot has confirmed Hall of Legends will return ahead of Worlds 2026, but the third inductee has not been announced yet. This section will update after the official reveal.'
  }
};

let section = null;
let navButton = null;
let activeYear = 2025;
let sectionObserver = null;
let mediaPromise = null;
const portraits = new Map();

function lang() { return getLanguage() === 'en' ? 'en' : 'vi'; }
function copy() { return COPY[lang()]; }
function text(value) { return typeof value === 'string' ? value : value?.[lang()] || value?.vi || ''; }
function selected() { return INDUCTEES.find(row => row.year === activeYear) || INDUCTEES[INDUCTEES.length - 1]; }

function ensureCss() {
  if (document.querySelector('link[data-hall-of-legends]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/hall-of-legends.css?v=${VERSION}`;
  link.dataset.hallOfLegends = 'true';
  document.head.appendChild(link);
}

function ensureStructure() {
  ensureCss();
  const nav = document.getElementById('nav');
  if (nav && !nav.querySelector('[data-section="hall"]')) {
    navButton = document.createElement('button');
    navButton.className = 'nav-btn';
    navButton.dataset.section = 'hall';
    const worlds = nav.querySelector('[data-section="worlds"]');
    const patch = nav.querySelector('[data-section="patch"]');
    nav.insertBefore(navButton, worlds || patch || null);
  } else {
    navButton = nav?.querySelector('[data-section="hall"]') || null;
  }

  const main = document.querySelector('main');
  if (main && !document.getElementById('hall')) {
    section = document.createElement('section');
    section.id = 'hall';
    section.className = 'page-section hol-section';
    const worldsSection = document.getElementById('worlds');
    main.insertBefore(section, worldsSection || null);
  } else {
    section = document.getElementById('hall');
  }

  if (section && !sectionObserver) {
    const sync = () => document.body.classList.toggle('hall-legends-active', section.classList.contains('active-section'));
    sectionObserver = new MutationObserver(sync);
    sectionObserver.observe(section, { attributes: true, attributeFilter: ['class'] });
    sync();
  }
}

function portraitHtml(row, extraClass = '') {
  const url = portraits.get(row.player);
  return `<div class="hol-portrait ${extraClass}" style="--hol-accent:${row.accent}">
    ${url ? `<img src="${esc(url)}" alt="${esc(row.player)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden')">` : ''}
    <span class="hol-portrait-fallback ${url ? 'hidden' : ''}">${esc(initials(row.player))}</span>
    <i class="hol-portrait-rim"></i>
  </div>`;
}

function timelineHtml() {
  const c = copy();
  const confirmed = INDUCTEES.map(row => `
    <button type="button" role="tab" aria-selected="${row.year === activeYear}" class="hol-year ${row.year === activeYear ? 'active' : ''}" data-hol-year="${row.year}" style="--hol-accent:${row.accent}">
      <small>${row.year}</small><b>${esc(row.player)}</b><span>${esc(row.mark)}</span>
    </button>`).join('');
  const upcoming = `
    <button type="button" class="hol-year" style="--hol-accent:#f3e7c5" disabled aria-disabled="true" title="${esc(c.upcomingNote)}">
      <small>${esc(c.upcoming)}</small><b>${esc(c.pending)}</b><span>III</span>
    </button>`;
  return `<div class="hol-timeline" role="tablist" aria-label="Hall of Legends inductees">${confirmed}${upcoming}</div>`;
}

function spotlightHtml(row) {
  const c = copy();
  const latest = row.year === INDUCTEES[INDUCTEES.length - 1].year;
  return `<article class="hol-spotlight" style="--hol-accent:${row.accent}">
    <div class="hol-stage" aria-hidden="true"><span></span><span></span><span></span><i></i></div>
    <div class="hol-spotlight-art">
      <div class="hol-roman">${esc(row.mark)}</div>
      ${portraitHtml(row, 'hol-portrait-large')}
      <div class="hol-year-watermark">${row.year}</div>
    </div>
    <div class="hol-spotlight-copy">
      <div class="hol-kicker"><span>${esc(c.inducted)}</span>${latest ? `<b>✦ ${esc(c.current)}</b>` : ''}</div>
      <h2>${esc(row.player)}</h2>
      <p class="hol-real-name">${esc(row.realName)} • ${esc(row.role)} • ${esc(row.region)}</p>
      <h3>${esc(text(row.title))}</h3>
      <p class="hol-summary">${esc(text(row.summary))}</p>
      <div class="hol-legacy-line"><small>${esc(c.legacy)}</small><b>${esc(row.legacyTeam)}</b></div>
      <div class="hol-highlight-block"><small>${esc(c.career)}</small><div>${row.highlights[lang()].map(item => `<span>✦ ${esc(item)}</span>`).join('')}</div></div>
      <div class="hol-cosmetics"><small>${esc(c.cosmetics)}</small><b>${esc(text(row.cosmetics))}</b></div>
      <div class="hol-actions">
        <button type="button" class="primary hol-profile" data-hol-player="${esc(row.player)}">${esc(c.profile)} →</button>
        <a class="secondary" href="${OFFICIAL_HALL}" target="_blank" rel="noreferrer">${esc(c.official)} ↗</a>
      </div>
    </div>
  </article>`;
}

function galleryHtml() {
  const c = copy();
  return `<div class="hol-gallery-head"><div><div class="eyebrow">2024 — 2026</div><h3>${esc(c.all)}</h3></div><span>${INDUCTEES.length}</span></div>
    <div class="hol-gallery">${INDUCTEES.map(row => `
      <button type="button" class="hol-card ${row.year === activeYear ? 'active' : ''}" data-hol-card="${row.year}" style="--hol-accent:${row.accent}">
        ${portraitHtml(row)}
        <div class="hol-card-copy"><small>${row.year} • ${esc(row.role)}</small><h4>${esc(row.player)}</h4><p>${esc(row.realName)}</p><span>${esc(row.region)} • ${esc(row.legacyTeam)}</span></div>
        <b class="hol-card-mark">${esc(row.mark)}</b>
      </button>`).join('')}</div>`;
}

function navigateToPlayer(player) {
  document.dispatchEvent(new CustomEvent('rift:navigate', { detail: 'esports' }));
  let tries = 0;
  const timer = setInterval(() => {
    const input = document.getElementById('playerSearch');
    if (input) {
      input.value = player;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      clearInterval(timer);
      return;
    }
    if (++tries > 18) clearInterval(timer);
  }, 80);
}

function bind() {
  section?.querySelectorAll('[data-hol-year], [data-hol-card]').forEach(button => {
    button.addEventListener('click', () => {
      const year = Number(button.dataset.holYear || button.dataset.holCard);
      if (!year || year === activeYear) return;
      activeYear = year;
      render(true);
      section?.querySelector('.hol-spotlight')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
  section?.querySelectorAll('[data-hol-player]').forEach(button => button.addEventListener('click', () => navigateToPlayer(button.dataset.holPlayer)));
}

function render(animate = false) {
  if (!section) return;
  const c = copy();
  const row = selected();
  if (navButton) navButton.textContent = c.nav;
  document.documentElement.style.setProperty('--hol-accent', row.accent);
  section.innerHTML = `<div class="hol-shell ${animate ? 'hol-switching' : ''}">
    <header class="hol-hero">
      <div class="hol-hero-copy"><div class="eyebrow">${esc(c.eyebrow)}</div><h1>${c.title}</h1><p>${esc(c.lead)}</p></div>
      <div class="hol-stats">
        <div><small>${esc(c.inductees)}</small><b>${INDUCTEES.length}</b></div>
        <div><small>${esc(c.regions)}</small><b>2</b></div>
        <div><small>${esc(c.since)}</small><b>2024</b></div>
        <div><small>${esc(c.latest)}</small><b>UZI • 2025</b></div>
      </div>
    </header>
    ${timelineHtml()}
    <div class="hol-cosmetics" style="--hol-accent:#f3e7c5"><small>${esc(c.upcoming)}</small><b>${esc(c.upcomingNote)}</b></div>
    ${spotlightHtml(row)}
    ${galleryHtml()}
    <p class="hol-source">ⓘ ${esc(c.source)}</p>
  </div>`;
  bind();
  if (animate) setTimeout(() => section?.querySelector('.hol-shell')?.classList.remove('hol-switching'), 900);
}

async function resolvePlayerMedia(row) {
  try {
    const params = new URLSearchParams({ page: '1', limit: '8', search: row.player, role: 'ALL', region: 'ALL', team: 'ALL' });
    const data = await api('/api/esports?' + params.toString());
    const players = data.players || [];
    const exact = players.find(player => String(player.id || '').toLowerCase() === row.player.toLowerCase()) || players[0];
    if (!exact) return;
    const key = exact.uid || exact.identityId || exact.overviewPage || exact.id || row.player;
    portraits.set(row.player, exact.preferredImage || esportsMediaUrl('player', key));
  } catch {
    portraits.set(row.player, esportsMediaUrl('player', row.player));
  }
}

export async function ensureHallOfLegends() {
  if (mediaPromise) return mediaPromise;
  mediaPromise = Promise.all(INDUCTEES.map(resolvePlayerMedia)).then(() => render());
  return mediaPromise;
}

export function initHallOfLegends() {
  ensureStructure();
  render();
  onLanguageChange(() => render());
}
