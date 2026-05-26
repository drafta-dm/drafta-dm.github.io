// ============================================================================
// MODULO: Riepilogo Fine Draft
// ============================================================================
// Mostra un riepilogo completo quando il draft è terminato.
// Include statistiche per squadra, best pick, e tabella riassuntiva.
// ============================================================================

import { state } from './state.js';
import { getTeamColor, showToast } from './utils.js';

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
        
        // Trova i migliori 2 acquisti per ruolo (D, C, A)
        const getBestOfRole = (role) => {
            const rolePicks = roster
                .map(r => {
                    const p = state.players.find(pl => String(pl.id) === String(r.playerId));
                    return p ? { name: p.name, cost: r.cost || 0, role: p.role } : null;
                })
                .filter(p => p && p.role === role);

            rolePicks.sort((a, b) => b.cost - a.cost);
            return rolePicks.slice(0, 2);
        };

        const bestD = getBestOfRole('D');
        const bestC = getBestOfRole('C');
        const bestA = getBestOfRole('A');

        // Calcola spesa per ruolo
        const roleSpent = { P: 0, D: 0, C: 0, A: 0 };
        roster.forEach(r => {
            const p = state.players.find(pl => String(pl.id) === String(r.playerId));
            if (p) {
                roleSpent[p.role] += r.cost || 0;
            }
        });

        return {
            name: t.name,
            id: t.id,
            totalSpent,
            avgCost,
            bestD,
            bestC,
            bestA,
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
            const p = state.players.find(pl => String(pl.id) === String(r.playerId));
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

    // Genera report di testo per email e copia negli appunti
    let reportText = `🏆 RIEPILOGO ASTA DRAFTA 🏆\n\n`;
    reportText += `HIGHLIGHTS GENERALE:\n`;
    reportText += `🔥 Chiamata Record: ${topPickOverall ? `${topPickOverall.name} (${topPickOverall.cost})` : 'N/A'} - Squadra: ${topPickOverall ? topPickOverall.teamName : '--'}\n`;
    reportText += `💸 Giocatore più Economico: ${cheapestPickOverall ? `${cheapestPickOverall.name} (${cheapestPickOverall.cost})` : 'N/A'} - Squadra: ${cheapestPickOverall ? cheapestPickOverall.teamName : '--'}\n`;
    reportText += `📊 Valore Totale Draft: ${totalDraftSpent} crediti (Media: ${avgDraftCost})\n\n`;
    reportText += `--- CLASSIFICA ROSE ---\n\n`;
    stats.forEach((s, i) => {
        reportText += `#${i + 1} - ${s.name} (Valore: ${s.totalValue})\n`;
        reportText += `   Spesa per ruolo -> P: ${s.roleSpent.P} | D: ${s.roleSpent.D} | C: ${s.roleSpent.C} | A: ${s.roleSpent.A}\n`;
        reportText += `   🛡️ Top D: ${s.bestD.map(p => `${p.name} (${p.cost})`).join(', ') || '--'}\n`;
        reportText += `   🔮 Top C: ${s.bestC.map(p => `${p.name} (${p.cost})`).join(', ') || '--'}\n`;
        reportText += `   🎯 Top A: ${s.bestA.map(p => `${p.name} (${p.cost})`).join(', ') || '--'}\n\n`;
    });

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

                            <!-- Migliori acquisti per ruolo (top 2) -->
                            <div class="summary-best-role-picks" style="margin-top:10px; padding-top:10px; border-top:1px solid #333; font-size:0.72rem; color:var(--text-muted); text-align:left;">
                                <div style="margin-bottom:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                    🛡️ <strong>Top D:</strong> <span style="color:white">${s.bestD.map(p => `${p.name} (${p.cost})`).join(', ') || '--'}</span>
                                </div>
                                <div style="margin-bottom:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                    🔮 <strong>Top C:</strong> <span style="color:white">${s.bestC.map(p => `${p.name} (${p.cost})`).join(', ') || '--'}</span>
                                </div>
                                <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                    🎯 <strong>Top A:</strong> <span style="color:white">${s.bestA.map(p => `${p.name} (${p.cost})`).join(', ') || '--'}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <!-- AZIONI ADMIN -->
                <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:15px;">
                    <button id="btn-email-summary" class="btn btn-outline" style="padding: 12px 24px; font-weight: 500;">✉️ Invia per Email</button>
                    <button id="btn-copy-summary" class="btn btn-outline" style="padding: 12px 24px; font-weight: 500;">📋 Copia Report Testo</button>
                    <button id="btn-close-summary" class="btn btn-primary" style="padding: 12px 24px;">Chiudi Riepilogo</button>
                </div>
            </div>
        </div>
    `;

    container.classList.remove('hidden');

    document.getElementById('btn-close-summary')?.addEventListener('click', () => {
        container.classList.add('hidden');
    });

    document.getElementById('btn-email-summary')?.addEventListener('click', () => {
        const mailtoUrl = `mailto:?subject=${encodeURIComponent("Riepilogo Asta Drafta!")}&body=${encodeURIComponent(reportText)}`;
        window.location.href = mailtoUrl;
    });

    document.getElementById('btn-copy-summary')?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(reportText);
            showToast('📋 Report copiato negli appunti!');
        } catch (err) {
            console.error('Copy report failed:', err);
            showToast('Impossibile copiare il report.');
        }
    });
}

function hideSummary() {
    state._summaryShown = false;
}
