/* ================================================================
   VocabPro — app.js
   Flashcard app for English vocabulary in Japanese manufacturing companies
   ================================================================ */

'use strict';

/* ================================================================
   STATE
   ================================================================ */
const state = {
  allCards:       [],       // All vocabulary loaded from JSON
  filteredCards:  [],       // Cards after category/search/fav filter
  currentIndex:   0,        // Index in filteredCards
  isFlipped:      false,    // Card flip state

  mode:            'en-vi', // 'en-vi' | 'vi-en'
  currentCategory: 'all',   // Selected category key
  searchQuery:     '',
  showFavOnly:     false,

  favorites:    new Set(),  // Set of card IDs
  learnedCards: new Set(),  // Set of card IDs
  hardCards:    new Set(),  // Set of card IDs

  darkMode: false,

  // Quiz state
  quizMode:      false,
  quizQueue:     [],        // Shuffled cards for quiz
  quizIndex:     0,
  quizCorrect:   0,
  quizWrong:     0,
  quizStreak:    0,
  quizBestStreak:0,
  quizAnswered:  false,
  quizOptions:   [],
  quizAnswerIdx: -1,        // Index of correct option

  // Dashboard collapse
  dashboardOpen: true,
};

/* ================================================================
   CATEGORY CONFIG — icon mapping
   ================================================================ */
const CATEGORY_ICONS = {
  'all':                  '🌐',
  'ISO Terms':            '📋',
  'Audit':                '🔍',
  'Quality Control':      '✅',
  'Production':           '⚙️',
  'Mechanical Parts':     '🔩',
  'Purchasing':           '🛒',
  'Logistics':            '🚚',
  'Kaizen':               '🔄',
  'QCC':                  '👥',
  'Office Email':         '📧',
  'Meeting English':      '💼',
  'Customer Complaint':   '📣',
  'Supplier Management':  '🤝',
  'Safety & Environment': '🦺',
  'Business Communication': '💬',
  'HR & Admin':             '🗂️',
  'Engineering':            '🔧',
};

/* ================================================================
   INIT
   ================================================================ */
async function init() {
  loadStateFromStorage();
  await loadData();
  buildCategoryList();
  applyFilter();
  renderCard();
  updateStats();
  applyDarkMode();
}

/* ================================================================
   DATA LOADING
   ================================================================ */
async function loadData() {
  try {
    const res = await fetch('./data.json');
    if (!res.ok) throw new Error('Fetch failed');
    const json = await res.json();
    state.allCards = json;
  } catch {
    // Fallback: empty (user can import via button)
    state.allCards = [];
    showToast('⚠️ Không tải được data.json. Dùng nút 📥 để nhập dữ liệu.');
  }
}

/* ================================================================
   FILTER & SEARCH
   ================================================================ */
function applyFilter() {
  let cards = [...state.allCards];

  // Category
  if (state.currentCategory !== 'all') {
    cards = cards.filter(c => c.category === state.currentCategory);
  }

  // Favorites only
  if (state.showFavOnly) {
    cards = cards.filter(c => state.favorites.has(c.id));
  }

  // Search
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    cards = cards.filter(c =>
      c.english.toLowerCase().includes(q) ||
      c.vietnamese.toLowerCase().includes(q) ||
      (c.tags || []).some(t => t.toLowerCase().includes(q)) ||
      c.category.toLowerCase().includes(q)
    );
  }

  state.filteredCards = cards;

  // Keep current index in bounds
  if (state.currentIndex >= state.filteredCards.length) {
    state.currentIndex = 0;
  }

  updateFilterInfo();
}

function setCategory(cat) {
  state.currentCategory = cat;
  state.currentIndex = 0;
  state.isFlipped = false;
  applyFilter();
  renderCard();
  updateStats();

  // Update active state on sidebar
  document.querySelectorAll('.cat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.cat === cat);
  });

  closeSidebar();
}

function handleSearch(query) {
  state.searchQuery = query;
  state.currentIndex = 0;
  state.isFlipped = false;
  applyFilter();
  renderCard();

  document.getElementById('searchClear').style.display = query ? 'block' : 'none';
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  handleSearch('');
}

