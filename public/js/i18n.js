const LANGUAGE_KEY = 'rift:language:v1';

const dictionary = {
  vi: {
    preferences: 'Hồ sơ',
    editPreferences: 'Đổi sở thích',
    welcomeTitle: 'Chào mừng đến Rift Meta Global',
    welcomeBack: 'Chào mừng trở lại',
    welcomeLead: 'Thiết lập nhanh hồ sơ của bạn để Rift Meta cá nhân hoá trải nghiệm League of Legends.',
    start: 'Bắt đầu',
    back: 'Quay lại',
    next: 'Tiếp tục',
    save: 'Lưu hồ sơ',
    finish: 'Hoàn tất',
    countryTitle: 'Bạn đang ở quốc gia nào?',
    countryLead: 'Thông tin này chỉ được lưu trên trình duyệt của bạn.',
    countryPlaceholder: 'Chọn quốc gia',
    teamTitle: 'Đội tuyển bạn yêu thích?',
    teamLead: 'Tìm trong directory đội tuyển chuyên nghiệp hiện tại.',
    teamPlaceholder: 'Ví dụ: T1, Gen.G, GAM Esports...',
    teamOptional: 'Có thể để trống nếu bạn chưa có đội yêu thích.',
    laneTitle: 'Vị trí / lane yêu thích của bạn?',
    laneLead: 'Rift Meta sẽ dùng lane này làm filter mặc định.',
    playerTitle: 'Tuyển thủ bạn yêu thích?',
    playerLead: 'Nhập IGN để tìm nhanh trong Global Esports Directory.',
    playerPlaceholder: 'Ví dụ: Faker, Chovy, Viper...',
    playerOptional: 'Có thể để trống và đổi lại bất kỳ lúc nào.',
    languageTitle: 'Chọn ngôn ngữ',
    languageLead: 'Bạn có thể đổi Tiếng Việt / English bất kỳ lúc nào.',
    vietnamese: 'Tiếng Việt',
    english: 'English',
    profileReady: 'Hồ sơ của bạn đã sẵn sàng',
    profileReadyLead: 'Các lựa chọn được lưu cục bộ trên thiết bị này.',
    country: 'Quốc gia',
    favoriteTeam: 'Đội yêu thích',
    favoriteLane: 'Lane yêu thích',
    favoritePlayer: 'Tuyển thủ yêu thích',
    language: 'Ngôn ngữ',
    notSelected: 'Chưa chọn',
    allRoles: 'Tất cả vị trí',
    top: 'Đường trên',
    jungle: 'Đi rừng',
    middle: 'Đường giữa',
    bottom: 'Xạ thủ',
    utility: 'Hỗ trợ',
    myRiftProfile: 'HỒ SƠ RIFT CỦA BẠN',
    personalizedForYou: 'Cá nhân hoá cho bạn',
    viewFavoritePlayer: 'Xem tuyển thủ',
    edit: 'Chỉnh sửa',
    loadingTeams: 'Đang tải danh sách đội...',
    noTeamMatch: 'Không tìm thấy đội khớp hoàn toàn; bạn vẫn có thể lưu tên đã nhập.',
    saved: 'Đã lưu sở thích của bạn.',
    latestRiot: 'MỚI NHẤT • RIOT GAMES',
    riotGames: 'RIOT GAMES',
    cached: 'BỘ NHỚ ĐỆM',
    readPatch: 'Đọc Patch Notes chính thức ↗',
    patchUnavailable: 'Chưa đọc được Patch Notes.',
    syncError: 'Lỗi đồng bộ'
  },
  en: {
    preferences: 'Profile',
    editPreferences: 'Edit preferences',
    welcomeTitle: 'Welcome to Rift Meta Global',
    welcomeBack: 'Welcome back',
    welcomeLead: 'Set up a quick profile so Rift Meta can personalize your League of Legends experience.',
    start: 'Get started',
    back: 'Back',
    next: 'Continue',
    save: 'Save profile',
    finish: 'Finish',
    countryTitle: 'Which country are you in?',
    countryLead: 'This information is stored only in your browser.',
    countryPlaceholder: 'Select your country',
    teamTitle: 'What is your favorite team?',
    teamLead: 'Search the current professional team directory.',
    teamPlaceholder: 'For example: T1, Gen.G, GAM Esports...',
    teamOptional: 'You can leave this empty if you do not have a favorite team yet.',
    laneTitle: 'What is your favorite role / lane?',
    laneLead: 'Rift Meta will use this lane as your default filter.',
    playerTitle: 'Who is your favorite pro player?',
    playerLead: 'Enter an IGN to search the Global Esports Directory.',
    playerPlaceholder: 'For example: Faker, Chovy, Viper...',
    playerOptional: 'You can leave this empty and change it at any time.',
    languageTitle: 'Choose your language',
    languageLead: 'You can switch between English and Vietnamese at any time.',
    vietnamese: 'Vietnamese',
    english: 'English',
    profileReady: 'Your profile is ready',
    profileReadyLead: 'Your choices are stored locally on this device.',
    country: 'Country',
    favoriteTeam: 'Favorite team',
    favoriteLane: 'Favorite lane',
    favoritePlayer: 'Favorite player',
    language: 'Language',
    notSelected: 'Not selected',
    allRoles: 'All roles',
    top: 'Top',
    jungle: 'Jungle',
    middle: 'Mid',
    bottom: 'ADC',
    utility: 'Support',
    myRiftProfile: 'YOUR RIFT PROFILE',
    personalizedForYou: 'Personalized for you',
    viewFavoritePlayer: 'View player',
    edit: 'Edit',
    loadingTeams: 'Loading teams...',
    noTeamMatch: 'No exact team match found; you can still save the name you entered.',
    saved: 'Your preferences have been saved.',
    latestRiot: 'LATEST • RIOT GAMES',
    riotGames: 'RIOT GAMES',
    cached: 'CACHED',
    readPatch: 'Read official Patch Notes ↗',
    patchUnavailable: 'Patch Notes are currently unavailable.',
    syncError: 'Sync error'
  }
};

