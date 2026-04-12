// js/register.js

console.log("[REGISTER.JS] File loaded at " + new Date().toISOString());

function showMessage(text, type = 'error') {
    const container = document.getElementById('messageContainer');
    if (!container) return;

    const message = document.createElement('div');
    message.style.padding = '12px 15px';
    message.style.borderRadius = '8px';
    message.style.marginBottom = '15px';
    message.style.position = 'relative';
    message.style.fontSize = '14px';
    message.style.display = 'flex';
    message.style.alignItems = 'center';
    message.style.justifyContent = 'space-between';

    if (type === 'error') {
        message.style.background = 'rgba(255, 77, 77, 0.15)';
        message.style.color = '#ff4d4d';
        message.style.border = '1px solid #ff4d4d';
    } else if (type === 'success') {
        message.style.background = 'rgba(76, 175, 80, 0.15)';
        message.style.color = '#4caf50';
        message.style.border = '1px solid #4caf50';
    } else {
        message.style.background = 'rgba(33, 150, 243, 0.15)';
        message.style.color = '#2196f3';
        message.style.border = '1px solid #2196f3';
    }

    message.innerHTML = `
        <span>${text}</span>
        <span style="cursor:pointer; font-weight:bold; font-size:18px; margin-left:15px;" onclick="this.parentElement.remove()">×</span>
    `;

    container.innerHTML = '';
    container.appendChild(message);
    container.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("[REGISTER] DOM ready");

    const form = document.getElementById('registerForm');
    if (form) {
        console.log("[REGISTER] Form found");
        form.addEventListener('submit', async (e) => {
            console.log("[REGISTER] Submit clicked");
            e.preventDefault();
            await register();
        });
    } else {
        console.error("[REGISTER] Form not found!");
    }
});

async function register() {
    console.log("[REGISTER] register() started");

    const username = document.getElementById('username')?.value?.trim();
    const password = document.getElementById('password')?.value;
    const key = document.getElementById('accessKey')?.value?.trim();
    const stream = document.querySelector('input[name="stream"]:checked')?.value;

    let branch = null;
    if (stream === '3 Secandery') {
        branch = document.querySelector('input[name="branch"]:checked')?.value;
        if (!branch) {
            showMessage('Please select a branch for 3rd secondary', 'error');
            return;
        }
    }

    if (!username || !password || !key || !stream) {
        showMessage('Please fill in all fields', 'error');
        return;
    }

    if (password.length < 6) {
        showMessage('Password must be at least 6 characters', 'error');
        return;
    }

    try {
        console.log("[REGISTER] Checking key:", key);

        const { data: keyData, error: keyError } = await supabaseClient
            .from('access_keys')
            .select('id, key, expires_at, is_used, duration')
            .eq('key', key)
            .maybeSingle();

        if (keyError) {
            console.error("Key check error:", keyError);
            showMessage('Error checking key', 'error');
            return;
        }

        if (!keyData) {
            showMessage('Invalid access key', 'error');
            return;
        }

        console.log("[REGISTER] Key info:", {
            is_used_raw: keyData.is_used,
            is_used_type: typeof keyData.is_used,
            duration: keyData.duration,
            current_expires: keyData.expires_at
        });

        // لو الكي لسه مش مستخدم (بنتعامل مع boolean أو string)
        if (keyData.is_used !== true && keyData.is_used !== 'true') {
            console.log("[REGISTER] First use - ACTIVATING KEY NOW");

            let durationDays = 30;

            if (keyData.duration) {
                switch (keyData.duration) {
                    case '1day':     durationDays = 1; break;
                    case '1week':    durationDays = 7; break;
                    case '1month':   durationDays = 30; break;
                    case '3months':  durationDays = 90; break;
                    case '4months':  durationDays = 120; break;
                    case '6months':  durationDays = 180; break;
                    case '1year':    durationDays = 365; break;
                    case 'lifetime': durationDays = 99999; break; // كبير جدًا بدل null
                    default:         durationDays = 30;
                }
            }

            const expiresDate = new Date();
            expiresDate.setDate(expiresDate.getDate() + durationDays);
            const newExpiresAt = expiresDate.toISOString();

            console.log("[REGISTER] Will set expires_at to:", newExpiresAt);

            const { data: updated, error: updateError } = await supabaseClient
                .from('access_keys')
                .update({
                    is_used: true,
                    expires_at: newExpiresAt
                })
                .eq('key', key)
                .select('is_used, expires_at')
                .single();

            if (updateError) {
                console.error("[REGISTER] Update failed:", updateError);
                showMessage('Failed to activate key: ' + updateError.message, 'error');
                return;
            }

            console.log("[REGISTER] DB updated successfully:", updated);

            const msg = durationDays === 99999
                ? 'Key activated! Lifetime access.'
                : `Key activated! Valid for ${durationDays} days.`;
            showMessage(msg, 'success');
        } else {
            console.log("[REGISTER] Key already used - checking expiry");
            if (keyData.expires_at) {
                if (new Date(keyData.expires_at) < new Date()) {
                    showMessage('This key has expired', 'error');
                    return;
                } else {
                    showMessage('Key is already active and valid', 'success');
                }
            } else {
                showMessage('Key is used but has no expiry date', 'warning');
            }
        }

        // 2. إنشاء الحساب
        const timestamp = Date.now();
        const email = `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${timestamp}@nazamly.local`;

        console.log("[REGISTER] Signing up:", email);

        const { data: authData, error: signUpError } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username,
                    stream,
                    branch,
                    access_key: key
                }
            }
        });

        if (signUpError) {
            console.error("[REGISTER] Sign up error:", signUpError);
            showMessage('Registration failed: ' + signUpError.message, 'error');
            return;
        }

        if (authData.user) {
            console.log("[REGISTER] Inserting profile");
            const { error: insertError } = await supabaseClient
                .from('users')
                .insert({
                    id: authData.user.id,
                    username,
                    key,
                    stream,
                    branch,
                    passwords: password,
                    is_banned: false,
                    is_expired: false,
                    created_at: new Date().toISOString()
                });

            if (insertError) {
                console.error("[REGISTER] Insert error:", insertError);
                showMessage('Failed to save profile', 'error');
                return;
            }
        }

        showMessage('Account created successfully! Redirecting...', 'success');

        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1800);

    } catch (err) {
        console.error("[REGISTER] Global error:", err);
        showMessage('Unexpected error', 'error');
    }
}