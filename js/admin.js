// Current session data
let currentAdmin = null;
let currentRole = null;
let sessionCheckInterval = null;
let currentResellerKeyFilter = 'all';

// ==================== AUTHENTICATION ====================
async function adminLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        showNotification('Please enter username and password', 'error');
        return;
    }
    
    try {
        const { data: admin, error } = await window.supabaseClient
            .from('admin_users')
            .select('*')
            .eq('username', username)
            .single();
        
        if (error || !admin) {
            showNotification('Invalid credentials', 'error');
            return;
        }
        
        if (admin.is_banned) {
            showNotification('Your account has been banned', 'error');
            return;
        }
        
        if (password !== admin.password) {
            showNotification('Invalid credentials', 'error');
            return;
        }
        
        const sessionToken = generateSessionToken();
        const expiresAt = new Date();
        expiresAt.setHours(24, 0, 0, 0);
        
        const { error: sessionError } = await window.supabaseClient
            .from('admin_sessions')
            .insert({
                admin_id: admin.id,
                session_token: sessionToken,
                expires_at: expiresAt.toISOString()
            });
        
        if (sessionError) throw sessionError;
        
        localStorage.setItem('admin_session', sessionToken);
        currentAdmin = admin;
        currentRole = admin.role;
        
        setupAutoLogout();
        
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'flex';
        document.getElementById('adminInfo').innerHTML = `${admin.username}<br><span style="font-size:0.75em;">${admin.role}</span>`;
        
        setupSidebarPermissions();
        loadTab('dashboard');
        
        showNotification('Login successful', 'success');
        
    } catch (err) {
        showNotification('Login error: ' + err.message, 'error');
    }
}

function generateSessionToken() {
    return 'admin_' + Date.now() + '_' + Math.random().toString(36).substr(2);
}

async function checkSession() {
    const sessionToken = localStorage.getItem('admin_session');
    if (!sessionToken) return false;
    
    try {
        const { data: session, error } = await window.supabaseClient
            .from('admin_sessions')
            .select('*, admin_users(*)')
            .eq('session_token', sessionToken)
            .single();
        
        if (error || !session) return false;
        
        if (new Date(session.expires_at) < new Date()) {
            await logoutSession(sessionToken);
            return false;
        }
        
        if (session.admin_users.is_banned) {
            await logoutSession(sessionToken);
            return false;
        }
        
        currentAdmin = session.admin_users;
        currentRole = currentAdmin.role;
        return true;
        
    } catch (err) {
        return false;
    }
}

async function logoutSession(sessionToken) {
    await window.supabaseClient
        .from('admin_sessions')
        .delete()
        .eq('session_token', sessionToken);
    localStorage.removeItem('admin_session');
}

function setupAutoLogout() {
    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    
    sessionCheckInterval = setInterval(async () => {
        const isValid = await checkSession();
        if (!isValid) {
            adminLogout();
        }
    }, 60000);
}

async function adminLogout() {
    const sessionToken = localStorage.getItem('admin_session');
    if (sessionToken) {
        await logoutSession(sessionToken);
    }
    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    localStorage.removeItem('admin_session');
    location.reload();
}

// ==================== PERMISSIONS ====================
function setupSidebarPermissions() {
    const tabs = {
        'dashboard': true,
        'admin-announcement': ['owner', 'high_admin'].includes(currentRole),
        'announcement': true,
        'users': ['owner', 'high_admin'].includes(currentRole),
        'keys': ['owner', 'high_admin'].includes(currentRole),
        'resellers-manage': ['owner', 'reseller_manager'].includes(currentRole),
        'reseller': currentRole === 'reseller',
        'admin-users': currentRole === 'owner'
    };
    
    document.querySelectorAll('.nav-item').forEach(btn => {
        const tab = btn.getAttribute('data-tab');
        if (!tabs[tab]) {
            btn.style.display = 'none';
        } else {
            btn.style.display = 'flex';
        }
    });
    
    if (currentRole === 'high_admin') {
        const keyGenSection = document.getElementById('keyGenerationSection');
        if (keyGenSection) keyGenSection.style.display = 'none';
        const warning = document.getElementById('keysPermissionWarning');
        if (warning) warning.style.display = 'flex';
    } else if (currentRole === 'owner') {
        const keyGenSection = document.getElementById('keyGenerationSection');
        if (keyGenSection) keyGenSection.style.display = 'block';
        const warning = document.getElementById('keysPermissionWarning');
        if (warning) warning.style.display = 'none';
    }
    
    // Show/hide announcement editors based on role
    const adminAnnouncementEditor = document.getElementById('adminAnnouncementEditor');
    const announcementEditor = document.getElementById('announcementEditor');
    
    if (adminAnnouncementEditor) {
        adminAnnouncementEditor.style.display = ['owner', 'high_admin'].includes(currentRole) ? 'block' : 'none';
    }
    if (announcementEditor) {
        announcementEditor.style.display = ['owner', 'high_admin'].includes(currentRole) ? 'block' : 'none';
    }
    
    // If reseller, load their keys and announcement
    if (currentRole === 'reseller') {
        loadResellerKeys();
        loadResellerAnnouncement();
    }
}

