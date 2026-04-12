// js/index.js - Optimized with performance improvements
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let currentUsername = '';
let currentSessionData = null;
let midnightCheckInterval = null;
let starsInitialized = false; // Track if stars have been added

// Mobile detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Performance flags
let starsEnabled = !isMobile;
let animationEnabled = !isMobile;
let isTaskUpdating = false;
let currentTasksCache = [];
let syncQueue = [];
let isSyncing = false;
let isLoadingTasks = false;
let lastRenderHash = ''; // Track last rendered state

// ==================== WEEK SYSTEM ====================
let currentWeek = 1; // 1-based week number

function getWeekKey(week) {
    return `week_${week}`;
}

function updateWeekLabel() {
    const label = document.getElementById('weekLabel');
    if (label) label.textContent = `Week ${currentWeek}`;
}

function prevWeek() {
    if (currentWeek <= 1) return;
    currentWeek--;
    updateWeekLabel();
    renderCurrentWeek();
}

function nextWeek() {
    currentWeek++;
    updateWeekLabel();
    renderCurrentWeek();
}

// Render tasks for the current week into the day columns
function renderCurrentWeek() {
    const weekKey = getWeekKey(currentWeek);
    // Filter tasks belonging to this week
    const weekTasks = currentTasksCache.filter(t => (t.week || 'week_1') === weekKey);
    renderTasksToUI(weekTasks);
}

// Safe localStorage operations
function safeLocalStorageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

function safeLocalStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        return false;
    }
}

function safeLocalStorageRemove(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (e) {
        return false;
    }
}

// Debounce utility
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// Throttle utility
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

// ==================== SESSION MANAGEMENT ====================
async function getValidSession() {
    try {
        const sessionStr = safeLocalStorageGet('nazamly_session');
        if (!sessionStr) return null;
        
        const sessionData = JSON.parse(sessionStr);
        const now = new Date();
        const expiresAt = new Date(sessionData.expiresAt);
        
        if (now > expiresAt) {
            await clearSession();
            return null;
        }
        
        const { data: dbSession, error } = await supabaseClient
            .from('user_sessions')
            .select('*')
            .eq('session_token', sessionData.sessionToken)
            .eq('user_id', sessionData.userId)
            .eq('is_active', true)
            .maybeSingle();
        
        if (error || !dbSession) {
            await clearSession();
            return null;
        }
        
        const dbExpiresAt = new Date(dbSession.expires_at);
        if (now > dbExpiresAt) {
            await clearSession();
            return null;
        }
        
        // Update last active without await to not slow down
        supabaseClient
            .from('user_sessions')
            .update({ last_active: now.toISOString() })
            .eq('id', dbSession.id);
        
        return sessionData;
    } catch (err) {
        console.error("Session validation error:", err);
        return null;
    }
}

async function clearSession() {
    try {
        const sessionStr = safeLocalStorageGet('nazamly_session');
        if (sessionStr) {
            const sessionData = JSON.parse(sessionStr);
            await supabaseClient
                .from('user_sessions')
                .update({ is_active: false })
                .eq('session_token', sessionData.sessionToken);
        }
        
        safeLocalStorageRemove('nazamly_session');
        if (currentUsername) {
            safeLocalStorageRemove(`tasks_cache_${currentUsername}`);
            safeLocalStorageRemove(`weeklyPlannerSubjects_${currentUsername}`);
            safeLocalStorageRemove(`sync_queue_${currentUsername}`);
        }
        
        currentUsername = null;
        currentSessionData = null;
    } catch (err) {
        console.error("Clear session error:", err);
    }
}

async function checkSession() {
    const session = await getValidSession();
    if (!session) {
        window.location.href = 'login.html';
        return false;
    }
    
    currentSessionData = session;
    currentUsername = session.username;
    
    const usernameDisplay = document.getElementById('usernameDisplay');
    if (usernameDisplay) {
        usernameDisplay.textContent = `Welcome, ${currentUsername}`;
        if (isMobile) usernameDisplay.style.fontSize = '14px';
    }
    
    return true;
}

