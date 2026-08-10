// ===== SRS STORAGE (localStorage) =====
function loadSRS() {
  try { return JSON.parse(localStorage.getItem('srs_data') || '{}'); } catch { return {}; }
}
function saveSRS(data) {
  try { localStorage.setItem('srs_data', JSON.stringify(data)); } catch {}
}
function loadStats() {
  try { return JSON.parse(localStorage.getItem('vocab_stats') || '{"today":0,"known":0,"total":0,"date":""}'); } catch {
    return {today:0,known:0,total:0,date:""};
  }
}
function saveStats(s) {
  try { localStorage.setItem('vocab_stats', JSON.stringify(s)); } catch {}
}

// SM-2 algorithm
function sm2(card, quality) {
  // quality: 1=again, 3=hard, 5=good
  let {ease=2.5, interval=1, reps=0} = card;
  if (quality < 3) {
    reps = 0; interval = 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    reps++;
  }
  ease = Math.max(1.3, ease + 0.1 - (5-quality)*0.08*(5-quality)*0.02);
  const nextDue = Date.now() + interval * 86400000;
  return {ease, interval, reps, nextDue, lastQuality: quality};
}

// ===== SESSION STATE =====
let currentMode = '';
let sessionWords = [];
let sessionIdx = 0;
let sessionCorrect = 0;
let sessionWrong = 0;
let sessionStreak = 0;
let sessionMaxStreak = 0;
let isFlipped = false;
let srsData = {};
let sessionStarted = false;

// Match state
let matchWords = [];
let matchSelected = null;
let matchMatchedCount = 0;
let matchStartTime = 0;
let matchTimerInterval = null;

// Spell state
let hintRevealed = 0;

// ===== INIT =====
function init() {
  srsData = loadSRS();
  updateHomeStats();
  document.addEventListener('keydown', handleKey);
}

