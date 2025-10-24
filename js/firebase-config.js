// Import functions from the Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    signOut,
    createUserWithEmailAndPassword // <-- Import this
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    addDoc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    arrayUnion,
    increment,
    runTransaction,
    Timestamp
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Your web app's Firebase configuration from the prompt
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
const auth = getAuth(app);
const db = getFirestore(app);

// Export all services and functions
export {
    app, // <-- Export the main app
    auth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    createUserWithEmailAndPassword, // <-- Export this
    db,
    collection,
    doc,
    addDoc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    arrayUnion,
    increment,
    runTransaction,
    Timestamp,
    firebaseConfig // <-- Export the config object
};