async function checkMidnightLogout() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    if (hours === 0 && minutes < 5) {
        const today = now.toDateString();
        const lastLogoutDate = safeLocalStorageGet('last_midnight_logout');
        
        if (lastLogoutDate !== today) {
            console.log("🌙 Midnight reached - performing automatic logout");
            if (typeof showTemporaryMessage === 'function') {
                showTemporaryMessage("Session expired at midnight. Please login again.");
            }
            await clearSession();
            safeLocalStorageSet('last_midnight_logout', today);
            window.location.href = 'login.html';
        }
    }
}

async function logout() {
    await clearSession();
    window.location.href = 'login.html';
}

// ==================== ANNOUNCEMENT - ALWAYS FROM DB ====================
async function loadAnnouncement() {
    const bar = document.getElementById('announcementBar');
    if (!bar) return;
    
    try {
        // ALWAYS fetch from DB - no localStorage cache
        const { data, error } = await supabaseClient
            .from('app_settings')
            .select('value')
            .eq('key', 'announcement_text')
            .maybeSingle();
        
        let text = '📢 اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ.';
        
        if (!error && data && data.value) {
            text = data.value;
            console.log("✅ Announcement loaded from DB:", text);
        } else {
            console.log("Using default announcement");
        }
        
        bar.textContent = text;
        
    } catch (err) {
        console.error('Announcement fetch error:', err);
        bar.textContent = '📢 اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ.';
    }
}

// ==================== UTILITY FUNCTIONS ====================
function generateUniqueId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function createStars() {
    if (!starsEnabled || starsInitialized) return; // Prevent duplicate stars
    
    const starsContainer = document.getElementById('stars');
    if (!starsContainer) return;
    
    // Clear existing stars first
    starsContainer.innerHTML = '';
    
    const starCount = isMobile ? 30 : 80;
    
    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.width = `${Math.random() * 2 + 1}px`;
        star.style.height = star.style.width;
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        
        if (animationEnabled) {
            star.style.animationDelay = `${Math.random() * 2}s`;
        } else {
            star.style.opacity = '0.3';
        }
        
        starsContainer.appendChild(star);
    }
    
    starsInitialized = true;
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== DEADLINE DATE FORMATTING ====================
function formatDeadlineDisplay(deadlineDateStr, deadlineTime) {
    const parts = [];

    if (deadlineDateStr) {
        // deadlineDateStr is YYYY-MM-DD
        const [year, month, day] = deadlineDateStr.split('-').map(Number);
        // Use UTC to avoid timezone shifts
        const date = new Date(Date.UTC(year, month - 1, day));
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dayName = dayNames[date.getUTCDay()];
        const monthName = monthNames[date.getUTCMonth()];
        parts.push(`${dayName}, ${day} ${monthName}`);
    }

    if (deadlineTime && deadlineTime !== '') {
        parts.push(deadlineTime);
    }

    return parts.length > 0 ? parts.join(' · ') : 'No deadline';
}

// ==================== TASKS - localStorage FIRST then DB ====================
function saveTasksToCache(tasks) {
    if (!currentUsername) return;
    const cacheData = {
        tasks: tasks,
        timestamp: Date.now(),
        version: '1.0'
    };
    safeLocalStorageSet(`tasks_cache_${currentUsername}`, JSON.stringify(cacheData));
    currentTasksCache = tasks;
}

function loadTasksFromCache() {
    if (!currentUsername) return null;
    const cached = safeLocalStorageGet(`tasks_cache_${currentUsername}`);
    if (cached) {
        try {
            const cacheData = JSON.parse(cached);
            const now = Date.now();
            // Cache valid for 24 hours
            if (now - cacheData.timestamp < 24 * 60 * 60 * 1000) {
                return cacheData.tasks;
            }
        } catch (e) {
            console.warn("Cache parse error:", e);
            // Clear corrupted cache
            safeLocalStorageRemove(`tasks_cache_${currentUsername}`);
        }
    }
    return null;
}

