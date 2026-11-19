// Rooms: create, join, leave, delete, the live listener on rooms/{roomId}, presence and the turn timer.

import { db, doc, setDoc, getDoc, updateDoc, deleteDoc, arrayUnion, serverTimestamp, onSnapshot, collection, query, where } from './firebase-modules.js';
import { state } from './state.js';
import { showToast, switchView, generateRoomId, openModal, closeModal, copyText, inviteLink, esc, icon } from './utils.js';
import { renderLobbyOrDraft, renderPresence } from './lobby.js';
import { renderOrderPreview, autoPickForTimeout, shuffleOrder } from './draft-logic.js';
import { renderDraftHistory } from './draft-history.js';
import { playSound } from './sounds.js';
import { initChat, cleanupChat } from './chat.js';
import { checkAndShowDraftSummary } from './draft-summary.js';

// Presence lives in rooms/{id}/presence/{uid}, not in the room: a heartbeat on the room
// made every client download the whole room again every few seconds.
const HEARTBEAT = 60_000;

let roomUnsubscribe = null;
let presenceUnsubscribe = null;
let presenceCleanup = null;
let recentUnsubscribe = null;
let timerInterval = null;

const myName = () => state.user.displayName || state.user.email?.split('@')[0] || 'Giocatore';

export async function createRoom() {
    const roomId = generateRoomId();
    const password = generateRoomId(4);
    const teamCount = parseInt(document.getElementById('input-team-count').value, 10);
    const teams = Array.from({ length: teamCount }, (_, i) => ({
        id: `team-${i + 1}`, name: `Squadra ${i + 1}`, ownerUid: null, ownerName: null, credits: 500, roster: [], totalValue: 0,
    }));
    const btn = document.getElementById('btn-create-room');
    btn.disabled = true;
    try {
        await setDoc(doc(db, 'rooms', roomId), {
            hostId: state.user.uid,
            password,
            status: 'lobby',
            participantIds: [state.user.uid],
            participantNames: { [state.user.uid]: myName() },
            teams,
            currentTurnIndex: 0,
            roundNumber: 1,
            draftOrder: [],
            currentPick: null,
            settings: {
                blockGK: document.getElementById('input-block-gk').checked,
                strictRoles: document.getElementById('input-strict-roles').checked,
                timerDuration: parseInt(document.getElementById('input-timer-duration').value, 10) || 0,
            },
            createdAt: serverTimestamp(),
        });
        document.getElementById('modal-room-id').textContent = roomId;
        document.getElementById('modal-room-pass').textContent = password;
        openModal('modal-room-created');
    } catch (e) {
        console.error(e);
        showToast("Non sono riuscito a creare l'asta: " + e.message);
    } finally {
        btn.disabled = false;
    }
}

export async function joinRoom() {
    const roomId = document.getElementById('input-room-id').value.trim().toUpperCase();
    const password = document.getElementById('input-room-pass').value.trim().toUpperCase();
    if (!roomId) return showToast("Scrivi il codice dell'asta.");
    const ref = doc(db, 'rooms', roomId);
    try {
        // Members read the room straight away. Everyone else is let in by the rules only
        // if the join write carries the right password.
        let snap = await getDoc(ref).catch((e) => { if (e.code !== 'permission-denied') throw e; return null; });
        if (snap && !snap.exists()) return showToast('Asta non trovata: controlla il codice.');
        if (!snap?.data().participantIds?.includes(state.user.uid)) {
            // rules from before 7.0 let anyone read the room: check the password here too
            if (snap && snap.data().password && snap.data().password !== password) return showToast('Codice o password sbagliati.');
            await updateDoc(ref, {
                participantIds: arrayUnion(state.user.uid),
                [`participantNames.${state.user.uid}`]: myName(),
                [`joins.${state.user.uid}`]: password,
            });
            snap = await getDoc(ref);
        }
        if (!snap.exists()) return showToast('Asta non trovata.');
        enterRoom(roomId, snap.data().hostId === state.user.uid);
    } catch (e) {
        if (e.code === 'not-found') showToast('Asta non trovata: controlla il codice.');
        else if (e.code === 'permission-denied') showToast('Codice o password sbagliati.');
        else { console.error(e); showToast("Non riesco a entrare nell'asta: " + e.message); }
    }
}

export function leaveRoom() {
    presenceCleanup?.();
    presenceCleanup = null;
    roomUnsubscribe?.();
    roomUnsubscribe = null;
    presenceUnsubscribe?.();
    presenceUnsubscribe = null;
    clearInterval(timerInterval);
    cleanupChat();
    Object.assign(state, { currentRoomId: null, roomData: null, isHost: false, presence: {}, summaryShown: false, lastTurnOwner: null, selectedUserUid: null });
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    if (state.user) switchView('dashboard');
}

