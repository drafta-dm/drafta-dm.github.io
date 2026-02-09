// ============================================================================
// MODULO: Rendering Interfaccia Utente Draft
// ============================================================================
// Modulo responsabile del rendering di tutti gli elementi UI durante il draft.
// 
// Componenti principali:
// - Matrice squadre: griglia con tutte le squadre, roster e contatori
// - Card giocatore: preview grande del giocatore selezionato
// - Indicatori turno: round corrente, squadra attiva
// - Roster fisso: visualizzazione slot 25 giocatori per ruolo
// - Stato online: dots verde/rosso con sistema nudge
// - Contatori ruoli: P:3, D:8, C:8, A:6 rimanenti per squadra
// ============================================================================

import { state } from './state.js';
import { getTeamColor } from './utils.js';
import { sendTurnNotification } from './notifications.js';
import { updatePlayerListVisuals } from './player-filters.js';

/**
 * Aggiorna l'intera interfaccia del draft in risposta a cambiamenti
 * 
 * Questa è la funzione principale chiamata dal listener real-time ogni volta
 * che il documento Firebase della stanza cambia. Coordina l'aggiornamento di
 * tutti i componenti UI.
 * 
 * Aggiornamenti eseguiti:
 * 1. Indicatore turno corrente (round, squadra attiva)
 * 2. Card giocatore selezionato
 * 3. Matrice squadre
 * 4. Lista giocatori disponibili (nascondi presi/ruoli pieni)
 * 5. Notifica turno se è tocco dell'utente corrente
 * 
 * @function updateDraftUI
 * @param {Object} data - Dati completi della stanza da Firebase
 * @returns {void}
 * 
 * @example
 * // Chiamato automaticamente dal listener onSnapshot in room-manager
 * onSnapshot(roomRef, (snap) => {
 *   const data = snap.data();
 *   updateDraftUI(data);
 * });
 */
export function updateDraftUI(data) {
    // Verifica che il draft sia iniziato
    if (!data.draftOrder || data.draftOrder.length === 0) return;

    // ── 1. AGGIORNAMENTO INDICATORE TURNO ───────────────────────────────
    const currentTeamId = data.draftOrder[data.currentTurnIndex];
    const currentTeam = data.teams.find(t => t.id === currentTeamId);

    // Aggiorna header round
    document.getElementById('txt-round').textContent = `Round ${data.roundNumber}`;
    const turnEl = document.getElementById('txt-current-turn-team');

    if (currentTeam) {
        // Verifica se è il turno dell'utente corrente
        if (state.user.uid === currentTeam.ownerUid) {
            // Stile evidenziato per turno utente
            turnEl.textContent = "Tocca a TE! 🫵";
            turnEl.style.color = "var(--primary)";
            turnEl.style.textShadow = "0 0 10px rgba(0,255,194,0.5)";

            // Notifica se il turno è appena cambiato a me
            if (state.lastTurnOwner !== state.user.uid) {
                sendTurnNotification("È il tuo turno! Fai la tua scelta.");
            }
        } else {
            // Stile normale per turno di altri
            turnEl.textContent = currentTeam.name;
            turnEl.style.color = "white";
            turnEl.style.textShadow = "none";
        }

        // Traccia owner turno precedente per rilevare cambiamenti
        state.lastTurnOwner = currentTeam.ownerUid;

    } else {
        // Draft terminato
        turnEl.textContent = 'Fine Asta';
    }

    // ── 2. CARD GIOCATORE SELEZIONATO ───────────────────────────────────
    if (data.currentPick) {
        // Trova giocatore dall'ID in currentPick
        const player = state.players.find(p => p.id === data.currentPick.playerId);
        updateStage(player);
    } else {
        // Nessun giocatore selezionato: reset card
        updateStage(null);
    }

    // ── 3. RENDERING MATRICE SQUADRE ────────────────────────────────────
    renderTeamsMatrix(data);

    // ── 4. AGGIORNAMENTO LISTA GIOCATORI DISPONIBILI ────────────────────
    // Crea set di ID giocatori già assegnati
    const takenIds = new Set();
    data.teams.forEach(t => t.roster.forEach(r => takenIds.add(String(r.playerId))));

    // Calcola ruoli nascosti (completi) per squadra corrente
    const hiddenRoles = [];

    if (currentTeam) {
        // Conta giocatori per ruolo nella rosa corrente
        const roles = { P: 0, D: 0, C: 0, A: 0 };
        currentTeam.roster.forEach(r => {
            const p = state.players.find(pl => String(pl.id) === String(r.playerId));
            if (p) roles[p.role]++;
        });

        // Determina ruoli pieni (slot massimi raggiunti)
        const maxRoles = { P: 3, D: 8, C: 8, A: 6 };
        if (roles.P >= maxRoles.P) hiddenRoles.push('P');
        if (roles.D >= maxRoles.D) hiddenRoles.push('D');
        if (roles.C >= maxRoles.C) hiddenRoles.push('C');
        if (roles.A >= maxRoles.A) hiddenRoles.push('A');
    } else {
        // Draft terminato: nascondi tutti i ruoli
        hiddenRoles.push('P', 'D', 'C', 'A');
    }

    // Aggiorna visibilità lista giocatori
    updatePlayerListVisuals(takenIds, hiddenRoles);
}