async function addTask() {
    // Prevent multiple rapid submissions
    if (isTaskUpdating) {
        console.log("Task update in progress, please wait");
        if (isMobile) showTemporaryMessage("Please wait...");
        return;
    }
    
    isTaskUpdating = true;
    
    try {
        const taskText = document.getElementById('taskInput')?.value?.trim();
        const day = document.getElementById('daySelect')?.value;
        const deadlineDateStr = document.getElementById('deadlineInput')?.value || null;
        const deadlineTime = document.getElementById('deadlineTimeInput')?.value || null;
        
        if (!taskText || !currentUsername) {
            console.log("Please enter a task first");
            if (isMobile) showTemporaryMessage("Please enter a task");
            return;
        }
        
        if (!currentSessionData) {
            console.log("Session not found - please login again");
            if (isMobile) showTemporaryMessage("Session issue - please login again");
            return;
        }

        const weekKey = getWeekKey(currentWeek);
        
        const newTask = {
            id: generateUniqueId(),
            text: taskText,
            day: day,
            deadline: deadlineDateStr || null,
            deadline: deadlineTime || null,
            week: weekKey,
            done: false,
            created_at: new Date().toISOString(),
            user_id: currentSessionData.userId,
            username: currentUsername
        };
        
        // ✅ STEP 1: Save to localStorage FIRST (instant UI)
        addTaskToUI(newTask.text, newTask.day, newTask.deadline, newTask.deadline, newTask.done, newTask.id);
        currentTasksCache.unshift(newTask);
        saveTasksToCache(currentTasksCache);
        
        // Clear inputs
        const taskInput = document.getElementById('taskInput');
        const deadlineInput = document.getElementById('deadlineInput');
        const deadlineTimeInput = document.getElementById('deadlineTimeInput');
        if (taskInput) taskInput.value = '';
        if (deadlineInput) deadlineInput.value = '';
        if (deadlineTimeInput) deadlineTimeInput.value = '';
        
        // ✅ STEP 2: Then save to DB (async, don't block UI)
        try {
            const { error } = await supabaseClient
                .from('tasks')
                .insert({
                    id: newTask.id,
                    text: newTask.text,
                    day: newTask.day,
                    deadline: newTask.deadline,
                    deadline: newTask.deadline,
                    week: newTask.week,
                    done: newTask.done,
                    created_at: newTask.created_at,
                    user_id: newTask.user_id,
                    username: newTask.username
                });
            
            if (error) {
                console.error("Error saving task to DB:", error);
                addToSyncQueue({
                    type: 'INSERT',
                    data: newTask
                });
            } else {
                console.log("✅ Task saved to DB successfully:", newTask.id);
            }
        } catch (err) {
            console.error("Task save error:", err);
            addToSyncQueue({
                type: 'INSERT',
                data: newTask
            });
        }
        
        if (isMobile) {
            showTemporaryMessage("Task added ✓");
        }
    } finally {
        setTimeout(() => {
            isTaskUpdating = false;
        }, 1000);
    }
}

function addTaskToUI(taskText, day, deadlineDateStr, deadlineTime, done, id) {
    // Only show if it's in the current week
    const weekKey = getWeekKey(currentWeek);
    const taskInCache = currentTasksCache.find(t => t.id === id);
    const taskWeek = taskInCache ? (taskInCache.week || 'week_1') : weekKey;
    if (taskWeek !== weekKey) return;

    const dayElement = document.getElementById(day);
    if (!dayElement) return;
    
    const taskList = dayElement.querySelector('.task-list');
    if (!taskList) return;
    
    const li = createTaskElement(taskText, day, deadlineDateStr, deadlineTime, done, id);
    
    if (taskList.firstChild) {
        taskList.insertBefore(li, taskList.firstChild);
    } else {
        taskList.appendChild(li);
    }

    initDragOnItem(li);
}

