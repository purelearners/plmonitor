import { auth, db } from './firebase-config.js';
import { 
    onAuthStateChanged, 
    signOut, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- Global Authentication State Listener and Redirection ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const role = docSnap.data().role;
            const currentPage = window.location.pathname;

            if (role === 'teacher' && !currentPage.includes('teacher.html')) {
                window.location.href = 'teacher.html';
            } else if (role === 'student' && !currentPage.includes('student.html')) {
                window.location.href = 'student.html';
            }
        }
    } else {
        // If not logged in and not on the index page, redirect to login
        if (!window.location.pathname.includes('index.html')) {
            window.location.href = 'index.html';
        }
    }
});

// --- Auth Functions (Attached to index.html forms) ---

// Login Handler
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
});

// Signup Handler (Students)
document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const classId = document.getElementById('signup-class-id').value;
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", userCredential.user.uid), {
            email: email,
            role: 'student', 
            classId: classId
        });
        alert('Signup successful! Please log in.');
    } catch (error) {
        alert('Signup failed: ' + error.message);
    }
});

// Logout Handler (Attached to teacher/student.html buttons)
document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Logout failed:", error);
    }
});

// Note: To create an initial TEACHER account, you'll need to sign up a user 
// through the console or modify the signup function to allow a specific email 
// to be marked as 'teacher' and then change the role manually in Firestore.
