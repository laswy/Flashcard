/* ================================================================
   Vocabulary Rain — game.js
   Falling vocabulary typing mini-game
   ================================================================ */

'use strict';

/* ================================================================
   CONFIG
   ================================================================ */

const DIFF = {
  easy: {
    label:     'Easy',
    speed:     42,        // px / sec at game start
    spawnMs:   3600,      // ms between spawns
    maxScreen: 3,         // max words on screen simultaneously
    maxLen:    8,         // only show words with english.length <= this
    accel:     10,        // px/sec added every 30 s
  },
  normal: {
    label:     'Normal',
    speed:     68,
    spawnMs:   2600,
    maxScreen: 5,
    maxLen:    14,
    accel:     14,
  },
  hard: {
    label:     'Hard',
    speed:     105,
    spawnMs:   1800,
    maxScreen: 7,
    maxLen:    99,
    accel:     20,
  },
  expert: {
    label:     'Expert',
    speed:     150,
    spawnMs:   950,
    maxScreen: 10,
    maxLen:    99,
    accel:     28,
  },
};

const MODE = {
  survival: { label: 'Survival',        lives: 3,        infinite: true,  dailyN: 0  },
  practice: { label: 'Practice',        lives: Infinity, infinite: true,  dailyN: 0  },
  daily:    { label: 'Daily Challenge', lives: 3,        infinite: false, dailyN: 25 },
};

/* Category → CSS color + rgb for glow */
const CAT_COLOR = {
  'ISO Terms':            ['#4f6ef7', '79,110,247'],
  'Audit':                ['#8b5cf6', '139,92,246'],
  'Quality Control':      ['#10b981', '16,185,129'],
  'Production':           ['#f59e0b', '245,158,11'],
  'Mechanical Parts':     ['#06b6d4', '6,182,212'],
  'Purchasing':           ['#f97316', '249,115,22'],
  'Logistics':            ['#84cc16', '132,204,22'],
  'Kaizen':               ['#ec4899', '236,72,153'],
  'QCC':                  ['#14b8a6', '20,184,166'],
  'Office Email':         ['#6366f1', '99,102,241'],
  'Meeting English':      ['#a78bfa', '167,139,250'],
  'Customer Complaint':   ['#ef4444', '239,68,68'],
  'Supplier Management':  ['#0ea5e9', '14,165,233'],
  'Safety & Environment': ['#22c55e', '34,197,94'],
};

const COMBO_LEVELS = [
  { min: 1,  mult: 1,  label: '' },
  { min: 3,  mult: 2,  label: '×2' },
  { min: 5,  mult: 3,  label: '×3' },
  { min: 8,  mult: 5,  label: '×5' },
  { min: 12, mult: 10, label: '×10 🔥' },
];

const LS_KEY = 'vocabrain_v1';

/* ================================================================
   STATE
   ================================================================ */

let words      = [];   // all single-word cards loaded from data.json
let selMode    = 'survival';
let selDiff    = 'easy';

// Game runtime state — reset on each play
let G = {};

let rafId  = null;
let lastTs = null;

/* ================================================================
   DATA
   ================================================================ */

async function loadWords() {
  try {
    const res = await fetch('./data.json');
    if (!res.ok) throw new Error();
    const all = await res.json();
    // Keep only true single English words (no spaces)
    words = all.filter(c => typeof c.english === 'string' && !c.english.includes(' ') && c.english.length >= 2);
  } catch {
    words = FALLBACK;
    console.warn('data.json not loaded — using built-in fallback');
  }
}

/* ================================================================
   SCREEN HELPERS
   ================================================================ */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

/* ================================================================
   START SCREEN
   ================================================================ */

function selectMode(m) {
  selMode = m;
  document.querySelectorAll('.mode-card').forEach(el =>
    el.classList.toggle('active', el.dataset.mode === m)
  );
  // Daily challenge uses fixed Normal-like settings; hide difficulty
  document.getElementById('diffBlock').style.display = m === 'daily' ? 'none' : '';
}

function selectDiff(d) {
  selDiff = d;
  document.querySelectorAll('.diff-btn').forEach(el =>
    el.classList.toggle('active', el.dataset.diff === d)
  );
}

