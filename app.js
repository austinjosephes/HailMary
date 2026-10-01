/**
 * അമ്മയോടൊപ്പം | CLC Velappaya
 * 100,000 Hail Marys Devotional Offering Campaign
 *
 * Frontend — talks to the Python server API.
 * All data is stored in the server (prayers_data.json).
 * localStorage is NOT the source of truth here.
 */

// ─── Constants ────────────────────────────────────────────────────────────────
const TARGET_GOAL  = 100000;
const API_BASE     = '';          // same origin; no trailing slash
const POLL_INTERVAL_MS = 5000;   // refresh total every 5 seconds

// ─── Local UI-only state ──────────────────────────────────────────────────────
let uiState = {
  totalCount:  0,
  todayCount:  0,
  lastDateStr: getTodayDateString(),
  history:     [],
  soundEnabled: loadSoundPref()
};

let pollTimer = null;

// ─── Rosary Mysteries ─────────────────────────────────────────────────────────
const ROSARY_MYSTERIES = {
  joyful: {
    title: "Joyful Mysteries",
    days: "Monday & Saturday",
    mysteries: [
      "The Annunciation of the Angel Gabriel to Mary",
      "The Visitation of Mary to Elizabeth",
      "The Nativity of our Lord Jesus Christ",
      "The Presentation of the Infant Jesus in the Temple",
      "The Finding of the Child Jesus in the Temple"
    ]
  },
  luminous: {
    title: "Luminous Mysteries",
    days: "Thursday",
    mysteries: [
      "The Baptism of Jesus in the Jordan River",
      "The Self-Manifestation at the Wedding of Cana",
      "The Proclamation of the Kingdom and Call to Conversion",
      "The Transfiguration of Jesus on Mount Tabor",
      "The Institution of the Holy Eucharist at the Last Supper"
    ]
  },
  sorrowful: {
    title: "Sorrowful Mysteries",
    days: "Tuesday & Friday",
    mysteries: [
      "The Agony of Jesus in the Garden of Gethsemane",
      "The Scourging of Jesus at the Pillar",
      "The Crowning with Thorns",
      "The Carrying of the Cross to Calvary",
      "The Crucifixion and Death of Jesus Christ"
    ]
  },
  glorious: {
    title: "Glorious Mysteries",
    days: "Wednesday & Sunday",
    mysteries: [
      "The Glorious Resurrection of Jesus from the Dead",
      "The Ascension of Jesus into Heaven",
      "The Descent of the Holy Spirit at Pentecost",
      "The Assumption of Mary into Heaven",
      "The Coronation of Mary as Queen of Heaven and Earth"
    ]
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTodayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function loadSoundPref() {
  try { return localStorage.getItem('ammayodoppam_sound') !== 'off'; } catch { return true; }
}
function saveSoundPref(val) {
  try { localStorage.setItem('ammayodoppam_sound', val ? 'on' : 'off'); } catch {}
}

// ─── Audio ────────────────────────────────────────────────────────────────────
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playSingleBell(ctx, frequency, startTime, duration) {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(frequency, startTime);
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(frequency * 2.01, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.24, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc1.connect(gain); osc2.connect(gain);
  gain.connect(ctx.destination);
  osc1.start(startTime); osc2.start(startTime);
  osc1.stop(startTime + duration); osc2.stop(startTime + duration);
}

function playChime(isMilestone = false) {
  if (!uiState.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (isMilestone) {
      [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => playSingleBell(ctx, f, now + i * 0.12, 1.6));
    } else {
      playSingleBell(ctx, 880, now, 1.2);
    }
  } catch (err) { console.warn('Audio error:', err); }
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function apiFetchTotal() {
  const res = await fetch(`${API_BASE}/api/prayers`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiAddPrayers(amount) {
  const res = await fetch(`${API_BASE}/api/prayers`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ amount })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Core: add prayers (calls server) ────────────────────────────────────────
async function addPrayers(amount) {
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) return;

  const prevTotal = uiState.totalCount;

  // Disable submit button while submitting
  const submitBtn = document.getElementById('submitPrayersBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.6'; }

  try {
    const data = await apiAddPrayers(amount);
    applyServerData(data);
    playChime();
    if (navigator.vibrate) { try { navigator.vibrate(25); } catch (_) {} }
    checkMilestones(prevTotal, uiState.totalCount);
    showToast(amount === 1 ? 'Added 1 Hail Mary' : `Added ${amount.toLocaleString()} Hail Marys!`);
  } catch (err) {
    console.error('Submit error:', err);
    showToast('Could not save — check your connection', true);
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ''; }
  }
}
window.addPrayers = addPrayers;

// ─── Apply data from server → uiState + DOM ───────────────────────────────────
function applyServerData(data) {
  uiState.totalCount  = Number(data.totalCount)  || 0;
  uiState.todayCount  = Number(data.todayCount)  || 0;
  uiState.lastDateStr = data.lastDateStr          || getTodayDateString();
  uiState.history     = Array.isArray(data.history) ? data.history : [];
  updateUI();
}

// ─── Poll server for real-time sync ───────────────────────────────────────────
async function pollServer() {
  try {
    const data = await apiFetchTotal();
    applyServerData(data);
  } catch (err) {
    // Silently ignore polling errors (no internet / server down)
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollServer, POLL_INTERVAL_MS);
}

// ─── Undo (local-history only — subtracts via API override) ───────────────────
async function undoLast() {
  if (!uiState.history || uiState.history.length === 0) {
    showToast('No recent entries to undo', true);
    return;
  }
  const lastEntry = uiState.history[0];
  const newTotal  = Math.max(0, uiState.totalCount - lastEntry.amount);

  try {
    const res = await fetch(`${API_BASE}/api/admin/entry/${lastEntry.id}`, {
      method:  'DELETE',
      headers: { 'X-Admin-Token': sessionStorage.getItem('adminToken') || '' }
    });
    // If not admin or entry not found, fall back: just re-fetch
    const data = await apiFetchTotal();
    applyServerData(data);
    showToast(`Undid last entry of ${lastEntry.amount.toLocaleString()} prayers`);
  } catch {
    showToast('Undo failed — please refresh', true);
  }
}

// ─── Milestones ───────────────────────────────────────────────────────────────
const MILESTONES = [1000, 5000, 10000, 25000, 50000, 75000, 100000];

function checkMilestones(previous, current) {
  for (const m of MILESTONES) {
    if (previous < m && current >= m) {
      triggerMilestoneCelebration(m);
      break;
    }
  }
}

function triggerMilestoneCelebration(milestone) {
  playChime(true);
  if (typeof confetti === 'function') {
    confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 }, colors: ['#1e3a8a','#3b82f6','#f59e0b','#ffffff','#60a5fa'] });
    setTimeout(() => {
      confetti({ particleCount: 70, angle:  60, spread: 55, origin: { x: 0 }, colors: ['#2563eb','#f59e0b','#ffffff'] });
      confetti({ particleCount: 70, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#2563eb','#f59e0b','#ffffff'] });
    }, 250);
  }
  showToast(`🎉 Milestone! ${milestone.toLocaleString()} Hail Marys offered!`);
}

// ─── UI rendering ─────────────────────────────────────────────────────────────
function updateUI() {
  const count      = Math.min(TARGET_GOAL, Math.max(0, uiState.totalCount));
  const remaining  = Math.max(0, TARGET_GOAL - count);
  const rawPct     = (count / TARGET_GOAL) * 100;

  // Big counter
  const counterEl = document.getElementById('counterValue');
  if (counterEl) {
    counterEl.textContent = count.toLocaleString();
    counterEl.classList.remove('counter-pulse');
    void counterEl.offsetWidth;
    counterEl.classList.add('counter-pulse');
  }

  // Remaining
  const remEl = document.getElementById('remainingDisplay');
  if (remEl) remEl.textContent = remaining.toLocaleString();

  // Today badges
  const todayBadge = document.getElementById('todayCountDisplay');
  if (todayBadge) todayBadge.textContent = (uiState.todayCount || 0).toLocaleString();

  const statToday = document.getElementById('statToday');
  if (statToday) statToday.textContent = `${(uiState.todayCount || 0).toLocaleString()} Hail Marys`;

  // Rosaries
  const statRosaries = document.getElementById('statRosaries');
  if (statRosaries) statRosaries.textContent = `${(count / 50).toFixed(1)} Rosaries`;

  // Remaining stat
  const statRemEl = document.getElementById('statRemaining');
  if (statRemEl) statRemEl.textContent = `${remaining.toLocaleString()} more`;

  // Progress bar
  const bar = document.getElementById('progressBar');
  if (bar) bar.style.width = `${Math.min(100, rawPct)}%`;

  // Percentage
  const pctEl = document.getElementById('percentageDisplay');
  if (pctEl) {
    if (count <= 0)            pctEl.textContent = '0%';
    else if (count >= TARGET_GOAL) pctEl.textContent = '100%';
    else                       pctEl.textContent = `${parseFloat(rawPct.toFixed(3))}%`;
  }

  // Last entry
  const statLast = document.getElementById('statLastUpdated');
  if (statLast) {
    if (uiState.history && uiState.history.length > 0) {
      const last = uiState.history[0];
      statLast.textContent = `+${last.amount.toLocaleString()} at ${last.time}`;
    } else {
      statLast.textContent = 'No prayers added yet';
    }
  }

  // Recent activity
  renderRecentActivity();
}

function renderRecentActivity() {
  const container = document.getElementById('recentActivityList');
  if (!container) return;

  if (!uiState.history || uiState.history.length === 0) {
    container.innerHTML = `<p class="text-slate-400 italic text-center py-6">Submissions will appear here as prayers are entered.</p>`;
    return;
  }

  container.innerHTML = uiState.history.slice(0, 5).map(item => `
    <div class="flex justify-between items-center py-2 px-3 rounded-xl bg-blue-50/60 border border-blue-100 font-medium">
      <span class="inline-flex items-center gap-1.5 text-blue-900 font-bold">
        <i class="fa-solid fa-circle-check text-emerald-500 text-xs"></i>
        +${item.amount.toLocaleString()} Hail Marys
      </span>
      <span class="text-slate-400 text-xs font-semibold">${item.time}</span>
    </div>
  `).join('');
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimeout = null;
function showToast(message, isWarning = false) {
  const toast  = document.getElementById('toast');
  const msgEl  = document.getElementById('toastMsg');
  const iconEl = document.getElementById('toastIcon');
  if (!toast || !msgEl) return;
  msgEl.textContent = message;
  iconEl.className = isWarning
    ? 'fa-solid fa-circle-exclamation text-amber-400'
    : 'fa-solid fa-check-circle text-emerald-400';
  toast.classList.remove('hidden');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 2500);
}

// ─── WhatsApp share ───────────────────────────────────────────────────────────
function shareOnWhatsApp() {
  const count     = uiState.totalCount.toLocaleString();
  const pct       = ((uiState.totalCount / TARGET_GOAL) * 100).toFixed(1);
  const remaining = Math.max(0, TARGET_GOAL - uiState.totalCount).toLocaleString();
  const text = `🌸 *അമ്മയോടൊപ്പം | CLC Velappaya* 🌸\n*100,000 Hail Marys Devotional Offering Campaign*\n\n✨ *Total Prayers Offered:* ${count} / 100,000 (${pct}%)\n🙏 *Remaining to Target:* ${remaining} Hail Marys\n\nJoin us in prayer with Our Blessed Mother!\nPresented by *CLC Velappaya*`;
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

// ─── Daily Mysteries ──────────────────────────────────────────────────────────
function renderTodaysMysteries() {
  const dow = new Date().getDay();
  const map = { 0:'glorious', 1:'joyful', 2:'sorrowful', 3:'glorious', 4:'luminous', 5:'sorrowful', 6:'joyful' };
  const dayNames = { 0:'Sunday', 1:'Monday', 2:'Tuesday', 3:'Wednesday', 4:'Thursday', 5:'Friday', 6:'Saturday' };
  const mystery = ROSARY_MYSTERIES[map[dow]];

  const headingEl = document.getElementById('mysteryDayHeading');
  const subEl     = document.getElementById('mysterySubHeading');
  const badgeEl   = document.getElementById('currentDayBadge');
  const container = document.getElementById('mysteryListContainer');

  if (headingEl) headingEl.textContent = `Today: ${mystery.title}`;
  if (subEl)     subEl.textContent     = `Meditation for ${mystery.days}`;
  if (badgeEl)   badgeEl.textContent   = dayNames[dow];
  if (container) {
    container.innerHTML = mystery.mysteries.map((t, i) => `
      <div class="p-2.5 rounded-xl bg-blue-50/60 border border-blue-100/70 hover:bg-blue-100/50 transition flex items-start gap-2.5">
        <span class="w-5 h-5 rounded-full bg-marian-700 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">${i+1}</span>
        <span class="text-xs sm:text-sm font-medium text-slate-800 leading-snug">${t}</span>
      </div>`).join('');
  }
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('hidden'); document.body.classList.add('overflow-hidden'); }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('hidden'); document.body.classList.remove('overflow-hidden'); }
}

// ─── Input handlers ───────────────────────────────────────────────────────────
function handleSubmitPrayers() {
  const input  = document.getElementById('hailMaryInput');
  if (!input) return;
  const val = parseInt(input.value.trim(), 10);
  if (!isNaN(val) && val > 0) {
    addPrayers(val);
    input.value = '';
    input.focus();
  } else {
    showToast('Please enter a valid number of prayers', true);
    input.focus();
  }
}
window.handleSubmitPrayers = handleSubmitPrayers;

function handleIncrement() {
  const input = document.getElementById('hailMaryInput');
  if (!input) return;
  const cur = parseInt(input.value, 10);
  input.value = isNaN(cur) || cur < 1 ? 1 : cur + 1;
}
window.handleIncrement = handleIncrement;

function handleDecrement() {
  const input = document.getElementById('hailMaryInput');
  if (!input) return;
  const cur = parseInt(input.value, 10);
  input.value = isNaN(cur) || cur <= 1 ? 1 : cur - 1;
}
window.handleDecrement = handleDecrement;

// ─── Event wiring ─────────────────────────────────────────────────────────────
function setupEventListeners() {
  const submitBtn    = document.getElementById('submitPrayersBtn');
  const input        = document.getElementById('hailMaryInput');
  const decrementBtn = document.getElementById('decrementInputBtn');
  const incrementBtn = document.getElementById('incrementInputBtn');

  if (submitBtn)    submitBtn.onclick    = handleSubmitPrayers;
  if (decrementBtn) decrementBtn.onclick = handleDecrement;
  if (incrementBtn) incrementBtn.onclick = handleIncrement;

  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); handleSubmitPrayers(); }
    });
  }

  // Quick chips
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.onclick = () => {
      const amount = parseInt(chip.getAttribute('data-amount'), 10);
      if (!isNaN(amount) && amount > 0) addPrayers(amount);
    };
  });

  // Sound toggle
  const toggleSoundBtn = document.getElementById('toggleSoundBtn');
  const soundIcon      = document.getElementById('soundIcon');
  const soundLabel     = document.getElementById('soundLabel');
  if (toggleSoundBtn) {
    toggleSoundBtn.addEventListener('click', () => {
      uiState.soundEnabled = !uiState.soundEnabled;
      saveSoundPref(uiState.soundEnabled);
      if (uiState.soundEnabled) {
        if (soundIcon)  soundIcon.className  = 'fa-solid fa-volume-high text-marian-600';
        if (soundLabel) soundLabel.textContent = 'Sound: On';
        playChime();
        showToast('Sound enabled');
      } else {
        if (soundIcon)  soundIcon.className  = 'fa-solid fa-volume-xmark text-slate-400';
        if (soundLabel) soundLabel.textContent = 'Sound: Off';
        showToast('Sound disabled');
      }
    });
  }

  // Undo
  const undoBtn = document.getElementById('undoBtn');
  if (undoBtn) undoBtn.addEventListener('click', undoLast);

  // WhatsApp
  const shareBtn = document.getElementById('shareWhatsAppBtn');
  if (shareBtn) shareBtn.addEventListener('click', shareOnWhatsApp);

  // Modal openers
  const prayerBtn     = document.getElementById('openPrayerModalBtn');
  const mysteriesBtn  = document.getElementById('openMysteriesBtn');
  const resetModalBtn = document.getElementById('openResetModalBtn');

  if (prayerBtn)    prayerBtn.addEventListener('click',    () => openModal('prayerModal'));
  if (mysteriesBtn) mysteriesBtn.addEventListener('click', () => openModal('mysteriesModal'));
  if (resetModalBtn) resetModalBtn.addEventListener('click', () => {
    showToast('Adjust Total is available in the Admin Panel only', true);
  });

  // Generic modal close
  document.querySelectorAll('.modal-close-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-target');
      if (id) closeModal(id);
    });
  });
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
      }
    });
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initApp() {
  renderTodaysMysteries();
  setupEventListeners();

  // Show initial zero state immediately
  updateUI();

  // Load real data from server
  try {
    const data = await apiFetchTotal();
    applyServerData(data);
  } catch (err) {
    console.warn('Could not reach server on startup:', err);
    showToast('Server not reachable — running in offline mode', true);
  }

  // Start live-sync polling
  startPolling();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