export async function deleteRoom(roomId) {
    if (!confirm(`Elimini l'asta ${roomId}? Non si torna indietro.`)) return;
    try {
        await deleteDoc(doc(db, 'rooms', roomId));
    } catch (e) {
        console.error(e);
        showToast("Non sono riuscito a eliminare l'asta.");
    }
}

function startPresence(roomId) {
    const me = doc(db, 'rooms', roomId, 'presence', state.user.uid);
    // online = Drafta is on screen: a phone in a pocket shows as offline, and can be nudged
    const beat = () => { if (document.visibilityState === 'visible') setDoc(me, { at: Date.now() }).catch(() => {}); };
    const gone = () => deleteDoc(me).catch(() => {});
    const onVisibility = () => (document.visibilityState === 'visible' ? beat() : gone());
    beat();
    const iv = setInterval(beat, HEARTBEAT);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', gone);
    presenceCleanup = () => {
        clearInterval(iv);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', gone);
        gone();
    };
    presenceUnsubscribe = onSnapshot(collection(db, 'rooms', roomId, 'presence'), (snap) => {
        state.presence = Object.fromEntries(snap.docs.map((d) => [d.id, d.data().at || 0]));
        renderPresence();
    }, (e) => console.warn('presence', e));
}

export function enterRoom(roomId, isHost) {
    leaveRoom();
    state.currentRoomId = roomId;
    state.isHost = isHost;
    state.hasShownOrderModal = false;
    const enteredAt = Date.now();

    document.getElementById('lobby-room-id').textContent = roomId;
    document.getElementById('txt-room-id-display').textContent = roomId;

    startPresence(roomId);
    initChat(roomId);

    roomUnsubscribe = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
        if (!snap.exists()) {
            showToast("L'asta non esiste più.");
            return leaveRoom();
        }
        const data = snap.data();
        state.roomData = data;
        state.isHost = data.hostId === state.user.uid;

        document.getElementById('lobby-room-pass').textContent = data.password || '';
        document.getElementById('lobby-pass-display').classList.toggle('hidden', !data.password);
        document.getElementById('txt-room-pass-display').textContent = data.password || '';
        document.getElementById('host-controls').classList.toggle('hidden', !state.isHost);
        document.getElementById('guest-waiting-msg').classList.toggle('hidden', state.isHost);
        document.getElementById('btn-export-csv').classList.toggle('hidden', !state.isHost);
        document.getElementById('btn-undo-pick').classList.toggle('hidden', !(state.isHost && data.lastPickState));

        updateTimerUI(data);
        renderDraftHistory(data);
        renderLobbyOrDraft(data);
        checkAndShowDraftSummary(data);

        const firstTurn = data.status === 'started' && !(data.draftHistory?.length);
        if (state.isHost && firstTurn && data.isImported && !data.orderSettingsApplied && !state.hasShownOrderModal) {
            state.hasShownOrderModal = true;
            openModal('modal-order-settings');
        } else if (state.isHost && firstTurn && !data.isImported) {
            if (!state.hasShownOrderModal) { state.hasShownOrderModal = true; openModal('modal-load-order'); }
            if (document.getElementById('modal-load-order').open) renderOrderPreview(data.draftOrder);
        }

        const n = data.notification;
        if (n?.targetUid === state.user.uid && n.timestamp > enteredAt && n.timestamp !== state.lastNudgeTimestamp) {
            state.lastNudgeTimestamp = n.timestamp;
            showToast(`${n.sender}: ${n.msg}`);
            playSound('nudge');
            if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification('Drafta', { body: n.msg, icon: 'icons/icon-192x192.png', tag: 'drafta-nudge' });
            }
        }
    }, (e) => {
        console.error(e);
        showToast("Non riesco più a leggere l'asta.");
        leaveRoom();
    });
}

const STATUS = { lobby: 'in attesa', started: 'in corso' };

export function loadRecentRooms(uid) {
    stopRecentRooms();
    const container = document.getElementById('recent-rooms-container');
    const list = document.getElementById('recent-rooms-list');
    recentUnsubscribe = onSnapshot(query(collection(db, 'rooms'), where('participantIds', 'array-contains', uid)), (snap) => {
        container.classList.toggle('hidden', snap.empty);
        const rooms = snap.docs.sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0));
        list.innerHTML = rooms.map((d) => {
            const r = d.data();
            const date = r.createdAt ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            const done = r.teams?.length && r.teams.every((t) => (t.roster?.length || 0) >= 25);
            const info = [date, done ? 'conclusa' : STATUS[r.status], `${r.teams?.length || 0} squadre`].filter(Boolean).join(' · ');
            return `<li>
                <button class="recent-open" data-room="${esc(d.id)}" aria-label="Entra nell'asta ${esc(d.id)}, ${esc(info)}">
                    <span><span class="mono">${esc(d.id)}</span><small>${esc(info)}</small></span>${icon('arrow-up-right')}
                </button>
                ${r.hostId === uid ? `<button class="icon-btn" data-delete="${esc(d.id)}" aria-label="Elimina l'asta ${esc(d.id)}" title="Elimina">${icon('trash-2')}</button>` : ''}
            </li>`;
        }).join('');
    }, (e) => console.warn('recent rooms', e));
}

