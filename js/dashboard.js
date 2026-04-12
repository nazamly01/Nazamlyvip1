// dashboard.js - Clean Version with Database Session Management

let currentUsername = '';
let currentSessionData = null;
let myChart = null;
let dayCharts = {};
let currentTasks = [];
let isUpdating = false;
let realtimeChannel = null;
let updateQueue = [];
let updateTimer = null;
let announcementCheckInterval = null;
let starsInitialized = false;

// Mobile detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isLowEndDevice = isMobile && (navigator.hardwareConcurrency <= 4 || !window.requestIdleCallback);

// Performance flags
let chartsEnabled = !isMobile;
let starsEnabled = !isMobile;
let animationEnabled = !isMobile;
let mobileChartQuality = isMobile ? 'low' : 'high';

// ==================== SESSION MANAGEMENT (DATABASE BASED) ====================

async function checkSessionAndRedirect() {
    try {
        const sessionStr = localStorage.getItem('nazamly_session');
        if (!sessionStr) {
            console.log("No session found, redirecting to login");
            window.location.href = 'login.html';
            return false;
        }
        
        const sessionData = JSON.parse(sessionStr);
        const now = new Date();
        const expiresAt = new Date(sessionData.expiresAt);
        
        if (now > expiresAt) {
            console.log("Session expired, redirecting to login");
            await clearSessionFromStorage();
            window.location.href = 'login.html';
            return false;
        }
        
        const { data: dbSession, error } = await supabaseClient
            .from('user_sessions')
            .select('*')
            .eq('session_token', sessionData.sessionToken)
            .eq('user_id', sessionData.userId)
            .eq('is_active', true)
            .maybeSingle();
        
        if (error || !dbSession) {
            console.log("Invalid session, redirecting to login");
            await clearSessionFromStorage();
            window.location.href = 'login.html';
            return false;
        }
        
        const dbExpiresAt = new Date(dbSession.expires_at);
        if (now > dbExpiresAt) {
            console.log("Session expired in DB, redirecting to login");
            await clearSessionFromStorage();
            window.location.href = 'login.html';
            return false;
        }
        
        // Update last active
        supabaseClient
            .from('user_sessions')
            .update({ last_active: now.toISOString() })
            .eq('id', dbSession.id);
        
        currentSessionData = sessionData;
        currentUsername = sessionData.username;
        
        const usernameDisplay = document.getElementById('usernameDisplay');
        if (usernameDisplay) {
            usernameDisplay.textContent = `Welcome, ${currentUsername}`;
        }
        
        console.log("✅ Session valid for user:", currentUsername);
        return true;
        
    } catch (err) {
        console.error("Session check error:", err);
        window.location.href = 'login.html';
        return false;
    }
}

async function clearSessionFromStorage() {
    try {
        const sessionStr = localStorage.getItem('nazamly_session');
        if (sessionStr) {
            const sessionData = JSON.parse(sessionStr);
            await supabaseClient
                .from('user_sessions')
                .update({ is_active: false })
                .eq('session_token', sessionData.sessionToken);
        }
        
        localStorage.removeItem('nazamly_session');
        localStorage.removeItem(`tasks_cache_${currentUsername}`);
        localStorage.removeItem(`weeklyPlannerSubjects_${currentUsername}`);
        localStorage.removeItem(`sync_queue_${currentUsername}`);
        
    } catch (err) {
        console.error("Clear session error:", err);
    }
}

async function logout() {
    await clearSessionFromStorage();
    window.location.href = 'login.html';
}

// ==================== ANNOUNCEMENT (ALWAYS FROM DB) ====================

async function loadAnnouncement() {
    const el = document.getElementById('announcementBar');
    if (!el) return;

    try {
        const { data, error } = await supabaseClient
            .from('app_settings')
            .select('value')
            .eq('key', 'announcement_text')
            .maybeSingle();

        let text = '📢 اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ.';
        
        if (!error && data && data.value) {
            text = data.value;
            console.log("✅ Announcement loaded from DB:", text);
        }

        el.innerHTML = text;
        el.style.cssText = `
            color: #ffffff;
            font-weight: 500;
            background: rgba(71, 1, 66, 0.12);
            border-radius: 8px;
            padding: 10px 16px;
            margin: 12px 0;
            border: 1px solid rgba(81, 4, 83, 0.3);
            text-align: center;
            font-size: ${isMobile ? '0.9rem' : '1.1rem'};
        `;

    } catch (err) {
        console.error("[Announcement] Failed:", err.message);
        el.innerHTML = '📢 اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ.';
    }
}