function updateFilterInfo() {
  const el = document.getElementById('cardFilterInfo');
  const parts = [];
  if (state.currentCategory !== 'all') parts.push(state.currentCategory);
  if (state.showFavOnly) parts.push('Yêu thích');
  if (state.searchQuery) parts.push(`"${state.searchQuery}"`);
  el.textContent = parts.length ? `Lọc: ${parts.join(' · ')}` : '';
}

/* ================================================================
   RENDER CARD
   ================================================================ */
function renderCard() {
  const cards = state.filteredCards;

  // Empty state
  if (!cards.length) {
    setCardEmpty();
    return;
  }

  const card = cards[state.currentIndex];
  const isEnVi = state.mode === 'en-vi';

  // Unflip card first (reset)
  const flashcard = document.getElementById('flashcard');
  flashcard.classList.remove('flipped');
  state.isFlipped = false;

  // Front
  document.getElementById('cardCategory').textContent = card.category;
  document.getElementById('cardWord').textContent = isEnVi ? card.english : card.vietnamese;

  // Back
  document.getElementById('cardTranslation').textContent = isEnVi ? card.vietnamese : card.english;
  document.getElementById('exampleEn').textContent = card.example    || '';
  document.getElementById('exampleVi').textContent = card.example_vi || '';

  // Tags
  const tagsEl = document.getElementById('cardTags');
  tagsEl.innerHTML = (card.tags || []).map(t => `<span class="tag-chip">${t}</span>`).join('');

  // Level badge
  const badge = document.getElementById('levelBadge');
  badge.textContent = card.level || 'Basic';
  badge.className = 'level-badge';
  if (card.level === 'Intermediate') badge.classList.add('level-intermediate');
  if (card.level === 'Advanced')     badge.classList.add('level-advanced');

  // Counter
  document.getElementById('cardCounter').textContent =
    `${state.currentIndex + 1} / ${cards.length}`;

  // Favorite button
  const favBtn = document.getElementById('favBtn');
  const isFav = state.favorites.has(card.id);
  favBtn.textContent = isFav ? '★' : '☆';
  favBtn.title = isFav ? 'Bỏ yêu thích' : 'Thêm yêu thích';
  favBtn.classList.toggle('is-fav', isFav);

  // Progress bar
  updateProgressBar();
}

function setCardEmpty() {
  document.getElementById('cardWord').textContent = 'Không có từ nào';
  document.getElementById('cardTranslation').textContent = '—';
  document.getElementById('exampleEn').textContent = '';
  document.getElementById('exampleVi').textContent = '';
  document.getElementById('cardTags').innerHTML = '';
  document.getElementById('cardCounter').textContent = '0 / 0';
  document.getElementById('levelBadge').textContent = '—';
}

function updateProgressBar() {
  const total = state.filteredCards.length;
  const learned = state.filteredCards.filter(c => state.learnedCards.has(c.id)).length;
  const pct = total > 0 ? Math.round((learned / total) * 100) : 0;

  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressLearnedLabel').textContent = `${learned} đã thuộc`;
  document.getElementById('progressPctLabel').textContent = pct + '%';
  document.getElementById('progressTotalLabel').textContent = `${total} từ`;
}

/* ================================================================
   FLIP
   ================================================================ */
function flipCard() {
  if (!state.filteredCards.length) return;
  state.isFlipped = !state.isFlipped;
  document.getElementById('flashcard').classList.toggle('flipped', state.isFlipped);
}

/* ================================================================
   NAVIGATION
   ================================================================ */
function nextCard() {
  if (!state.filteredCards.length) return;
  state.currentIndex = (state.currentIndex + 1) % state.filteredCards.length;
  state.isFlipped = false;
  renderCard();
}

function prevCard() {
  if (!state.filteredCards.length) return;
  state.currentIndex = (state.currentIndex - 1 + state.filteredCards.length) % state.filteredCards.length;
  state.isFlipped = false;
  renderCard();
}

/* ================================================================
   SHUFFLE
   ================================================================ */
