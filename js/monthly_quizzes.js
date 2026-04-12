// monthly_quizzes.js - Complete Version with Database Session Management

const subjects = ['Arabic', 'Chemistry', 'Physics', 'Biology', 'Math', 'English'];
let currentUsername = '';
let currentUserId = '';
let currentSessionData = null;
let chartInstances = {};
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
        localStorage.removeItem(`monthly_quizzes_${currentUsername}`);
        
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

// Toast Notification
function showToast(message, type = 'success') {
    let toast = document.getElementById('toast-message');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-message';
        toast.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            padding: 12px 24px; border-radius: 8px; color: white; font-weight: 500;
            z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            opacity: 0; transition: opacity 0.4s;
            font-size: ${isMobile ? '12px' : '14px'};
            white-space: nowrap;
        `;
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    if (type === 'error') {
        toast.style.background = '#f44336';
    } else if (type === 'warning') {
        toast.style.background = '#ff9800';
    } else {
        toast.style.background = '#4caf50';
    }
    toast.style.opacity = '1';
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 400);
    }, 3000);
}

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

// ==================== QUIZ FUNCTIONS ====================

async function addQuiz() {
    if (!currentUsername || !currentUserId) {
        showToast('Please log in first', 'error');
        return;
    }

    const subject = document.getElementById('subjectSelect').value;
    const score = parseFloat(document.getElementById('scoreInput').value);
    const total = parseFloat(document.getElementById('totalInput').value);
    const dateInput = document.getElementById('quizDate')?.value;

    if (isNaN(score) || isNaN(total) || score < 0 || total <= 0 || score > total) {
        showToast('Please enter valid score and total (score ≤ total)', 'error');
        return;
    }

    const quizDate = dateInput || new Date().toISOString().split('T')[0];

    try {
        const { error } = await supabaseClient
            .from('monthly_quizzes')
            .insert({
                username: currentUsername,
                user_id: currentUserId,
                subject: subject,
                date: quizDate,
                score: score,
                total: total,
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        document.getElementById('scoreInput').value = '';
        document.getElementById('totalInput').value = '';
        if (document.getElementById('quizDate')) {
            document.getElementById('quizDate').value = '';
        }

        await loadQuizzes();
        showToast('Quiz saved successfully!', 'success');

    } catch (err) {
        console.error("Add quiz error:", err);
        showToast('Error saving quiz: ' + (err.message || 'unknown error'), 'error');
    }
}

async function clearAllData() {
    if (!currentUsername || !currentUserId) return;

    if (!confirm('Are you sure you want to clear ALL quiz data? This cannot be undone.')) return;

    showToast('Clearing all data...', 'warning');
    
    try {
        const { error } = await supabaseClient
            .from('monthly_quizzes')
            .delete()
            .eq('user_id', currentUserId);

        if (error) throw error;

        await loadQuizzes();
        showToast('All data cleared successfully', 'success');

    } catch (err) {
        console.error("Clear data error:", err);
        showToast('Error while clearing data', 'error');
    }
}

async function loadQuizzes() {
    if (!currentUsername || !currentUserId) return;

    const loadingEl = document.getElementById('loadingIndicator');
    if (loadingEl && isMobile) loadingEl.style.display = 'block';

    try {
        const { data, error } = await supabaseClient
            .from('monthly_quizzes')
            .select('subject, date, score, total, id')
            .eq('user_id', currentUserId)
            .order('date', { ascending: false });

        if (error) throw error;

        const grouped = {};
        subjects.forEach(s => grouped[s] = []);

        data?.forEach(q => {
            if (grouped[q.subject]) {
                grouped[q.subject].push(q);
            }
        });

        subjects.forEach(subject => {
            updateDisplay(subject, grouped[subject] || []);
        });

        updateOverall(data || []);

        // Save to localStorage for offline cache
        localStorage.setItem(`monthly_quizzes_${currentUsername}`, JSON.stringify(data));

    } catch (err) {
        console.error("Failed to load quizzes:", err);
        
        // Try to load from cache
        const cached = localStorage.getItem(`monthly_quizzes_${currentUsername}`);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                const grouped = {};
                subjects.forEach(s => grouped[s] = []);
                data?.forEach(q => {
                    if (grouped[q.subject]) grouped[q.subject].push(q);
                });
                subjects.forEach(subject => {
                    updateDisplay(subject, grouped[subject] || []);
                });
                updateOverall(data || []);
                showToast('Using cached data (offline mode)', 'warning');
            } catch (e) {
                showToast('Failed to load quizzes', 'error');
            }
        } else {
            showToast('Failed to load quizzes', 'error');
        }
    } finally {
        if (loadingEl && isMobile) loadingEl.style.display = 'none';
    }
}

function updateDisplay(subject, quizzes) {
    const list = document.getElementById(`quizList_${subject}`);
    if (!list) return;

    list.innerHTML = '';
    
    if (quizzes.length === 0) {
        list.innerHTML = '<li class="text-gray-400 text-center py-2">No quizzes added yet</li>';
    } else {
        quizzes.forEach(q => {
            const pct = ((q.score / q.total) * 100).toFixed(2);
            const li = document.createElement('li');
            li.className = 'quiz-item p-2 border-b border-gray-700 hover:bg-gray-800';
            li.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="text-sm">${escapeHtml(q.date)}</span>
                    <span class="font-bold ${pct >= 70 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'}">
                        ${q.score}/${q.total} (${pct}%)
                    </span>
                </div>
            `;
            list.appendChild(li);
        });
    }

    const avg = calculateAverage(quizzes);
    const avgEl = document.getElementById(`average_${subject}`);
    if (avgEl) {
        const avgColor = avg >= 70 ? 'text-green-400' : avg >= 50 ? 'text-yellow-400' : 'text-red-400';
        avgEl.innerHTML = `<span class="${avgColor} font-bold">${avg.toFixed(2)}%</span>`;
    }

    drawChart(subject, avg);
}

