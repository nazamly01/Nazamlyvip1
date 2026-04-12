// ─── Web Worker (inline blob) for accurate background ticking ───────────────
const WORKER_CODE = `
let intervalId = null;
self.onmessage = function(e) {
  if (e.data === 'start') {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => self.postMessage('tick'), 1000);
  } else if (e.data === 'stop') {
    clearInterval(intervalId);
    intervalId = null;
  }
};
`;

// ─── Main Timer Class ────────────────────────────────────────────────────────
class PurpleFlipTimer {
  constructor() {
    // DOM refs
    this.hoursCard    = document.getElementById('hoursCard');
    this.minutesCard  = document.getElementById('minutesCard');
    this.secondsCard  = document.getElementById('secondsCard');
    this.startBtn     = document.getElementById('startBtn');
    this.pauseBtn     = document.getElementById('pauseBtn');
    this.resetBtn     = document.getElementById('resetBtn');
    this.modeBtns     = document.querySelectorAll('.mode-btn');
    this.modeIndicator    = document.getElementById('modeIndicator');
    this.countdownInput   = document.getElementById('countdownInput');
    this.progressContainer= document.getElementById('progressContainer');
    this.progressBar      = document.getElementById('progressBar');
    this.pomodoroStatus   = document.getElementById('pomodoroStatus');
    this.setCountdownBtn  = document.getElementById('setCountdownBtn');
    this.saveIndicator    = document.getElementById('saveIndicator');
    this.intentDisplay    = document.getElementById('intentDisplay');

    // Timer state
    this.currentMode  = 'timer';
    this.isRunning    = false;
    this.currentTime  = { hours: 0, minutes: 0, seconds: 0 };
    this.initialTime  = { hours: 0, minutes: 0, seconds: 0 };
    this.startEpoch   = null;   // Date.now() at last start
    this.elapsedAtStart = 0;    // seconds already elapsed before last start

    // Pomodoro state
    this.pomodoroPhase  = 'focus';
    this.pomodoroCycle  = 1;
    this.focusDuration  = { minutes: 25, seconds: 0 };
    this.breakDuration  = { minutes: 5,  seconds: 0 };
    this.completedPomodoros = 0;

    // Session intent
    this.sessionIntent = '';

    // Previous values for flip animation per digit
    this.prevValues = { hours: '--', minutes: '--', seconds: '--' };

    // Stats / history
    this.sessions = JSON.parse(localStorage.getItem('timerSessions') || '[]');

    // Web Worker
    this._initWorker();

    // Audio
    this._createAudio();

    // Load saved state, then boot UI
    this.loadState();
    this.updateDisplay(true);
    this._initEventListeners();
    this._initSidebar();
    this._initIntentModal();
    this._initAnalysisSection();

    this.showSaveIndicator('Ready');
  }

