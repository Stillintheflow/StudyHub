// ===== FLATTEN DATA =====
// IELTS_DATA (from data.js) is grouped by topic; flatten into one array so the
// SRS engine and session builder don't need to know about topic structure.
const WORDS = [];
IELTS_DATA.topics.forEach(t => {
  t.words.forEach((w, i) => {
    WORDS.push({
      id: t.topic_number + '-' + i,
      topic: t.topic_number,
      topicEn: t.topic_en,
      topicVi: t.topic_vi,
      term: w.word,
      ipa: w.ipa,
      def: w.meaning
    });
  });
});
const TOPICS = IELTS_DATA.topics.map(t => ({ number: t.topic_number, en: t.topic_en, vi: t.topic_vi, count: t.words.length }));

// ===== STORAGE (localStorage) =====
// Namespaced under ielts_* so this tool never collides with vocabmaster's srs_data/vocab_stats keys.
function loadSRS() {
  try { return JSON.parse(localStorage.getItem('ielts_srs') || '{}'); } catch { return {}; }
}
function saveSRS(data) {
  try { localStorage.setItem('ielts_srs', JSON.stringify(data)); } catch {}
}
function loadStats() {
  try {
    return JSON.parse(localStorage.getItem('ielts_stats') || '{"date":"","newToday":0,"reviewsToday":0,"streak":0,"lastStudyDate":""}');
  } catch {
    return { date: '', newToday: 0, reviewsToday: 0, streak: 0, lastStudyDate: '' };
  }
}
function saveStats(s) {
  try { localStorage.setItem('ielts_stats', JSON.stringify(s)); } catch {}
}
function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem('ielts_settings') || '{"newPerDay":20,"direction":"en-vi","topicFilter":"all"}');
  } catch {
    return { newPerDay: 20, direction: 'en-vi', topicFilter: 'all' };
  }
}
function saveSettings(s) {
  try { localStorage.setItem('ielts_settings', JSON.stringify(s)); } catch {}
}

// SM-2 algorithm (same shape as vocabmaster/app.js's sm2())
function sm2(card, quality) {
  // quality: 1=again, 3=hard, 4=good, 5=easy
  let { ease = 2.5, interval = 1, reps = 0 } = card;
  if (quality < 3) {
    reps = 0; interval = 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    reps++;
  }
  ease = Math.max(1.3, ease + 0.1 - (5 - quality) * 0.08 * (5 - quality) * 0.02);
  const nextDue = Date.now() + interval * 86400000;
  return { ease, interval, reps, nextDue, lastQuality: quality };
}

// ===== SESSION STATE =====
let srsData = {};
let settings = {};
let sessionWords = [];  // [{word, isNew}]
let sessionIdx = 0;
let sessionNewCount = 0;
let sessionReviewCount = 0;
let sessionMaxStreak = 0;
let sessionStreak = 0;
let isFlipped = false;
let bonusNewLimit = 0; // temp override when user asks to "study more" past today's cap

// ===== INIT =====
function init() {
  srsData = loadSRS();
  settings = loadSettings();
  document.getElementById('new-per-day').value = settings.newPerDay;
  document.getElementById('direction').value = settings.direction;
  populateTopicFilter();
  document.getElementById('topic-filter').value = settings.topicFilter;
  refreshHome();
  document.addEventListener('keydown', handleKey);
}

function todayStr() { return new Date().toDateString(); }

function rolloverStatsIfNeeded() {
  const stats = loadStats();
  if (stats.date !== todayStr()) {
    stats.date = todayStr();
    stats.newToday = 0;
    stats.reviewsToday = 0;
    saveStats(stats);
  }
  return stats;
}

function bumpStreak(stats) {
  const today = todayStr();
  if (stats.lastStudyDate === today) return;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  stats.streak = stats.lastStudyDate === yesterday ? stats.streak + 1 : 1;
  stats.lastStudyDate = today;
}

// ===== TOPIC FILTER DROPDOWN =====
function populateTopicFilter() {
  const sel = document.getElementById('topic-filter');
  sel.innerHTML = '<option value="all">Tất cả chủ đề</option>' +
    TOPICS.map(t => `<option value="${t.number}">${t.number}. ${t.vi} (${t.count})</option>`).join('');
}

