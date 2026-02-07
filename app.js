import { auth, db, googleProvider, signInWithPopup, onAuthStateChanged, signOut, doc, setDoc, getDoc, onSnapshot, updateDoc, deleteDoc, arrayUnion, serverTimestamp, query, collection, where, messaging, getToken, onMessage } from './firebase-modules.js';
import { playerService } from './player-service.js';

// --- STATE ---
const state = {
    user: null,
    currentRoomId: null,
    isHost: false,
    roomData: null,
    players: [], // Loaded via service
    draftHistory: []
};

// --- DOM ELEMENTS ---
const views = {
    login: document.getElementById('view-login'),
    dashboard: document.getElementById('view-dashboard'),
    lobby: document.getElementById('view-lobby'),
    draft: document.getElementById('view-draft')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    setupEventListeners();
    setupFilters();
    state.players = playerService.getPlayers(); // Load defaults initially
});

function switchView(viewName) {
    Object.values(views).forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden');
    });
    const target = views[viewName];
    target.classList.remove('hidden');
    // Force reflow for transition
    void target.offsetWidth;
    target.classList.add('active');
}

// --- AUTHENTICATION ---
function initAuth() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // CHECK VERSION
            verifyAppVersion();

            state.user = user;
            updateUserInfo(user);
            updateUserInfo(user);
            switchView('dashboard');
            loadRecentRooms(user.uid);
            showToast(`Benvenuto, ${user.displayName}!`);

            // Initialize FCM (Service Worker + token registration)
            initializeFCM();

            // Show notification permission modal on first login
            checkAndShowNotificationModal();
        } else {
            state.user = null;
            switchView('login');
        }
    });
}

function updateUserInfo(user) {
    document.getElementById('user-name').textContent = user.displayName;
    document.getElementById('user-avatar').src = user.photoURL;
}

// --- NOTIFICATION PERMISSION ---
function checkAndShowNotificationModal() {
    // Check if notifications are supported
    if (typeof Notification === 'undefined') return;

    // Check if we've already asked (use localStorage)
    const hasAsked = localStorage.getItem('drafta-notification-asked');

    // Only show if permission is default and we haven't asked before
    if (Notification.permission === 'default' && !hasAsked) {
        // Small delay to let dashboard load first
        setTimeout(() => {
            document.getElementById('modal-notifications').classList.remove('hidden');
        }, 1000);
    }
}

function enableNotifications() {
    if (typeof Notification === 'undefined') {
        showToast('Notifiche non supportate su questo browser');
        return;
    }

    Notification.requestPermission().then(async permission => {
        localStorage.setItem('drafta-notification-asked', 'true');
        document.getElementById('modal-notifications').classList.add('hidden');

        if (permission === 'granted') {
            showToast('✅ Notifiche abilitate!');

            // Request FCM token
            await requestFCMToken();

            // Send test notification
            try {
                new Notification('Drafta', {
                    body: 'Notifiche abilitate correttamente! 🎉',
                    icon: 'icons/icon-192x192.png'
                });
            } catch (e) {
                console.log('Test notification failed:', e);
            }
        } else if (permission === 'denied') {
            showToast('Notifiche bloccate. Puoi abilitarle dalle impostazioni del browser.');
        }
    }).catch(err => {
        console.error('Notification error:', err);
        showToast('Errore richiesta notifiche');
        localStorage.setItem('drafta-notification-asked', 'true');
        document.getElementById('modal-notifications').classList.add('hidden');
    });
}

function closeNotificationModal() {
    localStorage.setItem('drafta-notification-asked', 'true');
    document.getElementById('modal-notifications').classList.add('hidden');
    showToast('Puoi abilitare le notifiche in seguito dalle impostazioni del browser');
}

// --- VERSION CHECK ---
async function verifyAppVersion() {
    try {
        const response = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        const serverVersion = data.version;
        const localVersion = localStorage.getItem('drafta_version');

        if (serverVersion && serverVersion !== localVersion) {
            console.log(`New version found: ${serverVersion} (Local: ${localVersion})`);
            // Update stored version
            localStorage.setItem('drafta_version', serverVersion);

            // Unregister Service Workers to force update
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
            }

            // Force Reload if it's a major change (or just user feedback)
            showToast(`🚀 Aggiornamento a v${serverVersion} in corso...`);
            setTimeout(() => {
                window.location.reload(true);
            }, 1500);
        }
    } catch (e) {
        console.error("Version check failed", e);
    }
}

// --- FIREBASE CLOUD MESSAGING ---
async function initializeFCM() {
    if (!messaging) {
        console.log('FCM not supported on this browser');
        return;
    }

    // Register Service Worker
    try {
        // Dynamic path: works locally and on GitHub Pages
        const swPath = window.location.pathname.includes('/games/drafta/')
            ? '/games/drafta/firebase-messaging-sw.js'
            : './firebase-messaging-sw.js';

        const registration = await navigator.serviceWorker.register(swPath);
        console.log('Service Worker registered:', registration);

        // Store registration for later use
        state.swRegistration = registration;

        // Request FCM token after notification permission is granted
        if (Notification.permission === 'granted') {
            await requestFCMToken();
        }

        // Handle foreground messages (when app is open)
        onMessage(messaging, (payload) => {
            console.log('Foreground message received:', payload);

            const notificationTitle = payload.notification?.title || 'Drafta';
            const notificationBody = payload.notification?.body || 'Nuova notifica';

            // Show toast
            showToast(`${notificationTitle}: ${notificationBody}`);

            // Also show browser notification
            if (Notification.permission === 'granted') {
                new Notification(notificationTitle, {
                    body: notificationBody,
                    icon: 'icons/icon-192x192.png',
                    requireInteraction: true
                });
            }
        });

    } catch (err) {
        console.error('Service Worker registration failed:', err);
    }
}

async function requestFCMToken() {
    if (!messaging) return;

    try {
        const currentToken = await getToken(messaging, {
            vapidKey: 'BBP4-oexEv80hhemDsV2cq6SoOdelDUh0I3fI-hbiSy2OpBTzL7YODA2fNFYhIQJB2LSsrCHWInAFQFyoha5i0E',
            serviceWorkerRegistration: state.swRegistration // Use our registration!
        });

        if (currentToken) {
            console.log('FCM Token obtained:', currentToken);
            // Save token to Firestore
            await saveFCMToken(currentToken);
        } else {
            console.log('No FCM registration token available');
        }
    } catch (err) {
        console.error('Error getting FCM token:', err);
    }
}

async function saveFCMToken(token) {
    if (!state.user) return;

    try {
        // Save to user's fcmTokens subcollection
        const tokenRef = doc(db, `users/${state.user.uid}/fcmTokens/${token}`);
        await setDoc(tokenRef, {
            token: token,
            createdAt: serverTimestamp(),
            lastUsed: serverTimestamp(),
            userAgent: navigator.userAgent
        });
        console.log('FCM token saved to Firestore');
    } catch (err) {
        console.error('Error saving FCM token:', err);
    }
}

