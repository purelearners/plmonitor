// Inside js/auth.js
// --- Global Authentication State Listener and Redirection ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const role = docSnap.data().role;
            const currentPage = window.location.pathname;

            // 🔑 NEW: Admin has highest priority redirection
            if (role === 'admin' && !currentPage.includes('admin.html')) {
                window.location.href = 'admin.html';
            } 
            // Existing Teacher logic
            else if (role === 'teacher' && !currentPage.includes('teacher.html')) {
                window.location.href = 'teacher.html';
            } 
            // Existing Student logic
            else if (role === 'student' && !currentPage.includes('student.html')) {
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