function shuffleCards() {
  // Fisher-Yates shuffle on filteredCards
  const arr = [...state.filteredCards];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  state.filteredCards = arr;
  state.currentIndex = 0;
  state.isFlipped = false;
  renderCard();
  showToast('🔀 Đã xáo bài!');
}

/* ================================================================
   MARK CARD
   ================================================================ */
function markCard(status) {
  if (!state.filteredCards.length) return;
  const card = state.filteredCards[state.currentIndex];

  if (status === 'learned') {
    state.learnedCards.add(card.id);
    state.hardCards.delete(card.id);
    showToast('✅ Đã đánh dấu thuộc!');
  } else {
    state.hardCards.add(card.id);
    state.learnedCards.delete(card.id);
    showToast('😓 Đã đánh dấu khó — sẽ ôn lại!');
  }

  saveStateToStorage();
  updateStats();

  // Auto-advance to next
  setTimeout(() => nextCard(), 350);
}

/* ================================================================
   FAVORITE
   ================================================================ */
function toggleFavorite() {
  if (!state.filteredCards.length) return;
  const card = state.filteredCards[state.currentIndex];

  if (state.favorites.has(card.id)) {
    state.favorites.delete(card.id);
    showToast('☆ Đã bỏ khỏi yêu thích');
  } else {
    state.favorites.add(card.id);
    showToast('⭐ Đã thêm vào yêu thích!');
  }

  saveStateToStorage();
  renderCard();
  updateStats();
}

function toggleFavoritesView() {
  state.showFavOnly = !state.showFavOnly;
  state.currentIndex = 0;
  state.isFlipped = false;

  const btn = document.getElementById('favToggleBtn');
  btn.classList.toggle('fav-active', state.showFavOnly);

  applyFilter();
  renderCard();
  updateStats();
  showToast(state.showFavOnly ? '⭐ Hiển thị từ yêu thích' : '📚 Hiển thị tất cả từ');
}

/* ================================================================
   MODE (EN→VI / VI→EN)
   ================================================================ */
function setMode(mode) {
  state.mode = mode;
  state.isFlipped = false;
  document.getElementById('modeEnVi').classList.toggle('active', mode === 'en-vi');
  document.getElementById('modeViEn').classList.toggle('active', mode === 'vi-en');
  renderCard();
  showToast(mode === 'en-vi' ? '🇬🇧 Chế độ: EN → VI' : '🇻🇳 Chế độ: VI → EN');
}

/* ================================================================
   RESET PROGRESS
   ================================================================ */
function resetProgress() {
  if (!confirm('Đặt lại tiến độ học? Trạng thái Đã thuộc và Khó sẽ bị xóa.')) return;
  state.learnedCards.clear();
  state.hardCards.clear();
  state.currentIndex = 0;
  state.isFlipped = false;
  saveStateToStorage();
  renderCard();
  updateStats();
  showToast('🔄 Đã đặt lại tiến độ!');
}

/* ================================================================
   SPEECH SYNTHESIS
   ================================================================ */
