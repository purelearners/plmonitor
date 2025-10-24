import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDBwmR4NcmjxFGBKvIkQIK1_wwVRd5A7-o",
    authDomain: "plmonitor-9f5e2.firebaseapp.com",
    projectId: "plmonitor-9f5e2",
    storageBucket: "plmonitor-9f5e2.firebasestorage.app",
    messagingSenderId: "460568027767",
    appId: "1:460568027767:web:9f97c0e9c6541da6f75c72"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