async function loadTasks() {
    if (isLoadingTasks) return;
    isLoadingTasks = true;
    
    try {
        // ✅ STEP 1: Show cached tasks first (instant)
        const cachedTasks = loadTasksFromCache();
        if (cachedTasks && cachedTasks.length > 0) {
            console.log("📦 Loading tasks from cache:", cachedTasks.length);
            currentTasksCache = cachedTasks;
            renderCurrentWeek();
        }
        
        // ✅ STEP 2: Then load fresh from DB and merge
        const { data, error } = await supabaseClient
            .from('tasks')
            .select('*')
            .eq('user_id', currentSessionData.userId)
            .order('created_at', { ascending: false })
            .limit(200);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            console.log("🔄 Loading tasks from DB:", data.length);
            
            // Create a Map for deduplication by ID
            const tasksMap = new Map();
            
            // Add cached tasks first (keep unsynced)
            if (currentTasksCache && currentTasksCache.length > 0) {
                currentTasksCache.forEach(task => {
                    tasksMap.set(task.id, task);
                });
            }
            
            // Add DB tasks (will overwrite cached if same ID)
            data.forEach(task => {
                tasksMap.set(task.id, task);
            });
            
            // Convert back to array and sort by created_at
            const mergedTasks = Array.from(tasksMap.values());
            mergedTasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            // Check if data has changed before re-rendering
            const newHash = JSON.stringify(mergedTasks.map(t => ({id: t.id, done: t.done, text: t.text})));
            if (newHash !== lastRenderHash) {
                currentTasksCache = mergedTasks;
                renderCurrentWeek();
                lastRenderHash = newHash;
            }
            
            saveTasksToCache(mergedTasks);
        } else if (cachedTasks && cachedTasks.length > 0) {
            // No DB tasks, just use cache
            const cacheHash = JSON.stringify(cachedTasks.map(t => ({id: t.id, done: t.done, text: t.text})));
            if (cacheHash !== lastRenderHash) {
                renderCurrentWeek();
                lastRenderHash = cacheHash;
            }
        }
        
    } catch (err) {
        console.error('Load tasks error:', err);
        // Fallback to cache if DB fails
        const cachedTasks = loadTasksFromCache();
        if (cachedTasks) {
            if (JSON.stringify(cachedTasks) !== JSON.stringify(currentTasksCache)) {
                currentTasksCache = cachedTasks;
                renderCurrentWeek();
            }
        }
    } finally {
        isLoadingTasks = false;
    }
}

function renderTasksToUI(tasks) {
    // Clear all task lists
    days.forEach(day => {
        const dayElement = document.getElementById(day);
        if (!dayElement) return;
        const list = dayElement.querySelector('.task-list');
        if (list) list.innerHTML = '';
    });
    
    // Group tasks by day
    const tasksByDay = {};
    days.forEach(day => { tasksByDay[day] = []; });
    
    tasks.forEach(task => {
        if (tasksByDay[task.day]) {
            tasksByDay[task.day].push(task);
        }
    });
    
    // Render each day's tasks
    days.forEach(day => {
        const dayElement = document.getElementById(day);
        if (!dayElement) return;
        
        const taskList = dayElement.querySelector('.task-list');
        if (!taskList) return;
        
        const fragment = document.createDocumentFragment();
        const dayTasks = tasksByDay[day] || [];
        
        dayTasks.forEach(task => {
            const li = createTaskElement(task.text, task.day, task.deadline, task.deadline|| null, task.done, task.id);
            fragment.appendChild(li);
        });
        
        taskList.appendChild(fragment);
    });

    // Init drag on all rendered items
    document.querySelectorAll('.task-list li').forEach(li => initDragOnItem(li));
}

function createTaskElement(taskText, day, deadlineDateStr, deadlineTime, done, id) {
    const deadlineDisplay = formatDeadlineDisplay(deadlineDateStr, deadlineTime);
    const li = document.createElement('li');
    li.dataset.id = id;
    li.draggable = true;

    li.innerHTML = `
        <div class="task-card-top">
            <input type="checkbox" ${done ? 'checked' : ''}>
            <span class="task-title">${escapeHtml(taskText)}</span>
            <button class="task-delete-btn" title="Delete task" onclick="deleteSingleTask('${id}', event)">🗑️</button>
        </div>
        <div class="task-deadline-badge">📅 ${escapeHtml(deadlineDisplay)}</div>
    `;
    if (done) li.classList.add('completed');
    return li;
}

// ==================== SINGLE TASK DELETE ====================
async function deleteSingleTask(taskId, event) {
    if (event) event.stopPropagation();
    if (!taskId) return;

    // Find the li
    const li = document.querySelector(`li[data-id="${taskId}"]`);
    if (li) li.remove();

    // Update cache
    currentTasksCache = currentTasksCache.filter(t => t.id !== taskId);
    saveTasksToCache(currentTasksCache);

    if (isMobile) showTemporaryMessage("Task deleted ✓");

    // Delete from DB
    try {
        const { error } = await supabaseClient
            .from('tasks')
            .delete()
            .eq('id', taskId);

        if (error) {
            console.error("Error deleting task:", error);
            addToSyncQueue({ type: 'DELETE', id: taskId });
        } else {
            console.log("✅ Task deleted from DB:", taskId);
        }
    } catch (err) {
        console.error("Delete error:", err);
        addToSyncQueue({ type: 'DELETE', id: taskId });
    }
}