// ==================== SIDEBAR ====================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

// ==================== STARS ====================

function createStars() {
    if (!starsEnabled || starsInitialized) return;
    
    const starsContainer = document.getElementById('stars');
    if (!starsContainer) return;
    
    starsContainer.innerHTML = '';
    
    const starCount = isMobile ? 50 : 150;
    
    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.width  = `${Math.random() * 3 + 1}px`;
        star.style.height = star.style.width;
        star.style.left   = `${Math.random() * 100}%`;
        star.style.top    = `${Math.random() * 100}%`;
        
        if (animationEnabled) {
            star.style.animationDelay = `${Math.random() * 3}s`;
        } else {
            star.style.opacity = '0.5';
        }
        
        starsContainer.appendChild(star);
    }
    
    starsInitialized = true;
}

// ==================== TASKS FUNCTIONS ====================

async function getUserTasks(limit = null, offset = 0) {
    if (!currentUsername) return [];

    const mobileLimit = isMobile ? 200 : 500;
    const finalLimit = limit || mobileLimit;

    const { data, error } = await supabaseClient
        .from('tasks')
        .select('id, day, deadline, done, created_at')
        .eq('username', currentUsername)
        .order('created_at', { ascending: false })
        .range(offset, offset + finalLimit - 1);

    if (error) {
        console.error("[Tasks] Load error:", error.message);
        return [];
    }

    const mappedTasks = data.map(task => ({
        id: task.id,
        day: task.day,
        creationDate: task.created_at ? new Date(task.created_at).toISOString().split('T')[0] : '-',
        done: task.done || false,
        deleted: false,
        deadline: task.deadline || null,
    }));
    
    currentTasks = mappedTasks;
    return mappedTasks;
}

function updateStatistics(tasks) {
    const total = tasks.length || 0;
    const done = tasks.filter(t => t.done).length || 0;
    const active = tasks.filter(t => !t.done).length || 0;

    const totalEl = document.getElementById('totalTasks');
    const doneEl = document.getElementById('doneTasks');
    const activeEl = document.getElementById('activeTasks');
    const deletedEl = document.getElementById('deletedTasks');
    
    if (totalEl) totalEl.textContent = total;
    if (doneEl) doneEl.textContent = done;
    if (activeEl) activeEl.textContent = active;
    if (deletedEl) deletedEl.textContent = 0;
    
    return { total, done, active };
}

