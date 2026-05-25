// ============================================================================
// MODULO: Draft History Log
// ============================================================================
// Gestisce la cronologia dei pick del draft in tempo reale.
// Mostra un feed scrollabile con tutti i pick effettuati.
// ============================================================================

import { state } from './state.js';

/**
 * Renderizza il feed della cronologia pick
 * 
 * @param {Object} data - Dati completi della stanza Firebase
 */
export function renderDraftHistory(data) {
    const list = document.getElementById('draft-history-list');
    if (!list) return;

    const history = data.draftHistory || [];

    // Non ri-renderizzare se il numero di entry non è cambiato
    if (list.dataset.count === String(history.length)) return;
    list.dataset.count = String(history.length);

    list.innerHTML = '';

    if (history.length === 0) {
        list.innerHTML = '<div class="history-empty">Nessun pick ancora effettuato</div>';
        return;
    }

    // Renderizza in ordine inverso (più recente in cima)
    [...history].reverse().forEach((entry, i) => {
        const item = document.createElement('div');
        item.className = `history-item ${i === 0 ? 'history-item-new' : ''}`;

        const roleColorClass = entry.role === 'P' ? 'gk' : entry.role === 'D' ? 'def' : entry.role === 'C' ? 'mid' : 'att';

        item.innerHTML = `
            <div class="history-round">R${entry.round}</div>
            <span class="history-role-badge role-${entry.role}" style="background:var(--role-${roleColorClass})">${entry.role}</span>
            <div class="history-details">
                <span class="history-player">${entry.playerName}</span>
                <span class="history-team-name">→ ${entry.teamName}</span>
            </div>
            <span class="history-cost">${entry.cost}</span>
        `;

        list.appendChild(item);
    });
}

/**
 * Mostra/nascondi il pannello cronologia
 */
export function toggleHistoryPanel() {
    const panel = document.getElementById('draft-history-panel');
    if (panel) {
        panel.classList.toggle('hidden');
    }
}

/**
 * Configura i listener per il pannello cronologia
 */
export function setupHistoryListeners() {
    const btnToggle = document.getElementById('btn-toggle-history');
    const btnClose = document.getElementById('btn-close-history');

    if (btnToggle) {
        btnToggle.addEventListener('click', toggleHistoryPanel);
    }
    if (btnClose) {
        btnClose.addEventListener('click', () => {
            document.getElementById('draft-history-panel').classList.add('hidden');
        });
    }
}