function calculateAverage(quizzes) {
    if (!quizzes.length) return 0;
    let sumScore = 0, sumTotal = 0;
    quizzes.forEach(q => {
        sumScore += q.score;
        sumTotal += q.total;
    });
    return (sumScore / sumTotal) * 100;
}

function updateOverall(allQuizzes) {
    const avg = calculateAverage(allQuizzes);
    const totalAvg = document.getElementById('totalAverage');
    if (totalAvg) {
        const avgColor = avg >= 70 ? 'text-green-400' : avg >= 50 ? 'text-yellow-400' : 'text-red-400';
        totalAvg.innerHTML = `<span class="text-white">Total Average: </span><span class="${avgColor} font-bold text-xl">${avg.toFixed(2)}%</span>`;
    }
    
    const totalQuizzes = allQuizzes.length;
    const totalQuizzesEl = document.getElementById('totalQuizzes');
    if (totalQuizzesEl) totalQuizzesEl.textContent = totalQuizzes;
    
    const bestSubject = getBestSubject(allQuizzes);
    const bestSubjectEl = document.getElementById('bestSubject');
    if (bestSubjectEl && bestSubject) bestSubjectEl.textContent = bestSubject;
    
    drawChart('Overall', avg);
}

function getBestSubject(allQuizzes) {
    if (!allQuizzes.length) return 'N/A';
    
    const subjectAverages = {};
    subjects.forEach(s => subjectAverages[s] = { sumScore: 0, sumTotal: 0, count: 0 });
    
    allQuizzes.forEach(q => {
        if (subjectAverages[q.subject]) {
            subjectAverages[q.subject].sumScore += q.score;
            subjectAverages[q.subject].sumTotal += q.total;
            subjectAverages[q.subject].count++;
        }
    });
    
    let bestSubject = 'N/A';
    let bestAvg = -1;
    
    subjects.forEach(s => {
        const data = subjectAverages[s];
        if (data.count > 0) {
            const avg = (data.sumScore / data.sumTotal) * 100;
            if (avg > bestAvg) {
                bestAvg = avg;
                bestSubject = s;
            }
        }
    });
    
    return bestSubject;
}

