import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-analytics.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, updateDoc, deleteDoc, arrayUnion, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-messaging.js";

// Configuration provided by user
const firebaseConfig = {
    apiKey: "AIzaSyDyQyC2Fx-3Lv0zkBV3gjKcO5u0tjI1ZAA",
    authDomain: "drafta-dm.firebaseapp.com",
    projectId: "drafta-dm",
    storageBucket: "drafta-dm.firebasestorage.app",
    messagingSenderId: "1002743148971",
    appId: "1:1002743148971:web:aebcde08ff75e9c48522ee",
    measurementId: "G-HF2B9CEQ4T"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Initialize Firebase Cloud Messaging
let messaging = null;
try {
    messaging = getMessaging(app);
} catch (err) {
    console.warn('FCM not supported in this browser:', err);
}

export {
    app,
    analytics,
    auth,
    db,
    googleProvider,
    messaging,
    getToken,
    onMessage,
    signInWithPopup,
    onAuthStateChanged,
    signOut,
    collection,
    doc,
    setDoc,
    getDoc,
    onSnapshot,
    updateDoc,
    deleteDoc,
    arrayUnion,
    serverTimestamp,
    query,
    where
};

