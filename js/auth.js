import {
    auth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    db,
    doc,
    getDoc
} from './firebase-config.js';

const loginForm = document.getElementById('login-form');
const loginButton = document.getElementById('login-btn');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('error-message');
const logoutButton = document.getElementById('logout-btn');

/**
 * Handles user login.
 */
const handleLogin = async () => {
    if (!loginButton) return; // Only run on login page

    loginButton.disabled = true;
    loginButton.textContent = 'Logging in...';
    errorMessage.textContent = '';

    try {
        const email = emailInput.value;
        const password = passwordInput.value;
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the redirect
    } catch (error) {
        console.error("Login Error:", error);
        errorMessage.textContent = 'Invalid email or password.';
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
    }
};

/**
 * Handles user logout.
 */
const handleLogout = async () => {
    try {
        await signOut(auth);
        // onAuthStateChanged will handle redirect to index.html
    } catch (error) {
        console.error("Logout Error:", error);
    }
};

/**
 * Main auth state listener and role-based redirector.
 */
onAuthStateChanged(auth, async (user) => {
    const currentPage = window.location.pathname.split('/').pop();

    if (user) {
        // User is logged in
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const role = userData.role;
            const targetPage = `${role}.html`; // e.g., "admin.html"

            // Greet the user on their dashboard
            const greetingEl = document.getElementById('student-greeting');
            if (greetingEl && role === 'student') {
                greetingEl.textContent = `Welcome, ${userData.email}!`;
            }

            // If user is on the wrong page, redirect them
            if (currentPage !== targetPage && currentPage !== '') {
                console.log(`Redirecting to ${targetPage}...`);
                window.location.href = targetPage;
            }
            // If user is on the login page, redirect them
            else if (currentPage === 'index.html' || currentPage === '') {
                console.log(`Redirecting to ${targetPage}...`);
                window.location.href = targetPage;
            }
        } else {
            // User exists in Auth but not in Firestore 'users' collection
            console.error("No user role found in Firestore! Logging out.");
            errorMessage.textContent = 'Your account is not configured. Please contact an admin.';
            await handleLogout();
        }
    } else {
        // User is not logged in
        // If not on the login page, redirect to login
        if (currentPage !== 'index.html' && currentPage !== '') {
            console.log('User not logged in. Redirecting to login page...');
            window.location.href = 'index.html';
        }
    }
});

// Add event listeners if the elements exist on the current page
loginButton?.addEventListener('click', handleLogin);
logoutButton?.addEventListener('click', handleLogout);

// Also allow login with Enter key
passwordInput?.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') {
        handleLogin();
    }
});