function drawChart(id, average) {
    const canvas = document.getElementById(`chart_${id}`);
    if (!canvas) return;

    if (chartInstances[id]) {
        chartInstances[id].destroy();
    }

    const ctx = canvas.getContext('2d');
    
    chartInstances[id] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Correct', 'Incorrect'],
            datasets: [{
                data: [average, 100 - average],
                backgroundColor: ['#4CAF50', '#F44336'],
                borderWidth: 0,
                hoverOffset: isMobile ? 0 : 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: isMobile ? '65%' : '70%',
            animation: {
                duration: isMobile ? 0 : 300,
                animateRotate: !isMobile,
                animateScale: !isMobile
            },
            plugins: {
                legend: { 
                    display: !isMobile,
                    position: 'bottom',
                    labels: { 
                        color: '#ffffff',
                        font: { size: isMobile ? 8 : 10 }
                    }
                },
                tooltip: { enabled: !isMobile }
            }
        },
        plugins: [{
            id: 'centerText',
            afterDraw(chart) {
                const {width, height, ctx} = chart;
                ctx.restore();
                const fontSize = (height / (isMobile ? 80 : 114)).toFixed(2);
                ctx.font = `bold ${fontSize}em sans-serif`;
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#ffffff';
                const text = Math.round(average) + '%';
                ctx.fillText(text, width / 2, height / 2);
                ctx.save();
            }
        }]
    });
}

async function downloadAllCharts() {
    const chartsContainer = document.getElementById('chartsContainer');
    const overallSection = document.querySelector('.overall-section');
    if (!chartsContainer || !overallSection) return;

    showToast('Preparing download...', 'info');

    const temp = document.createElement('div');
    temp.style.backgroundColor = '#0c120d';
    temp.style.padding = '2rem';
    temp.style.borderRadius = '0.75rem';
    temp.style.margin = 'auto';
    temp.style.width = 'fit-content';
    temp.style.display = 'grid';
    temp.style.gridTemplateColumns = 'repeat(auto-fit, minmax(250px, 1fr))';
    temp.style.gap = '2rem';
    temp.style.position = 'absolute';
    temp.style.left = '-9999px';

    const gridClone = chartsContainer.cloneNode(true);
    const overallClone = overallSection.cloneNode(true);
    overallClone.querySelector('button')?.remove();

    temp.appendChild(gridClone);
    temp.appendChild(overallClone);
    document.body.appendChild(temp);

    subjects.forEach(s => {
        const c = temp.querySelector(`#chart_${s}`);
        const orig = document.getElementById(`chart_${s}`);
        if (c && orig) {
            c.width = orig.width;
            c.height = orig.height;
            c.getContext('2d').drawImage(orig, 0, 0);
        }
    });

    const overallC = temp.querySelector('#chart_Overall');
    const origOverall = document.getElementById('chart_Overall');
    if (overallC && origOverall) {
        overallC.width = origOverall.width;
        overallC.height = origOverall.height;
        overallC.getContext('2d').drawImage(origOverall, 0, 0);
    }

    html2canvas(temp, { 
        backgroundColor: '#0c120d',
        scale: isMobile ? 1.5 : 2,
        logging: false
    }).then(canvas => {
        const link = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        link.download = `monthly_quizzes_${currentUsername}_${date}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        document.body.removeChild(temp);
        showToast('Dashboard downloaded successfully', 'success');
    }).catch(err => {
        console.error("Download charts error:", err);
        showToast("Failed to generate image", 'error');
        document.body.removeChild(temp);
    });
}

function exportToCSV() {
    if (!currentUsername) return;
    
    const quizzes = JSON.parse(localStorage.getItem(`monthly_quizzes_${currentUsername}`) || '[]');
    if (quizzes.length === 0) {
        showToast('No data to export', 'warning');
        return;
    }
    
    let csvContent = "Subject,Date,Score,Total,Percentage\n";
    quizzes.forEach(q => {
        const pct = ((q.score / q.total) * 100).toFixed(2);
        csvContent += `"${q.subject}",${q.date},${q.score},${q.total},${pct}%\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `monthly_quizzes_${currentUsername}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('CSV exported successfully', 'success');
}

// ==================== PAGE LOAD ====================

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Weekly Quiz page loading - Session based on DB");

    const isValid = await checkSessionAndRedirect();
    if (!isValid) return;

    createStars();
    await loadAnnouncement();
    await loadQuizzes();

    // Refresh announcement every hour
    setInterval(() => {
        loadAnnouncement();
    }, 60 * 60 * 1000);

    // Refresh quizzes every 5 minutes (optional)
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            loadQuizzes();
        }
    }, 5 * 60 * 1000);

    // Sidebar close on outside click
    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar?.classList.contains('open') &&
            !sidebar.contains(e.target) &&
            !e.target.classList.contains('menu-toggle')) {
            sidebar.classList.remove('open');
        }
    });
    
    console.log("✅ Weekly Quiz page initialized for user:", currentUsername);
});