function setupEventListeners() {
    // Auth
    document.getElementById('btn-login-google').addEventListener('click', async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error(error);
            showToast('Errore Login: ' + error.message);
        }
    });

    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

    // Dashboard
    document.getElementById('btn-create-room').addEventListener('click', createRoom);
    document.getElementById('btn-join-room').addEventListener('click', () => {
        // Request Notifications on User Click
        if (Notification && Notification.permission === 'default') {
            Notification.requestPermission().catch(err => console.log(err));
        }
        joinRoom();
    });

    // Lobby
    document.getElementById('btn-leave-lobby').addEventListener('click', leaveRoom);
    document.getElementById('btn-start-draft').addEventListener('click', startDraft);

    // Draft
    document.getElementById('btn-confirm-pick').addEventListener('click', confirmPick);
    document.getElementById('btn-clear-pick').addEventListener('click', async () => {
        // Clear current pick
        if (!state.currentRoomId) return;
        await updateDoc(doc(db, 'rooms', state.currentRoomId), { currentPick: null });
        showToast("Selezione annullata");
    });
    document.getElementById('btn-export-csv').addEventListener('click', exportTeamsToCSV);

    // Notification Modal Buttons
    document.getElementById('btn-notif-enable').addEventListener('click', enableNotifications);
    document.getElementById('btn-notif-later').addEventListener('click', closeNotificationModal);



    // Modal Enter Button Logic
    document.getElementById('btn-modal-enter').addEventListener('click', () => {
        try {
            const roomId = document.getElementById('modal-room-id').innerText.trim();
            const password = document.getElementById('modal-room-pass').innerText.trim();

            showToast("Ingresso in corso..."); // Feedback

            // Request Notifications on User Click (Required for iOS)
            // Wrapped in try-catch to ensure it doesn't block the main action if it fails
            try {
                if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                    Notification.requestPermission().catch(err => console.log('Notification permission error:', err));
                }
            } catch (notifyErr) {
                console.warn('Notification API not supported or failed:', notifyErr);
            }

            // Enter room immediately (synchronous to click for best mobile support)
            enterRoom(roomId, true, password);
            document.getElementById('modal-room-created').classList.add('hidden');

        } catch (e) {
            console.error(e);
            showToast("Errore pulsante: " + e.message);
        }
    });

    // Team Manager Save
    document.getElementById('btn-tm-save').addEventListener('click', saveTeamManager);

    // Random Order Btn
    document.getElementById('btn-rnd-order')?.addEventListener('click', async () => {
        if (!state.isHost) return;
        if (!confirm("Mischiare ordine (solo Round 1)?")) return;

        let order = [...state.roomData.draftOrder];
        // Shuffle
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        await updateDoc(doc(db, 'rooms', state.currentRoomId), { draftOrder: order });
    });
}

// --- ROOM LOGIC ---
async function createRoom() {
    const roomId = generateRoomId();
    const password = Math.random().toString(36).slice(-4).toUpperCase();
    // customUrl removed - not needed anymore
    const teamCount = parseInt(document.getElementById('input-team-count').value);
    const blockGK = document.getElementById('input-block-gk').checked;
    const strictRoles = document.getElementById('input-strict-roles').checked;

    // Create Empty Teams
    const teams = [];
    for (let i = 0; i < teamCount; i++) {
        teams.push({
            id: `team-${i + 1}`,
            name: `Team ${i + 1}`,
            ownerUid: null, // Assigned later
            ownerName: null,
            credits: 500, // Or whatever default
            roster: [],
            totalValue: 0 // Track squad value for ordering
        });
    }

    // Player loading removed - always use local players.js

    const roomRef = doc(db, 'rooms', roomId);

    const roomData = {
        hostId: state.user.uid,
        password: password,
        status: 'lobby',
        participantIds: [state.user.uid],
        // Connected users list (waiting room)
        connectedUsers: [{
            uid: state.user.uid,
            name: state.user.displayName,
            photoURL: state.user.photoURL
        }],
        teams: teams,
        currentTurnIndex: 0,
        roundNumber: 1,
        draftOrder: [], // Array of teamIds
        currentPick: null,
        settings: {
            blockGK: blockGK,
            strictRoles: strictRoles
        },
        createdAt: serverTimestamp()
    };

    try {
        await setDoc(roomRef, roomData);

        // Show Modal instead of alert/immediate join
        document.getElementById('modal-room-id').textContent = roomId;
        document.getElementById('modal-room-pass').textContent = password;
        document.getElementById('modal-room-created').classList.remove('hidden');

        // Removed auto-enter to allow user to read credentials first
        // enterRoom(roomId, true, password); 

    } catch (e) {
        console.error(e);
        showToast("Errore creazione stanza: " + e.message);
    }
}

async function joinRoom() {
    const roomId = document.getElementById('input-room-id').value.trim().toUpperCase();
    const password = document.getElementById('input-room-pass').value.trim();

    if (!roomId) return showToast("Inserisci ID stanza");

    const roomRef = doc(db, 'rooms', roomId);
    const snap = await getDoc(roomRef);

    if (!snap.exists()) return showToast("Stanza non trovata");

    const data = snap.data();
    if (data.password && data.password !== password) return showToast("Password errata");

    const isParticipant = data.participantIds && data.participantIds.includes(state.user.uid);

    if (!isParticipant) {
        // Add to connectedUsers
        const newUser = {
            uid: state.user.uid,
            name: state.user.displayName,
            photoURL: state.user.photoURL
        };
        await updateDoc(roomRef, {
            connectedUsers: arrayUnion(newUser),
            participantIds: arrayUnion(state.user.uid)
        });
    }

    enterRoom(roomId, data.hostId === state.user.uid, password);
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function leaveRoom() {
    // In a real app, remove from participants list if lobby
    state.currentRoomId = null;
    state.roomData = null;
    state.isHost = false;
    // Unsubscribe listener if stored
    if (roomUnsubscribe) { roomUnsubscribe(); roomUnsubscribe = null; }
    switchView('dashboard');
}

// --- DELETE ROOM (Host) ---
async function deleteRoom(roomId) {
    if (!confirm("Sei sicuro di voler eliminare questa stanza?")) return;
    try {
        await deleteDoc(doc(db, "rooms", roomId));
        // Remove from list handled by snapshot
    } catch (e) {
        console.error(e);
        showToast("Errore eliminazione");
    }
}

// --- REAL-TIME LISTENERS ---
let roomUnsubscribe = null;

function enterRoom(roomId, isHost, password = null) {
    state.currentRoomId = roomId;
    state.isHost = isHost;

    document.getElementById('lobby-room-id').textContent = roomId;

    // Persistent Host Info
    if (isHost && password) {
        document.getElementById('lobby-room-pass').textContent = password;
        document.getElementById('lobby-pass-display').classList.remove('hidden');
    } else {
        document.getElementById('lobby-pass-display').classList.add('hidden');
    }

    if (isHost) {
        document.getElementById('host-controls').classList.remove('hidden');
    } else {
        document.getElementById('host-controls').classList.add('hidden');
    }
    // host-bid-controls managed dynamically in updateDraftUI now
    if (roomUnsubscribe) roomUnsubscribe();

    // Add user to connectedUsers on join (using simple UID for deduplication)
    const roomRef = doc(db, 'rooms', roomId);

    // Heartbeat-based presence system (more reliable than beforeunload)
    const updatePresence = () => {
        updateDoc(roomRef, {
            connectedUsers: arrayUnion(state.user.uid),
            // Also save participant name in a map for easy lookup
            [`participantNames.${state.user.uid}`]: state.user.displayName || state.user.email,
            // Heartbeat: update lastSeen timestamp
            [`lastSeen.${state.user.uid}`]: Date.now()
        }).catch(err => {
            console.error('Presence update error:', err);
        });
    };

    // Initial presence update
    updatePresence();

    // Send heartbeat every 5 seconds
    const heartbeatInterval = setInterval(updatePresence, 5000);

    // Cleanup on disconnect (best-effort, not reliable)
    const removePresence = () => {
        clearInterval(heartbeatInterval);
        updateDoc(roomRef, {
            connectedUsers: arrayRemove(state.user.uid)
            // Note: we DON'T remove from participantNames to preserve history
        }).catch(e => console.error('Presence removal error:', e));
    };

    window.addEventListener('beforeunload', removePresence);
    window.addEventListener('pagehide', removePresence); // Better for mobile/iOS
    state.presenceCleanup = removePresence;
    state.heartbeatInterval = heartbeatInterval;

    roomUnsubscribe = onSnapshot(doc(db, "rooms", roomId), (docSnap) => {
        if (!docSnap.exists()) {
            showToast("La stanza non esiste più.");
            showDashboard();
            return;
        }
        const data = docSnap.data();

        // DEDUPLICATION: Normalize connectedUsers to UID-only array
        if (data.connectedUsers && Array.isArray(data.connectedUsers)) {
            const uniqueUids = new Set();
            data.connectedUsers.forEach(u => {
                const uid = typeof u === 'string' ? u : u.uid;
                if (uid) uniqueUids.add(uid);
            });
            data.connectedUsers = Array.from(uniqueUids);
        }

        state.roomData = data;

        state.isHost = (state.user.uid === data.hostId);

        if (state.isHost) {
            document.body.classList.add('host-view');
        } else {
            document.body.classList.remove('host-view');
        }

        // Header Info Update
        document.getElementById('txt-room-id-display').textContent = `ID: ${roomId}`;
        const passEl = document.getElementById('txt-room-pass-display');

        const btnCsv = document.getElementById('btn-export-csv');

        if (state.isHost) {
            passEl.textContent = `PSW: ${data.password}`;
            passEl.style.display = 'block';
            if (btnCsv) btnCsv.style.display = 'inline-block';
        } else {
            passEl.style.display = 'none';
            if (btnCsv) btnCsv.style.display = 'none';
        }



        const avatarEl = document.getElementById('header-user-avatar');
        avatarEl.src = state.user.photoURL || 'https://via.placeholder.com/32';

        // State & Player Sync
        syncPlayersIfNeeded(data);

        // View Routing
        renderLobbyOrDraft(data);

        // Show Modal Logic:
        // 1. Imported Room -> Order Settings Modal (Rules)
        if (state.isHost && data.status === 'started' && data.isImported && !data.orderSettingsApplied) {
            const modal = document.getElementById('modal-order-settings');
            if (modal && !state.hasShownOrderModal) {
                modal.classList.remove('hidden');
                state.hasShownOrderModal = true;
            }
        }
        // 2. Standard Room -> Random Order Modal (Randomizer) - ONLY FIRST TURN EVER
        else if (state.isHost && data.status === 'started' && !data.isImported && data.currentTurnIndex === 0 && data.roundNumber === 1) {
            const modal = document.getElementById('modal-load-order');
            if (modal) {
                if (!state.hasShownOrderModal) {
                    modal.classList.remove('hidden');
                    state.hasShownOrderModal = true;
                }
                // Update preview live (for randomizer feedback)
                if (!modal.classList.contains('hidden') && typeof renderOrderPreview === 'function') {
                    renderOrderPreview(data.draftOrder);
                }
            }
        }

        // 3. Nudge Notification Listener
        if (data.notification && data.notification.targetUid === state.user.uid) {
            // Check if this is a new notification (not already processed)
            if (!state.lastNudgeTimestamp || data.notification.timestamp > state.lastNudgeTimestamp) {
                state.lastNudgeTimestamp = data.notification.timestamp;

                // Show browser notification
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    new Notification('Sollecito Drafta', {
                        body: data.notification.msg,
                        icon: 'icons/icon-192x192.png'
                    });
                }

                // Also show toast
                showToast(`📲 ${data.notification.sender}: ${data.notification.msg}`);
            }
        }

    });

    // --- Event Listeners for Order Modal ---
    const btnGen = document.getElementById('btn-gen-random-start');
    const btnConf = document.getElementById('btn-confirm-start-order');

    if (btnGen && btnConf) {
        // Use onclick to prevent duplicate listeners on re-entry
        btnGen.onclick = async () => {
            if (!state.isHost) return;
            if (!state.roomData || !state.roomData.draftOrder) return;

            let order = [...state.roomData.draftOrder];
            // Fisher-Yates Shuffle
            for (let i = order.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [order[i], order[j]] = [order[j], order[i]];
            }
            try {
                await updateDoc(doc(db, 'rooms', state.currentRoomId), { draftOrder: order });
            } catch (e) { console.error("Error shuffling", e); }
        };

        btnConf.onclick = () => {
            document.getElementById('modal-load-order').classList.add('hidden');
        };
    }
}

