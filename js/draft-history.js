// Pick history, newest first.

import { esc } from './utils.js';
import { markChatAsClosed } from './chat.js';

export function renderDraftHistory(data) {
    const list = document.getElementById('draft-history-list');
    const history = data.draftHistory || [];
    const key = `${history.length}:${history.at(-1)?.timestamp || 0}`;
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.innerHTML = history.length
        ? [...history].reverse().map((h) => `<li>
            <span class="history-round">G${esc(h.round)}</span>
            <span class="role-badge role-${esc(h.role)}">${esc(h.role)}</span>
            <span class="history-details"><span class="history-player">${esc(h.playerName)}</span><span class="history-team-name">${esc(h.teamName)}${h.isAutoPick ? ' · <span class="auto">d\'ufficio</span>' : ''}</span></span>
            <span class="history-cost">${esc(h.cost)}</span>
        </li>`).join('')
        : '<li class="empty-row">Nessuna scelta, per ora.</li>';
}

export function setupHistoryListeners() {
    const panel = document.getElementById('draft-history-panel');
    const toggle = document.getElementById('btn-toggle-history');
    const set = (open) => {
        panel.classList.toggle('hidden', !open);
        toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => {
        const open = panel.classList.contains('hidden');
        if (open) {
            document.getElementById('chat-panel').classList.add('hidden');
            markChatAsClosed();
        }
        set(open);
    });
    document.getElementById('btn-close-history').addEventListener('click', () => { set(false); toggle.focus(); });
}