// ===== POOLS =====
function getDuePool(topicFilter) {
  const now = Date.now();
  return WORDS.filter(w => {
    if (topicFilter !== 'all' && w.topic !== Number(topicFilter)) return false;
    const c = srsData[w.id];
    return c && c.nextDue <= now;
  });
}
function getNewPool(topicFilter, limit) {
  const pool = WORDS.filter(w => {
    if (topicFilter !== 'all' && w.topic !== Number(topicFilter)) return false;
    return !srsData[w.id];
  });
  return limit == null ? pool : pool.slice(0, Math.max(0, limit));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ===== HOME SCREEN =====
function refreshHome() {
  const stats = rolloverStatsIfNeeded();
  const topicFilter = document.getElementById('topic-filter').value;

  document.getElementById('stat-total').textContent = WORDS.length;
  const learned = Object.keys(srsData).length;
  const mastered = Object.values(srsData).filter(c => c.reps >= 4).length;
  document.getElementById('stat-learned').textContent = learned;
  document.getElementById('stat-mastered').textContent = mastered;
  document.getElementById('stat-streak').textContent = stats.streak || 0;

  const due = getDuePool(topicFilter);
  const remainingNew = Math.max(0, settings.newPerDay - stats.newToday) + bonusNewLimit;
  const fresh = getNewPool(topicFilter, remainingNew);

  document.getElementById('due-count').textContent = due.length;
  document.getElementById('new-count').textContent = fresh.length;
  document.getElementById('new-today-of-limit').textContent = stats.newToday + '/' + settings.newPerDay;

  const startBtn = document.getElementById('start-btn');
  const emptyMsg = document.getElementById('cta-empty');
  const moreBtn = document.getElementById('more-new-btn');

  if (due.length === 0 && fresh.length === 0) {
    startBtn.disabled = true;
    emptyMsg.style.display = 'block';
    const capped = Math.max(0, settings.newPerDay - stats.newToday) === 0 && getNewPool(topicFilter, null).length > 0;
    moreBtn.style.display = capped ? 'inline-block' : 'none';
    emptyMsg.textContent = capped
      ? '🎉 Đã đạt giới hạn từ mới hôm nay! Có thể học thêm nếu muốn.'
      : '🎉 Đã học hết từ trong phạm vi này. Đổi chủ đề hoặc quay lại sau.';
  } else {
    startBtn.disabled = false;
    emptyMsg.style.display = 'none';
    moreBtn.style.display = 'none';
  }
}

function studyMore() {
  bonusNewLimit += 10;
  refreshHome();
}

function onSettingsChange() {
  settings.newPerDay = Math.max(1, parseInt(document.getElementById('new-per-day').value) || 20);
  settings.direction = document.getElementById('direction').value;
  settings.topicFilter = document.getElementById('topic-filter').value;
  saveSettings(settings);
  bonusNewLimit = 0;
  refreshHome();
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goHome() {
  bonusNewLimit = 0;
  showScreen('home');
  refreshHome();
}

// ===== TOPICS SCREEN =====
function openTopics() {
  renderTopics(document.getElementById('topic-search').value);
  showScreen('topics');
}

function renderTopics(filterText) {
  const q = (filterText || '').trim().toLowerCase();
  const grid = document.getElementById('topics-grid');
  grid.innerHTML = '';
  TOPICS
    .filter(t => !q || t.vi.toLowerCase().includes(q) || t.en.toLowerCase().includes(q))
    .forEach(t => {
      const topicWords = WORDS.filter(w => w.topic === t.number);
      const learned = topicWords.filter(w => srsData[w.id]).length;
      const mastered = topicWords.filter(w => srsData[w.id] && srsData[w.id].reps >= 4).length;
      const pct = Math.round((learned / t.count) * 100);

      const div = document.createElement('div');
      div.className = 'topic-card';
      div.innerHTML = `
        <div class="topic-num">CHỦ ĐỀ ${t.number}</div>
        <div class="topic-name-vi">${t.vi}</div>
        <div class="topic-name-en">${t.en}</div>
        <div class="topic-progress-bar"><div class="topic-progress-fill" style="width:${pct}%"></div></div>
        <div class="topic-meta">
          <span>${learned}/${t.count} đã học</span>
          <span class="mastered">${mastered} thuộc</span>
        </div>`;
      div.onclick = () => studyTopic(t.number);
      grid.appendChild(div);
    });
}

function studyTopic(topicNumber) {
  document.getElementById('topic-filter').value = String(topicNumber);
  settings.topicFilter = String(topicNumber);
  saveSettings(settings);
  bonusNewLimit = 0;
  goHome();
  startSession();
}

// ===== BUILD & RUN SESSION =====
function startSession() {
  const stats = rolloverStatsIfNeeded();
  const topicFilter = document.getElementById('topic-filter').value;
  const due = getDuePool(topicFilter);
  const remainingNew = Math.max(0, settings.newPerDay - stats.newToday) + bonusNewLimit;
  const fresh = getNewPool(topicFilter, remainingNew);

  if (due.length === 0 && fresh.length === 0) return;

  sessionWords = shuffle([
    ...due.map(w => ({ word: w, isNew: false })),
    ...fresh.map(w => ({ word: w, isNew: true }))
  ]);
  sessionIdx = 0;
  sessionNewCount = 0;
  sessionReviewCount = 0;
  sessionStreak = 0;
  sessionMaxStreak = 0;

  showScreen('flash');
  loadFlashCard();
}

function loadFlashCard() {
  if (sessionIdx >= sessionWords.length) { showResults(); return; }
  const item = sessionWords[sessionIdx];
  const w = item.word;
  const dir = settings.direction;
  const showVi = dir === 'vi-en' || (dir === 'mix' && Math.random() > 0.5);

  isFlipped = false;
  const card3d = document.getElementById('card-3d');
  card3d.classList.remove('flipped');

  if (showVi) {
    document.getElementById('card-hint-front').textContent = 'Nhớ từ tiếng Anh là gì?';
    document.getElementById('card-term').textContent = w.def;
    document.getElementById('card-pron').textContent = '';
    document.getElementById('card-def').textContent = w.term;
    document.getElementById('card-pron-back').textContent = w.ipa;
  } else {
    document.getElementById('card-hint-front').textContent = 'Nhấn để xem nghĩa';
    document.getElementById('card-term').textContent = w.term;
    document.getElementById('card-pron').textContent = w.ipa;
    document.getElementById('card-def').textContent = w.def;
    document.getElementById('card-pron-back').textContent = '';
  }

  const badge = document.getElementById('card-badge');
  badge.textContent = item.isNew ? '🆕 Mới' : '🔁 Ôn tập';
  badge.className = 'card-badge ' + (item.isNew ? 'new' : 'review');
  document.getElementById('card-topic-pill').textContent = `Chủ đề ${w.topic}: ${w.topicVi}`;

  const n = sessionWords.length;
  document.getElementById('card-num').textContent = (sessionIdx + 1) + '/' + n;
  document.getElementById('card-num-back').textContent = (sessionIdx + 1) + '/' + n;
  document.getElementById('flash-counter').textContent = (sessionIdx + 1) + ' / ' + n;
  document.getElementById('flash-progress').style.width = ((sessionIdx / n) * 100) + '%';
  document.getElementById('flash-streak').textContent = sessionStreak;
  document.getElementById('rating-row').style.display = 'none';
  document.getElementById('reveal-hint').style.display = 'block';
}

function flipCard() {
  if (isFlipped) return;
  isFlipped = true;
  document.getElementById('card-3d').classList.add('flipped');
  document.getElementById('rating-row').style.display = 'flex';
  document.getElementById('reveal-hint').style.display = 'none';
  speakWord();
}

function rateCard(quality) {
  const item = sessionWords[sessionIdx];
  const w = item.word;
  srsData[w.id] = sm2(srsData[w.id] || {}, quality);
  saveSRS(srsData);

  if (quality >= 4) { sessionStreak++; sessionMaxStreak = Math.max(sessionMaxStreak, sessionStreak); }
  else { sessionStreak = 0; }

  const stats = rolloverStatsIfNeeded();
  if (item.isNew) { stats.newToday++; sessionNewCount++; }
  else { stats.reviewsToday++; sessionReviewCount++; }
  bumpStreak(stats);
  saveStats(stats);

  sessionIdx++;
  loadFlashCard();
}

function speakWord() {
  const term = document.getElementById('card-term').textContent;
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(term);
    u.lang = 'en-US'; u.rate = 0.85;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
}

// ===== RESULTS =====
function showResults() {
  const total = sessionNewCount + sessionReviewCount;
  document.getElementById('res-new').textContent = sessionNewCount;
  document.getElementById('res-review').textContent = sessionReviewCount;
  document.getElementById('res-streak').textContent = sessionMaxStreak;

  let trophy = '🏆', title = 'Xuất sắc!';
  if (total === 0) { trophy = '🤷'; title = 'Chưa có từ nào'; }
  else if (sessionMaxStreak >= total * 0.8) { trophy = '🥇'; title = 'Tuyệt vời!'; }
  else if (sessionMaxStreak >= total * 0.5) { trophy = '🎯'; title = 'Tốt lắm!'; }
  else { trophy = '💪'; title = 'Tiếp tục cố gắng!'; }

  document.getElementById('trophy-emoji').textContent = trophy;
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-sub').textContent = `Đã ôn ${total} từ trong phiên này.`;

  showScreen('results');
}

// ===== KEYBOARD =====
function handleKey(e) {
  const screen = document.querySelector('.screen.active')?.id;
  if (screen !== 'flash') return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!isFlipped) flipCard(); }
  else if (isFlipped && e.key === '1') rateCard(1);
  else if (isFlipped && e.key === '2') rateCard(3);
  else if (isFlipped && e.key === '3') rateCard(4);
  else if (isFlipped && e.key === '4') rateCard(5);
}

// ===== TOAST (unused for now, kept for parity/future use) =====
let toastTimeout;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove('show'), 1800);
}

// ===== START =====
init();
