// js/supabase-client.js
console.log("Loading Supabase client...");

const SUPABASE_URL = "https://rvofdchdwotevywlpkli.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2b2ZkY2hkd290ZXZ5d2xwa2xpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NTczNTUsImV4cCI6MjA4ODEzMzM1NX0.eQABLrQB4mJDb8IXPex_pzgeDLcOcXrUiQbPOKwccIY";

const { createClient } = window.supabase;

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("Supabase client loaded successfully!");

window.supabaseClient = supabaseClient;

// Authentication check & redirect
async function checkAuthAndRedirect() {
    console.log("Checking authentication status...");

    const { data: { session }, error } = await window.supabaseClient.auth.getSession();

    if (error) {
        console.error("Auth check error:", error);
        window.location.href = 'login.html';
        return null;
    }

    if (!session) {
        console.log("No active session → redirecting to login");
        window.location.href = 'login.html';
        return null;
    }

    console.log("User is authenticated:", session.user.id);
    return session;
}

// Logout function
async function logout() {
    console.log("Logging out...");
    await window.supabaseClient.auth.signOut();
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
}

window.checkAuthAndRedirect = checkAuthAndRedirect;
window.logout = logout;