// Keep deleteSelectedTasks for backward compat (not used in new UI)
async function deleteSelectedTasks() {
    console.log("deleteSelectedTasks: replaced by individual delete buttons");
}

// ==================== DRAG AND DROP ====================
let draggedItem = null;
let dragSourceDay = null;
let placeholder = null;

function initDragOnItem(li) {
    li.addEventListener('dragstart', onDragStart);
    li.addEventListener('dragend', onDragEnd);
}

function onDragStart(e) {
    draggedItem = e.currentTarget;
    dragSourceDay = draggedItem.closest('.day-section')?.dataset?.day || null;
    draggedItem.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedItem.dataset.id);

    // Create placeholder
    placeholder = document.createElement('li');
    placeholder.classList.add('drag-placeholder');
    placeholder.style.height = draggedItem.offsetHeight + 'px';
}

function onDragEnd(e) {
    if (draggedItem) draggedItem.classList.remove('dragging');
    if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
    
    // Remove all drag-over highlights
    document.querySelectorAll('.day-section.drag-over').forEach(el => el.classList.remove('drag-over'));

    // If item was dropped outside a valid target, re-render to restore
    draggedItem = null;
    dragSourceDay = null;
    placeholder = null;
}

function setupDayDropZones() {
    document.querySelectorAll('.day-section').forEach(section => {
        section.addEventListener('dragover', onDragOver);
        section.addEventListener('dragleave', onDragLeave);
        section.addEventListener('drop', onDrop);
    });
}

function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!draggedItem) return;

    const section = e.currentTarget;
    section.classList.add('drag-over');

    const taskList = section.querySelector('.task-list');
    if (!taskList) return;

    // Find the item we're hovering over
    const afterElement = getDragAfterElement(taskList, e.clientY);

    if (afterElement == null) {
        taskList.appendChild(placeholder);
    } else {
        taskList.insertBefore(placeholder, afterElement);
    }
}

function onDragLeave(e) {
    const section = e.currentTarget;
    // Only remove if leaving to outside the section
    if (!section.contains(e.relatedTarget)) {
        section.classList.remove('drag-over');
    }
}

function onDrop(e) {
    e.preventDefault();
    if (!draggedItem) return;

    const section = e.currentTarget;
    section.classList.remove('drag-over');

    const dayMap = {
        Sunday: 'Sun',
        Monday: 'Mon',
        Tuesday: 'Tue',
        Wednesday: 'Wed',
        Thursday: 'Thu',
        Friday: 'Fri',
        Saturday: 'Sat'
    };

    const newDayRaw = section.dataset.day;
    const newDay = dayMap[newDayRaw] || newDayRaw;

    const taskList = section.querySelector('.task-list');
    if (!taskList || !placeholder) return;

    taskList.insertBefore(draggedItem, placeholder);
    placeholder.remove();

    const taskId = draggedItem.dataset.id;

    if (newDay && newDay !== dragSourceDay) {
        updateTaskDay(taskId, newDay);
    }

    persistWeekOrder();
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('li:not(.dragging):not(.drag-placeholder)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function updateTaskDay(taskId, newDay) {
    // Update cache
    const taskIndex = currentTasksCache.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
        currentTasksCache[taskIndex].day = newDay;
        saveTasksToCache(currentTasksCache);
    }

    // Update DB
    try {
        const { error } = await supabaseClient
            .from('tasks')
            .update({ day: newDay })
            .eq('id', taskId);

        if (error) {
            addToSyncQueue({ type: 'UPDATE', id: taskId, data: { day: newDay } });
        }
    } catch (err) {
        addToSyncQueue({ type: 'UPDATE', id: taskId, data: { day: newDay } });
    }
}

