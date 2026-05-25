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

    // Calcola statistiche per squadra
    const stats = teams.map(t => {
        const roster = t.roster || [];
        const totalSpent = roster.reduce((sum, r) => sum + (r.cost || 0), 0);
        const avgCost = roster.length > 0 ? (totalSpent / roster.length).toFixed(1) : 0;
        
        // Trova il best pick della squadra
        let bestPickItem = null;
        let bestPickPlayer = null;
        roster.forEach(r => {
            if (!bestPickItem || (r.cost || 0) > (bestPickItem.cost || 0)) {
                bestPickItem = r;
                bestPickPlayer = state.players.find(p => p.id === r.playerId);
            }
        });

        // Calcola spesa per ruolo
        const roleSpent = { P: 0, D: 0, C: 0, A: 0 };
        roster.forEach(r => {
            const p = state.players.find(pl => pl.id === r.playerId);
            if (p) {
                roleSpent[p.role] += r.cost || 0;
            }
        });

        return {
            name: t.name,
            id: t.id,
            totalSpent,
            avgCost,
            bestPick: bestPickPlayer ? { name: bestPickPlayer.name, cost: bestPickItem.cost } : null,
            roleSpent,
            rosterCount: roster.length,
            totalValue: t.totalValue || totalSpent
        };
    });

    // Ordina per valore totale decrescente
    stats.sort((a, b) => b.totalValue - a.totalValue);

    // Calcola highlights globali
    let topPickOverall = null;
    let cheapestPickOverall = null;
    let totalDraftSpent = 0;
    let totalDraftCount = 0;

    teams.forEach(t => {
        const roster = t.roster || [];
        roster.forEach(r => {
            const p = state.players.find(pl => pl.id === r.playerId);
            if (p) {
                totalDraftSpent += r.cost || 0;
                totalDraftCount++;

                // Top Pick Assoluto
                if (!topPickOverall || (r.cost || 0) > topPickOverall.cost) {
                    topPickOverall = {
                        name: p.name,
                        cost: r.cost || 0,
                        teamName: t.name
                    };
                }

                // Giocatore più Economico Assoluto
                if (!cheapestPickOverall || (r.cost || 0) < cheapestPickOverall.cost) {
                    cheapestPickOverall = {
                        name: p.name,
                        cost: r.cost || 0,
                        teamName: t.name
                    };
                }
            }
        });
    });

    const avgDraftCost = totalDraftCount > 0 ? (totalDraftSpent / totalDraftCount).toFixed(1) : 0;

    container.innerHTML = `
        <div class="summary-overlay">
            <div class="summary-content" style="max-width: 1000px; padding: 25px; background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--primary); box-shadow: 0 4px 20px rgba(0,0,0,0.8);">
                <h2 style="color:var(--primary); font-size: 2.2rem; margin-bottom: 5px;">🏆 Draft Completato!</h2>
                <p class="summary-subtitle" style="margin-bottom: 20px;">Riepilogo finale dell'asta</p>
                
                <!-- HIGHLIGHTS GENERALI -->
                <div class="summary-highlights" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 8px; text-align: left;">
                    <div>
                        <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; display:block;">🔥 Chiamata Record (Top Pick)</span>
                        <strong style="font-size:1.1rem; color:var(--primary);">${topPickOverall ? `${topPickOverall.name} (${topPickOverall.cost})` : 'N/A'}</strong>
                        <span style="font-size:0.75rem; color:var(--text-muted); display:block;">Squadra: ${topPickOverall ? topPickOverall.teamName : '--'}</span>
                    </div>
                    <div>
                        <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; display:block;">💸 Giocatore più Economico</span>
                        <strong style="font-size:1.1rem; color:var(--accent);">${cheapestPickOverall ? `${cheapestPickOverall.name} (${cheapestPickOverall.cost})` : 'N/A'}</strong>
                        <span style="font-size:0.75rem; color:var(--text-muted); display:block;">Squadra: ${cheapestPickOverall ? cheapestPickOverall.teamName : '--'}</span>
                    </div>
                    <div>
                        <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; display:block;">📊 Valore Totale Draft</span>
                        <strong style="font-size:1.1rem; color:white;">${totalDraftSpent} crediti</strong>
                        <span style="font-size:0.75rem; color:var(--text-muted); display:block;">Media giocatore: ${avgDraftCost}</span>
                    </div>
                </div>

                <div class="summary-grid" style="margin-bottom: 25px;">
                    ${stats.map((s, i) => `
                        <div class="summary-team-card" style="border-color: ${getTeamColor(s.id, data)}">
                            <div class="summary-rank" style="background: ${getTeamColor(s.id, data)}">#${i + 1}</div>
                            <h3>${s.name}</h3>
                            <div class="summary-stats" style="margin-bottom: 10px;">
                                <div class="stat">
                                    <span class="stat-label">Valore Rosa</span>
                                    <span class="stat-value" style="color:var(--primary);">${s.totalValue}</span>
                                </div>
                                <div class="stat">
                                    <span class="stat-label">Costo Medio</span>
                                    <span class="stat-value">${s.avgCost}</span>
                                </div>
                            </div>
                            
                            <!-- Spesa per Ruolo -->
                            <div class="summary-roles" style="display:flex; justify-content:space-between; gap:4px; font-size:0.75rem; color:var(--text-muted); margin-top:10px; border-top:1px dashed #333; padding-top:10px;">
                                <span>P: <strong style="color:var(--role-gk, #ff4444)">${s.roleSpent.P}</strong></span>
                                <span>D: <strong style="color:var(--role-def, #22c55e)">${s.roleSpent.D}</strong></span>
                                <span>C: <strong style="color:var(--role-mid, #3b82f6)">${s.roleSpent.C}</strong></span>
                                <span>A: <strong style="color:var(--role-att, #ffcc00)">${s.roleSpent.A}</strong></span>
                            </div>

                            ${s.bestPick ? `<div class="summary-best-pick" style="margin-top:10px; padding-top:10px; border-top:1px solid #333;">💎 Best: ${s.bestPick.name} (${s.bestPick.cost})</div>` : ''}
                        </div>
                    `).join('')}
                </div>

                <button id="btn-close-summary" class="btn btn-primary" style="margin-top:10px; padding: 12px 30px;">Chiudi Riepilogo</button>
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