/**
 * Renderizza la matrice squadre con ordinamento dinamico
 * 
 * La matrice mostra tutte le squadre in ordine di turno, con la squadra
 * attiva sempre per prima. Ogni colonna squadra include:
 * - Header: nome, owner, indicatore turno, stato online
 * - Roster: 25 slot fissi organizzati per ruolo
 * - Footer: contatori ruoli rimanenti (P:3, D:8, C:8, A:6)
 * - Click header: apre modal Team Manager (solo host)
 * - Click dot rosso offline: invia nudge (sollecito)
 * 
 * Sistema presenza online:
 * - Dot verde: utente visto negli ultimi 15 secondi (heartbeat attivo)
 * - Dot rosso: utente offline, click per inviare sollecito
 * 
 * @function renderTeamsMatrix
 * @param {Object} data - Dati della stanza
 * @returns {void}
 * 
 * @example
 * // Chiamato da updateDraftUI ad ogni cambiamento
 * renderTeamsMatrix(data);
 */
export function renderTeamsMatrix(data) {
    const container = document.getElementById('teams-matrix');
    container.innerHTML = '';

    if (!data.draftOrder || data.draftOrder.length === 0) return;

    // ── Calcolo ordine visualizzazione (squadra attiva per prima) ──────
    // Ordine circolare a partire dal turno corrente
    const displayIds = [];
    const len = data.draftOrder.length;

    for (let i = 0; i < len; i++) {
        const relativeIdx = (data.currentTurnIndex + i) % len;
        displayIds.push(data.draftOrder[relativeIdx]);
    }

    // ── Rendering colonne squadre ───────────────────────────────────────
    displayIds.forEach((teamId, i) => {
        const team = data.teams.find(t => t.id === teamId);
        if (!team) return;

        const isActive = (i === 0);  // Prima squadra = turno attivo

        // Crea elemento colonna
        const col = document.createElement('div');
        col.className = `matrix-column ${isActive ? 'active-turn' : ''}`;
        col.style.borderTopColor = getTeamColor(team.id);

        // ── Calcolo ruoli attuali ──────────────────────────────────────
        const roles = { P: 0, D: 0, C: 0, A: 0 };
        team.roster.forEach(r => {
            const p = state.players.find(pl => pl.id === r.playerId);
            if (p) roles[p.role]++;
        });

        // ── Verifica stato online (sistema heartbeat) ──────────────────
        let isOnline = false;
        if (data.connectedUsers && Array.isArray(data.connectedUsers) && team.ownerUid) {
            const inArray = data.connectedUsers.includes(team.ownerUid);
            const lastSeenTime = data.lastSeen?.[team.ownerUid];
            const isRecent = lastSeenTime && (Date.now() - lastSeenTime) < 15000; // 15s threshold
            isOnline = inArray && isRecent;
        }

        // ── Markers visuali ─────────────────────────────────────────────
        // Freccia per squadra attiva
        const activeMarker = isActive ? '<span style="color:#ffcc00; margin-right:5px">▶</span>' : '';

        // Dot stato presenza
        let statusDot = '';
        if (team.ownerUid) {
            if (isOnline) {
                // Verde: online
                statusDot = `<span title="Online" style="color:#00ff00; cursor:default; margin-right:5px">●</span>`;
            } else {
                // Rosso: offline, click per nudge
                statusDot = `<span title="Offline - Clicca per sollecitare" 
                                   style="color:#ff4444; cursor:pointer; margin-right:5px"
                                   onclick="event.stopPropagation(); window.sendNudge('${team.ownerUid}', '${team.name}')">●</span>`;
            }
        }

        // ── HTML colonna completa ───────────────────────────────────────
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

/**
 * Renderizza il roster di una squadra con layout fisso a 25 slot
 * 
 * Sistema slot fissi:
 * - Slot 0-2:   Portieri (P)
 * - Slot 3-10:  Difensori (D)
 * - Slot 11-18: Centrocampisti (C)
 * - Slot 19-24: Attaccanti (A)
 * 
 * I giocatori vengono inseriti nei rispettivi slot in ordine di acquisizione.
 * Gli slot vuoti mostrano hint del ruolo (...).
 * 
 * Questo layout permette di vedere a colpo d'occhio:
 * - Quali slot sono pieni
 * - Quali ruoli mancano ancora
 * - Progressione della rosa
 * 
 * @function renderMatrixRosterFixed
 * @param {Array} roster - Array di oggetti {playerId, cost} nel roster
 * @returns {string} HTML string del roster completo (25 <li>)
 * 
 * @example
 * const rosterHTML = renderMatrixRosterFixed([
 *   {playerId: 101, cost: 50},
 *   {playerId: 205, cost: 30}
 * ]);
 * // Ritorna HTML con 25 <li>, 2 pieni e 23 vuoti
 */
export function renderMatrixRosterFixed(roster) {
    // ── Inizializzazione struttura slot ─────────────────────────────────
    const slots = Array(25).fill(null);

    // Definizione limiti per ruolo
    const limits = {
        P: { start: 0, count: 3 },   // Slot 0-2
        D: { start: 3, count: 8 },   // Slot 3-10
        C: { start: 11, count: 8 },   // Slot 11-18
        A: { start: 19, count: 6 }    // Slot 19-24
    };

    // Puntatori per tracciare prossimo slot disponibile per ruolo
    const pointers = { P: 0, D: 0, C: 0, A: 0 };

    // ── Assegnazione giocatori a slot ───────────────────────────────────
    roster.forEach(item => {
        // Recupera dati completi giocatore
        const p = state.players.find(x => x.id === item.playerId);
        if (!p) return;  // Giocatore non trovato (non dovrebbe succedere)

        const role = p.role;
        const limit = limits[role];

        // Inserisci nel prossimo slot disponibile per questo ruolo
        if (limit && pointers[role] < limit.count) {
            const slotIndex = limit.start + pointers[role];
            slots[slotIndex] = { ...item, ...p };  // Merge dati roster + giocatore
            pointers[role]++;
        } else {
            console.warn("Roster overflow for role " + role);
        }
    });

    // ── Rendering HTML slots ────────────────────────────────────────────
    return slots.map((slot, i) => {
        if (slot) {
            // Slot pieno: mostra nome e valore
            return `
                <li class="roster-item role-${slot.role}">
                    <span class="roster-name">${slot.name}</span>
                    <span class="roster-cost">${slot.cost}</span>
                </li>
             `;
        } else {
            // Slot vuoto: mostra hint ruolo
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

/**
 * Aggiorna la card grande del giocatore selezionato
 * 
 * La card mostra:
 * - Immagine giocatore (da fantacalcio.it)
 * - Nome completo
 * - Squadra reale (es: Inter, Milan)
 * - Ruolo con badge colorato
 * - FVM (Fantamilioni - costo)
 * - Pulsanti Conferma/Annulla (solo se è il proprio turno)
 * 
 * Gestione permessi pulsanti:
 * - Visibili solo se: isHost O è il turno dell'utente corrente
 * - Nascosti per spettatori
 * 
 * @function updateStage
 * @param {Object|null} player - Oggetto giocatore o null per reset
 * @returns {void}
 * 
 * @example
 * // Mostra giocatore selezionato
 * updateStage({id: 101, name: "Lautaro", team: "Inter", role: "A", cost: 50});
 * 
 * // Reset card (nessuna selezione)
 * updateStage(null);
 */
export function updateStage(player) {
    // Riferimenti elementi DOM
    const card = document.getElementById('active-player-card');
    const nameEl = document.getElementById('active-player-name');
    const teamEl = document.getElementById('active-player-team');
    const roleEl = document.getElementById('active-player-role');
    const fvmEl = document.getElementById('active-player-fvm');

    if (player) {
        // ── Giocatore selezionato: mostra dati ─────────────────────────
        nameEl.textContent = player.name;
        teamEl.textContent = player.team;
        roleEl.textContent = player.role;
        roleEl.className = `role-badge large role-${player.role}`;
        fvmEl.textContent = `FVM: ${player.cost}`;

        card.style.opacity = 1;  // Card completamente opaca

        // Immagine giocatore da fantacalcio.it
        const imgEl = document.getElementById('active-player-img');
        if (imgEl) {
            imgEl.src = `https://content.fantacalcio.it/web/campioncini/20/card/${player.id}.png`;
            imgEl.classList.remove('hidden');
        }

        // ── Gestione visibilità pulsanti Conferma/Annulla ──────────────
        const controls = document.getElementById('host-bid-controls');
        if (controls) {
            let canPick = state.isHost;  // Host può sempre confermare

            // Verifica se è il turno dell'utente corrente
            if (!canPick && state.roomData && state.roomData.draftOrder) {
                const currentTeamId = state.roomData.draftOrder[state.roomData.currentTurnIndex];
                const currentTeam = state.roomData.teams.find(t => t.id === currentTeamId);

                if (currentTeam && currentTeam.ownerUid === state.user.uid) {
                    canPick = true;
                }
            }

            controls.style.display = canPick ? 'flex' : 'none';
        }

    } else {
        // ── Nessun giocatore: reset card ───────────────────────────────
        nameEl.textContent = "Seleziona Giocatore";
        teamEl.textContent = "-";
        roleEl.textContent = "?";
        roleEl.className = `role-badge large`;
        fvmEl.textContent = "FVM: -";
        card.style.opacity = 0.5;  // Card semi-trasparente

        // Immagine placeholder
        const imgEl = document.getElementById('active-player-img');
        if (imgEl) {
            imgEl.src = 'icons/0000.png';
            imgEl.classList.remove('hidden');
        }

        // Nascondi pulsanti
        const controls = document.getElementById('host-bid-controls');
        if (controls) controls.style.display = 'none';
    }
}

/**
 * Renderizza il roster di un utente (funzione legacy, non utilizzata)
 * 
 * Questa funzione era usata in una versione precedente dell'UI.
 * Mantenuta per retrocompatibilità e possibile uso futuro.
 * 
 * Attualmente il roster viene visualizzato tramite renderTeamsMatrix()
 * che usa renderMatrixRosterFixed() con layout a slot fissi.
 * 
 * @function renderRoster
 * @param {Object} userData - Dati utente con roster
 * @param {Array} userData.roster - Array di pick {playerId, cost}
 * @param {number} userData.credits - Crediti rimanenti
 * @returns {void}
 * 
 * @deprecated Sostituita da renderTeamsMatrix + renderMatrixRosterFixed
 */
export function renderRoster(userData) {
    const rosterDiv = document.getElementById('user-roster');
    rosterDiv.innerHTML = '';

    // Aggiorna info header
    document.getElementById('user-credits').textContent = userData.credits;
    document.getElementById('user-slots').textContent = `${userData.roster.length}/25`;

    // ── Ordinamento per ruolo (P > D > C > A) ───────────────────────────
    const order = { 'P': 1, 'D': 2, 'C': 3, 'A': 4 };
    const sorted = [...userData.roster].sort((a, b) => {
        const pA = state.players.find(p => p.id === a.playerId) || { role: '?' };
        const pB = state.players.find(p => p.id === b.playerId) || { role: '?' };
        return order[pA.role] - order[pB.role];
    });

    // ── Rendering lista ─────────────────────────────────────────────────
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