function renderHighScores() {
  const hs    = loadHs();
  const panel = document.getElementById('highScorePanel');
  const rows  = Object.entries(hs).filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  if (!rows.length) { panel.innerHTML = ''; return; }

  panel.innerHTML = `
    <h3>🏆 Best Scores</h3>
    ${rows.map(([k, v]) => {
      const [m, d] = k.split('_');
      return `<div class="hs-row">
        <span>${MODE[m]?.label || m} · ${DIFF[d]?.label || d}</span>
        <strong>${v.toLocaleString()}</strong>
      </div>`;
    }).join('')}
  `;
}

/* ================================================================
   GAME START / STOP
   ================================================================ */

function startGame() {
  const dc    = DIFF[selMode === 'daily' ? 'normal' : selDiff];
  const mc    = MODE[selMode];

  // Build word pool for this difficulty
  let pool = words.filter(c => c.english.length <= dc.maxLen);
  if (pool.length < 5) pool = [...words]; // fallback if too few

  // Daily: seeded shuffle, fixed 25 words
  if (selMode === 'daily') {
    pool = dailyPool(pool, mc.dailyN);
  } else {
    pool = shuffle([...pool]);
  }

  G = {
    mode:        selMode,
    diff:        selMode === 'daily' ? 'normal' : selDiff,
    dc,
    mc,
    pool,
    poolIdx:     0,

    falling:     [],      // active FallingWord objects
    score:       0,
    lives:       mc.lives === Infinity ? Infinity : mc.lives,
    maxLives:    mc.lives === Infinity ? Infinity : mc.lives,
    combo:       0,
    maxCombo:    0,
    correct:     0,
    misses:      0,       // words that hit the bottom
    elapsed:     0,       // seconds since start
    spawnTimer:  0,       // ms accumulator
    paused:      false,
    over:        false,
    running:     true,
    dailyDone:   0,       // words spawned for daily mode
  };

  // Setup HUD
  document.getElementById('hudLabel').textContent =
    `${mc.label} · ${dc.label}`;
  renderLives();
  renderScore();
  renderCombo();
  renderAcc();

  // Clear old falling words from DOM
  document.querySelectorAll('.fw').forEach(el => el.remove());

  showScreen('gameScreen');

  // Focus input
  const inp = document.getElementById('gameInput');
  inp.value = '';
  inp.focus();

  lastTs = null;
  rafId  = requestAnimationFrame(gameLoop);
}

function stopGame() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (G) G.running = false;
}

/* ================================================================
   GAME LOOP
   ================================================================ */

function gameLoop(ts) {
  if (!G.running) return;

  if (!lastTs) lastTs = ts;
  const dt = Math.min((ts - lastTs) / 1000, 0.12); // cap delta time
  lastTs = ts;

  if (!G.paused && !G.over) update(dt);

  rafId = requestAnimationFrame(gameLoop);
}

function update(dt) {
  G.elapsed    += dt;
  G.spawnTimer += dt * 1000;

  const field  = document.getElementById('field');
  const fieldH = field.clientHeight;
  const hitY   = fieldH - 56; // danger zone top

  // Speed increases every 30 s
  const speed = G.dc.speed + Math.floor(G.elapsed / 30) * G.dc.accel;

  // ---- Spawn ----
  // Count only words still actively falling (not yet removed/revealed)
  const activeCount = G.falling.filter(f => !f.removed).length;
  const canSpawn =
    activeCount < G.dc.maxScreen &&
    G.spawnTimer >= G.dc.spawnMs;

  if (canSpawn) {
    G.spawnTimer = 0;
    spawnWord(field, speed);
  }

  // ---- Update positions ----
  const toRemove = [];

  for (const fw of G.falling) {
    if (fw.removed) continue;

    fw.y += fw.speed * dt;
    fw.el.style.transform = `translateY(${fw.y}px)`;

    // Danger zone coloring
    if (fw.y > hitY - 90) fw.el.classList.add('fw-danger');

    // Word escaped — miss!
    if (fw.y > hitY && !fw.removed) {
      toRemove.push(fw);
      handleMiss(fw);
    }
  }

  toRemove.forEach(fw => removeWord(fw));

  // ---- Daily completion check ----
  if (G.mode === 'daily' &&
      G.dailyDone >= G.mc.dailyN &&
      G.falling.filter(f => !f.removed).length === 0) {
    endGame(true);
  }
}