function speakWord(side) {
  if (!window.speechSynthesis) {
    showToast('⚠️ Trình duyệt không hỗ trợ phát âm');
    return;
  }

  if (!state.filteredCards.length) return;
  const card = state.filteredCards[state.currentIndex];
  const isEnVi = state.mode === 'en-vi';

  let text = '';
  let lang = 'en-US';

  if (side === 'front') {
    text = isEnVi ? card.english : card.vietnamese;
    lang = isEnVi ? 'en-US' : 'vi-VN';
  } else {
    text = isEnVi ? card.vietnamese : card.english;
    lang = isEnVi ? 'vi-VN' : 'en-US';
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

/* ================================================================
   QUIZ MODE
   ================================================================ */
function toggleQuizMode() {
  state.quizMode = !state.quizMode;

  document.getElementById('flashcardSection').classList.toggle('hidden', state.quizMode);
  document.getElementById('quizSection').classList.toggle('hidden', !state.quizMode);

  const btn = document.getElementById('quizToggleBtn');
  btn.innerHTML = state.quizMode
    ? '<span>📋</span><span class="btn-label">Học</span>'
    : '<span>📝</span><span class="btn-label">Quiz</span>';

  if (state.quizMode) {
    startQuiz();
  }
}

function startQuiz() {
  // Build quiz queue from current filtered cards (need at least 4 for options)
  const pool = state.filteredCards.length >= 4
    ? [...state.filteredCards]
    : [...state.allCards];

  // Shuffle pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  state.quizQueue = pool;
  state.quizIndex = 0;
  state.quizCorrect = 0;
  state.quizWrong = 0;
  state.quizStreak = 0;
  state.quizAnswered = false;

  renderQuiz();
  updateQuizScore();
}

function renderQuiz() {
  if (!state.quizQueue.length) return;

  const card = state.quizQueue[state.quizIndex % state.quizQueue.length];
  const isEnVi = state.mode === 'en-vi';

  state.quizAnswered = false;
  document.getElementById('quizNextBtn').style.display = 'none';

  // Question
  document.getElementById('quizQuestion').textContent = isEnVi ? card.english : card.vietnamese;
  document.getElementById('quizExample').textContent  = isEnVi
    ? (card.example || '')
    : (card.example_vi || '');

  // Generate 4 options: 1 correct + 3 random wrong
  const correct = isEnVi ? card.vietnamese : card.english;
  const pool = state.allCards.filter(c => c.id !== card.id);
  const wrongPool = shuffleArray(pool).slice(0, 3);
  const wrongAnswers = wrongPool.map(c => isEnVi ? c.vietnamese : c.english);

  const options = shuffleArray([correct, ...wrongAnswers]);
  state.quizOptions = options;
  state.quizAnswerIdx = options.indexOf(correct);

  const letters = ['A', 'B', 'C', 'D'];
  const grid = document.getElementById('quizOptions');
  grid.innerHTML = options.map((opt, i) => `
    <button
      class="quiz-option"
      onclick="checkAnswer(${i})"
      id="quizOpt${i}"
    >
      <span class="opt-letter">${letters[i]}</span>${escHtml(opt)}
    </button>
  `).join('');
}

function checkAnswer(selectedIdx) {
  if (state.quizAnswered) return;
  state.quizAnswered = true;

  const isCorrect = selectedIdx === state.quizAnswerIdx;
  const letters = ['A', 'B', 'C', 'D'];

  // Disable all options
  document.querySelectorAll('.quiz-option').forEach((btn, i) => {
    btn.disabled = true;
    if (i === state.quizAnswerIdx) btn.classList.add('correct');
    if (i === selectedIdx && !isCorrect) btn.classList.add('wrong');
  });

  if (isCorrect) {
    state.quizCorrect++;
    state.quizStreak++;
    if (state.quizStreak > state.quizBestStreak) state.quizBestStreak = state.quizStreak;
    showToast(`✅ Đúng! Chuỗi: ${state.quizStreak} 🔥`);
  } else {
    state.quizWrong++;
    state.quizStreak = 0;
    showToast('❌ Sai rồi! Xem đáp án đúng nhé.');
  }

  updateQuizScore();
  saveStateToStorage();

  // Show next button after short delay
  setTimeout(() => {
    document.getElementById('quizNextBtn').style.display = 'inline-flex';
  }, 600);
}

function nextQuiz() {
  state.quizIndex++;
  if (state.quizIndex >= state.quizQueue.length) {
    // Reshuffle for another round
    state.quizQueue = shuffleArray([...state.quizQueue]);
    state.quizIndex = 0;
    showToast('🎉 Hoàn thành một vòng! Bắt đầu lại...');
  }
  renderQuiz();
}

function updateQuizScore() {
  const total = state.quizCorrect + state.quizWrong;
  const accuracy = total > 0 ? Math.round((state.quizCorrect / total) * 100) + '%' : '—';

  document.getElementById('quizCorrect').textContent  = state.quizCorrect;
  document.getElementById('quizWrong').textContent    = state.quizWrong;
  document.getElementById('quizStreak').textContent   = state.quizStreak;
  document.getElementById('quizAccuracy').textContent = accuracy;

  // Update dashboard accuracy too
  document.getElementById('dashAccuracy').textContent = accuracy;
  document.getElementById('dashStreak').textContent   = state.quizBestStreak;
}

/* ================================================================
   STATS & DASHBOARD
   ================================================================ */
function updateStats() {
  const total   = state.allCards.length;
  const learned = state.learnedCards.size;
  const fav     = state.favorites.size;
  const hard    = state.hardCards.size;
  const total_filtered = state.filteredCards.length;

  // Sidebar mini stats
  document.getElementById('sStatTotal').textContent   = total;
  document.getElementById('sStatLearned').textContent = learned;
  document.getElementById('sStatFav').textContent     = fav;

  // Sidebar progress
  const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
  document.getElementById('sidebarProgressBar').style.width  = pct + '%';
  document.getElementById('sidebarProgressText').textContent = `${learned} / ${total} từ đã học`;
  document.getElementById('sidebarProgressPct').textContent  = pct + '%';

  // Dashboard KPI
  document.getElementById('dashTotal').textContent   = total;
  document.getElementById('dashLearned').textContent = learned;
  document.getElementById('dashFav').textContent     = fav;
  document.getElementById('dashHard').textContent    = hard;

  // Category breakdown
  renderCategoryBreakdown();

  // Update category counts in sidebar
  updateCategoryCounts();
}

function renderCategoryBreakdown() {
  const categories = [...new Set(state.allCards.map(c => c.category))];
  const container = document.getElementById('categoryBreakdown');

  container.innerHTML = categories.map(cat => {
    const catCards  = state.allCards.filter(c => c.category === cat);
    const catTotal  = catCards.length;
    const catLearned = catCards.filter(c => state.learnedCards.has(c.id)).length;
    const catPct    = catTotal > 0 ? Math.round((catLearned / catTotal) * 100) : 0;
    const icon      = CATEGORY_ICONS[cat] || '📌';

    return `
      <div class="cat-progress-item">
        <div class="cat-progress-header">
          <strong>${icon} ${escHtml(cat)}</strong>
          <span>${catLearned}/${catTotal} (${catPct}%)</span>
        </div>
        <div class="cat-progress-track">
          <div class="cat-progress-fill" style="width:${catPct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function updateCategoryCounts() {
  document.querySelectorAll('.cat-item').forEach(el => {
    const cat = el.dataset.cat;
    const countEl = el.querySelector('.cat-count');
    if (!countEl) return;
    if (cat === 'all') {
      countEl.textContent = state.allCards.length;
    } else {
      countEl.textContent = state.allCards.filter(c => c.category === cat).length;
    }
  });
}

/* ================================================================
   CATEGORY LIST (sidebar)
   ================================================================ */
function buildCategoryList() {
  const categories = ['all', ...new Set(state.allCards.map(c => c.category))];
  const list = document.getElementById('categoryList');

  list.innerHTML = categories.map(cat => {
    const count = cat === 'all'
      ? state.allCards.length
      : state.allCards.filter(c => c.category === cat).length;
    const icon   = CATEGORY_ICONS[cat] || '📌';
    const label  = cat === 'all' ? 'Tất cả' : cat;
    const active = cat === state.currentCategory ? 'active' : '';

    return `
      <li class="cat-item ${active}" data-cat="${escAttr(cat)}" onclick="setCategory('${escAttr(cat)}')">
        <span class="cat-name">${icon} ${escHtml(label)}</span>
        <span class="cat-count">${count}</span>
      </li>
    `;
  }).join('');
}

/* ================================================================
   DARK MODE
   ================================================================ */
function toggleDarkMode() {
  state.darkMode = !state.darkMode;
  applyDarkMode();
  saveStateToStorage();
  showToast(state.darkMode ? '🌙 Dark mode bật' : '☀️ Light mode bật');
}

function applyDarkMode() {
  document.body.classList.toggle('dark-mode', state.darkMode);
  document.getElementById('darkModeBtn').textContent = state.darkMode ? '☀️' : '🌙';
}

/* ================================================================
   DASHBOARD TOGGLE
   ================================================================ */
function toggleDashboard() {
  state.dashboardOpen = !state.dashboardOpen;
  document.getElementById('dashboardBody').style.display = state.dashboardOpen ? '' : 'none';
  document.getElementById('dashToggleIcon').textContent  = state.dashboardOpen ? '▼' : '▶';
}

/* ================================================================
   GUIDE MODAL
   ================================================================ */
function showGuide() {
  document.getElementById('guideModal').classList.remove('hidden');
}

function closeGuide() {
  document.getElementById('guideModal').classList.add('hidden');
}

function hideGuide(event) {
  if (event.target === document.getElementById('guideModal')) closeGuide();
}

/* ================================================================
   SIDEBAR OPEN / CLOSE
   ================================================================ */
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('visible');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
}

/* ================================================================
   EXPORT / IMPORT
   ================================================================ */
function exportData() {
  const data = JSON.stringify(state.allCards, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'vocabpro-data.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('📤 Đã xuất dữ liệu!');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) throw new Error('Invalid format');

      // Merge: add only cards with new IDs
      const existingIds = new Set(state.allCards.map(c => c.id));
      const newCards    = imported.filter(c => !existingIds.has(c.id));
      state.allCards    = [...state.allCards, ...newCards];

      buildCategoryList();
      applyFilter();
      renderCard();
      updateStats();
      saveStateToStorage();
      showToast(`📥 Đã nhập ${newCards.length} từ mới!`);
    } catch {
      showToast('❌ File không hợp lệ. Cần file JSON đúng định dạng.');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

/* ================================================================
   LOCAL STORAGE
   ================================================================ */
const STORAGE_KEY = 'vocabpro_state_v1';

function saveStateToStorage() {
  const toSave = {
    mode:           state.mode,
    currentCategory:state.currentCategory,
    darkMode:       state.darkMode,
    favorites:      [...state.favorites],
    learnedCards:   [...state.learnedCards],
    hardCards:      [...state.hardCards],
    quizCorrect:    state.quizCorrect,
    quizWrong:      state.quizWrong,
    quizBestStreak: state.quizBestStreak,
    allCards:       state.allCards,  // Persist imported data
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Storage may be full — fail silently
  }
}

function loadStateFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);

    state.mode           = saved.mode           || 'en-vi';
    state.currentCategory= saved.currentCategory|| 'all';
    state.darkMode       = saved.darkMode       || false;
    state.favorites      = new Set(saved.favorites    || []);
    state.learnedCards   = new Set(saved.learnedCards || []);
    state.hardCards      = new Set(saved.hardCards    || []);
    state.quizCorrect    = saved.quizCorrect    || 0;
    state.quizWrong      = saved.quizWrong      || 0;
    state.quizBestStreak = saved.quizBestStreak || 0;

    // Restore imported cards (if any were added)
    if (saved.allCards && saved.allCards.length > 0) {
      state.allCards = saved.allCards;
    }
  } catch {
    // Ignore corrupt storage
  }
}

/* ================================================================
   TOAST NOTIFICATION
   ================================================================ */
let toastTimeout = null;

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2400);
}

/* ================================================================
   UTILITIES
   ================================================================ */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'");
}

/* ================================================================
   KEYBOARD SHORTCUTS
   ================================================================ */
document.addEventListener('keydown', (e) => {
  // Skip when typing in input
  if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;

  switch (e.key) {
    case 'ArrowRight': case 'l': nextCard(); break;
    case 'ArrowLeft':  case 'h': prevCard(); break;
    case ' ':
    case 'f':
      e.preventDefault();
      flipCard();
      break;
    case 'g': markCard('learned'); break;
    case 'b': markCard('hard');    break;
    case 's': shuffleCards();      break;
    case 'd': toggleDarkMode();    break;
  }
});

/* ================================================================
   TOUCH / SWIPE SUPPORT
   ================================================================ */
(function () {
  let startX = 0, startY = 0;

  const viewport = document.getElementById('flashcard');
  if (!viewport) return;

  viewport.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  viewport.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;

    // Horizontal swipe (not vertical scroll)
    if (Math.abs(dx) > 60 && Math.abs(dy) < 80) {
      if (dx > 0) prevCard();
      else        nextCard();
    }
  }, { passive: true });
})();

/* ================================================================
   BOOT
   ================================================================ */
document.addEventListener('DOMContentLoaded', init);
