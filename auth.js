const SUPABASE_URL = 'https://wqrimnvcfduqsdnpcitk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcmltbnZjZmR1cXNkbnBjaXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1ODkyOTQsImV4cCI6MjA5NjE2NTI5NH0.wDTJffnCY9GyjkIOAlQIGt85zOyr8me_NIHeKB6raao';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', () => {
    const registerButton = document.getElementById('registerBtn');
    if (registerButton) {
        registerButton.addEventListener('click', registerUser);
    }
});

async function registerUser() {
    const companyName = document.getElementById('companyName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const message = document.getElementById('authMessage');
    const btn = document.getElementById('registerBtn');

    if (!companyName || !email || !password) {
        message.style.color = 'var(--danger)';
        message.textContent = 'Please fill in all fields.';
        return;
    }

    if (password.length < 6) {
        message.style.color = 'var(--danger)';
        message.textContent = 'Password must be at least 6 characters.';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating account...';

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                company_name: companyName
            }
        }
    });

    if (error) {
        message.style.color = 'var(--danger)';
        message.textContent = error.message;
        btn.disabled = false;
        btn.textContent = 'Create Account →';
        return;
    }

    if (data.user) {
        const { error: profileError } = await supabase.from('profiles').insert([
            {
                id: data.user.id,
                email,
                company_name: companyName,
                free_trial_used: false
            }
        ]);

        if (profileError) {
            console.error('Profile insert error:', profileError);
        }
    }

    message.style.color = 'var(--success)';
    message.textContent = 'Account created! Redirecting...';

    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1200);
}