export function stopRecentRooms() {
    recentUnsubscribe?.();
    recentUnsubscribe = null;
}

export async function sendNudge(targetUid, teamName) {
    try {
        await updateDoc(doc(db, 'rooms', state.currentRoomId), {
            notification: { targetUid, sender: myName(), msg: `Toc toc! Tocca a ${teamName}.`, timestamp: Date.now() },
        });
        showToast('Sollecito inviato.');
    } catch (e) {
        console.error(e);
        showToast('Sollecito non inviato.');
    }
}

function updateTimerUI(data) {
    clearInterval(timerInterval);
    const box = document.getElementById('timer-container');
    const text = document.getElementById('timer-text');
    const bar = document.getElementById('timer-bar-fill');
    const pauseBtn = document.getElementById('btn-timer-pause');
    const duration = data.settings?.timerDuration || 0;
    const running = duration > 0 && data.status === 'started' && data.currentTurnIndex < (data.draftOrder?.length || 0);
    box.classList.toggle('hidden', !running);
    pauseBtn.classList.toggle('hidden', !state.isHost);
    if (!running || !data.turnStartedAt) return;

    pauseBtn.setAttribute('aria-label', data.timerPaused ? 'Riprendi il timer' : 'Metti in pausa il timer');
    pauseBtn.querySelector('use').setAttribute('href', data.timerPaused ? '#i-play' : '#i-pause');

    const fmt = (s) => {
        s = Math.ceil(s);
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), pad = (n) => String(n).padStart(2, '0');
        return s < 60 ? `${s}s` : h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
    };
    const paint = (left) => {
        bar.style.width = `${(left / duration) * 100}%`;
        box.classList.toggle('is-low', left <= duration * 0.4);
        box.classList.toggle('is-critical', left <= Math.max(10, duration * 0.1));
    };
    if (data.timerPaused) {
        const left = Math.max(0, duration - (data.pausedElapsed || 0) / 1000);
        paint(left);
        text.textContent = `${fmt(left)} · pausa`;
        return;
    }
    const tick = () => {
        const left = Math.max(0, duration - (Date.now() - data.turnStartedAt) / 1000);
        paint(left);
        text.textContent = fmt(left);
        if (left <= 0) {
            clearInterval(timerInterval);
            if (state.isHost) autoPickForTimeout();
        }
    };
    tick();
    timerInterval = setInterval(tick, 250);
}

export function setupRoomListeners() {
    document.getElementById('btn-create-room').addEventListener('click', createRoom);
    document.getElementById('form-join').addEventListener('submit', (e) => { e.preventDefault(); joinRoom(); });
    document.getElementById('btn-leave-lobby').addEventListener('click', leaveRoom);
    document.getElementById('draft-logo-home').addEventListener('click', () => {
        if (confirm("Esci dall'asta e torni alla home? Puoi rientrare quando vuoi.")) leaveRoom();
    });

    document.getElementById('recent-rooms-list').addEventListener('click', (e) => {
        const del = e.target.closest('[data-delete]');
        if (del) return deleteRoom(del.dataset.delete);
        const open = e.target.closest('[data-room]');
        if (!open) return;
        document.getElementById('input-room-id').value = open.dataset.room;
        joinRoom();
    });

    document.getElementById('btn-modal-enter').addEventListener('click', () => {
        closeModal('modal-room-created');
        enterRoom(document.getElementById('modal-room-id').textContent.trim(), true);
    });

    const copyInvite = (roomId, password) => copyText(inviteLink(roomId, password), 'Link copiato: mandalo a chi gioca.');
    document.getElementById('btn-copy-room-link').addEventListener('click', () =>
        copyInvite(document.getElementById('modal-room-id').textContent.trim(), document.getElementById('modal-room-pass').textContent.trim()));
    for (const id of ['btn-profile-copy-link', 'btn-lobby-copy-link']) {
        document.getElementById(id).addEventListener('click', () => {
            if (state.currentRoomId) copyInvite(state.currentRoomId, state.roomData?.password);
        });
    }

    document.getElementById('btn-gen-random-start').addEventListener('click', shuffleOrder);
    document.getElementById('btn-confirm-start-order').addEventListener('click', () => closeModal('modal-load-order'));
}
