// Google sign-in, sign-out, and what happens when the user changes.

import { auth, googleProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from './firebase-modules.js';
import { state } from './state.js';
import { showToast, switchView, openModal, closeModal, copyText } from './utils.js';
import { verifyAppVersion } from './version-check.js';
import { initializeFCM, checkAndShowNotificationModal } from './notifications.js';
import { loadRecentRooms, stopRecentRooms, leaveRoom, joinRoom } from './room-manager.js';

const AVATAR = 'icons/avatar.svg';
const BLOCKED = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'];

export function initAuth() {
    getRedirectResult(auth).catch((error) => showToast('Accesso non riuscito: ' + error.message));

    onAuthStateChanged(auth, (user) => {
        if (!user) {
            leaveRoom();
            stopRecentRooms();
            state.user = null;
            switchView('login');
            return;
        }
        verifyAppVersion();
        state.user = user;
        updateUserInfo(user);
        switchView('dashboard');
        loadRecentRooms(user.uid);
        initializeFCM();
        checkAndShowNotificationModal();

        // invite link: ?room=ABC123&pass=XY34 joins straight away
        const params = new URLSearchParams(location.search);
        if (params.get('room')) {
            document.getElementById('input-room-id').value = params.get('room').toUpperCase();
            document.getElementById('input-room-pass').value = params.get('pass') || '';
            history.replaceState({}, document.title, location.pathname);
            joinRoom();
        }
    });
}

export function updateUserInfo(user) {
    document.getElementById('user-name').textContent = user.displayName || user.email;
    for (const id of ['user-avatar', 'header-user-avatar']) {
        const img = document.getElementById(id);
        img.src = user.photoURL || AVATAR;
        img.onerror = () => { img.onerror = null; img.src = AVATAR; };
    }
}

export function setupAuthListeners() {
    document.getElementById('btn-login-google').addEventListener('click', () => {
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isSafari = /Apple/.test(navigator.vendor) && !/CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram/i.test(ua);
        // Google sign-in fails inside iOS browsers that are not Safari: explain instead of failing.
        if (isIOS && !isSafari) return openModal('modal-auth-instructions');

        signInWithPopup(auth, googleProvider).catch((error) => {
            if (!BLOCKED.includes(error.code)) return showToast('Accesso non riuscito: ' + error.message);
            if (isIOS) return openModal('modal-auth-instructions');
            signInWithRedirect(auth, googleProvider).catch((e) => showToast('Accesso non riuscito: ' + e.message));
        });
    });

    document.getElementById('btn-copy-app-link').addEventListener('click', () => copyText(location.href, 'Link copiato: incollalo in Safari.'));

    const logout = () => { closeModal('modal-profile'); signOut(auth); };
    document.getElementById('btn-logout').addEventListener('click', logout);
    document.getElementById('btn-profile-logout').addEventListener('click', logout);

    const openProfile = () => {
        if (!state.user) return;
        const u = state.user;
        const img = document.getElementById('profile-modal-avatar');
        img.src = u.photoURL || AVATAR;
        img.onerror = () => { img.onerror = null; img.src = AVATAR; };
        document.getElementById('profile-modal-name').textContent = u.displayName || 'Utente';
        document.getElementById('profile-modal-email').textContent = u.email || '';
        const inRoom = !!state.currentRoomId;
        document.getElementById('profile-room-actions').classList.toggle('hidden', !inRoom);
        document.getElementById('profile-room-credentials').classList.toggle('hidden', !inRoom);
        openModal('modal-profile');
    };
    document.getElementById('user-chip').addEventListener('click', openProfile);
    document.getElementById('header-user-btn').addEventListener('click', openProfile);
}
