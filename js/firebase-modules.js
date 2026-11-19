import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, updateDoc, deleteDoc, arrayUnion, serverTimestamp, query, where, addDoc, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";
import { getMessaging, getToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-messaging.js";

// Web config: public by design, access is decided by firestore.rules.
const app = initializeApp({
    apiKey: "AIzaSyDyQyC2Fx-3Lv0zkBV3gjKcO5u0tjI1ZAA",
    authDomain: "drafta-dm.firebaseapp.com",
    projectId: "drafta-dm",
    storageBucket: "drafta-dm.firebasestorage.app",
    messagingSenderId: "1002743148971",
    appId: "1:1002743148971:web:aebcde08ff75e9c48522ee",
});

const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
// FCM is missing in some browsers (iOS outside the installed app, Firefox private)
const messaging = (await isSupported().catch(() => false)) ? getMessaging(app) : null;

export {
    auth, db, googleProvider, messaging, getToken, onMessage,
    signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
    collection, doc, setDoc, getDoc, onSnapshot, updateDoc, deleteDoc, arrayUnion, serverTimestamp,
    query, where, addDoc, orderBy, limit,
};