// Helper for view routing
function renderLobbyOrDraft(data) {
    if (data.status === 'started' || data.status === 'drafting') {
        if (views.draft.classList.contains('hidden')) {
            switchView('draft');
            renderPlayerList(); // Initial render
        }
        updateDraftUI(data);
    } else {
        // Lobby
        if (views.lobby.classList.contains('hidden')) {
            switchView('lobby');
        }
        renderLobby(data);
    }
}

async function syncPlayersIfNeeded(roomData) {
    // If room has a custom URL and we haven't loaded it, load it.
    if (roomData.dataSourceUrl) {
        try {
            await playerService.loadFromUrl(roomData.dataSourceUrl);
            state.players = playerService.getPlayers();
            renderPlayerList(); // Refresh visuals
        } catch (e) {
            console.error("Failed to sync players", e);
            showToast("Impossibile caricare lista giocatori personalizzata");
        }
    }
}

function renderLobby(data) {
    document.getElementById('team-count-display').textContent = `(${data.teams.length})`;

    renderConnectedUsers(data);
    renderTeamsGrid(data);
}

function renderConnectedUsers(data) {
    const list = document.getElementById('lobby-connected-list');
    list.innerHTML = '';
    document.getElementById('connected-count').innerText = `(${data.connectedUsers.length})`;

    data.connectedUsers.forEach(u => {
        // Normalize: handle both old {uid, name} format and new UID string format
        const uid = typeof u === 'string' ? u : u.uid;

        // Check if assigned
        const isAssigned = data.teams.some(t => t.ownerUid === uid);

        const li = document.createElement('li');
        li.className = `user-item ${isAssigned ? 'assigned' : ''}`;
        if (!isAssigned && state.selectedUserUid === uid) li.classList.add('selected');

        // Get user display name from participantNames map
        const userDisplayName = data.participantNames?.[uid] ||
            (typeof u === 'object' && u.name) || // Fallback to old format name
            (state.user.uid === uid ? state.user.displayName : `User ${uid.substring(0, 6)}`);
        li.innerHTML = `<span>${userDisplayName}</span>`;
        if (state.isHost && !isAssigned) {
            li.addEventListener('click', () => {
                // Select user to assign
                state.selectedUserUid = uid;
                renderConnectedUsers(state.roomData); // Re-render to show selection
                // user visual feedback needs re-rendering grid to show "Place here"
                renderTeamsGrid(state.roomData);
            });
        }
        list.appendChild(li);
    });
}

function renderTeamsGrid(data) {
    const grid = document.getElementById('lobby-teams-grid');

    // FOCUS PRESERVATION LOGIC
    let focusedElementId = null;
    let focusedCursorPos = null;
    if (document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.classList.contains('team-name-edit')) {
        focusedElementId = document.activeElement.id;
        focusedCursorPos = document.activeElement.selectionStart;
    }

    grid.innerHTML = '';

    data.teams.forEach((team, index) => {
        const div = document.createElement('div');
        div.className = 'team-slot';
        if (state.selectedUserUid && !team.ownerUid) div.classList.add('active-assignment');

        // Generate a unique ID for the input to track focus
        const inputId = `team-input-${index}`;

        div.innerHTML = `
            <div>
                <h4>Slot ${index + 1}</h4>
                <input type="text" id="${inputId}" class="team-name-edit" value="${team.name}" ${state.isHost ? '' : 'disabled'}>
            </div>
            <div class="team-owner">
                ${team.ownerName ? `👤 ${team.ownerName}` : '<i>Non assegnato</i>'}
            </div>
        `;

        // Host interactions
        if (state.isHost) {
            const input = div.querySelector('input');

            // Restore focus if this was the focused element
            if (focusedElementId === inputId) {
                // We need to wait for append to happen, but since we are appending synchronously in loop/end, 
                // we can just set a small timeout or do it after append.
                // Doing it here immediately affects the element, but it must be in DOM.
                // We'll restore it at the end of loop or immediately after append.
            }

            input.addEventListener('change', (e) => {
                updateTeamName(index, e.target.value);
            });
            // Also handle 'input' or 'blur' if we want real-time, but 'change' is safer for DB writes.
            // Using 'blur' to trigger update is standard for 'change'.

            div.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT') return; // Don't trigger on input click
                if (state.selectedUserUid && !team.ownerUid) {
                    assignUserToTeam(index, state.selectedUserUid);
                }
            });
        }

        grid.appendChild(div);
    });

    // Restore Focus
    if (focusedElementId) {
        const el = document.getElementById(focusedElementId);
        if (el) {
            el.focus();
            // Restore cursor position if possible
            if (typeof focusedCursorPos === 'number') {
                el.setSelectionRange(focusedCursorPos, focusedCursorPos);
            }
        }
    }
}