function updateHomeStats() {
  const stats = loadStats();
  const today = new Date().toDateString();
  if (stats.date !== today) { stats.today = 0; stats.date = today; saveStats(stats); }
  document.getElementById('stat-today').textContent = stats.today;
  const known = Object.values(srsData).filter(c => c.reps >= 3).length;
  document.getElementById('stat-known').textContent = known;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goHome() {
  if (matchTimerInterval) clearInterval(matchTimerInterval);
  showScreen('home');
  updateHomeStats();
}

// ===== BUILD SESSION =====
function buildSession(n) {
  const orderMode = document.getElementById('order-mode').value;
  let pool = [...VOCAB];
  
  if (orderMode === 'srs') {
    const now = Date.now();
    pool.sort((a, b) => {
      const da = srsData[a.term]?.nextDue || 0;
      const db = srsData[b.term]?.nextDue || 0;
      const dueA = da <= now ? -1 : da;
      const dueB = db <= now ? -1 : db;
      return dueA - dueB;
    });
  } else if (orderMode === 'random') {
    pool = pool.sort(() => Math.random() - 0.5);
  } else if (orderMode === 'alpha') {
    // already alphabetical
  } else if (orderMode === 'review') {
    pool = pool.filter(w => srsData[w.term]?.lastQuality <= 3 || !srsData[w.term]);
    pool.sort(() => Math.random() - 0.5);
  }
  
  const size = n === 0 ? pool.length : Math.min(n, pool.length);
  return pool.slice(0, size);
}

function startMode(mode) {
  currentMode = mode;
  const n = parseInt(document.getElementById('session-size').value);
  sessionWords = buildSession(n);
  sessionIdx = 0;
  sessionCorrect = 0;
  sessionWrong = 0;
  sessionStreak = 0;
  sessionMaxStreak = 0;
  sessionStarted = true;
  
  if (mode === 'flash') startFlash();
  else if (mode === 'quiz') startQuiz();
  else if (mode === 'match') startMatch();
  else if (mode === 'spell') startSpell();
}

// ===== FLASHCARD MODE =====
function startFlash() {
  showScreen('flash');
  loadFlashCard();
}

function loadFlashCard() {
  if (sessionIdx >= sessionWords.length) { showResults(); return; }
  const w = sessionWords[sessionIdx];
  const dir = document.getElementById('direction').value;
  const showVi = dir === 'vi-en' || (dir === 'mix' && Math.random() > 0.5);
  
  isFlipped = false;
  const card3d = document.getElementById('card-3d');
  card3d.classList.remove('flipped');
  
  if (showVi) {
    document.getElementById('card-hint-front').textContent = 'Nhớ từ tiếng Anh là gì?';
    document.getElementById('card-term').textContent = w.def;
    document.getElementById('card-pron').textContent = '';
    document.getElementById('card-def').textContent = w.term;
    document.getElementById('card-pron-back').textContent = w.pron;
  } else {
    document.getElementById('card-hint-front').textContent = 'Nhấn để xem nghĩa';
    document.getElementById('card-term').textContent = w.term;
    document.getElementById('card-pron').textContent = w.pron;
    document.getElementById('card-def').textContent = w.def;
    document.getElementById('card-pron-back').textContent = '';
  }
  
  const n = sessionWords.length;
  document.getElementById('card-num').textContent = (sessionIdx+1)+'/'+n;
  document.getElementById('card-num-back').textContent = (sessionIdx+1)+'/'+n;
  document.getElementById('flash-counter').textContent = (sessionIdx+1)+' / '+n;
  document.getElementById('flash-progress').style.width = ((sessionIdx/n)*100)+'%';
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
  const w = sessionWords[sessionIdx];
  const card = srsData[w.term] || {};
  srsData[w.term] = sm2(card, quality);
  saveSRS(srsData);
  
  if (quality >= 4) { sessionCorrect++; sessionStreak++; sessionMaxStreak = Math.max(sessionMaxStreak, sessionStreak); }
  else { sessionWrong++; sessionStreak = 0; }
  
  // Update daily stats
  const stats = loadStats();
  stats.today++;
  stats.date = new Date().toDateString();
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

// ===== QUIZ MODE =====
let quizCorrectIdx = 0;
let quizAnswered = false;

function startQuiz() {
  showScreen('quiz');
  loadQuizQuestion();
}

function loadQuizQuestion() {
  if (sessionIdx >= sessionWords.length) { showResults(); return; }
  quizAnswered = false;
  const w = sessionWords[sessionIdx];
  const dir = document.getElementById('direction').value;
  const showVi = dir === 'vi-en' || (dir === 'mix' && Math.random() > 0.5);
  
  const n = sessionWords.length;
  document.getElementById('quiz-counter').textContent = (sessionIdx+1)+' / '+n;
  document.getElementById('quiz-progress').style.width = ((sessionIdx/n)*100)+'%';
  document.getElementById('quiz-streak').textContent = sessionStreak;
  
  if (showVi) {
    document.getElementById('question-card').querySelector('.question-label').textContent = 'TỪ TIẾNG ANH LÀ GÌ?';
    document.getElementById('q-text').textContent = w.def;
    document.getElementById('q-pron').textContent = '';
  } else {
    document.getElementById('question-card').querySelector('.question-label').textContent = 'NGHĨA CỦA TỪ NÀO?';
    document.getElementById('q-text').textContent = w.term;
    document.getElementById('q-pron').textContent = w.pron;
  }
  
  // Build 4 options
  const others = VOCAB.filter(v => v.term !== w.term).sort(() => Math.random()-0.5).slice(0, 3);
  const options = [...others, w].sort(() => Math.random()-0.5);
  quizCorrectIdx = options.indexOf(w);
  
  const btns = document.querySelectorAll('.option-btn');
  options.forEach((opt, i) => {
    btns[i].textContent = showVi ? opt.term : opt.def;
    btns[i].className = 'option-btn';
    btns[i].disabled = false;
  });
}

function selectOption(idx) {
  if (quizAnswered) return;
  quizAnswered = true;
  const btns = document.querySelectorAll('.option-btn');
  btns.forEach(b => b.disabled = true);
  
  if (idx === quizCorrectIdx) {
    btns[idx].classList.add('correct');
    sessionCorrect++;
    sessionStreak++;
    sessionMaxStreak = Math.max(sessionMaxStreak, sessionStreak);
    showToast('✅ Chính xác!', 'success');
    // Update SRS
    const w = sessionWords[sessionIdx];
    srsData[w.term] = sm2(srsData[w.term] || {}, 5);
    saveSRS(srsData);
  } else {
    btns[idx].classList.add('wrong');
    btns[quizCorrectIdx].classList.add('correct');
    sessionWrong++;
    sessionStreak = 0;
    const w = sessionWords[sessionIdx];
    srsData[w.term] = sm2(srsData[w.term] || {}, 1);
    saveSRS(srsData);
    showToast('❌ Sai rồi!', 'error');
  }
  
  const stats = loadStats();
  stats.today++;
  stats.date = new Date().toDateString();
  saveStats(stats);
  
  setTimeout(() => {
    sessionIdx++;
    loadQuizQuestion();
  }, 1200);
}

// ===== MATCH MODE =====
function startMatch() {
  showScreen('match');
  const batch = sessionWords.slice(0, Math.min(8, sessionWords.length));
  matchWords = batch;
  matchMatchedCount = 0;
  matchSelected = null;
  matchStartTime = Date.now();
  renderMatchGrid();
  if (matchTimerInterval) clearInterval(matchTimerInterval);
  matchTimerInterval = setInterval(() => {
    document.getElementById('match-timer').textContent = Math.floor((Date.now()-matchStartTime)/1000)+'s';
  }, 1000);
  document.getElementById('match-counter').textContent = '0 / ' + batch.length;
  document.getElementById('match-progress').style.width = '0%';
}

function renderMatchGrid() {
  const terms = matchWords.map((w,i) => ({type:'term', idx:i, text:w.term, word:w}));
  const defs = matchWords.map((w,i) => ({type:'def', idx:i, text:w.def, word:w}));
  const all = [...terms, ...defs].sort(() => Math.random()-0.5);
  
  const grid = document.getElementById('match-grid');
  grid.innerHTML = '';
  all.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'match-item';
    div.textContent = item.text;
    div.dataset.type = item.type;
    div.dataset.idx = item.idx;
    div.dataset.itemIdx = i;
    div.onclick = () => clickMatchItem(div, item);
    grid.appendChild(div);
  });
}