/* ================================================================
   SPAWN WORD
   ================================================================ */

function spawnWord(field, speed) {
  // Pick card
  let card;
  if (G.mode === 'daily') {
    if (G.poolIdx >= G.pool.length) return;
    card = G.pool[G.poolIdx++];
    G.dailyDone++;
  } else {
    // Infinite: shuffle when exhausted, avoid duplicates on screen
    const activeIds = new Set(G.falling.filter(f => !f.removed).map(f => f.card.id));
    let tries = 0;
    do {
      if (G.poolIdx >= G.pool.length) {
        G.pool = shuffle([...G.pool]);
        G.poolIdx = 0;
      }
      card = G.pool[G.poolIdx++];
      tries++;
    } while (activeIds.has(card.id) && tries < 12);
  }

  if (!card) return;

  // Build DOM element
  const [color, rgb] = CAT_COLOR[card.category] || ['#4f6ef7', '79,110,247'];
  const vi = simplifyVi(card.vietnamese);

  const el = document.createElement('div');
  el.className = 'fw';
  el.style.setProperty('--fw-color', color);
  el.style.setProperty('--fw-rgb', rgb);
  el.innerHTML = `
    <div class="fw-vi">${escH(vi)}</div>
    <div class="fw-cat">${escH(card.category)}</div>
    <div class="fw-en">${escH(card.english)}</div>
    <div class="fw-hint" data-hint></div>
  `;

  // Determine X position (avoid crowding)
  const fieldW = field.clientWidth;
  const wordW  = Math.min(220, Math.max(110, vi.length * 14 + 28));
  const maxX   = Math.max(0, fieldW - wordW);
  const x      = pickX(maxX);

  el.style.left = x + 'px';
  el.style.top  = '0px';
  el.style.transform = 'translateY(-90px)';

  field.appendChild(el);

  const fw = {
    card,
    el,
    x,
    y:       -90,
    speed:   speed * (0.88 + Math.random() * 0.24),
    answer:  norm(card.english),
    removed: false,
  };

  G.falling.push(fw);
}

function pickX(maxX) {
  const taken = G.falling.filter(f => !f.removed).map(f => f.x);
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(Math.random() * maxX);
    if (!taken.some(tx => Math.abs(tx - x) < 145)) return x;
  }
  return Math.floor(Math.random() * maxX);
}

function simplifyVi(s) {
  // Take text before / or ( to keep it short
  return (s || '').split('/')[0].split('(')[0].split('·')[0].trim();
}

/* ================================================================
   INPUT
   ================================================================ */

function onInput(e) {
  if (G.paused || G.over) return;
  const typed = norm(e.target.value);

  // Highlight partial matches
  G.falling.filter(f => !f.removed).forEach(fw => {
    const isHl = typed.length > 0 && fw.answer.startsWith(typed);
    fw.el.classList.toggle('fw-hl', isHl);
    const hintEl = fw.el.querySelector('[data-hint]');
    if (hintEl) hintEl.textContent = isHl ? e.target.value + '▎' : '';
  });

  // Exact match → correct!
  const match = G.falling.find(fw => !fw.removed && fw.answer === typed);
  if (match) {
    handleCorrect(match);
    e.target.value = '';
    // Clear all highlights
    G.falling.forEach(fw => {
      fw.el.classList.remove('fw-hl');
      const h = fw.el.querySelector('[data-hint]');
      if (h) h.textContent = '';
    });
  }
}

/* ================================================================
   CORRECT
   ================================================================ */

function handleCorrect(fw) {
  fw.removed = true;

  // Remove from falling array
  const idx = G.falling.indexOf(fw);
  if (idx !== -1) G.falling.splice(idx, 1);

  // Update game stats
  G.correct++;
  G.combo++;
  if (G.combo > G.maxCombo) G.maxCombo = G.combo;

  const mult   = getMultiplier();
  const points = 10 * mult;
  G.score += points;

  // Visual: freeze position, clear transform, play pop
  const rect = fw.el.getBoundingClientRect();
  fw.el.style.top       = fw.y + 'px';
  fw.el.style.transform = 'none';
  fw.el.classList.remove('fw-hl', 'fw-danger');
  fw.el.classList.add('fw-correct');

  // Floating score text
  spawnFloat(rect.left + rect.width / 2, rect.top,
    mult > 1 ? `+${points} ×${mult}` : `+${points}`);

  setTimeout(() => fw.el.remove(), 420);

  renderScore();
  renderCombo();
  renderAcc();
}