async function updateTeamName(index, newName) {
    const roomRef = doc(db, 'rooms', state.currentRoomId);
    const newTeams = [...state.roomData.teams];
    newTeams[index].name = newName;
    await updateDoc(roomRef, { teams: newTeams });
}

async function assignUserToTeam(teamIndex, userUid) {
    // We no longer have a 'connectedUsers' object with name, so we need to get it from state.user
    // For now, let's assume the user is the current user or we fetch from participantIds if needed.
    const userName = state.roomData.participantNames?.[userUid] || (state.user.uid === userUid ? state.user.displayName : `User ${userUid.substring(0, 4)}`); // Fallback

    const roomRef = doc(db, 'rooms', state.currentRoomId);
    const newTeams = [...state.roomData.teams];
    newTeams[teamIndex].ownerUid = userUid;
    newTeams[teamIndex].ownerName = userName; // Use the determined name

    await updateDoc(roomRef, { teams: newTeams });
    state.selectedUserUid = null; // Reset selection
}

// --- DRAFT LOGIC ---
async function startDraft() {
    if (!state.isHost) return;

    // Reset hasShownOrderModal flag for this session if needed, or just set it false to trigger
    state.hasShownOrderModal = false;

    // Create Initial Draft Order (Snake or Standard)
    // Default: 1 -> N
    const teamIds = state.roomData.teams.map(t => t.id);

    await updateDoc(doc(db, "rooms", state.currentRoomId), {
        status: "started",
        draftOrder: teamIds,
        currentTurnIndex: 0,
        roundNumber: 1
    });

    // Modal will be triggered by onSnapshot
}

function renderOrderPreview(order) {
    const list = document.getElementById('order-preview-list');
    list.innerHTML = '';
    order.forEach((tid, i) => {
        const team = state.roomData.teams.find(t => t.id === tid);
        const div = document.createElement('div');
        div.textContent = `${i + 1}. ${team ? team.name : tid}`;
        div.style.padding = "4px";
        div.style.borderBottom = "1px solid #333";
        list.appendChild(div);
    });
}




function updateDraftUI(data) {
    if (!data.draftOrder || data.draftOrder.length === 0) return;

    // 1. UPDATE TURN UI (Merged into Matrix now)
    // renderTurnStrip(data); // Removed

    // 2. UPDATE TURN INDICATOR
    const currentTeamId = data.draftOrder[data.currentTurnIndex];
    const currentTeam = data.teams.find(t => t.id === currentTeamId);

    // Update Header
    document.getElementById('txt-round').textContent = `Round ${data.roundNumber}`;
    const turnEl = document.getElementById('txt-current-turn-team');

    if (currentTeam) {
        // Validation: Is it my turn?
        // Note: Host is technically always able to pick, but "Tocca a te" usually implies ownership.

        if (state.user.uid === currentTeam.ownerUid) {
            turnEl.textContent = "Tocca a TE! 🫵";
            turnEl.style.color = "var(--primary)";
            turnEl.style.textShadow = "0 0 10px rgba(0,255,194,0.5)";

            // Notify if turn changed to me
            if (state.lastTurnOwner !== state.user.uid) {
                sendTurnNotification("È il tuo turno! Fai la tua scelta.");
            }
            // Controls visibility handled by updateStage now based on active pick
        } else {
            turnEl.textContent = currentTeam.name;
            turnEl.style.color = "white";
            turnEl.style.textShadow = "none";
        }
        state.lastTurnOwner = currentTeam.ownerUid; // Track for edge detection

    } else {
        turnEl.textContent = 'Fine Asta';
        // Hide controls handled by updateStage
    }


    // 3. ACTIVE PICK
    if (data.currentPick) {
        const player = state.players.find(p => p.id === data.currentPick.playerId);
        updateStage(player);
    } else {
        updateStage(null);
    }

    // 3. RENDER TEAMS MATRIX
    renderTeamsMatrix(data);

    // 4. AVAILABLE PLAYERS
    const takenIds = new Set();
    data.teams.forEach(t => t.roster.forEach(r => takenIds.add(String(r.playerId))));

    // Calculate Hidden Roles for Current Team
    const hiddenRoles = [];
    if (currentTeam) {
        const roles = { P: 0, D: 0, C: 0, A: 0 };
        // Count roles (re-using logic from confirmPick approx)
        currentTeam.roster.forEach(r => {
            // Find player in global state
            const p = state.players.find(pl => String(pl.id) === String(r.playerId));
            if (p) roles[p.role]++;
        });

        const maxRoles = { P: 3, D: 8, C: 8, A: 6 };
        if (roles.P >= maxRoles.P) hiddenRoles.push('P');
        if (roles.D >= maxRoles.D) hiddenRoles.push('D');
        if (roles.C >= maxRoles.C) hiddenRoles.push('C');
        if (roles.A >= maxRoles.A) hiddenRoles.push('A');
    } else {
        // No current team -> Draft Finished?
        hiddenRoles.push('P', 'D', 'C', 'A');
    }

    updatePlayerListVisuals(takenIds, hiddenRoles);
}

// Turn strip removed


function renderTeamsMatrix(data) {
    const container = document.getElementById('teams-matrix');
    container.innerHTML = '';

    // Advanced Logic: Rotating Queue
    // We want the Current Turn Team at Index 0.
    // The list should show the SEQUENCE of upcoming picks.
    // data.draftOrder is the list of team IDs for this round.

    // Safety check
    if (!data.draftOrder || data.draftOrder.length === 0) return;

    // Ordered list of IDs starting from current
    const displayIds = [];
    const len = data.draftOrder.length;

    // Loop through ALL teams (to show everyone), but start order from current turn.
    // Note: draft logic might span multiple rounds? 
    // Usually standard snake draft: 1..N, N..1.
    // For now, let's just show the current round's order rotated.

    for (let i = 0; i < len; i++) {
        // Relative index in the draftOrder array
        const relativeIdx = (data.currentTurnIndex + i) % len;
        displayIds.push(data.draftOrder[relativeIdx]);
    }

    displayIds.forEach((teamId, i) => {
        const team = data.teams.find(t => t.id === teamId);
        if (!team) return;

        const isActive = (i === 0);
        const col = document.createElement('div');
        col.className = `matrix-column ${isActive ? 'active-turn' : ''}`;
        col.style.borderTopColor = getTeamColor(team.id);



        // Calculate needs
        const roles = { P: 0, D: 0, C: 0, A: 0 };
        team.roster.forEach(r => {
            const p = state.players.find(pl => pl.id === r.playerId);
            if (p) roles[p.role]++;
        });

        // Check Online Status - using heartbeat system
        let isOnline = false;
        if (data.connectedUsers && Array.isArray(data.connectedUsers) && team.ownerUid) {
            // User is online if in connectedUsers AND lastSeen within 15 seconds
            const inArray = data.connectedUsers.includes(team.ownerUid);
            const lastSeenTime = data.lastSeen?.[team.ownerUid];
            const isRecent = lastSeenTime && (Date.now() - lastSeenTime) < 15000; // 15 seconds threshold
            isOnline = inArray && isRecent;
        }

        const activeMarker = isActive ? '<span style="color:#ffcc00; margin-right:5px">▶</span>' : ''; // Arrow for current turn

        // Status Dot
        let statusDot = '';
        if (team.ownerUid) {
            if (isOnline) {
                statusDot = `<span title="Online" style="color:#00ff00; cursor:default; margin-right:5px">●</span>`;
            } else {
                // Offline -> Click to Nudge
                statusDot = `<span title="Offline - Clicca per sollecitare" 
                                   style="color:#ff4444; cursor:pointer; margin-right:5px"
                                   onclick="event.stopPropagation(); window.sendNudge('${team.ownerUid}', '${team.name}')">●</span>`;
            }
        }

        col.innerHTML = `
            <div class="matrix-header" onclick="${state.isHost ? `window.assignTeam('${team.id}')` : ''}">
                <div style="display:flex; align-items:center;">
                    ${activeMarker}
                    ${statusDot}
                    <h4 style="margin:0; font-size:1rem;">${team.name}</h4>
                </div>
                <div class="matrix-meta" style="color:white; margin-top:2px;">
                     <span style="color:var(--accent)">${team.ownerName || 'No Owner'}</span>
                </div>
                <div class="matrix-meta">
                     <span title="Valore Rosa Totale">💎 ${team.totalValue || 0}</span>
                     <span>👥 ${team.roster.length}/25</span>
                </div>
            </div>
            <ul class="matrix-roster">
                ${renderMatrixRosterFixed(team.roster)}
            </ul>
            <div class="matrix-footer">
                <span class="need-count ${roles.P >= 3 ? 'done' : ''}" style="${roles.P < 3 ? 'color:#ff4444; font-weight:bold' : ''}">P:${3 - roles.P}</span>
                <span class="need-count ${roles.D >= 8 ? 'done' : ''}" style="${roles.D < 8 ? 'color:#ff4444; font-weight:bold' : ''}">D:${8 - roles.D}</span>
                <span class="need-count ${roles.C >= 8 ? 'done' : ''}" style="${roles.C < 8 ? 'color:#ff4444; font-weight:bold' : ''}">C:${8 - roles.C}</span>
                <span class="need-count ${roles.A >= 6 ? 'done' : ''}" style="${roles.A < 6 ? 'color:#ff4444; font-weight:bold' : ''}">A:${6 - roles.A}</span>
            </div>
        `;
        container.appendChild(col);
    });
}

