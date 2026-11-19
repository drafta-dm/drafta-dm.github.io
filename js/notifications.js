// Push notifications: permission, FCM token in users/{uid}/fcmTokens, local notifications.
// The push itself is sent by the Cloud Function in functions/index.js.

import { messaging, getToken, onMessage, db, doc, setDoc, serverTimestamp } from './firebase-modules.js';
import { state } from './state.js';
import { showToast, openModal, closeModal } from './utils.js';

const VAPID = 'BBP4-oexEv80hhemDsV2cq6SoOdelDUh0I3fI-hbiSy2OpBTzL7YODA2fNFYhIQJB2LSsrCHWInAFQFyoha5i0E';
const supported = () => typeof Notification !== 'undefined';
const remember = () => { try { localStorage.setItem('drafta-notification-asked', 'true'); } catch { /* private mode */ } };
const asked = () => { try { return localStorage.getItem('drafta-notification-asked'); } catch { return true; } };

export function checkAndShowNotificationModal() {
    if (supported() && Notification.permission === 'default' && !asked()) setTimeout(() => openModal('modal-notifications'), 1200);
}

async function enableNotifications() {
    closeModal('modal-notifications');
    remember();
    if (!supported()) return showToast('Questo browser non supporta le notifiche. Su iPhone installa prima Drafta sulla Home.');
    const permission = await Notification.requestPermission().catch(() => 'denied');
    if (permission === 'granted') {
        showToast('Notifiche attive: ti avviso quando tocca a te.');
        await requestFCMToken();
    } else {
        showToast('Notifiche bloccate. Puoi riattivarle dalle impostazioni del browser.');
    }
}

export async function initializeFCM() {
    if (!messaging || !('serviceWorker' in navigator)) return;
    try {
        state.swRegistration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
        if (Notification.permission === 'granted') await requestFCMToken();
        // App open: turns and nudges of the current room already arrive from Firestore, show only the others.
        onMessage(messaging, (payload) => {
            if (payload.data?.roomId === state.currentRoomId) return;
            showToast(`${payload.notification?.title || 'Drafta'}: ${payload.notification?.body || ''}`);
        });
    } catch (err) {
        console.error('Service worker registration failed:', err);
    }
}

async function requestFCMToken() {
    if (!messaging || !state.user) return;
    try {
        const token = await getToken(messaging, { vapidKey: VAPID, serviceWorkerRegistration: state.swRegistration });
        if (token) await setDoc(doc(db, 'users', state.user.uid, 'fcmTokens', token), { token, lastUsed: serverTimestamp(), userAgent: navigator.userAgent });
    } catch (err) {
        console.error('FCM token:', err);
    }
}

// Only when Drafta is not on screen: same tag as the push, so the two collapse into one.
export function sendTurnNotification(msg) {
    if (document.hidden && supported() && Notification.permission === 'granted') {
        new Notification('Tocca a te', { body: msg, icon: 'icons/icon-192x192.png', tag: 'drafta-turn' });
    }
}

export function setupNotificationListeners() {
    document.getElementById('btn-notif-enable').addEventListener('click', enableNotifications);
    document.getElementById('btn-notif-later').addEventListener('click', () => { remember(); closeModal('modal-notifications'); });
}