function persistWeekOrder() {
    // After drag, sync order in cache based on DOM order for current week
    const weekKey = getWeekKey(currentWeek);
    const orderedIds = [];
    days.forEach(day => {
        const taskList = document.getElementById(day)?.querySelector('.task-list');
        if (!taskList) return;
        taskList.querySelectorAll('li[data-id]').forEach(li => {
            orderedIds.push(li.dataset.id);
        });
    });

    // Re-sort currentTasksCache: week tasks in DOM order, other weeks untouched
    const weekTasks = currentTasksCache.filter(t => (t.week || 'week_1') === weekKey);
    const otherTasks = currentTasksCache.filter(t => (t.week || 'week_1') !== weekKey);

    const reordered = orderedIds
        .map(id => weekTasks.find(t => t.id === id))
        .filter(Boolean);

    // Tasks in cache but not in DOM (e.g., filtered out) stay at end
    const missing = weekTasks.filter(t => !orderedIds.includes(t.id));

    currentTasksCache = [...reordered, ...missing, ...otherTasks];
    saveTasksToCache(currentTasksCache);
}

// ==================== CHECKBOX CHANGE ====================
const handleCheckboxChange = debounce(async (e) => {
    if (e.target.type !== 'checkbox') return;
    
    const li = e.target.closest('li');
    if (!li) return;
    
    const taskId = li.dataset.id;
    const done = e.target.checked;
    
    if (taskId) {
        // Update UI
        if (done) li.classList.add('completed');
        else li.classList.remove('completed');
        
        // Update cache
        const taskIndex = currentTasksCache.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            currentTasksCache[taskIndex].done = done;
            saveTasksToCache(currentTasksCache);
        }
        
        // Update DB
        try {
            const { error } = await supabaseClient
                .from('tasks')
                .update({ done: done })
                .eq('id', taskId);
            
            if (error) {
                addToSyncQueue({ type: 'UPDATE', id: taskId, data: { done: done } });
            }
        } catch (err) {
            addToSyncQueue({ type: 'UPDATE', id: taskId, data: { done: done } });
        }
    }
}, 500);

document.addEventListener('change', handleCheckboxChange);

// ==================== SYNC QUEUE ====================
function addToSyncQueue(operation) {
    syncQueue.push({
        ...operation,
        timestamp: Date.now(),
        retries: 0
    });
    
    if (currentUsername) {
        safeLocalStorageSet(`sync_queue_${currentUsername}`, JSON.stringify(syncQueue));
    }
    
    if (!isSyncing && navigator.onLine) {
        processSyncQueue();
    }
}

function loadPendingSyncQueue() {
    if (!currentUsername) return;
    const savedQueue = safeLocalStorageGet(`sync_queue_${currentUsername}`);
    if (savedQueue) {
        try {
            syncQueue = JSON.parse(savedQueue);
            // Validate queue entries
            if (!Array.isArray(syncQueue)) {
                throw new Error('Invalid queue format');
            }
            syncQueue = syncQueue.filter(item => item && typeof item === 'object');
            if (syncQueue.length > 0 && navigator.onLine) {
                processSyncQueue();
            }
        } catch (e) {
            console.error("Failed to parse sync queue:", e);
            // Reset corrupted queue
            syncQueue = [];
            safeLocalStorageRemove(`sync_queue_${currentUsername}`);
        }
    }
}

async function processSyncQueue() {
    if (isSyncing || syncQueue.length === 0) return;
    
    isSyncing = true;
    
    try {
        for (let i = 0; i < syncQueue.length; i++) {
            const operation = syncQueue[i];
            
            try {
                switch (operation.type) {
                    case 'INSERT':
                        await supabaseClient
                            .from('tasks')
                            .insert({
                                ...operation.data,
                                user_id: currentSessionData.userId,
                                username: currentUsername
                            });
                        console.log("✅ Synced INSERT:", operation.data.id);
                        break;
                        
                    case 'UPDATE':
                        await supabaseClient
                            .from('tasks')
                            .update(operation.data)
                            .eq('id', operation.id);
                        console.log("✅ Synced UPDATE:", operation.id);
                        break;
                        
                    case 'DELETE':
                        await supabaseClient
                            .from('tasks')
                            .delete()
                            .eq('id', operation.id);
                        console.log("✅ Synced DELETE:", operation.id);
                        break;
                }
                
                syncQueue.splice(i, 1);
                i--;
                
            } catch (err) {
                operation.retries++;
                console.warn(`Sync failed (${operation.retries}/5):`, operation.type);
                if (operation.retries >= 5) {
                    console.error("Max retries reached, removing from queue");
                    syncQueue.splice(i, 1);
                    i--;
                }
            }
        }
        
        if (syncQueue.length === 0 && currentUsername) {
            safeLocalStorageRemove(`sync_queue_${currentUsername}`);
        } else if (currentUsername) {
            safeLocalStorageSet(`sync_queue_${currentUsername}`, JSON.stringify(syncQueue));
        }
        
    } catch (err) {
        console.error("Sync queue processing error:", err);
    } finally {
        isSyncing = false;
        if (syncQueue.length > 0 && navigator.onLine) {
            setTimeout(processSyncQueue, 5000);
        }
    }
}