function renderMatrixRosterFixed(roster) {
    // 1. Prepare Fixed Slots
    // P: 3, D: 8, C: 8, A: 6 => Total 25
    const slots = Array(25).fill(null);

    // Limits
    const limits = { P: { start: 0, count: 3 }, D: { start: 3, count: 8 }, C: { start: 11, count: 8 }, A: { start: 19, count: 6 } };

    // Fillers to track next available index per role
    const pointers = { P: 0, D: 0, C: 0, A: 0 };

    roster.forEach(item => {
        const p = state.players.find(x => x.id === item.playerId);
        if (!p) return;

        const role = p.role;
        const limit = limits[role];

        if (limit && pointers[role] < limit.count) {
            const slotIndex = limit.start + pointers[role];
            slots[slotIndex] = { ...item, ...p }; // Merged info
            pointers[role]++;
        } else {
            // Overflow? Should not happen if game rules enforced, but append if necessary?
            // For now, ignore or log
            console.warn("Roster overflow for role " + role);
        }
    });

    // Render Slots
    return slots.map((slot, i) => {
        if (slot) {
            return `
                <li class="roster-item role-${slot.role}">
                    <span class="roster-name">${slot.name}</span>
                    <span class="roster-cost">${slot.cost}</span>
                </li>
             `;
        } else {
            // Determine what role this empty slot belongs to for visual hint
            let type = "";
            if (i < 3) type = "P";
            else if (i < 11) type = "D";
            else if (i < 19) type = "C";
            else type = "A";

            return `
                <li class="roster-item empty">
                    <span class="roster-role-hint">${type}</span>
                    <span class="roster-dots">...</span>
                </li>
             `;
        }
    }).join('');
}

function getTeamColor(id) {
    // Simple hash for color strip
    // or just var(--primary)
    return 'var(--bg-surface)';
}

function updateStage(player) {
    const card = document.getElementById('active-player-card');
    const nameEl = document.getElementById('active-player-name');
    const teamEl = document.getElementById('active-player-team');
    const roleEl = document.getElementById('active-player-role');
    const fvmEl = document.getElementById('active-player-fvm');

    if (player) {
        nameEl.textContent = player.name;
        teamEl.textContent = player.team;
        roleEl.textContent = player.role;
        roleEl.className = `role-badge large role-${player.role}`;
        fvmEl.textContent = `FVM: ${player.cost}`;

        card.style.opacity = 1;

        const imgEl = document.getElementById('active-player-img');
        if (imgEl) {
            imgEl.src = `https://content.fantacalcio.it/web/campioncini/20/card/${player.id}.png`;
            imgEl.classList.remove('hidden');

            // Show/Hide Host Controls
            const hBadge = document.getElementById('host-badge');
            if (hBadge) hBadge.style.display = state.isHost ? 'inline-block' : 'none';

            // Draft Order and CSV Export (Host Only)
            const btnOrder = document.getElementById('btn-draft-order');
            const btnCsv = document.getElementById('btn-export-csv');

            if (btnOrder) btnOrder.style.display = state.isHost ? 'inline-flex' : 'none';
            if (btnCsv) btnCsv.style.display = state.isHost ? 'inline-flex' : 'none';

            // Password Reveal (Host only)
            const passEl = document.getElementById('txt-room-pass-display');
            if (passEl) passEl.style.display = state.isHost ? 'inline-block' : 'none';
        }

        // Pick Controls Visibility: Host always, or user when it's their turn
        const controls = document.getElementById('host-bid-controls');
        if (controls) {
            // Check if it's the current user's turn
            let canPick = state.isHost; // Host can always pick

            if (!canPick && state.roomData && state.roomData.draftOrder) {
                const currentTeamId = state.roomData.draftOrder[state.roomData.currentTurnIndex];
                const currentTeam = state.roomData.teams.find(t => t.id === currentTeamId);
                if (currentTeam && currentTeam.ownerUid === state.user.uid) {
                    canPick = true; // It's the user's turn
                }
            }

            controls.style.display = canPick ? 'flex' : 'none';
        }

    } else {
        nameEl.textContent = "Seleziona Giocatore";
        teamEl.textContent = "-";
        roleEl.textContent = "?";
        roleEl.className = `role-badge large`;
        fvmEl.textContent = "FVM: -";
        card.style.opacity = 0.5;
        const imgEl = document.getElementById('active-player-img');
        if (imgEl) {
            imgEl.src = 'icons/0000.png';
            imgEl.classList.remove('hidden');
        }

        // Hide controls if no player selected
        const controls = document.getElementById('host-bid-controls');
        if (controls) controls.style.display = 'none';
    }
}

// HOST: Select player to auction
// Select player to auction (Host or Current Turn Owner)
function selectPlayerForAuction(playerId) {
    // Permission Check
    let canSelect = state.isHost;
    if (!canSelect && state.roomData && state.roomData.draftOrder) {
        const currentTeamId = state.roomData.draftOrder[state.roomData.currentTurnIndex];
        const currentTeam = state.roomData.teams.find(t => t.id === currentTeamId);
        if (currentTeam && currentTeam.ownerUid === state.user.uid) {
            canSelect = true;
        }
    }

    if (!canSelect) {
        // Optional: Select locally only? For now block to avoid confusion.
        return showToast("Non è il tuo turno per selezionare!");
    }

    // Host/Owner clicks a player from list -> Sets it as "Current active card"
    const roomRef = doc(db, 'rooms', state.currentRoomId);
    updateDoc(roomRef, {
        currentPick: { playerId: playerId }
    });
}