/* ================================================================
   MISS (word hit bottom)
   ================================================================ */

const REVEAL_MS = 2300; // how long the answer stays visible

function handleMiss(fw) {
  fw.removed = true;
  G.misses++;
  G.combo = 0;

  // Stop falling — freeze at current rendered position
  fw.el.style.top       = fw.y + 'px';
  fw.el.style.transform = 'none';
  fw.el.classList.remove('fw-hl', 'fw-danger');

  // Reveal the English answer — the whole point of this game is learning!
  fw.el.classList.add('fw-reveal');
  const enEl = fw.el.querySelector('.fw-en');
  if (enEl) enEl.classList.add('fw-en-show');

  // Slide the card upward so the full card (including English answer ~115px)
  // stays inside the field and isn't clipped by overflow:hidden or the type-area.
  // We do this in the next animation frame so the browser records the start
  // position first and animates the top change via CSS transition.
  requestAnimationFrame(() => {
    const fieldH  = document.getElementById('field').clientHeight;
    const safeTop = fieldH - 125; // 125px ≈ card height + English row + margin
    if (fw.y > safeTop) {
      fw.el.style.top = safeTop + 'px';
    }
  });

  // Remove DOM element after the reveal animation finishes
  setTimeout(() => fw.el.remove(), REVEAL_MS + 200);

  // Lose a life
  if (G.mc.lives !== Infinity) {
    G.lives = Math.max(0, G.lives - 1);
    renderLives();

    // Flash field red
    const field = document.getElementById('field');
    field.classList.remove('flash');
    void field.offsetWidth;
    field.classList.add('flash');
    setTimeout(() => field.classList.remove('flash'), 420);

    // Show hint text
    const hint = document.getElementById('typeHint');
    hint.textContent = `💔 Miss! Đáp án: "${fw.card.english}" — hãy ghi nhớ nhé!`;
    hint.style.color = '#ef4444';
    setTimeout(() => {
      hint.textContent = 'Gõ từ tiếng Anh tương ứng...';
      hint.style.color = '';
    }, REVEAL_MS);

    if (G.lives <= 0) {
      // Delay game-over until the last reveal has finished showing
      setTimeout(() => endGame(false), REVEAL_MS + 100);
    }
  }

  renderCombo();
  renderAcc();
}

function removeWord(fw) {
  const idx = G.falling.indexOf(fw);
  if (idx !== -1) G.falling.splice(idx, 1);
}

/* ================================================================
   HUD RENDERS
   ================================================================ */

function renderLives() {
  const el = document.getElementById('livesEl');
  if (G.mc.lives === Infinity) { el.textContent = '∞'; return; }
  const alive = Math.max(0, G.lives);
  const lost  = Math.max(0, G.maxLives - alive);
  el.textContent = '❤️'.repeat(alive) + '🖤'.repeat(lost);
}

function renderScore() {
  document.getElementById('scoreEl').textContent = G.score.toLocaleString();
}

function renderCombo() {
  const wrap = document.getElementById('comboWrap');
  const val  = document.getElementById('comboVal');

  if (G.combo < 3) { wrap.style.display = 'none'; return; }

  wrap.style.display = '';
  wrap.className = 'combo-wrap';
  if (G.combo >= 12) wrap.classList.add('combo-fire');

  const level = getComboLevel();
  val.textContent = level.label || `×${level.mult}`;
}

function renderAcc() {
  const el    = document.getElementById('accEl');
  const total = G.correct + G.misses;
  el.textContent = total > 0
    ? Math.round((G.correct / total) * 100) + '%'
    : '—';
}

function getMultiplier() {
  return getComboLevel().mult;
}

function getComboLevel() {
  let lvl = COMBO_LEVELS[0];
  for (const l of COMBO_LEVELS) {
    if (G.combo >= l.min) lvl = l;
  }
  return lvl;
}

/* ================================================================
   FLOATING SCORE TEXT
   ================================================================ */