function clickMatchItem(el, item) {
  if (el.classList.contains('matched')) return;
  
  if (!matchSelected) {
    matchSelected = {el, item};
    el.classList.add('selected');
    return;
  }
  
  const prev = matchSelected;
  if (prev.el === el) {
    el.classList.remove('selected');
    matchSelected = null;
    return;
  }
  
  // Check if same type
  if (prev.item.type === item.type) {
    prev.el.classList.remove('selected');
    matchSelected = {el, item};
    el.classList.add('selected');
    return;
  }
  
  // Check match
  if (prev.item.idx === item.idx) {
    el.classList.add('matched');
    prev.el.classList.remove('selected');
    prev.el.classList.add('matched');
    matchSelected = null;
    matchMatchedCount++;
    sessionCorrect++;
    const n = matchWords.length;
    document.getElementById('match-counter').textContent = matchMatchedCount + ' / ' + n;
    document.getElementById('match-progress').style.width = ((matchMatchedCount/n)*100)+'%';
    showToast('⚡ Ghép đúng!', 'success');
    if (matchMatchedCount === n) {
      clearInterval(matchTimerInterval);
      const time = Math.floor((Date.now()-matchStartTime)/1000);
      setTimeout(() => {
        sessionIdx += n;
        if (sessionIdx < sessionWords.length) {
          showToast('🎉 Tiếp tục vòng tiếp theo!', 'success');
          setTimeout(() => {
            const nextBatch = sessionWords.slice(sessionIdx, sessionIdx + Math.min(8, sessionWords.length - sessionIdx));
            matchWords = nextBatch;
            matchMatchedCount = 0;
            matchSelected = null;
            matchStartTime = Date.now();
            renderMatchGrid();
            if (matchTimerInterval) clearInterval(matchTimerInterval);
            matchTimerInterval = setInterval(() => {
              document.getElementById('match-timer').textContent = Math.floor((Date.now()-matchStartTime)/1000)+'s';
            }, 1000);
            document.getElementById('match-counter').textContent = '0 / ' + nextBatch.length;
            document.getElementById('match-progress').style.width = '0%';
          }, 800);
        } else {
          showResults();
        }
      }, 500);
    }
  } else {
    el.classList.add('wrong-match');
    prev.el.classList.add('wrong-match');
    prev.el.classList.remove('selected');
    matchSelected = null;
    sessionWrong++;
    setTimeout(() => {
      el.classList.remove('wrong-match');
      prev.el.classList.remove('wrong-match');
    }, 500);
  }
}

// ===== SPELL MODE =====
function startSpell() {
  showScreen('spell');
  hintRevealed = 0;
  loadSpellWord();
  document.getElementById('spell-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') checkSpell();
  });
}