// HOST: Confirm assignment
async function confirmPick() {
    // 1. Permissions Check
    const room = state.roomData;
    if (!room.currentPick) return showToast("Nessun giocatore selezionato");

    const currentTeamId = state.roomData.draftOrder[state.roomData.currentTurnIndex];
    if (!currentTeamId) return showToast("Draft terminato");

    const currentTeam = state.roomData.teams.find(t => t.id === currentTeamId);

    // Permission Check
    if (!state.isHost && state.user.uid !== currentTeam.ownerUid) {
        return showToast(`Non è il tuo turno! Tocca a: ${currentTeam ? currentTeam.name : 'Altra Squadra'}`);
    }

    const teamIndex = state.roomData.teams.findIndex(t => t.id === currentTeamId);
    const team = state.roomData.teams[teamIndex];

    const playerId = room.currentPick.playerId;
    const player = state.players.find(p => p.id === playerId);
    const cost = player.cost;

    // 2. Validation: Credits
    if (team.credits < cost && !state.isHost) return showToast("Crediti insufficienti!");

    // 3. Validation: Strict Role Order (P -> D -> C -> A)
    // Count current roles
    const roles = { P: 0, D: 0, C: 0, A: 0 };
    team.roster.forEach(r => {
        const pState = state.players.find(pl => pl.id === r.playerId);
        // Handle imported players or data mismatch
        if (pState) roles[pState.role]++;
    });

    const targetRole = player.role;

    // Strict Role Order Implementation (Host CANNOT bypass if enabled)
    if (state.roomData.settings?.strictRoles) {
        if (targetRole === 'D' && roles.P < 3) return showBigError("Devi completare i portieri prima!");
        if (targetRole === 'C' && (roles.P < 3 || roles.D < 8)) return showBigError("Devi completare P e D prima!");
        if (targetRole === 'A' && (roles.P < 3 || roles.D < 8 || roles.C < 8)) return showBigError("Devi completare P, D e C prima!");
    }

    // Also, don't allow picking if roles full (Host CANNOT bypass max slots to prevent errors)
    const maxRoles = { P: 3, D: 8, C: 8, A: 6 };
    if (roles[targetRole] >= maxRoles[targetRole]) return showBigError(`Slot ${targetRole} completi!`);


    // Update Logic
    const roomRef = doc(db, 'rooms', state.currentRoomId);
    // DEEP COPY to prevent reference issues/data loss
    const newTeams = JSON.parse(JSON.stringify(room.teams));
    const pickedItems = [{ playerId, cost }];

    // 4. Automatic GK Block Logic
    const useBlockGK = state.roomData.settings?.blockGK;
    if (targetRole === 'P' && useBlockGK && roles.P === 0) {
        // If first GK, try to find 2nd and 3rd of same team
        const teamMates = state.players.filter(p => p.team === player.team && p.role === 'P' && p.id !== player.id);

        // Add them if afford + space
        // We know space is open (roles.P is 0).
        // Check cost.
        let extraCost = 0;
        teamMates.forEach(m => extraCost += m.cost);

        if (team.credits >= (cost + extraCost)) {
            teamMates.forEach(m => pickedItems.push({ playerId: m.id, cost: m.cost }));
            showToast(`Blocco portieri ${player.team} assegnato!`);
        } else {
            showToast("Crediti insufficienti per blocco portieri completo.");
            // Proceed with just one? Or fail? Usually fail if block is enforced. 
            // Let's just pick the one for safety or ask user? 
            // For now, simple implementation: Pick just one if can't afford all.
        }
    }

    // Apply Picks
    let totalCost = 0;
    pickedItems.forEach(item => {
        newTeams[teamIndex].roster.push(item);
        totalCost += item.cost;
    });
    newTeams[teamIndex].credits -= totalCost;
    newTeams[teamIndex].totalValue = (newTeams[teamIndex].totalValue || 0) + totalCost;


    // Calc next turn
    let nextTurnIndex = room.currentTurnIndex + 1;
    let nextDraftOrder = [...room.draftOrder];
    let nextRound = room.roundNumber;

    const sortMode = state.roomData.settings?.sortMode;

    if (sortMode) {
        // --- DYNAMIC SORTING MODE ---
        // Recalculate order based on new state
        nextDraftOrder = calculateDynamicOrder(newTeams, sortMode);
        // Reset to 0 because the first in array is always the priority
        nextTurnIndex = 0;
        // We don't increment round number typically here as it's a continuous flow, 
        // or we could increment it if everyone has picked at least once? 
        // For simplicity in dynamic mode, Round Number is less relevant for logic, 
        // but we can increment it if the 'Leader' changes or just leave it. 
        // Let's leave it as is for now.
    } else {
        // --- STANDARD MODE ---
        if (nextTurnIndex >= room.draftOrder.length) {
            nextRound++;
            // Sort lowest value first for next round logic (Snake Variant?)
            // Updated to use Smart Logic (Value + High Card Tie-Breaker)
            const sortedTeams = [...newTeams].sort(compareTeamsSmart);
            nextDraftOrder = sortedTeams.map(t => t.id);
            nextTurnIndex = 0;
        }
    }

    await updateDoc(roomRef, {
        teams: newTeams,
        currentTurnIndex: nextTurnIndex,
        roundNumber: nextRound,
        draftOrder: nextDraftOrder,
        currentPick: null
    });

    showToast(`Assegnato ${player.name} (+${pickedItems.length - 1}) a ${team.name}`);
}

// ADMIN TOOLS
// Global access for onclick in HTML
window.assignTeam = function (teamId) {
    if (!state.isHost) return;
    const team = state.roomData.teams.find(t => t.id === teamId);
    if (!team) return;

    // Populate Modal
    document.getElementById('tm-team-id').value = team.id;
    document.getElementById('tm-team-name').value = team.name;

    const select = document.getElementById('tm-user-select');
    select.innerHTML = '<option value="">-- Seleziona Utente --</option>';

    // Add Connected Users - now UID array, need to get names from participantNames
    state.roomData.connectedUsers.forEach(uid => {
        // Check if user is already assigned to ANOTHER team
        const otherTeamOwner = state.roomData.teams.find(t => t.ownerUid === uid && t.id !== team.id);

        const opt = document.createElement('option');
        opt.value = uid;

        // Get user name from participantNames map
        const userName = state.roomData.participantNames?.[uid] || (uid === state.user.uid ? state.user.displayName : `User ${uid.substring(0, 6)}`);

        let label = userName;

        if (otherTeamOwner) {
            label += ` (Già su ${otherTeamOwner.name})`;
            opt.disabled = true; // Prevent selection
        }

        opt.textContent = label;
        if (uid === team.ownerUid) opt.selected = true;
        select.appendChild(opt);
    });

    // Add Host as fallback option if not in connectedUsers
    if (!state.roomData.connectedUsers.includes(state.user.uid)) {
        const opt = document.createElement('option');
        opt.value = state.user.uid;
        opt.textContent = `${state.user.displayName || 'Me'} (Host)`;
        if (state.user.uid === team.ownerUid) opt.selected = true;
        select.appendChild(opt);
    }

    document.getElementById('modal-team-manager').classList.remove('hidden');
}

async function saveTeamManager() {
    const teamId = document.getElementById('tm-team-id').value;
    const name = document.getElementById('tm-team-name').value;
    const userId = document.getElementById('tm-user-select').value;

    const teamIndex = state.roomData.teams.findIndex(t => t.id === teamId);
    if (teamIndex === -1) return;

    const newTeams = [...state.roomData.teams];
    newTeams[teamIndex].name = name;

    if (userId) {
        // Get user name from participantNames map
        const userName = state.roomData.participantNames?.[userId] ||
            (userId === state.user.uid ? state.user.displayName : `User ${userId.substring(0, 6)}`);

        newTeams[teamIndex].ownerUid = userId;
        newTeams[teamIndex].ownerName = userName;
    }

    try {
        await updateDoc(doc(db, 'rooms', state.currentRoomId), { teams: newTeams });
        showToast("Squadra aggiornata!");
        document.getElementById('modal-team-manager').classList.add('hidden');
    } catch (err) {
        console.error(err);
        showToast("Errore aggiornamento");
    }
}