// ==================== TAB MANAGEMENT ====================
function loadTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    switch(tabName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'admin-announcement':
            loadAdminAnnouncement();
            break;
        case 'announcement':
            loadAnnouncement();
            break;
        case 'users':
            loadUsers();
            break;
        case 'keys':
            loadKeys();
            break;
        case 'resellers-manage':
            loadResellersManage();
            break;
        case 'reseller':
            loadResellerKeys();
            loadResellerAnnouncement();
            break;
        case 'admin-users':
            loadAdminUsers();
            break;
    }
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
    try {
        const [usersCount, keysData] = await Promise.all([
            window.supabaseClient.from('users').select('*', { count: 'exact', head: true }),
            window.supabaseClient.from('access_keys').select('*')
        ]);
        
        const keys = keysData.data || [];
        const activeKeys = keys.filter(k => !k.is_used && (!k.expires_at || new Date(k.expires_at) > new Date()));
        const usedKeys = keys.filter(k => k.is_used);
        const expiredKeys = keys.filter(k => k.expires_at && new Date(k.expires_at) < new Date());
        
        const statsHtml = `
            <div class="stat-card"><h3>${usersCount.count || 0}</h3><p>Total Users</p></div>
            <div class="stat-card"><h3>${keys.length}</h3><p>Total Keys</p></div>
            <div class="stat-card"><h3>${activeKeys.length}</h3><p>Active Keys</p></div>
            <div class="stat-card"><h3>${usedKeys.length}</h3><p>Used Keys</p></div>
            <div class="stat-card"><h3>${expiredKeys.length}</h3><p>Expired Keys</p></div>
        `;
        
        document.getElementById('statsGrid').innerHTML = statsHtml;
        
        const { data: recentUsers } = await window.supabaseClient
            .from('users')
            .select('username, created_at')
            .order('created_at', { ascending: false })
            .limit(10);
        
        let activityHtml = '<div class="recent-list">';
        if (recentUsers && recentUsers.length > 0) {
            recentUsers.forEach(user => {
                activityHtml += `<div class="activity-item" style="padding: 10px; border-bottom: 1px solid var(--border);">
                    <span>👤 ${escapeHtml(user.username)}</span>
                    <span style="float: right;">${new Date(user.created_at).toLocaleString()}</span>
                </div>`;
            });
        } else {
            activityHtml += '<p>No recent activity</p>';
        }
        activityHtml += '</div>';
        document.getElementById('recentActivity').innerHTML = activityHtml;
        
    } catch (err) {
        showNotification('Error loading dashboard: ' + err.message, 'error');
    }
}

// ==================== ADMIN ANNOUNCEMENT (Main Website - app_settings) ====================
async function loadAdminAnnouncement() {
    try {
        const { data, error } = await window.supabaseClient
            .from('app_settings')
            .select('value')
            .eq('key', 'announcement_text')
            .maybeSingle();
        
        if (error) throw error;
        
        const textarea = document.getElementById('adminAnnouncementText');
        const previewContent = document.getElementById('adminPreviewContent');
        const previewDate = document.getElementById('adminPreviewDate');
        
        const announcementText = data?.value || '';
        
        if (textarea) textarea.value = announcementText;
        previewContent.textContent = announcementText || 'No announcement set for main website';
        
        if (data?.updated_at) {
            previewDate.textContent = `Last updated: ${new Date(data.updated_at).toLocaleString()}`;
        } else {
            previewDate.textContent = '';
        }
        
    } catch (err) {
        showNotification('Error loading website announcement: ' + err.message, 'error');
    }
}

async function saveAdminAnnouncement() {
    if (!['owner', 'high_admin'].includes(currentRole)) {
        showNotification('Permission denied', 'error');
        return;
    }
    
    const text = document.getElementById('adminAnnouncementText').value.trim();
    
    if (!text) {
        showNotification('Cannot save empty announcement!', 'error');
        return;
    }
    
    if (!confirm('Save this announcement to the main website?')) return;
    
    try {
        const { error } = await window.supabaseClient
            .from('app_settings')
            .upsert(
                { key: 'announcement_text', value: text, updated_at: new Date().toISOString() },
                { onConflict: 'key' }
            );
        
        if (error) throw error;
        
        showNotification('Website announcement saved', 'success');
        loadAdminAnnouncement();
    } catch (err) {
        showNotification('Error saving announcement: ' + err.message, 'error');
    }
}

