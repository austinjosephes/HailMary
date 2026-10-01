/**
 * അമ്മയോടൊപ്പം | CLC Velappaya
 * 100,000 Hail Marys Devotional Offering Campaign
 *
 * Frontend Client Application
 * Database/Server is the sole authoritative source of truth.
 * Automatic live sync via polling.
 */

// ─── Constants ────────────────────────────────────────────────────────────────
const TARGET_GOAL      = 100000;
const MAX_SUBMIT_LIMIT = 10000;
const API_BASE         = '';          // same origin
const POLL_INTERVAL_MS = 5000;        // refresh total every 5 seconds

// ─── UI State (Reflected from Server) ─────────────────────────────────────────
let uiState = {
  totalCount:      0,
  todayCount:      0,
  lastDateStr:     getTodayDateString(),
  history:         [],
  soundEnabled:    loadSoundPref(),
  highestCelebrated: 0
};

let pollTimer = null;
let isSubmitting = false;

// ─── Rosary Mysteries ─────────────────────────────────────────────────────────
const ROSARY_MYSTERIES = {
  joyful: {
    title: "Joyful Mysteries",
    days: "Monday & Saturday",
    mysteries: [
      "The Annunciation of the Lord to Mary",
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
      "The Proclamation of the Kingdom and Call to Repentance",
      "The Transfiguration of Jesus on Mount Tabor",
      "The Institution of the Holy Eucharist"
    ]
  },
  sorrowful: {
    title: "Sorrowful Mysteries",
    days: "Tuesday & Friday",
    mysteries: [
      "The Agony of Jesus in the Garden of Gethsemane",
      "The Scourging of Jesus at the Pillar",
      "The Crowning of Jesus with Thorns",
      "The Carrying of the Cross to Calvary",
      "The Crucifixion and Death of Jesus"
    ]
  },
  glorious: {
    title: "Glorious Mysteries",
    days: "Wednesday & Sunday",
    mysteries: [
      "The Glorious Resurrection of Jesus",
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

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Web Audio Bell Chimes ───────────────────────────────────────────────────
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
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
  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);
  osc1.start(startTime);
  osc2.start(startTime);
  osc1.stop(startTime + duration);
  osc2.stop(startTime + duration);
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
  } catch (err) {
    console.warn('Audio error:', err);
  }
}

