// ============================================================================
// MODULO: Chat in Stanza
// ============================================================================
// Gestisce la chat testuale tra partecipanti durante il draft.
// Messaggi salvati in sub-collezione Firestore rooms/{roomId}/messages.
// ============================================================================

import { db, collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp } from './firebase-modules.js';
import { state } from './state.js';
import { showToast } from './utils.js';

// ── Variabili modulo ────────────────────────────────────────────────────
let chatUnsubscribe = null;
let unreadCount = 0;
let chatOpen = false;

// Emoji rapide
const QUICK_EMOJIS = ['👍', '😂', '🔥', '💀', '🎯', '💎'];

/**
 * Inizializza la chat per la stanza corrente
 * Configura il listener real-time sui messaggi
 * 
 * @function initChat
 * @param {string} roomId - ID della stanza
 */
export function initChat(roomId) {
    // Cleanup listener precedente
    if (chatUnsubscribe) {
        chatUnsubscribe();
        chatUnsubscribe = null;
    }

    unreadCount = 0;
    updateBadge();

    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(200));

    chatUnsubscribe = onSnapshot(q, (snapshot) => {
        const list = document.getElementById('chat-messages');
        if (!list) return;

        list.innerHTML = '';

        snapshot.forEach(doc => {
            const msg = doc.data();
            renderMessage(list, msg);
        });

        // Auto-scroll in fondo
        list.scrollTop = list.scrollHeight;

        // Se chat chiusa, incrementa badge
        if (!chatOpen && snapshot.docChanges().length > 0) {
            const newMessages = snapshot.docChanges().filter(c => c.type === 'added');
            if (newMessages.length > 0 && list.childNodes.length > 0) {
                unreadCount += newMessages.length;
                updateBadge();
            }
        }
    });
}

/**
 * Renderizza un singolo messaggio nella lista
 * 
 * @param {HTMLElement} container - Container dei messaggi
 * @param {Object} msg - Dati del messaggio
 */
function renderMessage(container, msg) {
    const div = document.createElement('div');
    const isMe = msg.uid === state.user?.uid;
    div.className = `chat-msg ${isMe ? 'chat-msg-mine' : ''}`;

    const time = msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';

    div.innerHTML = `
        <div class="chat-msg-header">
            <span class="chat-msg-name">${isMe ? 'Tu' : (msg.displayName || 'Anonimo')}</span>
            <span class="chat-msg-time">${time}</span>
        </div>
        <div class="chat-msg-text">${escapeHtml(msg.text)}</div>
    `;

    container.appendChild(div);
}

/**
 * Invia un messaggio nella chat
 * 
 * @function sendMessage
 * @param {string} text - Testo del messaggio
 */
export async function sendMessage(text) {
    if (!text.trim()) return;
    if (!state.currentRoomId) return;

    const messagesRef = collection(db, 'rooms', state.currentRoomId, 'messages');

    try {
        await addDoc(messagesRef, {
            uid: state.user.uid,
            displayName: state.user.displayName || state.user.email,
            photoURL: state.user.photoURL || null,
            text: text.trim(),
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.error('Chat send error:', e);
        showToast('Errore invio messaggio');
    }
}

/**
 * Toggle apertura/chiusura pannello chat
 */
export function toggleChatPanel() {
    const panel = document.getElementById('chat-panel');
    if (!panel) return;

    chatOpen = !chatOpen;
    panel.classList.toggle('hidden', !chatOpen);

    if (chatOpen) {
        unreadCount = 0;
        updateBadge();
        // Focus sull'input
        const input = document.getElementById('chat-input');
        if (input) input.focus();
        // Scroll in fondo
        const list = document.getElementById('chat-messages');
        if (list) list.scrollTop = list.scrollHeight;
    }
}

/**
 * Aggiorna il badge di notifica messaggi non letti
 */
function updateBadge() {
    const badge = document.getElementById('chat-badge');
    const badgeMobile = document.getElementById('chat-badge-mobile');

    const text = unreadCount > 9 ? '9+' : unreadCount;

    if (unreadCount > 0) {
        if (badge) {
            badge.textContent = text;
            badge.classList.remove('hidden');
        }
        if (badgeMobile) {
            badgeMobile.textContent = text;
            badgeMobile.classList.remove('hidden');
        }
    } else {
        if (badge) badge.classList.add('hidden');
        if (badgeMobile) badgeMobile.classList.add('hidden');
    }
}

/**
 * Cleanup della chat (quando si esce dalla stanza)
 */
export function cleanupChat() {
    if (chatUnsubscribe) {
        chatUnsubscribe();
        chatUnsubscribe = null;
    }
    chatOpen = false;
    unreadCount = 0;
}

/**
 * Configura i listener per la chat
 */
export function setupChatListeners() {
    // Toggle chat panel
    const btnToggle = document.getElementById('btn-toggle-chat');
    if (btnToggle) {
        btnToggle.addEventListener('click', toggleChatPanel);
    }

    // Chiudi chat
    const btnClose = document.getElementById('btn-close-chat');
    if (btnClose) {
        btnClose.addEventListener('click', () => {
            chatOpen = false;
            document.getElementById('chat-panel').classList.add('hidden');
        });
    }

    // Invio messaggio
    const btnSend = document.getElementById('btn-send-chat');
    const chatInput = document.getElementById('chat-input');

    if (btnSend && chatInput) {
        btnSend.addEventListener('click', () => {
            sendMessage(chatInput.value);
            chatInput.value = '';
        });

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(chatInput.value);
                chatInput.value = '';
            }
        });
    }

    // Emoji rapide
    const emojiBar = document.getElementById('chat-emoji-bar');
    if (emojiBar) {
        QUICK_EMOJIS.forEach(emoji => {
            const btn = document.createElement('button');
            btn.className = 'chat-emoji-btn';
            btn.textContent = emoji;
            btn.addEventListener('click', () => {
                sendMessage(emoji);
            });
            emojiBar.appendChild(btn);
        });
    }
}

/**
 * Escape HTML per prevenire XSS nei messaggi
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