// ==================== ANNOUNCEMENT (For Admins & Resellers) ====================
async function loadAnnouncement() {
    try {
        const { data, error } = await window.supabaseClient
            .from('announcements')
            .select('value')
            .eq('key', 'announcement_text')
            .maybeSingle();
        
        if (error) throw error;
        
        const textarea = document.getElementById('announcementText');
        const previewContent = document.getElementById('previewContent');
        const previewDate = document.getElementById('previewDate');
        
        const announcementText = data?.value || '';
        
        if (textarea) textarea.value = announcementText;
        previewContent.textContent = announcementText || 'No announcement set';
        
        if (data?.updated_at) {
            previewDate.textContent = `Last updated: ${new Date(data.updated_at).toLocaleString()}`;
        } else {
            previewDate.textContent = '';
        }
        
    } catch (err) {
        showNotification('Error loading announcement: ' + err.message, 'error');
    }
}

async function saveAnnouncement() {
    if (!['owner', 'high_admin'].includes(currentRole)) {
        showNotification('Permission denied', 'error');
        return;
    }
    
    const text = document.getElementById('announcementText').value.trim();
    
    if (!text) {
        showNotification('Cannot save empty announcement!', 'error');
        return;
    }
    
    if (!confirm('Save this announcement for admins and resellers?')) return;
    
    try {
        const { error } = await window.supabaseClient
            .from('app_settings')
            .upsert(
                { key: 'admin_announcement', value: text, updated_at: new Date().toISOString() },
                { onConflict: 'key' }
            );
        
        if (error) throw error;
        
        showNotification('Announcement saved', 'success');
        loadAnnouncement();
        
        if (currentRole === 'reseller') {
            loadResellerAnnouncement();
        }
    } catch (err) {
        showNotification('Error saving announcement: ' + err.message, 'error');
    }
}

// Load announcement for resellers (read only)
async function loadResellerAnnouncement() {
    try {
        const { data, error } = await window.supabaseClient
            .from('announcements')
            .select('value,')
            .eq('key', 'admin_announcement')
            .maybeSingle();
        
        if (error) throw error;
        
        const contentDiv = document.getElementById('resellerAnnouncementContent');
        const dateDiv = document.getElementById('resellerAnnouncementDate');
        
        if (contentDiv) {
            contentDiv.textContent = data?.value || 'No announcement from admin';
        }
        if (dateDiv && data?.updated_at) {
            dateDiv.textContent = `Published: ${new Date(data.updated_at).toLocaleString()}`;
        } else if (dateDiv) {
            dateDiv.textContent = '';
        }
    } catch (err) {
        console.error('Error loading reseller announcement:', err);
    }
}