  // ── Web Worker ─────────────────────────────────────────────────────────────
  _initWorker() {
    try {
      const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob));
      this.worker.onmessage = () => this._tick();
    } catch(e) {
      // Fallback: plain setInterval if workers unavailable
      this.worker = null;
    }
  }

  // ── Audio ───────────────────────────────────────────────────────────────────
  _createAudio() {
    this.beep = () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 1);
        osc.start(); osc.stop(ctx.currentTime + 1);
      } catch(e) { /* silent */ }
    };
  }

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  _initSidebar() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar    = document.getElementById('sidebar');
    const overlay    = document.getElementById('sidebarOverlay');

    const toggle = () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
    };
    if (menuToggle) menuToggle.addEventListener('click', toggle);
    if (overlay)    overlay.addEventListener('click', toggle);

    // expose for inline onclick
    window.toggleSidebar = toggle;
    window.logout = () => { this.showNotification('👋 Logged out'); toggle(); };
  }

  // ── Session Intent Modal ────────────────────────────────────────────────────
  _initIntentModal() {
    // Insert modal HTML
    const modal = document.createElement('div');
    modal.id = 'intentModal';
    modal.innerHTML = `
      <div class="intent-backdrop"></div>
      <div class="intent-card">
        <div class="intent-icon">🎯</div>
        <h2 class="intent-title">What will you focus on?</h2>
        <p class="intent-subtitle">Set a clear intention for this Pomodoro session</p>
        <textarea id="intentInput" class="intent-textarea" placeholder="e.g. Complete chapter 3 of my book, finish the landing page, study linear algebra…" maxlength="140" rows="3"></textarea>
        <div class="intent-chars"><span id="intentCharCount">0</span>/140</div>
        <div class="intent-actions">
          <button id="intentSkipBtn" class="intent-btn intent-btn--ghost">Skip</button>
          <button id="intentConfirmBtn" class="intent-btn intent-btn--primary">Start Session ▶</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const textarea  = document.getElementById('intentInput');
    const charCount = document.getElementById('intentCharCount');
    const confirmBtn= document.getElementById('intentConfirmBtn');
    const skipBtn   = document.getElementById('intentSkipBtn');

    textarea.addEventListener('input', () => {
      charCount.textContent = textarea.value.length;
    });

    confirmBtn.addEventListener('click', () => {
      this.sessionIntent = textarea.value.trim();
      this._closeIntentModal();
      this._doStart();
    });

    skipBtn.addEventListener('click', () => {
      this.sessionIntent = '';
      this._closeIntentModal();
      this._doStart();
    });
  }

  _openIntentModal() {
    const modal    = document.getElementById('intentModal');
    const textarea = document.getElementById('intentInput');
    const charCount= document.getElementById('intentCharCount');
    textarea.value = '';
    charCount.textContent = '0';
    modal.classList.add('open');
    setTimeout(() => textarea.focus(), 300);
  }

  _closeIntentModal() {
    document.getElementById('intentModal').classList.remove('open');
    this._updateIntentDisplay();
  }

  _updateIntentDisplay() {
    const el = document.getElementById('intentDisplay');
    if (!el) return;
    if (this.sessionIntent && this.isRunning && this.currentMode === 'pomodoro') {
      el.innerHTML = `<span class="intent-label">🎯 Focus:</span><span class="intent-text">${this._escapeHtml(this.sessionIntent)}</span>`;
      el.style.display = 'flex';
    } else {
      el.style.display = 'none';
    }
  }

  _escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Analysis Section ────────────────────────────────────────────────────────
  _initAnalysisSection() {
    // Insert analysis HTML after .app-container
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) return;

    const section = document.createElement('div');
    section.id = 'analysisSection';
    section.innerHTML = `
      <div class="analysis-header">
        <h2 class="analysis-title">📊 Focus Analytics</h2>
        <div class="analysis-tabs">
          <button class="atab active" data-tab="overview">Overview</button>
          <button class="atab" data-tab="daily">Daily</button>
          <button class="atab" data-tab="sessions">Sessions</button>
        </div>
      </div>

      <div class="analysis-panel" id="tab-overview">
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value" id="statTotalTime">0h 0m</div><div class="stat-label">Total Focus Time</div></div>
          <div class="stat-card"><div class="stat-value" id="statSessions">0</div><div class="stat-label">Sessions</div></div>
          <div class="stat-card"><div class="stat-value" id="statPomodoros">0</div><div class="stat-label">Pomodoros Done</div></div>
          <div class="stat-card"><div class="stat-value" id="statAvgSession">0m</div><div class="stat-label">Avg Session</div></div>
        </div>
        <div class="charts-row">
          <div class="chart-box">
            <div class="chart-label">Focus vs Planned (last 7 sessions)</div>
            <canvas id="chartFocusVsPlanned" height="180"></canvas>
          </div>
          <div class="chart-box">
            <div class="chart-label">Pomodoro Completion Rate</div>
            <canvas id="chartPomodoro" height="180"></canvas>
          </div>
        </div>
      </div>

      <div class="analysis-panel hidden" id="tab-daily">
        <div class="chart-box full-width">
          <div class="chart-label">Daily Focus Minutes (last 14 days)</div>
          <canvas id="chartDaily" height="200"></canvas>
        </div>
      </div>

      <div class="analysis-panel hidden" id="tab-sessions">
        <div class="sessions-list" id="sessionsList"></div>
      </div>
    `;
    appContainer.insertAdjacentElement('afterend', section);

    // Tab switching
    section.querySelectorAll('.atab').forEach(btn => {
      btn.addEventListener('click', () => {
        section.querySelectorAll('.atab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        section.querySelectorAll('.analysis-panel').forEach(p => p.classList.add('hidden'));
        document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
        this._renderCharts();
      });
    });

    this._renderCharts();
  }

  _renderCharts() {
    this._renderOverviewStats();
    this._renderFocusVsPlannedChart();
    this._renderPomodoroChart();
    this._renderDailyChart();
    this._renderSessionsList();
  }

  _renderOverviewStats() {
    const sessions = this.sessions;
    const totalSec = sessions.reduce((a, s) => a + (s.actualSeconds || 0), 0);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const avgSec = sessions.length ? Math.floor(totalSec / sessions.length) : 0;

    const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    set('statTotalTime', `${h}h ${m}m`);
    set('statSessions', sessions.length);
    set('statPomodoros', this.completedPomodoros + (parseInt(localStorage.getItem('completedPomodoros')) || 0));
    set('statAvgSession', `${Math.floor(avgSec/60)}m`);
  }

  _chartColors() {
    return {
      purple: 'rgba(139,92,246,0.85)',
      purpleLight: 'rgba(192,132,252,0.85)',
      purpleFade: 'rgba(139,92,246,0.2)',
      grid: 'rgba(139,92,246,0.1)',
      text: '#a78bfa',
    };
  }

  _destroyChart(id) {
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
  }

  _renderFocusVsPlannedChart() {
    const canvas = document.getElementById('chartFocusVsPlanned');
    if (!canvas || typeof Chart === 'undefined') return;
    this._destroyChart('chartFocusVsPlanned');

    const last7 = this.sessions.slice(-7);
    const labels = last7.map((s, i) => `S${i+1}`);
    const planned = last7.map(s => Math.round((s.plannedSeconds || 0) / 60));
    const actual  = last7.map(s => Math.round((s.actualSeconds || 0) / 60));
    const c = this._chartColors();

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Planned (min)', data: planned, backgroundColor: c.purpleFade, borderColor: c.purpleLight, borderWidth: 2, borderRadius: 6 },
          { label: 'Actual (min)',  data: actual,  backgroundColor: c.purple,     borderColor: c.purple,      borderWidth: 2, borderRadius: 6 },
        ]
      },
      options: this._chartOptions()
    });
  }

  _renderPomodoroChart() {
    const canvas = document.getElementById('chartPomodoro');
    if (!canvas || typeof Chart === 'undefined') return;
    this._destroyChart('chartPomodoro');

    const done   = parseInt(localStorage.getItem('completedPomodoros') || '0') + this.completedPomodoros;
    const total  = done + (parseInt(localStorage.getItem('skippedPomodoros') || '0'));
    const skipped= Math.max(0, total - done);
    const c = this._chartColors();

    new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'Incomplete'],
        datasets: [{ data: [done || 1, skipped], backgroundColor: [c.purple, 'rgba(30,20,50,0.6)'], borderColor: ['transparent','transparent'], borderWidth: 0, hoverOffset: 6 }]
      },
      options: {
        responsive: true,
        cutout: '72%',
        plugins: {
          legend: { labels: { color: c.text, font: { family: 'Inter', size: 12 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}` } }
        }
      }
    });
  }

  _renderDailyChart() {
    const canvas = document.getElementById('chartDaily');
    if (!canvas || typeof Chart === 'undefined') return;
    this._destroyChart('chartDaily');

    // Build 14-day map
    const map = {};
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map[key] = 0;
    }
    this.sessions.forEach(s => {
      const key = (s.date || '').slice(0, 10);
      if (map[key] !== undefined) map[key] += Math.round((s.actualSeconds || 0) / 60);
    });

    const labels = Object.keys(map).map(k => { const d = new Date(k); return `${d.getMonth()+1}/${d.getDate()}`; });
    const data   = Object.values(map);
    const c = this._chartColors();

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Focus (min)',
          data,
          backgroundColor: data.map((v, i) => i === data.length-1 ? c.purple : c.purpleFade),
          borderColor: c.purpleLight,
          borderWidth: 1.5,
          borderRadius: 6,
        }]
      },
      options: this._chartOptions()
    });
  }

  _chartOptions() {
    const c = this._chartColors();
    return {
      responsive: true,
      plugins: {
        legend: { labels: { color: c.text, font: { family: 'Inter', size: 11 } } },
        tooltip: { backgroundColor: '#0a0a14', borderColor: c.purpleLight, borderWidth: 1, titleColor: '#e9eaff', bodyColor: c.text }
      },
      scales: {
        x: { ticks: { color: c.text, font: { size: 11 } }, grid: { color: c.grid } },
        y: { ticks: { color: c.text, font: { size: 11 } }, grid: { color: c.grid }, beginAtZero: true }
      }
    };
  }

  _renderSessionsList() {
    const el = document.getElementById('sessionsList');
    if (!el) return;
    if (!this.sessions.length) {
      el.innerHTML = '<p class="no-sessions">No sessions recorded yet. Start your first session!</p>';
      return;
    }
    const rows = [...this.sessions].reverse().slice(0, 20).map(s => {
      const date = new Date(s.date).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      const actual  = this._formatSecs(s.actualSeconds || 0);
      const planned = s.plannedSeconds ? this._formatSecs(s.plannedSeconds) : '—';
      const mode    = { timer:'⏱ Timer', countdown:'⏲ Countdown', pomodoro:'🍅 Pomodoro' }[s.mode] || s.mode;
      const intent  = s.intent ? `<span class="srow-intent">🎯 ${this._escapeHtml(s.intent)}</span>` : '';
      return `<div class="srow">
        <div class="srow-left"><span class="srow-mode">${mode}</span><span class="srow-date">${date}</span>${intent}</div>
        <div class="srow-right"><span class="srow-actual">${actual}</span><span class="srow-planned">${planned !== '—' ? `/ ${planned}` : ''}</span></div>
      </div>`;
    }).join('');
    el.innerHTML = rows;
  }

  _formatSecs(s) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  // ── Event Listeners ─────────────────────────────────────────────────────────
  _initEventListeners() {
    this.startBtn.addEventListener('click', () => this.startTimer());
    this.pauseBtn.addEventListener('click', () => this.pauseTimer());
    this.resetBtn.addEventListener('click', () => this.resetTimer());
    this.setCountdownBtn?.addEventListener('click', () => this.setCountdown());

    this.modeBtns.forEach(btn => {
      btn.addEventListener('click', () => this.switchMode(btn.dataset.mode));
    });

    // Correct drift when tab becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isRunning) this._correctDrift();
    });
  }

  // ── Mode Switching ──────────────────────────────────────────────────────────
  switchMode(mode) {
    if (this.isRunning) this.pauseTimer(true);
    this.currentMode = mode;
    this.sessionIntent = '';
    this._updateIntentDisplay();

    this.modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));

    const icons = { timer:'⏱️', countdown:'⏲️', pomodoro:'🍅' };
    const names = { timer:'Timer (Counting Up)', countdown:'Countdown', pomodoro:'Pomodoro' };
    this.modeIndicator.innerHTML = `<span class="mode-icon">${icons[mode]}</span><span class="mode-name">${names[mode]}</span>`;

    this.countdownInput.style.display    = mode === 'countdown' ? 'flex' : 'none';
    this.progressContainer.style.display = mode === 'pomodoro'  ? 'block' : 'none';
    this.pomodoroStatus.style.display    = mode === 'pomodoro'  ? 'flex' : 'none';

    if (mode === 'timer') {
      this.currentTime = { hours:0, minutes:0, seconds:0 };
      this.elapsedAtStart = 0;
    } else if (mode === 'countdown') {
      this.currentTime = { hours:0, minutes:5, seconds:0 };
      this.initialTime = { ...this.currentTime };
    } else if (mode === 'pomodoro') {
      this.pomodoroPhase = 'focus'; this.pomodoroCycle = 1;
      this.currentTime  = { hours:0, minutes:this.focusDuration.minutes, seconds:0 };
      this.initialTime  = { ...this.currentTime };
      this._updatePomodoroStatus();
      this.updateProgress(100);
    }

    this.updateDisplay(true);
    this.saveFullState();
    this.showSaveIndicator(`Mode: ${names[mode]}`);
  }

  // ── Set Countdown ───────────────────────────────────────────────────────────
  setCountdown() {
    const h = parseInt(document.getElementById('cdHours').value)   || 0;
    const m = parseInt(document.getElementById('cdMinutes').value) || 0;
    const s = parseInt(document.getElementById('cdSeconds').value) || 0;
    if (h < 0 || m < 0 || s < 0 || m > 59 || s > 59) return;
    this.currentTime = { hours:h, minutes:m, seconds:s };
    this.initialTime = { ...this.currentTime };
    this.updateDisplay(true);
    if (this.isRunning) { this.pauseTimer(true); this.startTimer(); }
    this.saveFullState();
    this.showSaveIndicator('Countdown set');
  }

  // ── Start / Pause / Reset ───────────────────────────────────────────────────
  startTimer() {
    if (this.isRunning) return;

    // For Pomodoro at the very beginning of a focus phase, show intent modal
    if (this.currentMode === 'pomodoro' && this.pomodoroPhase === 'focus' && !this.sessionIntent) {
      this._openIntentModal();
      return; // modal will call _doStart()
    }
    this._doStart();
  }

  _doStart() {
    if (this.isRunning) return;
    this.isRunning   = true;
    this.startEpoch  = Date.now();

    // Record planned seconds for this session
    this._sessionPlannedSeconds = this._timeToSeconds(this.currentTime);
    this._sessionStartTime = Date.now();

    if (this.worker) {
      this.worker.postMessage('start');
    } else {
      this._fallbackInterval = setInterval(() => this._tick(), 1000);
    }
    this._updateIntentDisplay();
  }

  pauseTimer(silent = false) {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.worker) {
      this.worker.postMessage('stop');
    } else {
      clearInterval(this._fallbackInterval);
    }

    // Save session record on manual pause (not silent internal pauses)
    if (!silent && this._sessionStartTime) {
      this._recordSession();
    }

    this.elapsedAtStart = this._currentTotalSeconds();
    this.saveFullState();
    this._updateIntentDisplay();
    if (!silent) this.showSaveIndicator('⏸ Paused & saved');
  }

  resetTimer() {
    this.pauseTimer(true);
    this.sessionIntent = '';
    this._updateIntentDisplay();

    if (this.currentMode === 'timer') {
      this.currentTime = { hours:0, minutes:0, seconds:0 };
      this.elapsedAtStart = 0;
    } else if (this.currentMode === 'countdown') {
      this.currentTime = { ...this.initialTime };
    } else if (this.currentMode === 'pomodoro') {
      this.pomodoroPhase  = 'focus'; this.pomodoroCycle = 1;
      this.currentTime    = { hours:0, minutes:this.focusDuration.minutes, seconds:0 };
      this.initialTime    = { ...this.currentTime };
      this._updatePomodoroStatus();
    }

    this.updateDisplay(true);
    this.updateProgress(this.currentMode === 'pomodoro' ? 100 : 0);
    this.saveFullState();
    this.showSaveIndicator('🔄 Reset');
  }

  // ── Drift Correction ────────────────────────────────────────────────────────
  _correctDrift() {
    if (!this.isRunning || !this.startEpoch) return;
    const elapsedMs = Date.now() - this.startEpoch;
    const expectedSecs = Math.floor(elapsedMs / 1000);
    const currentSecs  = this._currentTotalSeconds() - this.elapsedAtStart;
    const diff = expectedSecs - currentSecs;
    if (Math.abs(diff) > 1) {
      // Fast-forward / rewind
      for (let i = 0; i < Math.abs(diff); i++) {
        if (diff > 0) this._tickLogic();
        else this._untickLogic();
      }
      this.updateDisplay(false);
    }
  }

  _currentTotalSeconds() {
    return this.currentTime.hours * 3600 + this.currentTime.minutes * 60 + this.currentTime.seconds;
  }

  _timeToSeconds(t) { return t.hours * 3600 + t.minutes * 60 + t.seconds; }

  // ── Tick ────────────────────────────────────────────────────────────────────
  _tick() {
    if (!this.isRunning) return;
    this._tickLogic();
    this.updateDisplay(false);
    this.saveFullState();
  }

  _tickLogic() {
    if (this.currentMode === 'timer')      this._tickUp();
    else if (this.currentMode === 'countdown') this._tickDown();
    else if (this.currentMode === 'pomodoro')  this._tickPomodoro();
  }

  _untickLogic() {
    // Only needed for timer-up drift correction
    if (this.currentMode === 'timer') {
      if (this.currentTime.seconds > 0) this.currentTime.seconds--;
      else if (this.currentTime.minutes > 0) { this.currentTime.minutes--; this.currentTime.seconds = 59; }
      else if (this.currentTime.hours > 0)   { this.currentTime.hours--;   this.currentTime.minutes = 59; this.currentTime.seconds = 59; }
    }
  }

  _tickUp() {
    this.currentTime.seconds++;
    if (this.currentTime.seconds >= 60) { this.currentTime.seconds = 0; this.currentTime.minutes++; }
    if (this.currentTime.minutes >= 60) { this.currentTime.minutes = 0; this.currentTime.hours++; }
  }

  _tickDown() {
    if (this.currentTime.hours === 0 && this.currentTime.minutes === 0 && this.currentTime.seconds === 0) {
      this._recordSession();
      this._onCountdownComplete(); return;
    }
    if (this.currentTime.seconds > 0) { this.currentTime.seconds--; }
    else if (this.currentTime.minutes > 0) { this.currentTime.minutes--; this.currentTime.seconds = 59; }
    else if (this.currentTime.hours > 0)   { this.currentTime.hours--; this.currentTime.minutes = 59; this.currentTime.seconds = 59; }
  }

  _tickPomodoro() {
    if (this.currentTime.minutes === 0 && this.currentTime.seconds === 0) {
      this.beep && this.beep();
      this.pauseTimer(true);

      if (this.pomodoroPhase === 'focus') {
        this.completedPomodoros++;
        localStorage.setItem('completedPomodoros',
          (parseInt(localStorage.getItem('completedPomodoros')||'0') + 1).toString());
        this._recordSession();
        this.pomodoroPhase   = 'break';
        this.currentTime     = { hours:0, minutes:this.breakDuration.minutes, seconds:0 };
        this.initialTime     = { ...this.currentTime };
        this._updatePomodoroStatus();
        this.showNotification('☕ Break time! Well done.');
        setTimeout(() => this._doStart(), 100);
      } else {
        this.pomodoroPhase = 'focus';
        this.pomodoroCycle++;
        this.sessionIntent = '';
        this.currentTime   = { hours:0, minutes:this.focusDuration.minutes, seconds:0 };
        this.initialTime   = { ...this.currentTime };
        this._updatePomodoroStatus();
        this._updateIntentDisplay();
        this.showNotification('🍅 Focus time!');
        // Prompt intent again
        setTimeout(() => this._openIntentModal(), 400);
      }
      this.updateDisplay(true);
      this.updateProgress(100);
      this.saveFullState();
      this._renderCharts();
      return;
    }

    if (this.currentTime.seconds > 0) { this.currentTime.seconds--; }
    else if (this.currentTime.minutes > 0) { this.currentTime.minutes--; this.currentTime.seconds = 59; }

    const totalSecs   = this.pomodoroPhase === 'focus' ? this.focusDuration.minutes * 60 : this.breakDuration.minutes * 60;
    const currentSecs = this.currentTime.minutes * 60 + this.currentTime.seconds;
    this.updateProgress(((totalSecs - currentSecs) / totalSecs) * 100);
  }

  _onCountdownComplete() {
    this.beep && this.beep();
    this.pauseTimer(true);
    this.showNotification('⏰ Countdown complete!', 3000);
    this._renderCharts();
  }

  // ── Session Recording ───────────────────────────────────────────────────────
  _recordSession() {
    if (!this._sessionStartTime) return;
    const actualSeconds = Math.round((Date.now() - this._sessionStartTime) / 1000);
    this.sessions.push({
      date: new Date().toISOString(),
      mode: this.currentMode,
      actualSeconds,
      plannedSeconds: this._sessionPlannedSeconds || 0,
      intent: this.sessionIntent || '',
      phase: this.pomodoroPhase,
    });
    // Keep last 200 sessions
    if (this.sessions.length > 200) this.sessions = this.sessions.slice(-200);
    localStorage.setItem('timerSessions', JSON.stringify(this.sessions));
    this._sessionStartTime = null;
  }

  // ── Pomodoro Status ─────────────────────────────────────────────────────────
  _updatePomodoroStatus() {
    const stype = document.getElementById('sessionType');
    const ccnt  = document.getElementById('cycleCount');
    if (stype) stype.textContent = this.pomodoroPhase === 'focus' ? '🍅 Focus Session' : '☕ Break Time';
    if (ccnt)  ccnt.textContent  = `Cycle ${this.pomodoroCycle}`;
  }

  updateProgress(pct) {
    if (this.progressBar) this.progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  }

  // ── Flip Clock Display ──────────────────────────────────────────────────────
  updateDisplay(forceNoAnimate = false) {
    const h = String(this.currentTime.hours).padStart(2, '0');
    const m = String(this.currentTime.minutes).padStart(2, '0');
    const s = String(this.currentTime.seconds).padStart(2, '0');

    this._updateDigit('hours',   h, forceNoAnimate);
    this._updateDigit('minutes', m, forceNoAnimate);
    this._updateDigit('seconds', s, forceNoAnimate);
  }

  _updateDigit(unit, newValue, forceNoAnimate) {
    const card = document.getElementById(`${unit}Card`);
    if (!card) return;

    this.prevValues[unit] = newValue;

    // Flat digital display — just update the digit text
    const digitEl = card.querySelector('.digital-digit');
    if (digitEl) digitEl.textContent = newValue;
  }

  // ── Persistence ─────────────────────────────────────────────────────────────
  saveFullState() {
    localStorage.setItem('purpleFlipTimerState', JSON.stringify({
      currentMode: this.currentMode,
      currentTime: this.currentTime,
      initialTime: this.initialTime,
      pomodoroPhase: this.pomodoroPhase,
      pomodoroCycle: this.pomodoroCycle,
      completedPomodoros: this.completedPomodoros,
      elapsedAtStart: this.elapsedAtStart,
      isRunning: this.isRunning,
      sessionIntent: this.sessionIntent,
      timestamp: Date.now(),
    }));
  }

  loadState() {
    const raw = localStorage.getItem('purpleFlipTimerState');
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      this.currentMode       = s.currentMode || 'timer';
      this.currentTime       = s.currentTime || { hours:0, minutes:0, seconds:0 };
      this.initialTime       = s.initialTime || { hours:0, minutes:0, seconds:0 };
      this.pomodoroPhase     = s.pomodoroPhase || 'focus';
      this.pomodoroCycle     = s.pomodoroCycle || 1;
      this.completedPomodoros= s.completedPomodoros || 0;
      this.elapsedAtStart    = s.elapsedAtStart || 0;
      this.sessionIntent     = s.sessionIntent || '';

      // If it was running when saved, adjust for elapsed time
      if (s.isRunning && s.timestamp) {
        const gapSecs = Math.floor((Date.now() - s.timestamp) / 1000);
        if (gapSecs > 0 && gapSecs < 86400) {
          for (let i = 0; i < gapSecs; i++) this._tickLogic();
        }
      }

      // Restore UI state
      this.modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === this.currentMode));
      const icons = { timer:'⏱️', countdown:'⏲️', pomodoro:'🍅' };
      const names = { timer:'Timer (Counting Up)', countdown:'Countdown', pomodoro:'Pomodoro' };
      this.modeIndicator.innerHTML = `<span class="mode-icon">${icons[this.currentMode]}</span><span class="mode-name">${names[this.currentMode]}</span>`;
      this.countdownInput.style.display    = this.currentMode === 'countdown' ? 'flex' : 'none';
      this.progressContainer.style.display = this.currentMode === 'pomodoro'  ? 'block' : 'none';
      this.pomodoroStatus.style.display    = this.currentMode === 'pomodoro'  ? 'flex' : 'none';
      this._updatePomodoroStatus();

      if (this.currentMode === 'pomodoro') {
        const total   = (this.pomodoroPhase === 'focus' ? this.focusDuration.minutes : this.breakDuration.minutes) * 60;
        const current = this.currentTime.minutes * 60 + this.currentTime.seconds;
        this.updateProgress(((total - current) / total) * 100);
      }

      this.showSaveIndicator('Loaded');
    } catch(e) { /* ignore corrupt state */ }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  showSaveIndicator(msg = '💾 Auto-saved') {
    if (this.saveIndicator) {
      this.saveIndicator.textContent = msg;
      this.saveIndicator.style.opacity = '1';
      setTimeout(() => { if (this.saveIndicator) this.saveIndicator.style.opacity = '0.7'; }, 1500);
    }
  }

  showNotification(msg, duration = 2000) {
    const el = this.saveIndicator;
    if (!el) return;
    const orig = el.textContent;
    el.textContent = msg; el.style.opacity = '1';
    setTimeout(() => { if (el.textContent === msg) { el.textContent = orig; el.style.opacity = '0.7'; } }, duration);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Load Chart.js then init
  if (typeof Chart === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
    script.onload = () => { window._timerApp = new PurpleFlipTimer(); };
    document.head.appendChild(script);
  } else {
    window._timerApp = new PurpleFlipTimer();
  }
});