// ============================================================================
// MODULO: Riepilogo Fine Draft
// ============================================================================
// Mostra un riepilogo completo quando il draft è terminato.
// Include statistiche per squadra, best pick, e tabella riassuntiva.
// ============================================================================

import { state } from './state.js';
import { getTeamColor } from './utils.js';

const ROSTER_SLOTS = 25; // Slot totali per squadra (3P + 8D + 8C + 6A)

/**
 * Verifica se il draft è completato e mostra il riepilogo
 * 
 * @param {Object} data - Dati della stanza Firebase
 * @returns {boolean} true se il draft è completato
 */
export function checkAndShowDraftSummary(data) {
    if (!data.teams || data.teams.length === 0) return false;

    // Il draft è completo se TUTTE le squadre hanno il roster pieno
    const allComplete = data.teams.every(t => (t.roster?.length || 0) >= ROSTER_SLOTS);

    if (!allComplete) {
        hideSummary();
        return false;
    }

    // Mostra riepilogo solo se non già visibile
    if (!state._summaryShown) {
        state._summaryShown = true;
        showDraftSummary(data);
    }

    return true;
}

/**
 * Genera e mostra il pannello riepilogo
 */
function showDraftSummary(data) {
    let container = document.getElementById('draft-summary-panel');
    if (!container) {
        container = document.createElement('div');
        container.id = 'draft-summary-panel';
        container.className = 'draft-summary-panel';
        document.body.appendChild(container);
    }

    const teams = data.teams;

    // Calcola statistiche
    const stats = teams.map(t => {
        const roster = t.roster || [];
        const totalSpent = roster.reduce((sum, r) => sum + (r.cost || 0), 0);
        const avgCost = roster.length > 0 ? (totalSpent / roster.length).toFixed(1) : 0;
        const bestPick = roster.reduce((best, r) => (r.cost > (best?.cost || 0) ? r : best), null);

        return {
            name: t.name,
            id: t.id,
            totalSpent,
            remaining: t.credits,
            avgCost,
            bestPick,
            rosterCount: roster.length,
            totalValue: t.totalValue || totalSpent
        };
    });

    // Ordina per valore totale decrescente
    stats.sort((a, b) => b.totalValue - a.totalValue);

    container.innerHTML = `
        <div class="summary-overlay">
            <div class="summary-content">
                <h2>🏆 Draft Completato!</h2>
                <p class="summary-subtitle">Riepilogo finale dell'asta</p>
                
                <div class="summary-grid">
                    ${stats.map((s, i) => `
                        <div class="summary-team-card" style="border-color: ${getTeamColor(s.id)}">
                            <div class="summary-rank" style="background: ${getTeamColor(s.id)}">#${i + 1}</div>
                            <h3>${s.name}</h3>
                            <div class="summary-stats">
                                <div class="stat">
                                    <span class="stat-label">Spesi</span>
                                    <span class="stat-value">${s.totalSpent}</span>
                                </div>
                                <div class="stat">
                                    <span class="stat-label">Rimasti</span>
                                    <span class="stat-value">${s.remaining}</span>
                                </div>
                                <div class="stat">
                                    <span class="stat-label">Media</span>
                                    <span class="stat-value">${s.avgCost}</span>
                                </div>
                            </div>
                            ${s.bestPick ? `<div class="summary-best-pick">💎 ${s.bestPick.playerName || 'N/A'} (${s.bestPick.cost})</div>` : ''}
                        </div>
                    `).join('')}
                </div>

                <button id="btn-close-summary" class="btn btn-primary" style="margin-top:20px;">Chiudi Riepilogo</button>
            </div>
        </div>
    `;

    container.classList.remove('hidden');

    document.getElementById('btn-close-summary')?.addEventListener('click', () => {
        container.classList.add('hidden');
    });
}

function hideSummary() {
    state._summaryShown = false;
}
