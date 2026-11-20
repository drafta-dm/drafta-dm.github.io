// Room chat: rooms/{roomId}/messages, last 200.

import { db, collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp } from './firebase-modules.js';
import { state } from './state.js';
import { showToast, esc } from './utils.js';
import { playSound } from './sounds.js';

let chatUnsubscribe = null;
let unreadCount = 0;
let chatOpen = false;

const QUICK_EMOJIS = ['👍', '😂', '🔥', '💀', '🎯', '💎'];

export function initChat(roomId) {
    cleanupChat();
    const list = document.getElementById('chat-messages');
    list.innerHTML = '';
    let first = true;
    chatUnsubscribe = onSnapshot(query(collection(db, 'rooms', roomId, 'messages'), orderBy('createdAt', 'asc'), limit(200)), (snap) => {
        list.innerHTML = snap.docs.map((d) => renderMessage(d.data())).join('') || '<p class="list-status">Nessun messaggio. Rompi il ghiaccio.</p>';
        list.scrollTop = list.scrollHeight;
        // the first snapshot is the old history, not news
        const fresh = first ? 0 : snap.docChanges().filter((c) => c.type === 'added' && c.doc.data().uid !== state.user?.uid).length;
        first = false;
        if (fresh && !chatOpen) {
            unreadCount += fresh;
            updateBadge();
            playSound('nudge');
        }
    }, (e) => console.warn('chat', e));
}

function renderMessage(msg) {
    const mine = msg.uid === state.user?.uid;
    const time = msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="chat-msg ${mine ? 'chat-msg-mine' : ''}">
        <div class="chat-msg-header"><span class="chat-msg-name">${mine ? 'Tu' : esc(state.roomData?.participantNames?.[msg.uid] || 'Giocatore')}</span><span>${time}</span></div>
        <div class="chat-msg-text">${esc(msg.text)}</div>
    </div>`;
}

export async function sendMessage(text) {
    text = text.trim();
    if (!text || !state.currentRoomId) return;
    try {
        await addDoc(collection(db, 'rooms', state.currentRoomId, 'messages'), {
            uid: state.user.uid,
            displayName: state.user.displayName || 'Giocatore',
            text: text.slice(0, 500),
            createdAt: serverTimestamp(),
        });
    } catch (e) {
        console.error('chat', e);
        showToast('Messaggio non inviato.');
    }
}

function setOpen(open) {
    chatOpen = open;
    document.getElementById('btn-toggle-chat').setAttribute('aria-expanded', String(open));
    if (!open) return;
    unreadCount = 0;
    updateBadge();
    const list = document.getElementById('chat-messages');
    list.scrollTop = list.scrollHeight;
}

export function markChatAsRead() { setOpen(true); }
export function markChatAsClosed() { setOpen(false); }

function updateBadge() {
    for (const id of ['chat-badge', 'chat-badge-mobile']) {
        const b = document.getElementById(id);
        b.textContent = unreadCount > 9 ? '9+' : unreadCount;
        b.classList.toggle('hidden', !unreadCount);
    }
}

export function cleanupChat() {
    chatUnsubscribe?.();
    chatUnsubscribe = null;
    chatOpen = false;
    unreadCount = 0;
    updateBadge();
}

export function setupChatListeners() {
    const panel = document.getElementById('chat-panel');
    const history = document.getElementById('draft-history-panel');
    const input = document.getElementById('chat-input');

    document.getElementById('btn-toggle-chat').addEventListener('click', () => {
        const open = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !open);
        if (open) {
            history.classList.add('hidden');
            document.getElementById('btn-toggle-history').setAttribute('aria-expanded', 'false');
            input.focus();
        }
        setOpen(open);
    });
    document.getElementById('btn-close-chat').addEventListener('click', () => {
        panel.classList.add('hidden');
        setOpen(false);
        document.getElementById('btn-toggle-chat').focus();
    });
    document.getElementById('chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        sendMessage(input.value);
        input.value = '';
    });

    const bar = document.getElementById('chat-emoji-bar');
    bar.innerHTML = QUICK_EMOJIS.map((e) => `<button type="button" class="chat-emoji-btn" aria-label="Invia ${e}">${e}</button>`).join('');
    bar.addEventListener('click', (e) => {
        const b = e.target.closest('.chat-emoji-btn');
        if (b) sendMessage(b.textContent);
    });
}