// ─── API Client ───────────────────────────────────────────────────────────────
async function apiFetchTotal() {
  const res = await fetch(`${API_BASE}/api/prayers`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiAddPrayers(amount) {
  const res = await fetch(`${API_BASE}/api/prayers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ amount })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

// ─── Core Prayer Submission ───────────────────────────────────────────────────
async function addPrayers(amount) {
  if (isSubmitting) return;

  const parsed = parseInt(amount, 10);
  if (isNaN(parsed) || parsed <= 0) {
    showToast('Please enter a valid number of prayers', true);
    return;
  }
  if (parsed > MAX_SUBMIT_LIMIT) {
    showToast(`Maximum submission is ${MAX_SUBMIT_LIMIT.toLocaleString()} prayers at a time`, true);
    return;
  }

  isSubmitting = true;
  const submitBtn = document.getElementById('submitPrayersBtn');
  const btnText   = document.getElementById('submitBtnText');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-70', 'cursor-not-allowed');
  }
  if (btnText) btnText.textContent = 'Saving offering…';

  const prevTotal = uiState.totalCount;

  try {
    const data = await apiAddPrayers(parsed);
    applyServerData(data);

    // Audio & Haptic Feedback
    playChime();
    if (navigator.vibrate) { try { navigator.vibrate(25); } catch (_) {} }

    // Check milestones
    checkMilestones(prevTotal, uiState.totalCount);

    // Show appropriate toast feedback
    if (data.isGoalFull) {
      showToast('Goal reached! 100,000 prayers already offered.', true);
    } else if (data.creditedAmount < data.submittedAmount) {
      showToast(`Goal reached! ${data.creditedAmount.toLocaleString()} of your ${data.submittedAmount.toLocaleString()} prayers completed the 100,000 target!`);
    } else {
      showToast(parsed === 1 ? 'Added 1 Hail Mary to the offering!' : `Added ${parsed.toLocaleString()} Hail Marys!`);
    }
  } catch (err) {
    console.error('Submit error:', err);
    showToast(err.message || 'Could not record prayers. Check connection.', true);
  } finally {
    isSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
    }
    if (btnText) btnText.textContent = uiState.totalCount >= TARGET_GOAL ? 'Goal Reached (100,000)' : 'Submit to Offering';
  }
}
window.addPrayers = addPrayers;

// ─── Apply Authoritative Server Data ──────────────────────────────────────────
function applyServerData(data) {
  if (!data) return;
  uiState.totalCount  = Number(data.totalCount)  || 0;
  uiState.todayCount  = Number(data.todayCount)  || 0;
  uiState.lastDateStr = data.lastDateStr          || getTodayDateString();
  uiState.history     = Array.isArray(data.history) ? data.history : [];
  updateUI();
}

// ─── Real-Time Sync Polling ───────────────────────────────────────────────────
async function pollServer() {
  try {
    const data = await apiFetchTotal();
    const prevTotal = uiState.totalCount;
    applyServerData(data);

    // Check milestone if updated from another user
    if (prevTotal > 0 && uiState.totalCount > prevTotal) {
      checkMilestones(prevTotal, uiState.totalCount);
    }
  } catch (err) {
    // Network hiccup — ignore silently in polling loop
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollServer, POLL_INTERVAL_MS);
}

// ─── Milestones ───────────────────────────────────────────────────────────────
const MILESTONES = [1000, 5000, 10000, 25000, 50000, 75000, 100000];

function checkMilestones(previous, current) {
  for (const m of MILESTONES) {
    if (previous < m && current >= m && uiState.highestCelebrated < m) {
      uiState.highestCelebrated = m;
      triggerMilestoneCelebration(m);
      break;
    }
  }
}

function triggerMilestoneCelebration(milestone) {
  playChime(true);
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#1e3a8a','#3b82f6','#f59e0b','#ffffff','#60a5fa']
    });
    setTimeout(() => {
      confetti({ particleCount: 70, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#2563eb','#f59e0b','#ffffff'] });
      confetti({ particleCount: 70, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#2563eb','#f59e0b','#ffffff'] });
    }, 250);
  }
  showToast(`🎉 Milestone reached! ${milestone.toLocaleString()} Hail Marys offered!`);
}

// ─── UI Rendering ─────────────────────────────────────────────────────────────
function updateUI() {
  const count      = Math.min(TARGET_GOAL, Math.max(0, uiState.totalCount));
  const remaining  = Math.max(0, TARGET_GOAL - count);
  const rawPct     = (count / TARGET_GOAL) * 100;
  const isComplete = count >= TARGET_GOAL;

  // Counter
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

  // Today
  const todayBadge = document.getElementById('todayCountDisplay');
  if (todayBadge) todayBadge.textContent = (uiState.todayCount || 0).toLocaleString();

  const statToday = document.getElementById('statToday');
  if (statToday) statToday.textContent = `${(uiState.todayCount || 0).toLocaleString()} Hail Marys`;

  // Rosaries calculation
  const statRosaries = document.getElementById('statRosaries');
  if (statRosaries) statRosaries.textContent = `${(count / 50).toFixed(1)} Rosaries`;

  // Stat remaining
  const statRemEl = document.getElementById('statRemaining');
  if (statRemEl) statRemEl.textContent = isComplete ? 'Goal Completed!' : `${remaining.toLocaleString()} more`;

  // Progress Bar
  const bar = document.getElementById('progressBar');
  if (bar) bar.style.width = `${Math.min(100, rawPct)}%`;

  const track = document.getElementById('progressTrack');
  if (track) track.setAttribute('aria-valuenow', Math.min(100, Math.round(rawPct)));

  // Percentage text
  const pctEl = document.getElementById('percentageDisplay');
  if (pctEl) {
    if (count <= 0) pctEl.textContent = '0%';
    else if (isComplete) pctEl.textContent = '100%';
    else pctEl.textContent = `${parseFloat(rawPct.toFixed(2))}%`;
  }

  // Target Reached Banner
  const banner = document.getElementById('targetReachedBanner');
  if (banner) {
    if (isComplete) banner.classList.remove('hidden');
    else banner.classList.add('hidden');
  }

  // Last entry
  const statLast = document.getElementById('statLastUpdated');
  if (statLast) {
    if (uiState.history && uiState.history.length > 0) {
      const last = uiState.history[0];
      const credited = last.creditedAmount !== undefined ? last.creditedAmount : last.amount;
      statLast.textContent = `+${credited.toLocaleString()} at ${last.time || 'recent'}`;
    } else {
      statLast.textContent = 'No prayers added yet';
    }
  }

  // Recent activity list
  renderRecentActivity();
}

function renderRecentActivity() {
  const container = document.getElementById('recentActivityList');
  if (!container) return;

  if (!uiState.history || uiState.history.length === 0) {
    container.innerHTML = `<p class="text-slate-400 italic text-center py-6">Submissions will appear here as prayers are entered.</p>`;
    return;
  }

  container.innerHTML = uiState.history.slice(0, 5).map(item => {
    const credited = Number(item.creditedAmount !== undefined ? item.creditedAmount : item.amount) || 0;
    const submitted = Number(item.submittedAmount !== undefined ? item.submittedAmount : item.amount) || credited;
    const timeStr = escapeHtml(item.time || 'Recent');

    let badge = '';
    if (credited < submitted && credited > 0) {
      badge = `<span class="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-bold ml-1">Target Reached</span>`;
    } else if (credited === 0 && submitted > 0) {
      badge = `<span class="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-bold ml-1">Goal Full</span>`;
    }

    return `
      <div class="flex justify-between items-center py-2 px-3 rounded-xl bg-blue-50/60 border border-blue-100 font-medium">
        <span class="inline-flex items-center gap-1.5 text-blue-900 font-bold">
          <i class="fa-solid fa-circle-check text-emerald-500 text-xs" aria-hidden="true"></i>
          +${credited.toLocaleString()} Hail Marys
          ${badge}
        </span>
        <span class="text-slate-400 text-xs font-semibold">${timeStr}</span>
      </div>
    `;
  }).join('');
}

// ─── Toast Notifications ──────────────────────────────────────────────────────
let toastTimeout = null;
function showToast(message, isWarning = false) {
  const toast  = document.getElementById('toast');
  const msgEl  = document.getElementById('toastMsg');
  const iconEl = document.getElementById('toastIcon');
  if (!toast || !msgEl) return;

  msgEl.textContent = message;
  if (iconEl) {
    iconEl.className = isWarning
      ? 'fa-solid fa-circle-exclamation text-amber-400'
      : 'fa-solid fa-check-circle text-emerald-400';
  }
  toast.classList.remove('hidden');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 2800);
}

// ─── WhatsApp Sharing ─────────────────────────────────────────────────────────
function shareOnWhatsApp() {
  const count     = uiState.totalCount.toLocaleString();
  const pct       = ((uiState.totalCount / TARGET_GOAL) * 100).toFixed(1);
  const remaining = Math.max(0, TARGET_GOAL - uiState.totalCount).toLocaleString();
  const text = `🌸 *അമ്മയോടൊപ്പം | CLC Velappaya* 🌸\n*100,000 Hail Marys Devotional Offering Campaign*\n\n✨ *Total Prayers Offered:* ${count} / 100,000 (${pct}%)\n🙏 *Remaining to Target:* ${remaining} Hail Marys\n\nJoin our parish community in prayer with Our Blessed Mother!\nPresented with devotion by *CLC Velappaya*`;
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

// ─── Daily Rosary Mysteries ───────────────────────────────────────────────────
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
        <span class="w-5 h-5 rounded-full bg-marian-700 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5" aria-hidden="true">${i+1}</span>
        <span class="text-xs sm:text-sm font-medium text-slate-800 leading-snug">${escapeHtml(t)}</span>
      </div>`).join('');
  }
}

// ─── Modal Helpers ────────────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
}