// ==================== SUBJECTS ====================
function addSubject() {
    const subjectText = document.getElementById('subjectInput')?.value?.trim();
    if (!subjectText || !currentUsername) return;
    
    const subjectId = generateUniqueId();
    const subjectList = document.getElementById('subjectList');
    if (!subjectList) return;
    
    const li = document.createElement('li');
    li.dataset.id = subjectId;
    li.innerHTML = `
        <div class="flex items-center justify-between w-full">
            <div class="flex items-center flex-1">
                <input type="radio" name="subject_select" value="${subjectId}">
                <span class="flex-1">${escapeHtml(subjectText)}</span>
            </div>
        </div>
    `;
    subjectList.appendChild(li);
    const subjectInput = document.getElementById('subjectInput');
    if (subjectInput) subjectInput.value = '';
    syncSubjects();
}

function deleteSelectedSubjects() {
    if (!currentUsername) return;
    
    const subjectList = document.getElementById('subjectList');
    if (!subjectList) return;
    
    const selected = Array.from(subjectList.children).filter(li =>
        li.querySelector('input[type="radio"]')?.checked
    );
    
    if (selected.length === 0) {
        alert("No subjects selected");
        return;
    }
    
    if (confirm(`Delete ${selected.length} selected subject(s)?`)) {
        selected.forEach(li => li.remove());
        syncSubjects();
    }
}

function syncSubjects() {
    if (!currentUsername) return;
    
    const subjects = [];
    const list = document.getElementById('subjectList')?.children;
    if (!list) return;
    
    Array.from(list).forEach(li => {
        const span = li.querySelector('span');
        if (span) {
            subjects.push({
                id: li.dataset.id,
                text: span.textContent.trim()
            });
        }
    });
    
    safeLocalStorageSet(`weeklyPlannerSubjects_${currentUsername}`, JSON.stringify(subjects));
}

function loadSubjects() {
    if (!currentUsername) return;
    
    const saved = safeLocalStorageGet(`weeklyPlannerSubjects_${currentUsername}`);
    const subjects = saved ? JSON.parse(saved) : [];
    const list = document.getElementById('subjectList');
    
    if (list) {
        list.innerHTML = '';
        const fragment = document.createDocumentFragment();
        subjects.forEach(s => {
            const li = document.createElement('li');
            li.dataset.id = s.id;
            li.innerHTML = `
                <div class="flex items-center justify-between w-full">
                    <div class="flex items-center flex-1">
                        <input type="radio" name="subject_select" value="${s.id}">
                        <span class="flex-1">${escapeHtml(s.text)}</span>
                    </div>
                </div>
            `;
            fragment.appendChild(li);
        });
        list.appendChild(fragment);
    }
}

// ==================== UI HELPERS ====================
let loadingIndicator = null;
let messageTimeout = null;

function showLoadingIndicator(show) {
    if (!isMobile) return;
    
    if (!loadingIndicator) {
        loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'loadingIndicator';
        loadingIndicator.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 8px 16px;
            border-radius: 8px;
            z-index: 9999;
            font-size: 12px;
            display: none;
            pointer-events: none;
        `;
        loadingIndicator.textContent = 'Loading...';
        document.body.appendChild(loadingIndicator);
    }
    
    loadingIndicator.style.display = show ? 'block' : 'none';
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
            padding: 6px 12px;
            border-radius: 8px;
            z-index: 9999;
            font-size: 12px;
            pointer-events: none;
            white-space: nowrap;
        `;
        document.body.appendChild(messageEl);
    }
    
    messageEl.textContent = message;
    messageEl.style.display = 'block';
    
    if (messageTimeout) clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => {
        if (messageEl) messageEl.style.display = 'none';
    }, 1500);
}