// ==================== USERS ====================
async function loadUsers() {
    try {
        const { data, error } = await window.supabaseClient
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const tbody = document.querySelector('#usersTable tbody');
        tbody.innerHTML = '';
        
        data.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td contenteditable="${['owner', 'high_admin'].includes(currentRole)}" onblur="updateUserField('${escapeHtml(user.username)}', 'username', this.innerText)">${escapeHtml(user.username)}</td>
                <td contenteditable="${['owner', 'high_admin'].includes(currentRole)}" onblur="updateUserField('${escapeHtml(user.username)}', 'key', this.innerText)">${escapeHtml(user.key || 'N/A')}</td>
                <td contenteditable="${['owner', 'high_admin'].includes(currentRole)}" onblur="updateUserField('${escapeHtml(user.username)}', 'passwords', this.innerText)">${escapeHtml(user.passwords || 'N/A')}</td>
                <td contenteditable="${['owner', 'high_admin'].includes(currentRole)}" onblur="updateUserField('${escapeHtml(user.username)}', 'stream', this.innerText)">${escapeHtml(user.stream || 'N/A')}</td>
                <td contenteditable="${['owner', 'high_admin'].includes(currentRole)}" onblur="updateUserField('${escapeHtml(user.username)}', 'branch', this.innerText)">${escapeHtml(user.branch || 'N/A')}</td>
                <td>${new Date(user.created_at).toLocaleString()}</td>
                <td>${user.is_banned ? '<span style="color: var(--danger);">🔴 Banned</span>' : '<span style="color: var(--success);">🟢 Active</span>'}</td>
                <td>
                    <button class="${user.is_banned ? 'btn-success' : 'btn-danger'}" onclick="toggleUserBan('${escapeHtml(user.username)}', ${user.is_banned})">
                        ${user.is_banned ? 'Unban' : 'Ban'}
                    </button>
                    ${currentRole === 'owner' ? `<button class="btn-danger" onclick="deleteUser('${escapeHtml(user.username)}')">Delete</button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        const searchInput = document.getElementById('searchUsers');
        if (searchInput) searchInput.oninput = () => filterTable('usersTable', 'searchUsers');
        
    } catch (err) {
        showNotification('Error loading users: ' + err.message, 'error');
    }
}

async function updateUserField(username, field, newValue) {
    if (!['owner', 'high_admin'].includes(currentRole)) {
        showNotification('Permission denied', 'error');
        loadUsers();
        return;
    }
    
    newValue = newValue.trim();
    if (newValue === '' || newValue === 'N/A') newValue = null;
    
    if (!confirm(`Update ${field} for ${username}?`)) {
        loadUsers();
        return;
    }
    
    try {
        const { error } = await window.supabaseClient
            .from('users')
            .update({ [field]: newValue })
            .eq('username', username);
        
        if (error) throw error;
        showNotification(`${field} updated`);
        loadUsers();
    } catch (err) {
        showNotification(`Error: ${err.message}`, 'error');
        loadUsers();
    }
}

async function toggleUserBan(username, isBanned) {
    if (!['owner', 'high_admin'].includes(currentRole)) return;
    
    try {
        const { error } = await window.supabaseClient
            .from('users')
            .update({ is_banned: !isBanned })
            .eq('username', username);
        
        if (error) throw error;
        showNotification(`User ${!isBanned ? 'banned' : 'unbanned'}`);
        loadUsers();
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
}

async function deleteUser(username) {
    if (currentRole !== 'owner') return;
    if (!confirm(`Delete user ${username} permanently?`)) return;
    
    try {
        const { error } = await window.supabaseClient
            .from('users')
            .delete()
            .eq('username', username);
        
        if (error) throw error;
        showNotification('User deleted');
        loadUsers();
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
}

// ==================== KEYS with FULL CONTROLS ====================
async function generateKey(duration) {
    if (currentRole !== 'owner') {
        showNotification('Only owner can generate keys', 'error');
        return;
    }
    
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 12; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    try {
        const { error } = await window.supabaseClient
            .from('access_keys')
            .insert({
                key: key,
                is_used: false,
                created_at: new Date().toISOString(),
                duration: duration
            });
        
        if (error) throw error;
        
        document.getElementById('newKeyDisplay').innerHTML = `
            <div style="background: rgba(16, 185, 129, 0.1); padding: 20px; border-radius: 12px; text-align: center;">
                <strong>✨ New Key Created ✨</strong><br>
                <code style="font-size: 1.4em;">${key}</code><br>
                Duration: ${getDurationText(duration)}
            </div>
        `;
        
        showNotification('Key created');
        loadKeys();
        
        setTimeout(() => {
            const display = document.getElementById('newKeyDisplay');
            if (display) display.innerHTML = '';
        }, 8000);
        
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
}

async function loadKeys() {
    try {
        const { data, error } = await window.supabaseClient
            .from('access_keys')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const tbody = document.querySelector('#keysTable tbody');
        tbody.innerHTML = '';
        
        data.forEach(key => {
            const isExpired = key.expires_at && new Date(key.expires_at) < new Date();
            let status = '', statusColor = '';
            
            if (key.is_used) {
                status = 'Used';
                statusColor = 'var(--warning)';
            } else if (isExpired) {
                status = 'Expired';
                statusColor = 'var(--danger)';
            } else {
                status = 'Active';
                statusColor = 'var(--success)';
            }
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><code id="key-${escapeHtml(key.key)}">${escapeHtml(key.key)}</code></td>
                <td style="color: ${statusColor};">${status}</td>
                <td>${getDurationText(key.duration)}</td>
                <td>${key.expires_at ? new Date(key.expires_at).toLocaleString() : 'Not set'}</td>
                <td>${new Date(key.created_at).toLocaleString()}</td>
                <td>${key.assigned_to || 'None'}</td>
                <td>
                    ${currentRole === 'owner' ? `
                        <button class="btn-edit" onclick="editKeyFull('${escapeHtml(key.key)}')">✏️ Edit</button>
                        <button class="btn-danger" onclick="deleteKey('${escapeHtml(key.key)}')">Delete</button>
                    ` : ''}
                    ${['owner', 'high_admin'].includes(currentRole) ? `
                        <button class="btn-primary" onclick="markKeyUsed('${escapeHtml(key.key)}')">Mark Used</button>
                        <button class="btn-success" onclick="markKeyUnused('${escapeHtml(key.key)}')">Mark Unused</button>
                        <button class="btn-warning" onclick="expireKey('${escapeHtml(key.key)}')">Expire</button>
                    ` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        const searchInput = document.getElementById('searchKeys');
        if (searchInput) searchInput.oninput = () => filterTable('keysTable', 'searchKeys');
        
    } catch (err) {
        showNotification('Error loading keys: ' + err.message, 'error');
    }
}

// Full edit function for keys
async function editKeyFull(keyValue) {
    if (currentRole !== 'owner') {
        showNotification('Only owner can edit keys', 'error');
        return;
    }
    
    // Get current key data
    const { data: keyData } = await window.supabaseClient
        .from('access_keys')
        .select('*')
        .eq('key', keyValue)
        .single();
    
    if (!keyData) return;
    
    const newKey = prompt('Enter new key value:', keyValue);
    if (!newKey) return;
    
    const newExpires = prompt('Enter new expiry date (YYYY-MM-DD HH:MM:SS) or leave blank:', 
        keyData.expires_at ? new Date(keyData.expires_at).toISOString().slice(0, 19).replace('T', ' ') : '');
    
    const newDuration = prompt('Enter new duration (1day, 1week, 1month, 3months, 6months, 1year, lifetime):', keyData.duration);
    
    const newIsUsed = confirm('Mark as used? Click OK for Used, Cancel for Unused');
    
    try {
        const updateData = {
            key: newKey,
            is_used: newIsUsed
        };
        
        if (newDuration && newDuration.trim()) {
            updateData.duration = newDuration.trim();
        }
        
        if (newExpires && newExpires.trim()) {
            updateData.expires_at = new Date(newExpires).toISOString();
        } else if (newExpires === '') {
            updateData.expires_at = null;
        }
        
        const { error } = await window.supabaseClient
            .from('access_keys')
            .update(updateData)
            .eq('key', keyValue);
        
        if (error) throw error;
        
        showNotification('Key updated successfully');
        loadKeys();
    } catch (err) {
        showNotification('Error updating key: ' + err.message, 'error');
    }
}

async function markKeyUsed(keyValue) {
    if (!confirm(`Mark key ${keyValue} as used?`)) return;
    
    try {
        await window.supabaseClient
            .from('access_keys')
            .update({ is_used: true, last_used_at: new Date().toISOString() })
            .eq('key', keyValue);
        
        showNotification('Key marked as used');
        loadKeys();
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
}

async function markKeyUnused(keyValue) {
    if (!confirm(`Mark key ${keyValue} as unused?`)) return;
    
    try {
        await window.supabaseClient
            .from('access_keys')
            .update({ is_used: false, last_used_at: null })
            .eq('key', keyValue);
        
        showNotification('Key marked as unused');
        loadKeys();
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
}

async function expireKey(keyValue) {
    if (!confirm(`Expire key ${keyValue}?`)) return;
    
    try {
        await window.supabaseClient
            .from('access_keys')
            .update({ expires_at: new Date().toISOString() })
            .eq('key', keyValue);
        
        showNotification('Key expired');
        loadKeys();
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
}

async function deleteKey(keyValue) {
    if (currentRole !== 'owner') {
        showNotification('Only owner can delete keys', 'error');
        return;
    }
    
    if (!confirm(`Delete key ${keyValue} permanently?`)) return;
    
    try {
        await window.supabaseClient
            .from('access_keys')
            .delete()
            .eq('key', keyValue);
        
        showNotification('Key deleted');
        loadKeys();
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
}

// ==================== RESELLERS MANAGE (Send Keys) ====================
async function loadResellersManage() {
    try {
        const { data: resellers, error } = await window.supabaseClient
            .from('admin_users')
            .select('*')
            .eq('role', 'reseller');
        
        if (error) throw error;
        
        const listDiv = document.getElementById('resellersList');
        if (listDiv) {
            listDiv.innerHTML = '';
            
            for (const reseller of resellers) {
                const { data: assignedKeys } = await window.supabaseClient
                    .from('reseller_keys')
                    .select('key_value, claimed_at')
                    .eq('reseller_id', reseller.id);
                
                const keysData = [];
                for (const item of assignedKeys || []) {
                    const { data: keyInfo } = await window.supabaseClient
                        .from('access_keys')
                        .select('*')
                        .eq('key', item.key_value)
                        .single();
                    
                    if (keyInfo) keysData.push({ ...keyInfo, claimed: !!item.claimed_at });
                }
                
                const usedKeys = keysData.filter(k => k.is_used);
                const unusedKeys = keysData.filter(k => !k.is_used && (!k.expires_at || new Date(k.expires_at) > new Date()));
                
                const resellerDiv = document.createElement('div');
                resellerDiv.className = 'reseller-card';
                resellerDiv.innerHTML = `
                    <div class="reseller-header">
                        <div class="reseller-name">${escapeHtml(reseller.username)}</div>
                        <div class="reseller-stats">📊 Total: ${keysData.length} | ✅ Used: ${usedKeys.length} | 🟢 Unused: ${unusedKeys.length}</div>
                    </div>
                    <div class="reseller-keys">
                        <strong>Keys:</strong>
                        <div>
                            ${keysData.map(key => `
                                <div class="key-item">
                                    <span class="key-code">${escapeHtml(key.key)}</span>
                                    <span>${getDurationText(key.duration)}</span>
                                    <span class="key-status ${key.is_used ? 'status-used' : 'status-unused'}">
                                        ${key.is_used ? 'Used' : (key.expires_at && new Date(key.expires_at) < new Date() ? 'Expired' : 'Active')}
                                    </span>
                                    ${!key.claimed && !key.is_used ? `<button onclick="claimKeyForReseller(${reseller.id}, '${escapeHtml(key.key)}')" class="btn-success">Claim</button>` : key.claimed ? '<span>✓ Claimed</span>' : ''}
                                </div>
                            `).join('') || '<p>No keys assigned</p>'}
                        </div>
                    </div>
                    ${['owner', 'reseller_manager'].includes(currentRole) ? `
                        <div style="margin-top: 15px;">
                            <button onclick="removeResellerKeys(${reseller.id})" class="btn-danger">Remove All Keys</button>
                            ${currentRole === 'owner' ? `<button onclick="deleteReseller(${reseller.id})" class="btn-danger">Delete Reseller</button>` : ''}
                        </div>
                    ` : ''}
                `;
                listDiv.appendChild(resellerDiv);
            }
            
            if (resellers.length === 0) {
                listDiv.innerHTML = '<p>No resellers found. Create one in Admin Users tab.</p>';
            }
        }
        
        const resellerSelect = document.getElementById('resellerSelectForAssign');
        if (resellerSelect) {
            resellerSelect.innerHTML = '<option value="">Select Reseller</option>' + 
                resellers.map(r => `<option value="${r.id}">${escapeHtml(r.username)}</option>`).join('');
        }
        
        await updateAvailableKeysCount();
        
    } catch (err) {
        showNotification('Error loading resellers: ' + err.message, 'error');
    }
}

async function updateAvailableKeysCount() {
    const duration = document.getElementById('keyDurationSelect')?.value;
    if (!duration) return;
    
    const { data, error } = await window.supabaseClient
        .from('access_keys')
        .select('key')
        .eq('duration', duration)
        .eq('is_used', false)
        .is('assigned_to', null);
    
    if (!error && data) {
        const count = data.length;
        const span = document.getElementById('availableKeysCount');
        if (span) span.innerHTML = `Available: ${count} keys`;
    }
}

async function sendKeysToReseller() {
    const resellerId = document.getElementById('resellerSelectForAssign').value;
    const duration = document.getElementById('keyDurationSelect').value;
    const quantity = parseInt(document.getElementById('keyQuantity').value);
    const messageDiv = document.getElementById('sendMessage');
    
    if (!resellerId) {
        showNotification('Select a reseller first', 'error');
        return;
    }
    
    if (!quantity || quantity < 1) {
        showNotification('Enter valid quantity', 'error');
        return;
    }
    
    const { data: availableKeys, error: fetchError } = await window.supabaseClient
        .from('access_keys')
        .select('key')
        .eq('duration', duration)
        .eq('is_used', false)
        .is('assigned_to', null)
        .limit(quantity);
    
    if (fetchError) {
        showNotification('Error checking keys: ' + fetchError.message, 'error');
        return;
    }
    
    if (!availableKeys || availableKeys.length < quantity) {
        messageDiv.innerHTML = `<span style="color: var(--danger);">❌ Not enough keys! Available: ${availableKeys?.length || 0}, Requested: ${quantity}</span>`;
        showNotification(`Not enough keys with duration ${duration}`, 'error');
        return;
    }
    
    let successCount = 0;
    
    for (const key of availableKeys) {
        try {
            await window.supabaseClient
                .from('reseller_keys')
                .insert({
                    reseller_id: parseInt(resellerId),
                    key_value: key.key,
                    claimed_at: null
                });
            
            await window.supabaseClient
                .from('access_keys')
                .update({ assigned_to: parseInt(resellerId) })
                .eq('key', key.key);
            
            successCount++;
        } catch (err) {
            // Skip duplicates
        }
    }
    
    messageDiv.innerHTML = `<span style="color: var(--success);">✅ Sent ${successCount} keys (${getDurationText(duration)}) to reseller</span>`;
    showNotification(`Sent ${successCount} keys successfully`);
    
    setTimeout(() => {
        messageDiv.innerHTML = '';
    }, 5000);
    
    loadResellersManage();
    loadKeys();
}

async function claimKeyForReseller(resellerId, keyValue) {
    if (!confirm('Claim this key? It will be added to your account.')) return;
    
    try {
        await window.supabaseClient
            .from('reseller_keys')
            .update({ claimed_at: new Date().toISOString() })
            .eq('reseller_id', resellerId)
            .eq('key_value', keyValue);
        
        showNotification('Key claimed successfully!');
        loadResellersManage();
        if (currentRole === 'reseller') loadResellerKeys();
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
}

async function removeResellerKeys(resellerId) {
    if (!confirm('Remove all keys from this reseller?')) return;
    
    try {
        const { data: assignedKeys } = await window.supabaseClient
            .from('reseller_keys')
            .select('key_value')
            .eq('reseller_id', resellerId);
        
        await window.supabaseClient
            .from('reseller_keys')
            .delete()
            .eq('reseller_id', resellerId);
        
        for (const key of assignedKeys || []) {
            await window.supabaseClient
                .from('access_keys')
                .update({ assigned_to: null })
                .eq('key', key.key_value);
        }
        
        showNotification('Keys removed from reseller');
        loadResellersManage();
        loadKeys();
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
}

async function deleteReseller(resellerId) {
    if (!confirm('Delete this reseller?')) return;
    
    try {
        await removeResellerKeys(resellerId);
        await window.supabaseClient
            .from('admin_users')
            .delete()
            .eq('id', resellerId);
        
        showNotification('Reseller deleted');
        loadResellersManage();
        loadAdminUsers();
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
}

// ==================== RESELLER (View their own keys - Read Only) ====================
async function loadResellerKeys() {
    if (currentRole !== 'reseller') return;
    
    try {
        const { data: resellerKeys, error } = await window.supabaseClient
            .from('reseller_keys')
            .select('key_value, claimed_at')
            .eq('reseller_id', currentAdmin.id);
        
        if (error) throw error;
        
        const keysData = [];
        for (const item of resellerKeys || []) {
            const { data: keyInfo } = await window.supabaseClient
                .from('access_keys')
                .select('*')
                .eq('key', item.key_value)
                .single();
            
            if (keyInfo) {
                keysData.push({
                    ...keyInfo,
                    claimed: !!item.claimed_at
                });
            }
        }
        
        let filteredKeys = keysData;
        if (currentResellerKeyFilter === 'used') {
            filteredKeys = keysData.filter(k => k.is_used);
        } else if (currentResellerKeyFilter === 'unused') {
            filteredKeys = keysData.filter(k => !k.is_used && (!k.expires_at || new Date(k.expires_at) > new Date()));
        }
        
        const tbody = document.querySelector('#resellerKeysTable tbody');
        tbody.innerHTML = '';
        
        filteredKeys.forEach(key => {
            const isExpired = key.expires_at && new Date(key.expires_at) < new Date();
            let status = '';
            let statusColor = '';
            
            if (key.is_used) {
                status = 'Used';
                statusColor = 'var(--warning)';
            } else if (isExpired) {
                status = 'Expired';
                statusColor = 'var(--danger)';
            } else {
                status = 'Active';
                statusColor = 'var(--success)';
            }
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><code>${escapeHtml(key.key)}</code></td>
                <td style="color: ${statusColor};">${status}</td>
                <td>${getDurationText(key.duration)}</td>
                <td>${key.expires_at ? new Date(key.expires_at).toLocaleString() : 'Not set'}</td>
                <td>${key.claimed ? '<span style="color: var(--success);">✓ Claimed</span>' : '<span style="color: var(--warning);">⏳ Pending</span>'}</td>
            `;
            tbody.appendChild(tr);
        });
        
        if (filteredKeys.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No keys found</td></tr>';
        }
        
        const searchInput = document.getElementById('searchResellerKeys');
        if (searchInput) {
            searchInput.oninput = () => filterTable('resellerKeysTable', 'searchResellerKeys');
        }
        
    } catch (err) {
        showNotification('Error loading your keys: ' + err.message, 'error');
    }
}

