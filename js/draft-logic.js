// ============================================================================
// MODULO: Logica del Draft
// ============================================================================
// Gestisce l'intera logica del fantasy draft inclusi turni, selezioni e validazioni.
// Funzionalità principali:
// - Avvio draft e creazione ordine turni iniziale
// - Selezione giocatori (con permessi host/owner turno)
// - Conferma pick con validazioni multiple (crediti, slot, ordine ruoli)
// - Calcolo ordine turni dinamico (strict, count, value)
// - Confronto intelligente squadre per ordinamento
// - Logica automatica blocco portieri
// - Salvataggio stato su Firebase con aggiornamento real-time
// ============================================================================

// Import Firebase per aggiornamenti stanza
import { db, doc, updateDoc } from './firebase-modules.js';

// Import moduli interni
import { state } from './state.js';                    // Stato globale
import { showToast, showBigError } from './utils.js';  // Notifiche UI

/**
 * Avvia il draft cambiando lo stato della stanza da 'lobby' a 'started'
 * 
 * Operazioni eseguite:
 * - Crea ordine turni iniziale basato sull'ordine delle squadre
 * - Imposta currentTurnIndex a 0 (prima squadra)
 * - Imposta roundNumber a 1 (primo turno)
 * - Resetta flag modal ordine turni
 * - Cambia status stanza a 'started'
 * 
 * Solo l'host può avviare il draft.
 * 
 * @function startDraft
 * @returns {Promise<void>}
 * 
 * @example
 * // Collegato al pulsante "Avvia Draft" in lobby
 * await startDraft();
 */
export async function startDraft() {
    if (!state.isHost) return;

    // Reset flag modal ordine turni (per mostrarla di nuovo se necessario)
    state.hasShownOrderModal = false;

    // Crea ordine turni iniziale = ordine squadre
    const teamIds = state.roomData.teams.map(t => t.id);

    await updateDoc(doc(db, "rooms", state.currentRoomId), {
        status: "started",
        draftOrder: teamIds,
        currentTurnIndex: 0,
        roundNumber: 1
    });
}

/**
 * Renderizza l'anteprima dell'ordine dei turni nella modal
 * 
 * Mostra una lista numerata con i nomi delle squadre nell'ordine
 * in cui giocheranno durante il round corrente.
 * 
 * @function renderOrderPreview
 * @param {Array<string>} order - Array di team IDs nell'ordine desiderato
 * @returns {void}
 * 
 * @example
 * renderOrderPreview(['team-1', 'team-3', 'team-2']);
 * // Mostra: 1. Nome Team 1
 * //         2. Nome Team 3
 * //         3. Nome Team 2
 */