// ==================== DOWNLOAD PLANNER ====================
function downloadPlannerAsPNG() {
    const content = document.getElementById('plannerContent');
    if (!content) return;
    
    showLoadingIndicator(true);
    const scale = isMobile ? 1.2 : 1.5;
    
    if (typeof html2canvas === 'undefined') {
        console.error("html2canvas not loaded");
        showLoadingIndicator(false);
        return;
    }
    
    html2canvas(content, {
        backgroundColor: '#1B2735',
        scale: scale,
        logging: false,
        useCORS: true
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Nazamly_${currentUsername || 'planner'}_${new Date().toISOString().split('T')[0]}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showLoadingIndicator(false);
        if (isMobile) showTemporaryMessage("Downloaded ✓");
    }).catch(err => {
        console.error('PNG generation error:', err);
        showLoadingIndicator(false);
    });
}

// ==================== MOBILE OPTIMIZATIONS ====================
function addMobileViewport() {
    if (!document.querySelector('meta[name="viewport"]')) {
        const meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1.0, user-scalable=yes';
        document.head.appendChild(meta);
    }
}

const handleResize = throttle(() => {
    if (isMobile) {
        const isLandscape = window.innerWidth > window.innerHeight;
        const taskContainers = document.querySelectorAll('.task-list');
        taskContainers.forEach(container => {
            container.style.maxHeight = isLandscape ? '180px' : '250px';
        });
    }
}, 250);

window.addEventListener('resize', handleResize);

// ==================== ONLINE/OFFLINE HANDLING ====================
function handleOnlineStatus() {
    if (navigator.onLine && syncQueue.length > 0) {
        processSyncQueue();
    }
}

window.addEventListener('online', handleOnlineStatus);
window.addEventListener('offline', () => {
    if (isMobile) showTemporaryMessage("Offline mode");
});

// ==================== INITIALIZATION ====================
let isInitialized = false;

async function initializeApp() {
    // Prevent multiple initializations
    if (isInitialized) {
        console.log("App already initialized");
        return;
    }
    
    console.log("Initializing app...");
    
    addMobileViewport();
    
    const hasValidSession = await checkSession();
    if (!hasValidSession) return;
    
    try {
        // ✅ Always load announcement fresh from DB
        await loadAnnouncement();
        
        createStars();
        loadPendingSyncQueue();
        updateWeekLabel();
        await loadTasks();
        loadSubjects();
        setupEventListeners();
        setupDayDropZones();
        
        // Clear existing interval if any
        if (midnightCheckInterval) {
            clearInterval(midnightCheckInterval);
        }
        midnightCheckInterval = setInterval(checkMidnightLogout, 60 * 1000);
        
        // Periodic sync every 30 seconds
        const syncInterval = setInterval(() => {
            if (navigator.onLine && syncQueue.length > 0) {
                processSyncQueue();
            }
        }, 30000);
        
        // Store interval for cleanup (optional)
        window.syncInterval = syncInterval;
        
        isInitialized = true;
        console.log("✅ App initialized for user:", currentUsername);
        
    } catch (err) {
        console.error("Initialization error:", err);
    }
}

function setupEventListeners() {
    window.addEventListener('storage', (e) => {
        if (e.key === `weeklyPlannerSubjects_${currentUsername}`) {
            loadSubjects();
        }
    });
    
    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar?.classList.contains('open') &&
            !sidebar.contains(e.target) &&
            !e.target.classList.contains('menu-toggle')) {
            sidebar.classList.remove('open');
        }
    });
    
    const taskInput = document.getElementById('taskInput');
    if (taskInput) {
        taskInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') addTask();
        });
    }
    
    const subjectInput = document.getElementById('subjectInput');
    if (subjectInput) {
        subjectInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') addSubject();
        });
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (midnightCheckInterval) {
        clearInterval(midnightCheckInterval);
    }
    if (window.syncInterval) {
        clearInterval(window.syncInterval);
    }
});

document.addEventListener('DOMContentLoaded', initializeApp);