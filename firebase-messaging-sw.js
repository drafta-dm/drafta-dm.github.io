// Push notifications while Drafta is closed or in the background. Must stay at the site root.
importScripts('https://www.gstatic.com/firebasejs/11.2.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.2.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyDyQyC2Fx-3Lv0zkBV3gjKcO5u0tjI1ZAA",
    authDomain: "drafta-dm.firebaseapp.com",
    projectId: "drafta-dm",
    storageBucket: "drafta-dm.firebasestorage.app",
    messagingSenderId: "1002743148971",
    appId: "1:1002743148971:web:aebcde08ff75e9c48522ee",
});

// The message carries a notification block, so the browser shows it by itself; here only the data-only case.
firebase.messaging().onBackgroundMessage((payload) => {
    if (payload.notification) return;
    const type = payload.data?.type === 'nudge_notification' ? 'nudge' : 'turn';
    return self.registration.showNotification('Drafta', {
        body: payload.data?.body || 'Tocca a te.',
        icon: '/icons/icon-192x192.png',
        tag: `drafta-${type}`,
        data: payload.data,
    });
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        const open = list.find((c) => new URL(c.url).origin === self.location.origin && 'focus' in c);
        return open ? open.focus() : clients.openWindow('/');
    }));
});
