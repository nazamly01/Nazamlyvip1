// goals.js - Complete Version with Fixed toggleAchieved

let currentUsername = '';
let currentUserId = '';
let currentSessionData = null;
let starsInitialized = false;

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
        currentUserId = sessionData.userId;
        
        const usernameDisplay = document.getElementById('usernameDisplay');
        if (usernameDisplay) {
            usernameDisplay.textContent = `Welcome, ${currentUsername}`;
            if (isMobile) usernameDisplay.style.fontSize = '14px';
        }
        
        console.log("✅ Session valid for user:", currentUsername, "ID:", currentUserId);
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
        localStorage.removeItem(`user_goals_${currentUsername}`);
        
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
    const announcementEl = document.getElementById('announcement');
    if (!announcementEl) return;

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

        announcementEl.textContent = text;
        announcementEl.style.cssText = `
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
        announcementEl.textContent = '📢 اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ.';
    }
}

// ==================== UTILITY FUNCTIONS ====================

function showMessage(text, type = 'success') {
    const overlay = document.getElementById('messageOverlay');
    if (!overlay) return;
    
    overlay.textContent = text;
    if (type === 'success') {
        overlay.style.background = 'rgba(34,197,94,0.9)';
    } else if (type === 'error') {
        overlay.style.background = 'rgba(220,38,38,0.9)';
    } else if (type === 'warning') {
        overlay.style.background = 'rgba(255,152,0,0.9)';
    } else {
        overlay.style.background = 'rgba(34,197,94,0.9)';
    }
    overlay.classList.add('show');
    setTimeout(() => overlay.classList.remove('show'), 3200);
}

function generateStars() {
    if (starsInitialized) return;
    
    const container = document.getElementById('stars');
    if (!container) return;
    
    const starCount = isMobile ? 50 : 120;
    
    container.innerHTML = '';
    
    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.width = star.style.height = `${Math.random() * 3 + 1}px`;
        star.style.left = `${Math.random() * 100}%`;
        star.style.top  = `${Math.random() * 100}%`;
        star.style.animationDelay = `${Math.random() * 5}s`;
        container.appendChild(star);
    }
    
    starsInitialized = true;
}

function formatDateTime(dateString) {
    if (!dateString) return null;
    const date = new Date(dateString);
    return {
        date: date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }),
        time: date.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }),
        full: date.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
    };
}

function formatTimeDifference(startDate, endDate) {
    if (!startDate || !endDate) return null;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    
    let diffMs = end - start;
    if (diffMs < 0) return null;
    
    // Calculate years
    const years = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365));
    diffMs -= years * (1000 * 60 * 60 * 24 * 365);
    
    // Calculate months
    const months = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
    diffMs -= months * (1000 * 60 * 60 * 24 * 30.44);
    
    // Calculate days
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    diffMs -= days * (1000 * 60 * 60 * 24);
    
    // Calculate hours
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    diffMs -= hours * (1000 * 60 * 60);
    
    // Calculate minutes
    const minutes = Math.floor(diffMs / (1000 * 60));
    diffMs -= minutes * (1000 * 60);
    
    // Calculate seconds
    const seconds = Math.floor(diffMs / 1000);
    
    // Build the time difference string
    const parts = [];
    
    if (years > 0) {
        parts.push(`${years} year${years > 1 ? 's' : ''}`);
    }
    if (months > 0) {
        parts.push(`${months} month${months > 1 ? 's' : ''}`);
    }
    if (days > 0 && parts.length < 2) {
        parts.push(`${days} day${days > 1 ? 's' : ''}`);
    }
    if (hours > 0 && parts.length === 0) {
        parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    }
    if (minutes > 0 && parts.length === 0) {
        parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
    }
    if (seconds > 0 && parts.length === 0) {
        parts.push(`${seconds} second${seconds > 1 ? 's' : ''}`);
    }
    
    if (parts.length === 0) return 'just now';
    
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
    return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('visible');
}

// ==================== GOALS FUNCTIONS ====================

async function loadGoals() {
    if (!currentUsername || !currentUserId) {
        showMessage("No user logged in", "error");
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('user_goals')
            .select('*')
            .eq('user_id', currentUserId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const container = document.getElementById('goalsGrid');
        if (!container) return;
        
        container.innerHTML = '';

        if (data.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 py-8">No goals yet. Add your first goal above!</div>';
            return;
        }

        data.forEach(goal => {
            const card = document.createElement('div');
            card.className = 'goal-card';
            if (goal.is_achieved) card.classList.add('achieved');

            // Format creation time
            const created = formatDateTime(goal.created_at);
            const createdDisplay = created ? `${created.date} at ${created.time}` : 'Unknown';
            
            // Format deadline with full datetime
            let deadlineDisplay = 'No deadline';
            let deadlineTimeDisplay = '';
            if (goal.deadline) {
                const deadline = formatDateTime(goal.deadline);
                deadlineDisplay = `${deadline.date} at ${deadline.time}`;
                deadlineTimeDisplay = `<div class="goal-deadline-time">⏰ Deadline: ${deadlineDisplay}</div>`;
            }
            
            // Check if deadline is overdue (only if not achieved and deadline exists)
            let overdueWarning = '';
            if (!goal.is_achieved && goal.deadline && new Date(goal.deadline) < new Date()) {
                overdueWarning = '<div class="goal-overdue">⚠️ Overdue!</div>';
            }
            
            // Achievement info with time difference
            let achievementInfo = '';
            if (goal.is_achieved) {
                if (goal.achieved_at) {
                    const achieved = formatDateTime(goal.achieved_at);
                    const timeToAchieve = formatTimeDifference(goal.created_at, goal.achieved_at);
                    
                    achievementInfo = `
                        <div class="goal-achieved-info">
                            <div class="achieved-date">🏆 Achieved: ${achieved.date} at ${achieved.time}</div>
                            ${timeToAchieve ? `<div class="goal-time-taken">⏱️ Time taken: ${timeToAchieve}</div>` : ''}
                        </div>
                    `;
                } else {
                    achievementInfo = '<div class="goal-achieved-info">🏆 Achieved!</div>';
                }
            }

            card.innerHTML = `
                <div class="goal-text">${escapeHtml(goal.text)}</div>
                ${goal.description ? `<div class="goal-desc">💭 "${escapeHtml(goal.description)}"</div>` : ''}
                <div class="goal-created">
                    📅 Created: ${createdDisplay}
                </div>
                ${deadlineTimeDisplay}
                ${overdueWarning}
                ${achievementInfo}
                <div class="goal-actions">
                    <label class="checkbox-label">
                        <input type="checkbox" ${goal.is_achieved ? 'checked' : ''} 
                               onchange="toggleAchieved('${goal.id}', this.checked)">
                        <span>Mark as Achieved</span>
                    </label>
                    <button class="delete-btn" onclick="deleteGoal('${goal.id}')">Delete</button>
                </div>
            `;

            container.appendChild(card);
        });

        // Save to localStorage for offline cache
        localStorage.setItem(`user_goals_${currentUsername}`, JSON.stringify(data));

    } catch (err) {
        console.error("Error loading goals:", err);
        
        // Try to load from cache
        const cached = localStorage.getItem(`user_goals_${currentUsername}`);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                const container = document.getElementById('goalsGrid');
                if (container) {
                    container.innerHTML = '';
                    data.forEach(goal => {
                        const card = document.createElement('div');
                        card.className = 'goal-card';
                        if (goal.is_achieved) card.classList.add('achieved');
                        
                        const created = formatDateTime(goal.created_at);
                        const createdDisplay = created ? `${created.date} at ${created.time}` : 'Unknown';
                        
                        card.innerHTML = `
                            <div class="goal-text">${escapeHtml(goal.text)}</div>
                            ${goal.description ? `<div class="goal-desc">💭 "${escapeHtml(goal.description)}"</div>` : ''}
                            <div class="goal-created">📅 Created: ${createdDisplay}</div>
                            <div class="goal-actions">
                                <label class="checkbox-label">
                                    <input type="checkbox" ${goal.is_achieved ? 'checked' : ''} 
                                           onchange="toggleAchieved('${goal.id}', this.checked)">
                                    <span>Mark as Achieved</span>
                                </label>
                                <button class="delete-btn" onclick="deleteGoal('${goal.id}')">Delete</button>
                            </div>
                        `;
                        container.appendChild(card);
                    });
                }
                showMessage('Using cached data (offline mode)', 'warning');
            } catch (e) {
                showMessage("Failed to load goals", "error");
            }
        } else {
            showMessage("Failed to load goals", "error");
        }
    }
}

async function addGoal() {
    if (!currentUsername || !currentUserId) {
        showMessage("Please log in first", "error");
        return;
    }

    const text = document.getElementById('goalInput')?.value?.trim();
    const desc = document.getElementById('descInput')?.value?.trim();
    const deadlineVal = document.getElementById('deadlineInput')?.value;

    if (!text) {
        showMessage("Please write your goal", "error");
        return;
    }

    const goal = {
        user_id: currentUserId,
        username: currentUsername,
        text: text,
        description: desc || null,
        is_achieved: false,
        created_at: new Date().toISOString()
    };

    if (deadlineVal) {
        const deadlineDate = new Date(deadlineVal);
        if (!isNaN(deadlineDate.getTime())) {
            goal.deadline = deadlineDate.toISOString();
        }
    }

    try {
        const { error } = await supabaseClient
            .from('user_goals')
            .insert([goal]);

        if (error) throw error;

        showMessage("Goal added successfully!");
        document.getElementById('goalInput').value = '';
        document.getElementById('descInput').value = '';
        document.getElementById('deadlineInput').value = '';
        await loadGoals();

    } catch (err) {
        console.error("Insert failed:", err);
        showMessage("Failed to save goal: " + err.message, "error");
    }
}

async function toggleAchieved(goalId, isChecked) {
    if (!currentUsername || !currentUserId) return;

    const updateData = {
        is_achieved: isChecked
    };
    
    if (isChecked) {
        // When marking as achieved, set achieved_at to current time
        updateData.achieved_at = new Date().toISOString();
    } else {
        // When unmarking, remove achieved_at
        updateData.achieved_at = null;
    }

    try {
        const { error } = await supabaseClient
            .from('user_goals')
            .update(updateData)
            .eq('id', goalId)
            .eq('user_id', currentUserId);

        if (error) throw error;

        if (isChecked) {
            // Show confetti celebration
            if (typeof confetti !== 'undefined') {
                confetti({
                    particleCount: 150,
                    spread: 100,
                    origin: { y: 0.6 },
                    colors: ['#22c55e', '#86efac', '#4ade80', '#fbbf24']
                });
            }
            showMessage("🎉 Goal achieved! Great job!", "success");
        } else {
            showMessage("Goal unmarked", "warning");
        }

        // Reload goals to show updated info (including time taken)
        await loadGoals();

    } catch (err) {
        console.error("Toggle failed:", err);
        showMessage("Couldn't update goal", "error");
    }
}

async function deleteGoal(goalId) {
    if (!currentUsername || !currentUserId) return;

    try {
        const { error } = await supabaseClient
            .from('user_goals')
            .delete()
            .eq('id', goalId)
            .eq('user_id', currentUserId);

        if (error) throw error;

        showMessage("Goal deleted");
        await loadGoals();

    } catch (err) {
        console.error("Delete failed:", err);
        showMessage("Error deleting goal", "error");
    }
}

// ==================== PAGE LOAD ====================

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Goals page loading - Session based on DB");
    
    const isValid = await checkSessionAndRedirect();
    if (!isValid) return;
    
    generateStars();
    await loadAnnouncement();
    await loadGoals();

    // Enter key support
    const goalInput = document.getElementById('goalInput');
    if (goalInput) {
        goalInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addGoal();
            }
        });
    }
    
    // Set datetime-local input to accept both date and time
    const deadlineInput = document.getElementById('deadlineInput');
    if (deadlineInput) {
        deadlineInput.step = 1;
    }
    
    // Refresh announcement every hour
    setInterval(() => {
        loadAnnouncement();
    }, 60 * 60 * 1000);
    
    // Refresh goals every 5 minutes (optional)
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            loadGoals();
        }
    }, 5 * 60 * 1000);
    
    // Sidebar close on click outside
    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        const menuToggle = document.querySelector('.menu-toggle');
        if (sidebar?.classList.contains('open') &&
            !sidebar.contains(e.target) &&
            !menuToggle?.contains(e.target)) {
            sidebar.classList.remove('open');
            const overlay = document.getElementById('sidebarOverlay');
            if (overlay) overlay.classList.remove('visible');
        }
    });
    
    console.log("✅ Goals page initialized for user:", currentUsername);
});