function spawnFloat(x, y, text) {
  const el = document.createElement('div');
  el.className = 'float-score';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

/* ================================================================
   PAUSE
   ================================================================ */

function togglePause() {
  if (G.over) return;
  G.paused = !G.paused;
  document.getElementById('pauseOverlay').classList.toggle('hidden', !G.paused);
  document.getElementById('pauseBtn').textContent = G.paused ? '▶' : '⏸';
  if (!G.paused) document.getElementById('gameInput').focus();
}

/* ================================================================
   END GAME
   ================================================================ */

function endGame(completed) {
  G.over    = true;
  G.running = false;

  const total = G.correct + G.misses;
  const acc   = total > 0 ? Math.round((G.correct / total) * 100) + '%' : '—';
  const secs  = Math.round(G.elapsed);

  // Save high score
  const isNew = saveHs(G.mode, G.diff, G.score);
  const prev  = getHs(G.mode, G.diff);

  // Populate game over screen
  document.getElementById('oScore').textContent   = G.score.toLocaleString();
  document.getElementById('oHigh').textContent    = Math.max(G.score, prev).toLocaleString();
  document.getElementById('oCorrect').textContent = G.correct;
  document.getElementById('oCombo').textContent   = G.maxCombo;
  document.getElementById('oAcc').textContent     = acc;
  document.getElementById('oTime').textContent    = secs + 's';

  document.getElementById('overIcon').textContent  = completed ? '🎉' : G.lives <= 0 ? '💀' : '⏹️';
  document.getElementById('overTitle').textContent = completed ? 'Hoàn thành!' : G.lives <= 0 ? 'Game Over!' : 'Kết thúc';

  document.getElementById('newRecord').classList.toggle('hidden', !isNew);

  setTimeout(() => showScreen('overScreen'), 500);
}

/* ================================================================
   NAVIGATION
   ================================================================ */

function restartGame() {
  stopGame();
  // Remove remaining word elements
  document.querySelectorAll('.fw').forEach(el => el.remove());
  startGame();
}

function exitToMenu() {
  stopGame();
  document.querySelectorAll('.fw').forEach(el => el.remove());
  showScreen('startScreen');
  renderHighScores();
}

/* ================================================================
   HIGH SCORE STORAGE
   ================================================================ */

function loadHs() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}

function saveHs(mode, diff, score) {
  const hs  = loadHs();
  const key = `${mode}_${diff}`;
  if (!hs[key] || score > hs[key]) {
    hs[key] = score;
    try { localStorage.setItem(LS_KEY, JSON.stringify(hs)); } catch {}
    return true;
  }
  return false;
}

function getHs(mode, diff) {
  return loadHs()[`${mode}_${diff}`] || 0;
}

/* ================================================================
   DAILY CHALLENGE
   ================================================================ */

function dailyPool(pool, n) {
  const d    = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const rng  = mulberry32(seed);
  const arr  = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length));
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================================================================
   UTILITIES
   ================================================================ */