function loadSpellWord() {
  if (sessionIdx >= sessionWords.length) { showResults(); return; }
  hintRevealed = 0;
  const w = sessionWords[sessionIdx];
  document.getElementById('spell-def').textContent = w.def;
  document.getElementById('spell-pron').textContent = w.pron;
  updateHintLetters(w.term, 0);
  const inp = document.getElementById('spell-input');
  inp.value = '';
  inp.className = 'spell-input';
  document.getElementById('spell-feedback').textContent = '';
  document.getElementById('spell-feedback').style.color = '';
  
  const n = sessionWords.length;
  document.getElementById('spell-counter').textContent = (sessionIdx+1)+' / '+n;
  document.getElementById('spell-progress').style.width = ((sessionIdx/n)*100)+'%';
  document.getElementById('spell-streak').textContent = sessionStreak;
  
  setTimeout(() => inp.focus(), 100);
}

function updateHintLetters(term, revealed) {
  const letters = term.split('').map((ch, i) => {
    if (ch === ' ') return ' ';
    return i < revealed ? ch : '_';
  });
  document.getElementById('hint-letters').textContent = letters.join(' ');
}

function showHintLetter() {
  const w = sessionWords[sessionIdx];
  if (hintRevealed < w.term.length) {
    hintRevealed++;
    updateHintLetters(w.term, hintRevealed);
  }
}

function checkSpell() {
  const w = sessionWords[sessionIdx];
  const inp = document.getElementById('spell-input');
  const val = inp.value.trim().toLowerCase();
  const correct = w.term.toLowerCase();
  const fb = document.getElementById('spell-feedback');
  
  if (val === correct) {
    inp.className = 'spell-input correct-spell';
    fb.textContent = '✅ Chính xác!';
    fb.style.color = 'var(--green)';
    sessionCorrect++;
    sessionStreak++;
    sessionMaxStreak = Math.max(sessionMaxStreak, sessionStreak);
    srsData[w.term] = sm2(srsData[w.term] || {}, hintRevealed > 0 ? 3 : 5);
    saveSRS(srsData);
    const stats = loadStats();
    stats.today++;
    stats.date = new Date().toDateString();
    saveStats(stats);
    setTimeout(() => { sessionIdx++; loadSpellWord(); }, 900);
  } else {
    inp.className = 'spell-input wrong-spell';
    fb.textContent = '❌ Sai — thử lại!';
    fb.style.color = 'var(--red)';
    setTimeout(() => { inp.className = 'spell-input'; }, 400);
  }
}

function skipSpell() {
  const w = sessionWords[sessionIdx];
  document.getElementById('spell-feedback').textContent = '→ ' + w.term;
  document.getElementById('spell-feedback').style.color = 'var(--yellow)';
  sessionWrong++;
  sessionStreak = 0;
  srsData[w.term] = sm2(srsData[w.term] || {}, 1);
  saveSRS(srsData);
  setTimeout(() => { sessionIdx++; loadSpellWord(); }, 1000);
}

// ===== RESULTS =====
function showResults() {
  if (matchTimerInterval) clearInterval(matchTimerInterval);
  const total = sessionCorrect + sessionWrong;
  const pct = total > 0 ? Math.round(sessionCorrect/total*100) : 0;
  
  let trophy = '🏆', title = 'Xuất sắc!';
  if (pct >= 90) { trophy = '🥇'; title = 'Tuyệt vời!'; }
  else if (pct >= 70) { trophy = '🎯'; title = 'Tốt lắm!'; }
  else if (pct >= 50) { trophy = '💪'; title = 'Cố lên nào!'; }
  else { trophy = '📚'; title = 'Học thêm nhé!'; }
  
  document.getElementById('trophy-emoji').textContent = trophy;
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-sub').textContent = `Điểm chính xác: ${pct}% — ${sessionCorrect}/${total} câu đúng`;
  document.getElementById('res-correct').textContent = sessionCorrect;
  document.getElementById('res-wrong').textContent = sessionWrong;
  document.getElementById('res-streak').textContent = sessionMaxStreak;
  
  showScreen('results');
}

function retrySession() {
  startMode(currentMode);
}

// ===== KEYBOARD =====
function handleKey(e) {
  const screen = document.querySelector('.screen.active')?.id;
  if (screen === 'flash') {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!isFlipped) flipCard(); }
    else if (e.key === '1') rateCard(1);
    else if (e.key === '2') rateCard(3);
    else if (e.key === '3') rateCard(5);
  } else if (screen === 'quiz') {
    if (e.key >= '1' && e.key <= '4') selectOption(parseInt(e.key)-1);
  }
}

// ===== TOAST =====
let toastTimeout;
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove('show'), 1800);
}

// ===== START =====
init();
