// history.js - Clean Version with Database Session Management

let currentUsername = '';
let currentSessionData = null;
let announcementCheckInterval = null;

// Mobile detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

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
            if (isMobile) usernameDisplay.style.fontSize = '14px';
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
        localStorage.removeItem(`taskHistory_${currentUsername}`);
        
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
    const el = document.getElementById('announcement');
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
            font-size: ${isMobile ? '0.9rem' : '1rem'};
        `;

    } catch (err) {
        console.error("[Announcement] Failed:", err.message);
        el.innerHTML = '📢 اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ.';
    }
}

// ==================== UTILITY FUNCTIONS ====================

let starsInitialized = false;

function createStars() {
    if (starsInitialized) return;
    
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
        star.style.animationDelay = `${Math.random() * 3}s`;
        starsContainer.appendChild(star);
    }
    
    starsInitialized = true;
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== NOTIFICATION SYSTEM ====================

let notificationTimeout = null;

function showNotification(message, type = "info") {
    const el = document.getElementById('notification');
    const msgEl = document.getElementById('notification-message');
    
    if (!el || !msgEl) return;

    msgEl.textContent = message;
    
    el.className = 'notification';
    if (type === "success") el.classList.add('success');
    if (type === "error")   el.classList.add('error');
    if (type === "warning") el.classList.add('warning');

    el.classList.remove('hidden');
    
    if (notificationTimeout) clearTimeout(notificationTimeout);
    notificationTimeout = setTimeout(() => {
        el.classList.add('hidden');
    }, 3000);
}

// ==================== HISTORY FUNCTIONS ====================

async function loadHistory() {
    if (!currentUsername) return;

    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    historyList.innerHTML = '<tr><td colspan="9">Loading tasks...<\/td><\/tr>';

    let displayTasks = [];

    try {
        const { data: dbTasks, error } = await supabaseClient
            .from('tasks')
            .select('id, day, text, deadline, done, created_at')
            .eq('username', currentUsername)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn("Could not fetch from Supabase:", error.message);
        }

        let localTasks = JSON.parse(localStorage.getItem(`taskHistory_${currentUsername}`) || '[]');
        const localMap = new Map(localTasks.map(t => [t.id, t]));

        if (dbTasks && dbTasks.length > 0) {
            dbTasks.forEach(dbTask => {
                const taskObj = {
                    id: dbTask.id,
                    creationDate: dbTask.created_at ? new Date(dbTask.created_at).toLocaleString('en-US') : '-',
                    day: dbTask.day || '-',
                    text: dbTask.text || '-',
                    deadline: dbTask.deadline || '-',
                    done: !!dbTask.done
                };
                localMap.set(dbTask.id, taskObj);
            });
        }

        localTasks = Array.from(localMap.values());
        localStorage.setItem(`taskHistory_${currentUsername}`, JSON.stringify(localTasks));

        displayTasks = localTasks;

    } catch (err) {
        console.error("Error in loadHistory:", err);
        displayTasks = JSON.parse(localStorage.getItem(`taskHistory_${currentUsername}`) || '[]');
    }

    historyList.innerHTML = '';

    if (displayTasks.length === 0) {
        historyList.innerHTML = '<tr><td colspan="9">No tasks found<\/td><\/tr>';
        return;
    }

    displayTasks.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.dataset.id = entry.id || `local-${index}`;

        const isDone = entry.done === true;
        const statusText = isDone ? 'Inactive' : 'Active';

        row.innerHTML = `
            <td class="text-center">
                <input type="checkbox" class="task-select" data-index="${index}">
             </td>
             <td>${escapeHtml(entry.creationDate || '-')}</td>
             <td>${escapeHtml(entry.text || '-')}</td>
             <td>${escapeHtml(entry.day || '-')}</td>
             <td>${escapeHtml(entry.deadline || '-')}</td>
            <td class="text-center">${isDone ? '✅' : '⬜'}</td>
            <td class="text-center">${statusText}</td>
        `;

        historyList.appendChild(row);
    });

    updateSelectAllCheckbox();
}

function toggleSelectAll() {
    const selectAll = document.getElementById('selectAll');
    if (!selectAll) return;
    const checkboxes = document.querySelectorAll('.task-select');
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
}

function updateSelectAllCheckbox() {
    const selectAll = document.getElementById('selectAll');
    if (!selectAll) return;

    const checkboxes = document.querySelectorAll('.task-select');
    const allChecked   = Array.from(checkboxes).every(cb => cb.checked);
    const someChecked  = Array.from(checkboxes).some(cb => cb.checked);

    selectAll.checked = allChecked;
    selectAll.indeterminate = someChecked && !allChecked;
}

function clearSelectedTasks() {
    if (!currentUsername) {
        showNotification("No user logged in", "error");
        return;
    }

    const checkboxes = document.querySelectorAll('.task-select:checked');
    if (checkboxes.length === 0) {
        showNotification("Please select at least one task to remove from history", "warning");
        return;
    }

    let tasks = JSON.parse(localStorage.getItem(`taskHistory_${currentUsername}`) || '[]');
    const indices = Array.from(checkboxes)
        .map(cb => parseInt(cb.dataset.index))
        .sort((a, b) => b - a);

    indices.forEach(idx => tasks.splice(idx, 1));

    localStorage.setItem(`taskHistory_${currentUsername}`, JSON.stringify(tasks));
    
    showNotification(`Removed ${indices.length} task(s) from history`, "success");
    
    loadHistory();
}

// ==================== PAGE LOAD ====================

document.addEventListener('DOMContentLoaded', async () => {
    console.log("History page loading - Session based on DB");
    
    const isValid = await checkSessionAndRedirect();
    if (!isValid) return;
    
    createStars();
    await loadAnnouncement();
    await loadHistory();

    // Setup event listeners
    const historyList = document.getElementById('historyList');
    if (historyList) {
        historyList.addEventListener('change', e => {
            if (e.target.classList.contains('task-select')) {
                updateSelectAllCheckbox();
            }
        });
    }

    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.addEventListener('change', toggleSelectAll);
    }
    
    // Refresh announcement every hour
    setInterval(() => {
        loadAnnouncement();
    }, 60 * 60 * 1000);

    // Sidebar close on outside click
    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar?.classList.contains('open') &&
            !sidebar.contains(e.target) &&
            !e.target.classList.contains('menu-toggle')) {
            sidebar.classList.remove('open');
        }
    });
    
    console.log("✅ History page initialized for user:", currentUsername);
});