function filterResellerKeys(filter) {
    currentResellerKeyFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    loadResellerKeys();
}

// ==================== ADMIN USERS ====================
async function loadAdminUsers() {
    if (currentRole !== 'owner') {
        showNotification('Only owner can access admin users', 'error');
        return;
    }
    
    try {
        const { data, error } = await window.supabaseClient
            .from('admin_users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const tbody = document.querySelector('#adminUsersTable tbody');
        tbody.innerHTML = '';
        
        data.forEach(admin => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td contenteditable="true" onblur="updateAdminField(${admin.id}, 'username', this.innerText)">${escapeHtml(admin.username)}</td>
                <td contenteditable="true" onblur="updateAdminField(${admin.id}, 'password', this.innerText)">${escapeHtml(admin.password)}</td>

                <td>
                    <select onchange="updateAdminField(${admin.id}, 'role', this.value)">
                        <option value="owner" ${admin.role === 'owner' ? 'selected' : ''}>Owner</option>
                        <option value="high_admin" ${admin.role === 'high_admin' ? 'selected' : ''}>High Admin</option>
                        <option value="reseller_manager" ${admin.role === 'reseller_manager' ? 'selected' : ''}>Reseller Manager</option>
                        <option value="reseller" ${admin.role === 'reseller' ? 'selected' : ''}>Reseller</option>
                    </select>
                </td>
                <td>${admin.is_banned ? '<span style="color: var(--danger);">🔴 Banned</span>' : '<span style="color: var(--success);">🟢 Active</span>'}</td>
                <td>${new Date(admin.created_at).toLocaleString()}</td>
                <td>
                    <button onclick="resetAdminPassword(${admin.id}, '${escapeHtml(admin.username)}')" class="btn-primary">Reset Password</button>
                    <button onclick="toggleAdminBan(${admin.id}, ${admin.is_banned})" class="${admin.is_banned ? 'btn-success' : 'btn-danger'}">
                        ${admin.is_banned ? 'Unban' : 'Ban'}
                    </button>
                    ${admin.username !== 'owner' ? `<button onclick="deleteAdmin(${admin.id})" class="btn-danger">Delete</button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
        
    } catch (err) {
        showNotification('Error loading admin users: ' + err.message, 'error');
    }
}

async function updateAdminField(adminId, field, newValue) {
    if (currentRole !== 'owner') return;
    if (!confirm(`Update ${field}?`)) return;
    
    try {
        await window.supabaseClient
            .from('admin_users')
            .update({ [field]: newValue })
            .eq('id', adminId);
        
        showNotification(`${field} updated`);
        loadAdminUsers();
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
        loadAdminUsers();
    }
}

async function createAdminUser() {
    if (currentRole !== 'owner') {
        showNotification('Only owner can create admins', 'error');
        return;
    }
    
    const username = document.getElementById('newAdminUsername').value.trim();
    const password = document.getElementById('newAdminPassword').value;
    const role = document.getElementById('newAdminRole').value;
    
    if (!username || !password) {
        showNotification('Fill all fields', 'error');
        return;
    }
    
    try {
        const { error } = await window.supabaseClient
            .from('admin_users')
            .insert({
                username: username,
                password: password,
                role: role,
                is_banned: false
            });
        
        if (error) throw error;
        
        showNotification('Admin user created');
        document.getElementById('newAdminUsername').value = '';
        document.getElementById('newAdminPassword').value = '';
        loadAdminUsers();
        
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
}

async function resetAdminPassword(adminId, username) {
    const newPassword = prompt(`Enter new password for ${username}:`);
    if (!newPassword) return;
    
    try {
        await window.supabaseClient
            .from('admin_users')
            .update({ password: newPassword })
            .eq('id', adminId);
        
        showNotification(`Password reset for ${username}`);
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
}

async function toggleAdminBan(adminId, isBanned) {
    if (currentRole !== 'owner') return;
    
    try {
        await window.supabaseClient
            .from('admin_users')
            .update({ is_banned: !isBanned })
            .eq('id', adminId);
        
        showNotification(`Admin ${!isBanned ? 'banned' : 'unbanned'}`);
        loadAdminUsers();
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
}

async function deleteAdmin(adminId) {
    if (currentRole !== 'owner') return;
    if (!confirm('Delete this admin user?')) return;
    
    try {
        await window.supabaseClient
            .from('admin_users')
            .delete()
            .eq('id', adminId);
        
        showNotification('Admin deleted');
        loadAdminUsers();
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
}

// ==================== UTILITIES ====================
function showNotification(message, type = 'success') {
    const notif = document.getElementById('notification');
    if (!notif) return;
    
    notif.textContent = message;
    notif.style.borderLeftColor = type === 'error' ? 'var(--danger)' : 'var(--success)';
    notif.style.display = 'block';
    
    setTimeout(() => {
        notif.style.display = 'none';
    }, 3000);
}

function filterTable(tableId, searchInputId) {
    const input = document.getElementById(searchInputId);
    if (!input) return;
    
    const filter = input.value.toLowerCase();
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const rows = table.getElementsByTagName('tr');
    for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        let match = false;
        for (let cell of cells) {
            if (cell.innerText.toLowerCase().includes(filter)) {
                match = true;
                break;
            }
        }
        rows[i].style.display = match ? '' : 'none';
    }
}

function getDurationText(duration) {
    const map = {
        '1day': '1 Day', '1week': '1 Week', '1month': '1 Month',
        '3months': '3 Months', '6months': '6 Months',
        '1year': '1 Year', 'lifetime': 'Lifetime'
    };
    return map[duration] || duration || 'Not specified';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Event listener for duration select change
document.addEventListener('DOMContentLoaded', () => {
    const durationSelect = document.getElementById('keyDurationSelect');
    if (durationSelect) {
        durationSelect.addEventListener('change', updateAvailableKeysCount);
    }
});

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
    const isValid = await checkSession();
    if (isValid) {
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'flex';
        document.getElementById('adminInfo').innerHTML = `${currentAdmin.username}<br><span style="font-size:0.75em;">${currentAdmin.role}</span>`;
        setupSidebarPermissions();
        setupAutoLogout();
        loadTab('dashboard');
    }
});