const bindings = [
  ['.nav-btn[data-section="dashboard"]', 'Tổng quan', 'Overview'],
  ['.nav-btn[data-section="meta"]', 'Meta', 'Meta'],
  ['.nav-btn[data-section="counter"]', 'Counter', 'Counter'],
  ['.nav-btn[data-section="assets"]', 'Kho dữ liệu', 'Data Vault'],
  ['.nav-btn[data-section="esports"]', 'Tuyển thủ', 'Pro Players'],
  ['.nav-btn[data-section="patch"]', 'Patch', 'Patch'],
  ['.global-ribbon', 'GLOBAL HIGH-ELO • LIVE DATA', 'GLOBAL HIGH-ELO • LIVE DATA'],
  ['#dashboard .hero-content .eyebrow', 'LEAGUE OF LEGENDS • GLOBAL ANALYTICS • ESPORTS', 'LEAGUE OF LEGENDS • GLOBAL ANALYTICS • ESPORTS'],
  ['#dashboard .hero-content h1', 'Đọc meta.<br><span>Hiểu trận đấu.</span>', 'Read the meta.<br><span>Understand the game.</span>', 'html'],
  ['#dashboard .hero-content > p', 'Meta High‑Elo trên nhiều server Riot toàn thế giới, counter theo lane, build/ngọc/phép phổ biến, biến động sức mạnh và hồ sơ tuyển thủ chuyên nghiệp trong cùng một hệ thống.', 'High-Elo meta across Riot servers worldwide, lane counters, popular builds/runes/spells, power trends and professional player profiles in one system.'],
  ['.hero-actions [data-go="meta"]', 'Xem Tier List', 'View Tier List'],
  ['.hero-actions [data-go="patch"]', 'Xem Riot Update', 'View Riot Updates'],
  ['.hero-actions [data-go="esports"]', 'Khám phá tuyển thủ', 'Explore Pro Players'],
  ['#dashboard .section-intro.compact:nth-of-type(1) h2', 'Dữ liệu Global đang chạy thật', 'Live Global data'],
  ['#coverageText', 'Đang tải coverage...', 'Loading coverage...'],
  ['#latestPatchLive .intel-muted', 'Đang đọc Patch Notes mới nhất...', 'Loading latest Patch Notes...'],
  ['#datasetAge', 'Đang kiểm tra...', 'Checking...'],
  ['.movers-panel-head h3', 'Tướng tăng / giảm sức mạnh trong dữ liệu Global', 'Champion risers / fallers in Global data'],
  ['#meta .section-intro h2', 'Tier List High‑Elo toàn cầu', 'Global High-Elo Tier List'],
  ['#search', 'Tìm tướng...', 'Search champions...', 'placeholder'],
  ['#role option[value="ALL"]', 'Tất cả vị trí', 'All roles'],
  ['#tier option[value="ALL"]', 'Tất cả tier', 'All tiers'],
  ['#counter .section-intro h2', 'Counter theo lane', 'Lane counters'],
  ['#counterInput', 'Ví dụ: Gwen, Ahri, Jinx...', 'For example: Gwen, Ahri, Jinx...', 'placeholder'],
  ['#counterRole option[value=""]', 'Tự nhận lane', 'Auto-detect lane'],
  ['#counterBtn', 'Phân tích', 'Analyze'],
  ['#assets .section-intro h2', 'Kho dữ liệu game', 'Game Data Vault'],
  ['.asset-tab[data-asset="champions"]', 'Tướng', 'Champions'],
  ['.asset-tab[data-asset="items"]', 'Trang bị', 'Items'],
  ['.asset-tab[data-asset="runes"]', 'Ngọc', 'Runes'],
  ['#assetSearch', 'Tìm trong kho...', 'Search the vault...', 'placeholder'],
  ['#esports .section-intro h2', 'Tuyển thủ chuyên nghiệp toàn cầu', 'Global Professional Players'],
  ['#playerSearch', 'Tìm Faker, Chovy, đội tuyển...', 'Search Faker, Chovy, teams...', 'placeholder'],
  ['#playerRole option[value="ALL"]', 'Mọi vị trí', 'All roles'],
  ['#playerRegion option[value="ALL"]', 'Mọi khu vực', 'All regions'],
  ['#playerTeam option[value="ALL"]', 'Mọi đội tuyển', 'All teams'],
  ['#prevPlayers', '← Trước', '← Previous'],
  ['#nextPlayers', 'Sau →', 'Next →'],
  ['#patch .section-intro h2', 'Patch Notes', 'Patch Notes']
];