// --- UI HELPERS ---
function renderPlayerList(filterRole = 'all', searchTerm = '') {
    const list = document.getElementById('player-list');
    list.innerHTML = '';

    // Filter
    let players = state.players.filter(p => {
        // Filter out assigned players
        const isAssigned = state.roomData.teams.some(t => t.roster && t.roster.some(r => String(r.playerId) === String(p.id)));
        if (isAssigned) return false;

        if (filterRole !== 'all' && p.role !== filterRole) return false;
        if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        return true;
    });

    // Sort by Cost Descending
    players.sort((a, b) => b.cost - a.cost);

    players.forEach(p => {
        const li = document.createElement('li');
        li.className = 'player-item';
        li.dataset.id = p.id;
        li.dataset.role = p.role; // Add role for filtering
        li.innerHTML = `
            <span class="p-role-badge role-${p.role}" style="background:var(--role-${p.role === 'P' ? 'gk' : p.role === 'D' ? 'def' : p.role === 'C' ? 'mid' : 'att'})">${p.role}</span>
            <div class="p-info">
                <span class="p-name">${p.name}</span>
                <span class="p-team">${p.team}</span>
            </div>
            <span class="p-value">${p.cost}</span>
        `;

        li.addEventListener('click', () => {
            selectPlayerForAuction(p.id);
        });

        list.appendChild(li);
    });
}

function updatePlayerListVisuals(takenIds, hiddenRoles = []) {
    const items = document.querySelectorAll('.player-item');
    items.forEach(item => {
        const isTaken = takenIds.has(item.dataset.id);
        const isHiddenRole = hiddenRoles.includes(item.dataset.role);

        if (isTaken || isHiddenRole) {
            item.classList.add('hidden');
        } else {
            item.classList.remove('hidden');
        }
    });

    // Check if list is empty/all hidden
    const visible = document.querySelectorAll('.player-item:not(.hidden)');
    const msgEl = document.getElementById('list-status-msg');

    if (visible.length === 0) {
        if (!msgEl) {
            const msg = document.createElement('div');
            msg.id = 'list-status-msg';
            msg.style.padding = '20px';
            msg.style.textAlign = 'center';
            msg.style.color = '#888';
            msg.textContent = hiddenRoles.length >= 4 ? "Draft Completato! 🎉" : "Nessun giocatore disponibile per i ruoli richiesti.";
            const container = document.querySelector('.player-list-container');
            if (container) {
                container.appendChild(msg);
            }
        } else {
            msgEl.textContent = hiddenRoles.length >= 4 ? "Draft Completato! 🎉" : "Nessun giocatore disponibile per i ruoli richiesti.";
            msgEl.style.display = 'block';
        }
    } else {
        if (msgEl) msgEl.style.display = 'none';
    }
}

function setupFilters() {
    // Role tabs
    document.querySelectorAll('.role-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            const role = e.target.dataset.role;
            const search = document.getElementById('search-player').value;
            renderPlayerList(role, search);
        });
    });

    // Search
    document.getElementById('search-player').addEventListener('input', (e) => {
        const activeTab = document.querySelector('.role-tab.active');
        renderPlayerList(activeTab.dataset.role, e.target.value);
    });
}

function renderRoster(userData) {
    const rosterDiv = document.getElementById('user-roster');
    rosterDiv.innerHTML = '';

    document.getElementById('user-credits').textContent = userData.credits;
    document.getElementById('user-slots').textContent = `${userData.roster.length}/25`;

    // Sort by role
    const order = { 'P': 1, 'D': 2, 'C': 3, 'A': 4 };
    const sorted = [...userData.roster].sort((a, b) => {
        const pA = state.players.find(p => p.id === a.playerId) || { role: '?' };
        const pB = state.players.find(p => p.id === b.playerId) || { role: '?' };
        return order[pA.role] - order[pB.role];
    });

    sorted.forEach((item) => {
        const player = state.players.find(p => p.id === item.playerId);
        const div = document.createElement('div');
        div.className = 'roster-slot';
        div.innerHTML = `
            <span><b>${player.role}</b> ${player.name}</span>
            <span>${item.cost}</span>
        `;
        rosterDiv.appendChild(div);
    });
}

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// --- RECENT ROOMS ---
// --- RECENT ROOMS ---
function loadRecentRooms(uid) {
    const container = document.getElementById('recent-rooms-container');
    const list = document.getElementById('recent-rooms-list');

    // Simple query: rooms where 'participantIds' contains uid
    const q = query(collection(db, "rooms"), where("participantIds", "array-contains", uid));

    onSnapshot(q, (snapshot) => {
        list.innerHTML = '';
        if (snapshot.empty) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');

        snapshot.forEach(doc => {
            const data = doc.data();
            const li = document.createElement('li');
            li.className = 'recent-item';

            // Format time if available
            let timeStr = "";
            if (data.createdAt) {
                timeStr = new Date(data.createdAt.seconds * 1000).toLocaleDateString();
            }

            li.innerHTML = `
                <div>
                   <span style="font-weight:bold">Stanza <code style="color:var(--primary)">${doc.id}</code></span>
                   <small style="display:block; color:#888; font-size:0.75rem">${timeStr}</small>
                </div>
                <span>➔</span>
            `;

            // Click to pre-fill and JOIN
            li.addEventListener('click', () => {
                document.getElementById('input-room-id').value = doc.id;
                if (data.password) {
                    document.getElementById('input-room-pass').value = data.password;
                }
                // Auto-join for better UX
                joinRoom();
            });

            // Delete button for Host
            if (uid === data.hostId) {
                const delBtn = document.createElement('button');
                delBtn.className = 'btn-delete-room';
                delBtn.textContent = 'Elimina';
                delBtn.onclick = (e) => {
                    e.stopPropagation(); // Prevent joining when deleting
                    deleteRoom(doc.id);
                };
                // Append to the first div (text area) or main li? 
                // Previous code appended to li.querySelector('div')
                li.querySelector('div').appendChild(delBtn);
            }

            list.appendChild(li);
        });
    });
}

function sendTurnNotification(msg) {
    if (Notification.permission === "granted") {
        new Notification("Drafta", {
            body: msg,
            icon: 'icon-192.png' // Ensure this exists or use placeholder logic if needed
        });
    }
}

async function sendNudge(targetUid, teamName) {
    // Write to a ephemeral 'nudge' field or just console log for now if no backend.
    // Since we don't have a specific user-to-user channel, we update the room with a 'notification' object.
    try {
        await updateDoc(doc(db, 'rooms', state.currentRoomId), {
            notification: {
                targetUid: targetUid,
                sender: state.user.displayName || state.user.email,
                msg: `Toc toc! È il turno di ${teamName}!`,
                timestamp: Date.now()
            }
        });
        showToast("Sollecito inviato!");
    } catch (e) { console.error(e); }
}

// Expose sendNudge globally for onclick handlers
window.sendNudge = sendNudge;

function showBigError(msg) {
    // Create or reuse modal
    let modal = document.getElementById('modal-error-big');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-error-big';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); display:flex; align-items:center; justify-content:center; z-index:9999;';
        modal.innerHTML = `
            <div style="background:#1a1a1a; padding:2rem; border-radius:1rem; border:2px solid #ff4444; max-width:400px; text-align:center; box-shadow:0 20px 60px rgba(255,68,68,0.5);">
                <div style="font-size:4rem; margin-bottom:1rem;">🚫</div>
                <h3 style="color:#ff4444; font-size:1.5rem; margin-bottom:1rem; font-weight:bold;">ATTENZIONE</h3>
                <p id="modal-error-text" style="color:white; font-size:1.1rem; margin-bottom:2rem; font-weight:500;"></p>
                <button onclick="document.getElementById('modal-error-big').style.display='none'" 
                        style="background:#ff4444; color:white; border:none; padding:0.75rem 2rem; border-radius:0.5rem; font-size:1rem; font-weight:bold; cursor:pointer; width:100%;">OK</button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    document.getElementById('modal-error-text').textContent = msg;
    modal.style.display = 'flex';

    // Play error sound
    const audio = new Audio('https://actions.google.com/sounds/v1/alarms/error_buzzer.ogg');
    audio.volume = 0.5;
    audio.play().catch(e => { });
}

// --- CSV EXPORT ---
function exportTeamsToCSV() {
    if (!state.roomData || !state.roomData.teams) {
        showToast("Nessun dato da esportare");
        return;
    }

    const teams = state.roomData.teams;
    const csvLines = [];

    // Generate CSV according to format: $,$,$ separator, then TeamName,PlayerID,0 for each player
    teams.forEach(team => {
        // Team separator
        csvLines.push('$,$,$');

        // Add each player in the roster
        if (team.roster && team.roster.length > 0) {
            team.roster.forEach(rosterItem => {
                // Format: TeamName,PlayerID,0
                csvLines.push(`${team.name},${rosterItem.playerId},0`);
            });
        }
    });

    // Join all lines with newline
    const csvContent = csvLines.join('\n');

    // Create blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Filename: drafta-export-{roomId}-{timestamp}.csv
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    link.download = `drafta-export-${state.currentRoomId}-${timestamp}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast("✅ CSV esportato!");
}