// ─── Input Handlers ───────────────────────────────────────────────────────────
function handleSubmitPrayers() {
  const input = document.getElementById('hailMaryInput');
  if (!input) return;
  const val = parseInt(input.value.trim(), 10);
  if (!isNaN(val) && val > 0) {
    addPrayers(val);
    input.value = '';
  } else {
    showToast('Please enter a valid number of prayers', true);
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

// ─── Event Setup ──────────────────────────────────────────────────────────────
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
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmitPrayers();
      }
    });
  }

  // Quick preset chips
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const amount = parseInt(chip.getAttribute('data-amount'), 10);
      if (!isNaN(amount) && amount > 0) addPrayers(amount);
    });
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

  // WhatsApp share
  const shareBtn = document.getElementById('shareWhatsAppBtn');
  if (shareBtn) shareBtn.addEventListener('click', shareOnWhatsApp);

  // Modal openers
  const prayerBtn    = document.getElementById('openPrayerModalBtn');
  const mysteriesBtn = document.getElementById('openMysteriesBtn');
  if (prayerBtn)    prayerBtn.addEventListener('click', () => openModal('prayerModal'));
  if (mysteriesBtn) mysteriesBtn.addEventListener('click', () => openModal('mysteriesModal'));

  // Generic modal close triggers
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

// ─── Initialization ───────────────────────────────────────────────────────────
async function initApp() {
  renderTodaysMysteries();
  setupEventListeners();
  updateUI();

  // Fetch real authoritative campaign data
  try {
    const data = await apiFetchTotal();
    applyServerData(data);
  } catch (err) {
    console.warn('Initial server connection attempt:', err);
    showToast('Connecting to shared campaign server…', true);
  }

  // Begin live polling
  startPolling();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
