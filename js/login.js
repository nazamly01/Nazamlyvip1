// js/login.js - Login with username + password + key expiration check

// Safe localStorage operations with error handling
function safeLocalStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        console.warn("localStorage set blocked:", e);
        return false;
    }
}

function safeLocalStorageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        console.warn("localStorage get blocked:", e);
        return null;
    }
}

function safeLocalStorageRemove(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (e) {
        console.warn("localStorage remove blocked:", e);
        return false;
    }
}

function createStars() {
    const starsContainer = document.getElementById('stars');
    if (!starsContainer) return;

    for (let i = 0; i < 180; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        const size = Math.random() * 2.8 + 0.8;
        star.style.width = star.style.height = `${size}px`;
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        star.style.animationDelay = `${Math.random() * 4}s`;
        starsContainer.appendChild(star);
    }
}

function showMessage(message, type = 'error') {
    const messageBox = document.getElementById('messageBox');
    const banMessage = document.getElementById('banMessage');
    
    if (!messageBox) return;
    
    if (banMessage) banMessage.style.display = 'none';
    
    messageBox.textContent = message;
    messageBox.className = `message-box ${type}`;
    messageBox.style.display = 'block';
    
    if (type === 'success' || type === 'info') {
        setTimeout(() => messageBox.style.display = 'none', type === 'success' ? 3000 : 4000);
    }
}

function setLoginButtonLoading(isLoading) {
    const btn = document.querySelector('.login-btn');
    if (btn) {
        btn.disabled = isLoading;
        btn.innerHTML = isLoading ? '<span>🔄 Logging in...</span>' : 'Login';
    }
}

function generateSessionToken() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 16);
}

async function createUserSession(userId, username, sessionToken) {
    try {
        // Calculate expiration (next midnight)
        const expiresAt = new Date();
        expiresAt.setHours(24, 0, 0, 0);
        
        const { error } = await supabaseClient
            .from('user_sessions')
            .insert({
                user_id: userId,
                username: username,
                session_token: sessionToken,
                created_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
                last_active: new Date().toISOString(),
                is_active: true
            });
        
        if (error) {
            console.error('Error creating session:', error);
            throw error;
        }
        
        console.log("Session created successfully for user:", username);
        return true;
    } catch (err) {
        console.error('Session creation error:', err);
        return false;
    }
}

async function login() {
    const usernameInput = document.getElementById('username')?.value?.trim();
    const passwordInput = document.getElementById('password')?.value;

    if (!usernameInput || !passwordInput) {
        showMessage('Please enter username and password', 'error');
        return;
    }

    setLoginButtonLoading(true);
    showMessage('Checking credentials...', 'info');

    try {
        // 1. Search for user by username
        const { data: userProfile, error: profileError } = await supabaseClient
            .from('users')
            .select('id, username, passwords, key, stream, branch, is_banned, is_expired')
            .eq('username', usernameInput)
            .maybeSingle();

        if (profileError) {
            console.error('Profile lookup error:', profileError);
            showMessage('Something went wrong. Try again later.', 'error');
            setLoginButtonLoading(false);
            return;
        }

        if (!userProfile) {
            showMessage('Username not found', 'error');
            setLoginButtonLoading(false);
            return;
        }

        // 2. Check ban or expiration
        if (userProfile.is_banned === true) {
            const banMessageEl = document.getElementById('banMessage');
            if (banMessageEl) banMessageEl.style.display = 'block';
            showMessage('Your account is banned. Contact support.', 'error');
            setLoginButtonLoading(false);
            return;
        }

        if (userProfile.is_expired === true) {
            showMessage('Your account has expired. Contact support for renewal.', 'error');
            setLoginButtonLoading(false);
            return;
        }

        // 3. Check access key status
        if (userProfile.key) {
            const { data: keyData, error: keyError } = await supabaseClient
                .from('access_keys')
                .select('expires_at, is_used')
                .eq('key', userProfile.key)
                .maybeSingle();

            if (keyError) {
                console.error('Key check error:', keyError);
                showMessage('Error checking access key status.', 'error');
                setLoginButtonLoading(false);
                return;
            }

            if (!keyData) {
                showMessage('Associated access key not found in system.', 'error');
                setLoginButtonLoading(false);
                return;
            }

            // Check expiration
            let keyExpired = false;
            if (keyData.expires_at) {
                const expiresDate = new Date(keyData.expires_at);
                const now = new Date();
                if (expiresDate < now) {
                    keyExpired = true;
                }
            }

            if (keyExpired) {
                showMessage('Your access key has expired. Please get a new key or contact support.', 'error');
                setLoginButtonLoading(false);
                return;
            }
        } else {
            showMessage('No access key linked to this account.', 'error');
            setLoginButtonLoading(false);
            return;
        }

        // 4. Verify password
        if (userProfile.passwords !== passwordInput) {
            showMessage('Incorrect password', 'error');
            setLoginButtonLoading(false);
            return;
        }

        // 5. Create session in database
        const sessionToken = generateSessionToken();
        const sessionCreated = await createUserSession(userProfile.id, userProfile.username, sessionToken);
        
        if (!sessionCreated) {
            showMessage('Error creating session. Please try again.', 'error');
            setLoginButtonLoading(false);
            return;
        }

        // 6. Store session info in localStorage using safe function
        const expiresAt = new Date();
        expiresAt.setHours(24, 0, 0, 0);
        
        const sessionData = {
            userId: userProfile.id,
            username: userProfile.username,
            stream: userProfile.stream || null,
            branch: userProfile.branch || null,
            sessionToken: sessionToken,
            loggedInAt: new Date().toISOString(),
            expiresAt: expiresAt.getTime(),
            isLoggedIn: true
        };

        safeLocalStorageSet('nazamly_session', JSON.stringify(sessionData));

        showMessage(`Welcome back, ${userProfile.username}!`, 'success');

        setTimeout(() => {
            window.location.replace('index.html');
        }, 1200);

    } catch (err) {
        console.error('Login unexpected error:', err);
        showMessage('An unexpected error occurred. Please try again.', 'error');
        setLoginButtonLoading(false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    createStars();

    const loginBtn = document.querySelector('.login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', login);
    }

    const form = document.getElementById('loginForm');
    if (form) {
        form.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                login();
            }
        });
    }

    ['username', 'password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('focus', () => {
                const messageBox = document.getElementById('messageBox');
                const banMessage = document.getElementById('banMessage');
                if (messageBox) messageBox.style.display = 'none';
                if (banMessage) banMessage.style.display = 'none';
            });
        }
    });

    console.log('Nazamly login ready – creates session in DB at login');
});