function updateDailyStatsTable(tasks) {
    const statsMap = new Map();
    tasks.forEach(task => {
        const date = task.creationDate || task.deadline || '-';
        if (!statsMap.has(date)) {
            statsMap.set(date, { added: 0, done: 0, active: 0, deleted: 0 });
        }
        statsMap.get(date).added++;
        if (task.done) statsMap.get(date).done++;
        else statsMap.get(date).active++;
    });

    const sortedDates = [...statsMap.keys()].sort((a, b) => new Date(b) - new Date(a));
    const visibleDates = isMobile ? sortedDates.slice(0, 30) : sortedDates;

    const statsList = document.getElementById('statsList');
    if (statsList) {
        statsList.innerHTML = '';

        if (visibleDates.length === 0) {
            statsList.innerHTML = `<tr><td colspan="5">No data available</td></tr>`;
        } else {
            visibleDates.forEach(date => {
                const s = statsMap.get(date);
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${date}</td>
                    <td>${s.added || 0}</td>
                    <td>${s.done || 0}</td>
                    <td>${s.active || 0}</td>
                    <td>${s.deleted || 0}</td>
                `;
                statsList.appendChild(row);
            });
            
            if (isMobile && sortedDates.length > 30) {
                const indicatorRow = document.createElement('tr');
                indicatorRow.innerHTML = `<td colspan="5" style="text-align:center; opacity:0.7;">+ ${sortedDates.length - 30} more days</td>`;
                statsList.appendChild(indicatorRow);
            }
        }
    }
}

function updateOverallChart(done, active) {
    const ctx = document.getElementById('statsChart')?.getContext('2d');
    if (!ctx) return;
    
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: true,
        cutout: isMobile ? '60%' : '65%',
        animation: animationEnabled ? {
            duration: 300,
            easing: 'easeOutQuart'
        } : false,
        plugins: {
            legend: {
                position: isMobile ? 'bottom' : 'top',
                labels: { 
                    color: '#ffffff', 
                    font: { size: isMobile ? 10 : 14 },
                    boxWidth: isMobile ? 8 : 12
                }
            },
            tooltip: { enabled: !isMobile }
        }
    };

    if (myChart) {
        myChart.data.datasets[0].data = [done, active];
        myChart.update({ duration: animationEnabled ? 300 : 0 });
    } else {
        myChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Done', 'Active'],
                datasets: [{
                    data: [done, active],
                    backgroundColor: ['#4CAF50', '#F44336'],
                    borderWidth: 0
                }]
            },
            options: chartOptions
        });
    }
}

function updateDayCharts(tasks) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    days.forEach(day => {
        const canvas = document.getElementById(`chart-${day}`);
        if (!canvas) return;
        
        const dayTasks = tasks.filter(t => t.day === day);
        const dayDone = dayTasks.filter(t => t.done).length;
        const dayActive = dayTasks.filter(t => !t.done).length;
        
        const ctx = canvas.getContext('2d');
        
        if (dayCharts[day]) {
            dayCharts[day].destroy();
        }
        
        dayCharts[day] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Done', 'Active'],
                datasets: [{
                    data: [dayDone, dayActive],
                    backgroundColor: ['#4CAF50', '#F44336'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: isMobile ? '65%' : '70%',
                animation: animationEnabled ? { duration: 300 } : false,
                plugins: {
                    legend: { 
                        position: isMobile ? 'bottom' : 'top',
                        labels: { 
                            color: '#ffffff',
                            font: { size: isMobile ? 8 : 12 },
                            boxWidth: isMobile ? 6 : 10
                        }
                    },
                    tooltip: { enabled: !isMobile }
                }
            }
        });
    });
}

// ==================== REALTIME ====================

function queueRealtimeUpdate(change) {
    updateQueue.push(change);
    
    if (updateTimer) clearTimeout(updateTimer);
    
    const batchDelay = isMobile ? 300 : 100;
    
    updateTimer = setTimeout(() => {
        processBatchUpdates();
    }, batchDelay);
}

function processBatchUpdates() {
    if (updateQueue.length === 0 || isUpdating) return;
    
    isUpdating = true;
    
    try {
        updateQueue.forEach(change => {
            const { eventType, new: newRecord, old: oldRecord } = change;
            
            switch (eventType) {
                case 'INSERT':
                    const newTask = {
                        id: newRecord.id,
                        day: newRecord.day,
                        creationDate: newRecord.created_at ? new Date(newRecord.created_at).toISOString().split('T')[0] : '-',
                        done: newRecord.done || false,
                        deleted: false,
                        deadline: newRecord.deadline || null,
                    };
                    currentTasks.unshift(newTask);
                    break;
                    
                case 'UPDATE':
                    const index = currentTasks.findIndex(t => t.id === oldRecord.id);
                    if (index !== -1) {
                        currentTasks[index] = {
                            ...currentTasks[index],
                            day: newRecord.day,
                            done: newRecord.done || false,
                            deadline: newRecord.deadline,
                        };
                    }
                    break;
                    
                case 'DELETE':
                    const deleteIndex = currentTasks.findIndex(t => t.id === oldRecord.id);
                    if (deleteIndex !== -1) {
                        currentTasks.splice(deleteIndex, 1);
                    }
                    break;
            }
        });
        
        const stats = updateStatistics(currentTasks);
        updateOverallChart(stats.done, stats.active);
        updateDailyStatsTable(currentTasks);
        updateDayCharts(currentTasks);
        
        updateQueue = [];
        
    } finally {
        isUpdating = false;
    }
}

function setupRealtime() {
    if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
    }
    
    realtimeChannel = supabaseClient
        .channel(`tasks-changes:${currentUsername}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'tasks',
            filter: `username=eq.${currentUsername}`
        }, (payload) => {
            console.log('Realtime: tasks changed - queuing update');
            queueRealtimeUpdate({
                eventType: payload.eventType,
                new: payload.new,
                old: payload.old
            });
        })
        .subscribe();
}

// ==================== DASHBOARD FUNCTIONS ====================

async function loadDashboard() {
    if (!currentUsername) return;

    if (isMobile) {
        const loadingEl = document.getElementById('loadingIndicator');
        if (loadingEl) loadingEl.style.display = 'block';
    }

    try {
        const tasks = await getUserTasks();
        const stats = updateStatistics(tasks);
        updateDailyStatsTable(tasks);
        updateOverallChart(stats.done, stats.active);
        updateDayCharts(tasks);
    } finally {
        if (isMobile) {
            const loadingEl = document.getElementById('loadingIndicator');
            if (loadingEl) loadingEl.style.display = 'none';
        }
    }
}

function confirmClearAll() {
    if (confirm('Are you sure you want to clear all tasks? This cannot be undone.')) {
        clearAllData();
    }
}

async function clearAllData() {
    if (!currentUsername) return;

    try {
        const { error } = await supabaseClient
            .from('tasks')
            .delete()
            .eq('username', currentUsername);

        if (error) throw error;

        currentTasks = [];
        await loadDashboard();
        alert('All tasks cleared.');
    } catch (err) {
        console.error("Clear failed:", err.message);
        alert("Error clearing tasks");
    }
}

function downloadDashboard() {
    const dashboardContent = document.getElementById('dashboardContent');
    if (!dashboardContent) return;

    const tempContainer = document.createElement('div');
    tempContainer.style.backgroundColor = '#0c120d';
    tempContainer.style.padding = '2.5rem';
    tempContainer.style.borderRadius = '0.75rem';
    tempContainer.style.margin = 'auto';
    tempContainer.style.width = 'fit-content';
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';

    const clone = dashboardContent.cloneNode(true);
    clone.querySelector('.controls')?.remove();
    clone.querySelectorAll('button').forEach(btn => btn.remove());

    tempContainer.appendChild(clone);
    document.body.appendChild(tempContainer);

    const overallCanvas = tempContainer.querySelector('#statsChart');
    const origOverall = document.getElementById('statsChart');
    if (overallCanvas && origOverall) {
        overallCanvas.width = origOverall.width;
        overallCanvas.height = origOverall.height;
        overallCanvas.getContext('2d').drawImage(origOverall, 0, 0);
    }

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(day => {
        const dayCanvas = tempContainer.querySelector(`#chart-${day}`);
        const origDay = document.getElementById(`chart-${day}`);
        if (dayCanvas && origDay) {
            dayCanvas.width = origDay.width;
            dayCanvas.height = origDay.height;
            dayCanvas.getContext('2d').drawImage(origDay, 0, 0);
        }
    });

    html2canvas(tempContainer, { backgroundColor: '#0c120d' }).then(canvas => {
        const link = document.createElement('a');
        link.download = 'dashboard.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        document.body.removeChild(tempContainer);
    }).catch(err => {
        console.error('Dashboard PNG error:', err);
        alert('Failed to download dashboard image.');
        document.body.removeChild(tempContainer);
    });
}

// ==================== MOBILE UI ====================

function addMobileUI() {
    if (!isMobile) return;
    
    if (!document.getElementById('loadingIndicator')) {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'loadingIndicator';
        loadingDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 9999;
            display: none;
            font-size: 14px;
        `;
        loadingDiv.textContent = 'Loading...';
        document.body.appendChild(loadingDiv);
    }
    
    if (!document.querySelector('meta[name="viewport"]')) {
        const meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        document.head.appendChild(meta);
    }
}

function showTemporaryMessage(message) {
    if (!isMobile) return;
    
    let messageEl = document.getElementById('tempMessage');
    if (!messageEl) {
        messageEl = document.createElement('div');
        messageEl.id = 'tempMessage';
        messageEl.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(76, 175, 80, 0.95);
            color: white;
            padding: 8px 16px;
            border-radius: 8px;
            z-index: 9999;
            font-size: 14px;
            pointer-events: none;
            white-space: nowrap;
        `;
        document.body.appendChild(messageEl);
    }
    
    messageEl.textContent = message;
    messageEl.style.display = 'block';
    
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 2000);
}

// ==================== THROTTLE/DEBOUNCE ====================

function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ==================== PAGE LOAD ====================

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Dashboard loading - Mobile optimized mode:", isMobile);
    
    addMobileUI();
    
    const isValid = await checkSessionAndRedirect();
    if (!isValid) return;
    
    createStars();
    await loadDashboard();
    await loadAnnouncement();
    setupRealtime();
    
    // Refresh announcement every hour (optional)
    setInterval(() => {
        loadAnnouncement();
    }, 60 * 60 * 1000);
    
    const usernameDisplay = document.getElementById('usernameDisplay');
    if (usernameDisplay) {
        usernameDisplay.style.fontSize = isMobile ? '16px' : '18px';
    }
    
    console.log("✅ Dashboard initialized for user:", currentUsername);

    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar?.classList.contains('open') &&
            !sidebar.contains(e.target) &&
            !e.target.classList.contains('menu-toggle')) {
            sidebar.classList.remove('open');
        }
    });
});