const phrasePairs = [
  ['Đang đồng bộ', 'Syncing'],
  ['Đang tải dữ liệu...', 'Loading data...'],
  ['Đang tải meta...', 'Loading meta...'],
  ['Đang tải asset...', 'Loading assets...'],
  ['Đang tải tuyển thủ...', 'Loading players...'],
  ['Không tìm thấy tuyển thủ phù hợp.', 'No matching players found.'],
  ['Chọn một tướng để bắt đầu.', 'Choose a champion to get started.'],
  ['Xem hồ sơ & thống kê →', 'View profile & stats →'],
  ['Hồ sơ hiện tại', 'Current profile'],
  ['Tuyển thủ chuyên nghiệp', 'Professional player'],
  ['Hồ sơ công khai', 'Public profile'],
  ['Tên thật', 'Real name'],
  ['Ngày sinh', 'Birthday'],
  ['Tuổi', 'Age'],
  ['Quốc gia', 'Country'],
  ['Giải / khu vực', 'League / region'],
  ['Vị trí', 'Role'],
  ['Đội hiện tại', 'Current team'],
  ['Trận gần nhất trong dataset', 'Latest match in dataset'],
  ['Hợp đồng', 'Contract'],
  ['Champion pool', 'Champion pool'],
  ['Liên kết công khai', 'Public links'],
  ['Phong độ chuyên nghiệp', 'Professional performance'],
  ['Build / ngọc / spell nổi bật', 'Featured builds / runes / spells'],
  ['Build phổ biến', 'Popular builds'],
  ['Ngọc', 'Runes'],
  ['Danh hiệu & thành tích', 'Titles & achievements'],
  ['Tải thành tích', 'Load achievements'],
  ['Đang tải...', 'Loading...'],
  ['Đang tải hồ sơ tuyển thủ hiện tại...', 'Loading current player profile...'],
  ['Chưa có dữ liệu', 'No data yet'],
  ['Chưa có dữ liệu.', 'No data yet.'],
  ['Chưa có thống kê thi đấu gần đây.', 'No recent match statistics available.'],
  ['Mở nguồn hồ sơ/ảnh ↗', 'Open profile/image source ↗']
];

let language = (() => {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved === 'vi' || saved === 'en') return saved;
  } catch {}
  return navigator.language?.toLowerCase().startsWith('vi') ? 'vi' : 'en';
})();
let observer = null;

export function getLanguage() { return language; }
export function locale() { return language === 'vi' ? 'vi-VN' : 'en-US'; }
export function t(key, vars = {}) {
  let value = dictionary[language]?.[key] ?? dictionary.vi[key] ?? key;
  for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}

function setNodeValue(node, value, mode) {
  if (!node) return;
  if (mode === 'html') node.innerHTML = value;
  else if (mode === 'placeholder') node.setAttribute('placeholder', value);
  else node.textContent = value;
}

function applyBindings() {
  for (const [selector, vi, en, mode] of bindings) {
    const node = document.querySelector(selector);
    if (node) setNodeValue(node, language === 'vi' ? vi : en, mode);
  }
}

function translateTextNode(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  const raw = node.nodeValue || '';
  const trimmed = raw.trim();
  if (!trimmed) return;
  for (const [vi, en] of phrasePairs) {
    const from = language === 'vi' ? en : vi;
    const to = language === 'vi' ? vi : en;
    if (trimmed === from) {
      node.nodeValue = raw.replace(trimmed, to);
      return;
    }
  }
}

function translateTree(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root);
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current;
  while ((current = walker.nextNode())) translateTextNode(current);
}

export function applyInterfaceLanguage() {
  document.documentElement.lang = language;
  applyBindings();
  translateTree(document.body);
}

export function setLanguage(next, { persist = true, emit = true } = {}) {
  if (next !== 'vi' && next !== 'en') return language;
  language = next;
  if (persist) {
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch {}
  }
  applyInterfaceLanguage();
  if (emit) document.dispatchEvent(new CustomEvent('rift:language', { detail: language }));
  return language;
}

export function initI18n() {
  applyInterfaceLanguage();
  if (!observer && document.body) {
    observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) translateTree(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  return language;
}

export function onLanguageChange(callback) {
  const handler = event => callback(event.detail);
  document.addEventListener('rift:language', handler);
  return () => document.removeEventListener('rift:language', handler);
}