// Normalize answer: lowercase, strip hyphens/spaces/parens
function norm(s) {
  return (s || '').toLowerCase().replace(/[-\s().]/g, '').trim();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escH(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ================================================================
   KEYBOARD SHORTCUTS
   ================================================================ */

document.addEventListener('keydown', e => {
  // P or Escape = pause (only in game screen)
  if (document.getElementById('gameScreen').classList.contains('hidden')) return;
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    togglePause();
  }
});

// Also handle Escape even when input is focused
document.getElementById('gameInput')?.addEventListener('keydown', e => {
  if (e.key === 'Escape') togglePause();
});

/* Re-focus input whenever user clicks/taps field area */
document.addEventListener('click', e => {
  if (document.getElementById('gameScreen').classList.contains('hidden')) return;
  if (G && !G.paused && !G.over) {
    document.getElementById('gameInput').focus();
  }
});

/* ================================================================
   FALLBACK WORD LIST (when data.json not available)
   ================================================================ */

const FALLBACK = [
  { id: 2001, category: 'Quality Control',      english: 'Inspection',     vietnamese: 'Kiểm tra',              level: 'Basic', tags: [] },
  { id: 2002, category: 'Quality Control',      english: 'Defect',         vietnamese: 'Khuyết tật',            level: 'Basic', tags: [] },
  { id: 2003, category: 'Quality Control',      english: 'Calibration',    vietnamese: 'Hiệu chuẩn',           level: 'Basic', tags: [] },
  { id: 2004, category: 'Quality Control',      english: 'Tolerance',      vietnamese: 'Dung sai',              level: 'Basic', tags: [] },
  { id: 2005, category: 'Quality Control',      english: 'Rework',         vietnamese: 'Gia công lại',          level: 'Basic', tags: [] },
  { id: 2006, category: 'Quality Control',      english: 'Scrap',          vietnamese: 'Phế phẩm',             level: 'Basic', tags: [] },
  { id: 2007, category: 'Quality Control',      english: 'Specification',  vietnamese: 'Thông số kỹ thuật',    level: 'Basic', tags: [] },
  { id: 2008, category: 'Quality Control',      english: 'Traceability',   vietnamese: 'Truy xuất nguồn gốc', level: 'Intermediate', tags: [] },
  { id: 2009, category: 'Mechanical Parts',     english: 'Bolt',           vietnamese: 'Bu lông',               level: 'Basic', tags: [] },
  { id: 2010, category: 'Mechanical Parts',     english: 'Bearing',        vietnamese: 'Vòng bi',               level: 'Basic', tags: [] },
  { id: 2011, category: 'Mechanical Parts',     english: 'Shaft',          vietnamese: 'Trục',                  level: 'Basic', tags: [] },
  { id: 2012, category: 'Mechanical Parts',     english: 'Gear',           vietnamese: 'Bánh răng',             level: 'Basic', tags: [] },
  { id: 2013, category: 'Mechanical Parts',     english: 'Bracket',        vietnamese: 'Giá đỡ',               level: 'Basic', tags: [] },
  { id: 2014, category: 'Mechanical Parts',     english: 'Gasket',         vietnamese: 'Gioăng',               level: 'Basic', tags: [] },
  { id: 2015, category: 'Mechanical Parts',     english: 'Bushing',        vietnamese: 'Bạc lót',              level: 'Intermediate', tags: [] },
  { id: 2016, category: 'Mechanical Parts',     english: 'Hardness',       vietnamese: 'Độ cứng',              level: 'Intermediate', tags: [] },
  { id: 2017, category: 'Production',           english: 'Downtime',       vietnamese: 'Dừng máy',             level: 'Basic', tags: [] },
  { id: 2018, category: 'Production',           english: 'Changeover',     vietnamese: 'Chuyển đổi',           level: 'Intermediate', tags: [] },
  { id: 2019, category: 'Production',           english: 'Throughput',     vietnamese: 'Sản lượng',            level: 'Intermediate', tags: [] },
  { id: 2020, category: 'Audit',                english: 'Auditor',        vietnamese: 'Chuyên viên đánh giá', level: 'Basic', tags: [] },
  { id: 2021, category: 'Audit',                english: 'Auditee',        vietnamese: 'Bên được đánh giá',    level: 'Basic', tags: [] },
  { id: 2022, category: 'Audit',                english: 'Observation',    vietnamese: 'Quan sát',             level: 'Basic', tags: [] },
  { id: 2023, category: 'Audit',                english: 'Evidence',       vietnamese: 'Bằng chứng',           level: 'Basic', tags: [] },
  { id: 2024, category: 'Kaizen',               english: 'Kanban',         vietnamese: 'Thẻ Kanban',           level: 'Basic', tags: [] },
  { id: 2025, category: 'Logistics',            english: 'Incoterms',      vietnamese: 'Điều kiện thương mại', level: 'Advanced', tags: [] },
  { id: 2026, category: 'Meeting English',      english: 'Agenda',         vietnamese: 'Chương trình họp',     level: 'Basic', tags: [] },
  { id: 2027, category: 'Meeting English',      english: 'Consensus',      vietnamese: 'Đồng thuận',           level: 'Intermediate', tags: [] },
  { id: 2028, category: 'QCC',                  english: 'Brainstorming',  vietnamese: 'Động não',             level: 'Basic', tags: [] },
];

/* ================================================================
   INIT
   ================================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  await loadWords();
  showScreen('startScreen');
  renderHighScores();
  selectMode('survival');
  selectDiff('easy');
});
