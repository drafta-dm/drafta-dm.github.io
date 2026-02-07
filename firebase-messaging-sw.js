// Firebase Cloud Messaging Service Worker
// This file MUST be in the root directory (same level as index.html)

// Import Firebase scripts for Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase configuration (same as in firebase-modules.js)
const firebaseConfig = {
    apiKey: "AIzaSyDyQyC2Fx-3Lv0zkBV3gjKcO5u0tjI1ZAA",
    authDomain: "drafta-dm.firebaseapp.com",
    projectId: "drafta-dm",
    storageBucket: "drafta-dm.firebasestorage.app",
    messagingSenderId: "1002743148971",
    appId: "1:1002743148971:web:aebcde08ff75e9c48522ee",
    measurementId: "G-HF2B9CEQ4T"
};

// Initialize Firebase in Service Worker
firebase.initializeApp(firebaseConfig);

// Get Firebase Messaging instance
const messaging = firebase.messaging();

// Handle background messages (when browser is closed or tab is not active)
messaging.onBackgroundMessage((payload) => {
    console.log('[Service Worker] Received background message:', payload);

    const notificationTitle = payload.notification?.title || 'Drafta';
    const notificationOptions = {
        body: payload.notification?.body || 'È il tuo turno!',
        icon: '/games/drafta/icons/icon-192x192.png',
        badge: '/games/drafta/icons/icon-192x192.png',
        tag: 'drafta-notification',
        requireInteraction: true, // Keeps notification visible until user interacts
        data: payload.data
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification clicked:', event.notification);

    event.notification.close();

    // Open or focus the Drafta app
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Check if app is already open
                for (const client of clientList) {
                    if (client.url.includes('drafta') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // If not open, open new window
                if (clients.openWindow) {
                    return clients.openWindow('/games/drafta/');
                }
            })
    );
});