// --- IMPORT LOGIC ---
document.getElementById('btn-import-room').addEventListener('click', () => {
    document.getElementById('input-import-csv').value = ''; // Reset
    document.getElementById('input-import-csv').click();
});

document.getElementById('input-import-csv').addEventListener('change', handleImportCSV);

function handleImportCSV(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const text = event.target.result;
        try {
            await createRoomFromCSV(text);
        } catch (err) {
            console.error(err);
            showToast("Errore importazione CSV: " + err.message);
        }
    };
    reader.readAsText(file);
}

async function createRoomFromCSV(csvText) {
    if (!state.user) return showToast("Devi essere loggato!");

    const rows = csvText.split(/\r?\n/);
    const teamsMap = new Map(); // Name -> { players: [] }

    // Parse CSV
    // Format: TeamName, PlayerID, Cost(ignored)
    // Separator: $,$,$ (ignored)
    rows.forEach(row => {
        const parts = row.split(',');
        if (parts.length < 2) return;

        const teamName = parts[0].trim();
        const playerId = parts[1].trim();

        if (teamName === '$' || !teamName) return; // Skip separator

        if (!teamsMap.has(teamName)) {
            teamsMap.set(teamName, []);
        }

        if (playerId) {
            teamsMap.get(teamName).push(playerId);
        }
    });

    if (teamsMap.size === 0) throw new Error("Nessuna squadra trovata nel file");

    // Init Logic similar to createRoom
    const roomId = generateRoomId();
    const password = Math.random().toString(36).slice(-4).toUpperCase(); // Random pass

    // Create Teams Structure
    const teams = [];
    let i = 1;
    for (const [name, playerIds] of teamsMap) {
        // Build Roster
        const roster = [];
        let totalSpent = 0;

        playerIds.forEach(pid => {
            const p = state.players.find(pl => String(pl.id) === String(pid));
            if (p) {
                roster.push({ playerId: p.id, cost: p.cost });
                totalSpent += p.cost;
            }
        });

        teams.push({
            id: `team-${i}`,
            name: name,
            ownerUid: (i === 1) ? state.user.uid : null, // Assign Host to Team 1
            ownerName: (i === 1) ? state.user.displayName : null, // Assign Host to Team 1
            credits: 500 - totalSpent,
            roster: roster,
            totalValue: totalSpent
        });
        i++;
    }

    const roomRef = doc(db, 'rooms', roomId);

    // Config: deduce team count from file
    // Settings: default
    const roomData = {
        hostId: state.user.uid,
        password: password,
        status: 'started', // Import -> Started directly
        participantIds: [state.user.uid],
        connectedUsers: [{
            uid: state.user.uid,
            name: state.user.displayName,
            photoURL: state.user.photoURL
        }],
        teams: teams,
        currentTurnIndex: 0,
        roundNumber: 1,
        draftOrder: teams.map(t => t.id), // Default 1..N order
        currentPick: null,
        settings: {
            blockGK: false, // Default off for import
            strictRoles: true // Default on?
        },
        createdAt: serverTimestamp(),
        isImported: true
    };

    await setDoc(roomRef, roomData);

    // Switch to room
    state.currentRoomId = roomId;
    document.getElementById('input-room-id').value = roomId; // For join field

    showToast("Stanza importata con successo! Ingresso...");
    enterRoom(roomId, true, password);
}


// --- ORDER LOGIC ---
const mdOrder = document.getElementById('modal-order-settings');
const btnCloseOrder = document.getElementById('btn-close-order-modal');

if (document.getElementById('btn-draft-order')) {
    document.getElementById('btn-draft-order').addEventListener('click', () => {
        mdOrder.classList.remove('hidden');
    });
}
if (btnCloseOrder) {
    btnCloseOrder.addEventListener('click', () => {
        mdOrder.classList.add('hidden');
    });
}

// Order Buttons
['btn-order-strict', 'btn-order-count', 'btn-order-value'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
        btn.addEventListener('click', () => {
            const type = id.replace('btn-order-', '');
            applyDraftOrder(type);
        });
    }
});

async function applyDraftOrder(type) {
    if (!state.isHost) return;
    if (!state.roomData) return;

    if (!state.players || state.players.length === 0) {
        showToast("Attendi caricamento giocatori...");
        return;
    }

    const newOrder = calculateDynamicOrder(state.roomData.teams, type);

    // Update Firebase
    const roomRef = doc(db, 'rooms', state.currentRoomId);
    await updateDoc(roomRef, {
        draftOrder: newOrder,
        currentTurnIndex: 0, // Reset round start
        orderSettingsApplied: true,
        "settings.sortMode": type // Save the mode for dynamic updates!
    });

    mdOrder.classList.add('hidden');
    showToast("Ordine dei turni aggiornato!");
}

function calculateDynamicOrder(teams, type) {
    const sorted = [...teams];

    // Helper to count roles
    const countRoles = (roster) => {
        const c = { P: 0, D: 0, C: 0, A: 0, Total: 0 };
        roster.forEach(r => {
            const p = state.players.find(pl => String(pl.id) === String(r.playerId));
            if (p) { c[p.role]++; c.Total++; }
        });
        return c;
    };

    sorted.sort((a, b) => {
        const rA = countRoles(a.roster);
        const rB = countRoles(b.roster);

        // Use Smart Comparison for Value/Tie-Breaking
        const valueComparison = compareTeamsSmart(a, b);

        if (type === 'strict') {
            // P ascending
            if (rA.P !== rB.P) return rA.P - rB.P;
            // D ascending
            if (rA.D !== rB.D) return rA.D - rB.D;
            // C ascending
            if (rA.C !== rB.C) return rA.C - rB.C;
            // A ascending
            if (rA.A !== rB.A) return rA.A - rB.A;
            // Tie -> Value Smart
            return valueComparison;
        } else if (type === 'count') {
            // Total Players ascending
            if (rA.Total !== rB.Total) return rA.Total - rB.Total;
            // Tie -> Value Smart
            return valueComparison;
        } else {
            // Value Mode is just Smart Comparison directly
            return valueComparison;
        }
    });

    return sorted.map(t => t.id);
}

/**
 * Compare two teams based on:
 * 1. Total Value (Lower goes first)
 * 2. If Equal: "High Card" Rule (Team with the most expensive player goes LAST/LATER)
 *    - Compare sorted costs of rosters (Desc)
 *    - First mismatch determines winner
 */
function compareTeamsSmart(a, b) {
    const valA = a.totalValue || 0;
    const valB = b.totalValue || 0;

    // 1. Primary: Total Value
    if (valA !== valB) return valA - valB;

    // 2. Secondary: High Card Logic
    // Extract costs and sort Descending (100, 50, 10...)
    const getCosts = (t) => t.roster.map(r => r.cost || 0).sort((x, y) => y - x);

    const costsA = getCosts(a);
    const costsB = getCosts(b);

    const len = Math.max(costsA.length, costsB.length);

    for (let i = 0; i < len; i++) {
        const cA = costsA[i] || 0;
        const cB = costsB[i] || 0;

        if (cA !== cB) {
            // "Chi ha quello più caro sceglie DOPO"
            // So if A has 100 and B has 50, A should be > B.
            // Returning Positive (A - B) puts A after B.
            return cA - cB;
        }
    }

    // 3. Fallback: Original ID Order (Stable)
    // Assuming IDs like "team-1", "team-2"
    // Does JavaScript sort preserve order? Yes generally, but explicit is safer?
    // Let's stick to 0 (equal) if identical rosters.
    return 0;
}