export function renderOrderPreview(order) {
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

/**
 * Seleziona un giocatore per metterlo in asta (mostra card preview)
 * 
 * Controllo permessi:
 * - Host può sempre selezionare
 * - Owner della squadra di turno può selezionare
 * - Altri utenti non possono (viene mostrato toast di errore)
 * 
 * Non assegna direttamente il giocatore, ma lo mette in stato "currentPick"
 * visibile a tutti. L'assegnazione definitiva avviene con confirmPick().
 * 
 * @function selectPlayerForAuction
 * @param {string|number} playerId - ID del giocatore da selezionare
 * @returns {void}
 * 
 * @example
 * selectPlayerForAuction(1234); // Mostra card giocatore ID 1234
 */
export function selectPlayerForAuction(playerId) {
    // ── Controllo permessi ──────────────────────────────────────────────
    let canSelect = state.isHost;

    if (!canSelect && state.roomData && state.roomData.draftOrder) {
        // Verifica se è il proprietario della squadra di turno
        const currentTeamId = state.roomData.draftOrder[state.roomData.currentTurnIndex];
        const currentTeam = state.roomData.teams.find(t => t.id === currentTeamId);

        if (currentTeam && currentTeam.ownerUid === state.user.uid) {
            canSelect = true;
        }
    }

    if (!canSelect) {
        return showToast("Non è il tuo turno per selezionare!");
    }

    // ── Aggiorna currentPick su Firebase ────────────────────────────────
    const roomRef = doc(db, 'rooms', state.currentRoomId);
    updateDoc(roomRef, {
        currentPick: { playerId: playerId }
    });
}

/**
 * Conferma l'assegnazione del giocatore selezionato alla squadra di turno
 * 
 * Validazioni effettuate:
 * 1. Verifica che ci sia un giocatore selezionato (currentPick)
 * 2. Verifica permessi (host o owner squadra di turno)
 * 3. Verifica crediti sufficienti
 * 4. Se strictRoles attivo: verifica ordine ruoli P->D->C->A
 * 5. Verifica slot ruolo non pieni (max: P=3, D=8, C=8, A=6)
 * 
 * Logiche speciali:
 * - Blocco portieri automatico: se blockGK attivo e primo portiere, aggiunge automaticamente gli altri 2 della stessa squadra
 * 
 * Dopo la conferma:
 * - Aggiorna roster squadra
 * - Sottrae crediti
 * - Calcola turno successivo (snake o dynamic order modes)
 * - Salva tutto su Firebase
 * 
 * @function confirmPick
 * @returns {Promise<void>}
 * 
 * @example
 * // Dopo selectPlayerForAuction(), l'utente clicca "Conferma"
 * await confirmPick();
 */
export async function confirmPick() {
    const room = state.roomData;

    // ── Validazione 1: Giocatore selezionato ────────────────────────────
    if (!room.currentPick) return showToast("Nessun giocatore selezionato");

    const currentTeamId = state.roomData.draftOrder[state.roomData.currentTurnIndex];
    if (!currentTeamId) return showToast("Draft terminato");

    const currentTeam = state.roomData.teams.find(t => t.id === currentTeamId);

    // ── Validazione 2: Permessi ─────────────────────────────────────────
    if (!state.isHost && state.user.uid !== currentTeam.ownerUid) {
        return showToast(`Non è il tuo turno! Tocca a: ${currentTeam ? currentTeam.name : 'Altra Squadra'}`);
    }

    const teamIndex = state.roomData.teams.findIndex(t => t.id === currentTeamId);
    const team = state.roomData.teams[teamIndex];

    const playerId = room.currentPick.playerId;
    const player = state.players.find(p => p.id === playerId);
    const cost = player.cost;

    // ── Validazione 3: Crediti ──────────────────────────────────────────
    if (team.credits < cost && !state.isHost) {
        return showToast("Crediti insufficienti!");
    }

    // ── Calcolo ruoli attuali squadra ───────────────────────────────────
    const roles = { P: 0, D: 0, C: 0, A: 0 };
    team.roster.forEach(r => {
        const pState = state.players.find(pl => pl.id === r.playerId);
        if (pState) roles[pState.role]++;
    });

    const targetRole = player.role;

    // ── Validazione 4: Ordine Ruoli Strict (P->D->C->A) ─────────────────
    if (state.roomData.settings?.strictRoles) {
        if (targetRole === 'D' && roles.P < 3) {
            return showBigError("Devi completare i portieri prima!");
        }
        if (targetRole === 'C' && (roles.P < 3 || roles.D < 8)) {
            return showBigError("Devi completare P e D prima!");
        }
        if (targetRole === 'A' && (roles.P < 3 || roles.D < 8 || roles.C < 8)) {
            return showBigError("Devi completare P, D e C prima!");
        }
    }

    // ── Validazione 5: Slot Massimi ─────────────────────────────────────
    const maxRoles = { P: 3, D: 8, C: 8, A: 6 };
    if (roles[targetRole] >= maxRoles[targetRole]) {
        return showBigError(`Slot ${targetRole} completi!`);
    }

    // ── Preparazione assegnazione ───────────────────────────────────────
    const roomRef = doc(db, 'rooms', state.currentRoomId);
    const newTeams = JSON.parse(JSON.stringify(room.teams));
    const pickedItems = [{ playerId, cost }];

    // ── Logica Blocco Portieri Automatico ───────────────────────────────
    const useBlockGK = state.roomData.settings?.blockGK;
    if (targetRole === 'P' && useBlockGK && roles.P === 0) {
        // Se è il primo portiere, cerca gli altri 2 della stessa squadra
        const teamMates = state.players.filter(p =>
            p.team === player.team && p.role === 'P' && p.id !== player.id
        );

        let extraCost = 0;
        teamMates.forEach(m => extraCost += m.cost);

        // Verifica se ci sono crediti sufficienti per prendere tutto il blocco
        if (team.credits >= (cost + extraCost)) {
            teamMates.forEach(m => pickedItems.push({ playerId: m.id, cost: m.cost }));
            showToast(`Blocco portieri ${player.team} assegnato!`);
        } else {
            showToast("Crediti insufficienti per blocco portieri completo.");
        }
    }

    // ── Applicazione Pick ───────────────────────────────────────────────
    let totalCost = 0;
    pickedItems.forEach(item => {
        newTeams[teamIndex].roster.push(item);
        totalCost += item.cost;
    });
    newTeams[teamIndex].credits -= totalCost;
    newTeams[teamIndex].totalValue = (newTeams[teamIndex].totalValue || 0) + totalCost;

    // ── Calcolo Turno Successivo ────────────────────────────────────────
    let nextTurnIndex = room.currentTurnIndex + 1;
    let nextDraftOrder = [...room.draftOrder];
    let nextRound = room.roundNumber;

    const sortMode = state.roomData.settings?.sortMode;

    if (sortMode) {
        // ── Modalità Ordinamento Dinamico ──────────────────────────────
        // Riordina le squadre ad ogni turno in base al criterio scelto
        nextDraftOrder = calculateDynamicOrder(newTeams, sortMode);
        nextTurnIndex = 0;
    } else {
        // ── Modalità Standard (Snake) ───────────────────────────────────
        // Quando finisce il giro, passa al round successivo e riordina squadre
        if (nextTurnIndex >= room.draftOrder.length) {
            nextRound++;
            const sortedTeams = [...newTeams].sort(compareTeamsSmart);
            nextDraftOrder = sortedTeams.map(t => t.id);
            nextTurnIndex = 0;
        }
    }

    // ── Salvataggio su Firebase ─────────────────────────────────────────
    await updateDoc(roomRef, {
        teams: newTeams,
        currentTurnIndex: nextTurnIndex,
        roundNumber: nextRound,
        draftOrder: nextDraftOrder,
        currentPick: null
    });

    showToast(`Assegnato ${player.name} (+${pickedItems.length - 1}) a ${team.name}`);
}

/**
 * Calcola l'ordine dinamico dei turni basato su un criterio specifico
 * 
 * Modalità disponibili:
 * - 'strict': Ordina per ruoli mancanti (P -> D -> C -> A), chi è più indietro sceglie per primo
 * - 'count': Ordina per numero totale giocatori, chi ha meno sceglie per primo
 * - 'value': Ordina per valore rosa, chi ha speso meno sceglie per primo
 * 
 * In caso di parità su criterio primario, usa compareTeamsSmart come tie-breaker.
 * 
 * @function calculateDynamicOrder
 * @param {Array<Object>} teams - Array di squadre
 * @param {string} type - Tipo di ordinamento ('strict', 'count', 'value')
 * @returns {Array<string>} Array di team IDs ordinati secondo il criterio
 * 
 * @example
 * const order = calculateDynamicOrder(teams, 'strict');
 * // Ritorna: ['team-2', 'team-1', 'team-3'] (team-2 ha meno ruoli completati)
 */
export function calculateDynamicOrder(teams, type) {
    const sorted = [...teams];

    // Helper per contare ruoli nella rosa
    const countRoles = (roster) => {
        const c = { P: 0, D: 0, C: 0, A: 0, Total: 0 };
        roster.forEach(r => {
            const p = state.players.find(pl => String(pl.id) === String(r.playerId));
            if (p) {
                c[p.role]++;
                c.Total++;
            }
        });
        return c;
    };

    // ── Ordinamento basato sul tipo ────────────────────────────────────
    sorted.sort((a, b) => {
        const rA = countRoles(a.roster);
        const rB = countRoles(b.roster);

        const valueComparison = compareTeamsSmart(a, b);

        if (type === 'strict') {
            // Ordine per ruoli: P -> D -> C -> A
            if (rA.P !== rB.P) return rA.P - rB.P;
            if (rA.D !== rB.D) return rA.D - rB.D;
            if (rA.C !== rB.C) return rA.C - rB.C;
            if (rA.A !== rB.A) return rA.A - rB.A;
            return valueComparison;  // Tie-breaker
        } else if (type === 'count') {
            // Ordine per numero totale giocatori
            if (rA.Total !== rB.Total) return rA.Total - rB.Total;
            return valueComparison;  // Tie-breaker
        } else {
            // Ordine per valore rosa (type === 'value')
            return valueComparison;
        }
    });

    return sorted.map(t => t.id);
}

/**
 * Confronta due squadre per ordinamento intelligente basato su valore rosa
 * 
 * Algoritmo:
 * 1. Confronto primario: totalValue (chi ha speso meno sceglie prima)
 * 2. Confronto secondario (tie-breaker): "High Card" logic
 *    - Ordina i costi dei giocatori di ogni squadra in ordine decrescente
 *    - Confronta il giocatore più costoso di A vs B
 *    - Se uguale, confronta il secondo più costoso
 *    - E così via finché non trova una differenza
 * 
 * Questo sistema assicura un bilanciamento equo anche quando due squadre
 * hanno lo stesso valore totale ma composizione diversa.
 * 
 * @function compareTeamsSmart
 * @param {Object} a - Prima squadra da confrontare
 * @param {Object} b - Seconda squadra da confrontare
 * @returns {number} -1 se a < b, 0 se a == b, 1 se a > b
 * 
 * @example
 * // Team A: totalValue=100, giocatori=[50, 30, 20]
 * // Team B: totalValue=100, giocatori=[40, 35, 25]
 * compareTeamsSmart(teamA, teamB);
 * // Ritorna: 1 (Team B sceglie prima perché ha il giocatore più costoso più basso)
 */
export function compareTeamsSmart(a, b) {
    const valA = a.totalValue || 0;
    const valB = b.totalValue || 0;

    // ── Confronto primario: Valore totale ───────────────────────────────
    if (valA !== valB) return valA - valB;

    // ── Confronto secondario: High Card Logic ───────────────────────────
    const getCosts = (t) => t.roster.map(r => r.cost || 0).sort((x, y) => y - x);

    const costsA = getCosts(a);
    const costsB = getCosts(b);

    const len = Math.max(costsA.length, costsB.length);

    // Confronta giocatore per giocatore dal più costoso
    for (let i = 0; i < len; i++) {
        const cA = costsA[i] || 0;
        const cB = costsB[i] || 0;

        if (cA !== cB) {
            return cA - cB;
        }
    }

    return 0;  // Perfettamente uguali
}

/**
 * Applica un nuovo ordine di draft dinamico e salva le impostazioni
 * 
 * Operazioni:
 * 1. Calcola nuovo ordine basato sul tipo scelto
 * 2. Resetta currentTurnIndex a 0
 * 3. Salva sortMode nelle settings per applicarlo ad ogni turno
 * 4. Chiude modal impostazioni ordine
 * 
 * Solo l'host può modificare l'ordine dei turni.
 * 
 * @function applyDraftOrder
 * @param {string} type - Tipo ordinamento ('strict', 'count', 'value')
 * @returns {Promise<void>}
 * 
 * @example
 * // Utente sceglie "Per Ruolo Mancante" nella modal
 * await applyDraftOrder('strict');
 */
export async function applyDraftOrder(type) {
    if (!state.isHost) return;
    if (!state.roomData) return;

    // Verifica che i giocatori siano caricati
    if (!state.players || state.players.length === 0) {
        showToast("Attendi caricamento giocatori...");
        return;
    }

    // Calcola nuovo ordine
    const newOrder = calculateDynamicOrder(state.roomData.teams, type);

    // Salva su Firebase
    const roomRef = doc(db, 'rooms', state.currentRoomId);
    await updateDoc(roomRef, {
        draftOrder: newOrder,
        currentTurnIndex: 0,
        orderSettingsApplied: true,
        "settings.sortMode": type  // Salva modalità per applicarla ad ogni turno
    });

    // Chiudi modal e notifica
    document.getElementById('modal-order-settings').classList.add('hidden');
    showToast("Ordine dei turni aggiornato!");
}

/**
 * Configura gli event listener per le funzionalità del draft
 * 
 * Collega:
 * - Pulsante "Avvia Draft" (lobby) -> startDraft()
 * - Pulsante "Conferma" (draft) -> confirmPick()
 * - Pulsante "Annulla" (draft) -> resetta currentPick
 * - Modal ordinamento turni -> pulsanti strict/count/value
 * - Pulsante chiusura modal ordinamento
 * 
 * Da chiamare durante l'inizializzazione dell'app.
 * 
 * @function setupDraftListeners
 * @returns {void}
 * 
 * @example
 * // In app.js durante DOMContentLoaded
 * setupDraftListeners();
 */
export function setupDraftListeners() {
    // ── Pulsante Avvia Draft ────────────────────────────────────────────
    document.getElementById('btn-start-draft').addEventListener('click', startDraft);

    // ── Pulsante Conferma Pick ──────────────────────────────────────────
    document.getElementById('btn-confirm-pick').addEventListener('click', confirmPick);

    // ── Pulsante Annulla Selezione ──────────────────────────────────────
    document.getElementById('btn-clear-pick').addEventListener('click', async () => {
        if (!state.currentRoomId) return;
        await updateDoc(doc(db, 'rooms', state.currentRoomId), { currentPick: null });
        showToast("Selezione annullata");
    });

    // ── Modal Ordinamento Turni ─────────────────────────────────────────
    const mdOrder = document.getElementById('modal-order-settings');
    const btnCloseOrder = document.getElementById('btn-close-order-modal');

    if (btnCloseOrder) {
        btnCloseOrder.addEventListener('click', () => {
            mdOrder.classList.add('hidden');
        });
    }

    // Pulsanti ordinamento (strict, count, value)
    ['btn-order-strict', 'btn-order-count', 'btn-order-value'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                const type = id.replace('btn-order-', '');  // Estrae 'strict', 'count' o 'value'
                applyDraftOrder(type);
            });
        }
    });
}
