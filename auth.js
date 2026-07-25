const SUPABASE_URL = 'https://wqrimnvcfduqsdnpcitk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcmltbnZjZmR1cXNkbnBjaXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1ODkyOTQsImV4cCI6MjA5NjE2NTI5NH0.wDTJffnCY9GyjkIOAlQIGt85zOyr8me_NIHeKB6raao';

let supabaseClient = null;

function initSupabase() {
    if (window.supabaseClient) {
        supabaseClient = window.supabaseClient;
        return;
    }

    try {
        if (typeof supabase !== 'undefined' && supabase.createClient) {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('Supabase initialized via global `supabase`.');
        } else if (window && window.supabase && window.supabase.createClient) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('Supabase initialized via `window.supabase`.');
        }

        if (supabaseClient) {
            window.supabaseClient = supabaseClient;
        }

        return;
    } catch (err) {
        console.error('Error initializing Supabase client:', err);
    }

    console.error('Supabase client not found. Ensure the CDN script is loaded before auth.js');
}

function getSignupErrorMessage(error) {
    if (!error || !error.message) {
        return 'Unable to create account right now. Please try again later.';
    }

    const normalized = error.message.toLowerCase();

    if (normalized.includes('email rate limit')) {
        return 'Too many confirmation emails were requested. Please wait a few minutes and try again.';
    }

    if (normalized.includes('invalid email')) {
        return 'Please enter a valid email address.';
    }

    if (normalized.includes('password')) {
        return 'Please choose a stronger password.';
    }

    return error.message;
}

async function registerUser(event) {
    if (event && event.preventDefault) event.preventDefault();
    const companyNameEl = document.getElementById('companyName');
    const emailEl = document.getElementById('email');
    const passwordEl = document.getElementById('password');
    const message = document.getElementById('authMessage');
    const btn = document.getElementById('registerBtn');

    const companyName = companyNameEl ? companyNameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';

    if (!companyName || !email || !password) {
        if (message) {
            message.style.color = 'var(--danger)';
            message.textContent = 'Please fill in all fields.';
        }
        return;
    }

    if (password.length < 6) {
        if (message) {
            message.style.color = 'var(--danger)';
            message.textContent = 'Password must be at least 6 characters.';
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Creating account...';
    }

    if (!supabaseClient) {
        console.error('Supabase client not initialized.');
        if (message) {
            message.style.color = 'var(--danger)';
            message.textContent = 'Configuration error. Check console.';
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Create Account →'; }
        return;
    }

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: { company_name: companyName }
            }
        });

        if (error) {
            const displayMessage = getSignupErrorMessage(error);
            console.warn('Signup error:', error);
            if (message) {
                message.style.color = 'var(--danger)';
                message.textContent = displayMessage;
            }
            if (btn) { btn.disabled = false; btn.textContent = 'Create Account →'; }
            return;
        }

        if (data && data.user) {
            const { error: profileError } = await supabaseClient.from('profiles').insert([
                {
                    id: data.user.id,
                    email,
                    company_name: companyName,
                    free_trial_used: false
                }
            ]);

            if (profileError) console.error('Profile insert error:', profileError);
        }

       if (message) {
    message.style.color = 'var(--success)';
    message.innerHTML = '✅ Account created! Check your email inbox (including spam/junk) and click the confirmation link before signing in.';
}
if (btn) { btn.textContent = 'Check Your Email'; }
    } catch (err) {
        console.error('registerUser error:', err);
        if (message) {
            message.style.color = 'var(--danger)';
            message.textContent = 'An unexpected error occurred.';
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Create Account →'; }
    }
}

async function loginUser(event) {
    if (event && event.preventDefault) event.preventDefault();
    const emailEl = document.getElementById('email');
    const passwordEl = document.getElementById('password');
    const message = document.getElementById('authMessage');
    const btn = document.getElementById('loginBtn');

    const email = emailEl ? emailEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';

    if (!email || !password) {
        if (message) {
            message.style.color = '#DC2626';
            message.textContent = 'Please enter your email and password.';
        }
        return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }

    if (!supabaseClient) {
        console.error('Supabase client not initialized.');
        if (message) { message.style.color = '#DC2626'; message.textContent = 'Configuration error. Check console.'; }
        if (btn) { btn.disabled = false; btn.textContent = 'Sign In →'; }
        return;
    }

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            if (message) {
                message.style.color = '#DC2626';
                message.textContent = error.message;
            }
            if (btn) { btn.disabled = false; btn.textContent = 'Sign In →'; }
            return;
        }

        if (message) {
            message.style.color = '#059669';
            message.textContent = 'Signed in! Redirecting...';
        }

        setTimeout(() => { window.location.href = 'index.html'; }, 1000);
    } catch (err) {
        console.error('loginUser error:', err);
        if (message) { message.style.color = '#DC2626'; message.textContent = 'An unexpected error occurred.'; }
        if (btn) { btn.disabled = false; btn.textContent = 'Sign In →'; }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('auth.js loaded and DOMContentLoaded fired');
    initSupabase();

    const registerButton = document.getElementById('registerBtn');
    if (registerButton) {
        registerButton.addEventListener('click', registerUser);
    }

    const loginButton = document.getElementById('loginBtn');
    if (loginButton) {
        loginButton.addEventListener('click', loginUser);
    }

    // Expose for debugging and in-case other code expects globals
    window.registerUser = registerUser;
    window.loginUser = loginUser;
    window.logoutUser = logoutUser;
});

async function logoutUser() {
    try {
        const client = supabaseClient || window.supabaseClient;
        if (client && client.auth && client.auth.signOut) {
            await client.auth.signOut();
        }
    } catch (err) {
        console.error('Logout error:', err);
    }

    window.location.href = 'login.html';
}