// ============================================================================
// MODULO: Lobby e Preparazione Draft
// ============================================================================
// Gestisce l'interfaccia della lobby pre-draft e l'assegnazione delle squadre.
// Funzionalità principali:
// - Visualizzazione utenti connessi in tempo reale
// - Gestione nomi squadre (modificabili dall'host)
// - Assegnazione utenti alle squadre tramite click
// - Modal avanzata per gestione squadre (Team Manager)
// - Routing automatico tra lobby e draft in base allo stato della stanza
// - Preservazione del focus durante i re-render
// ============================================================================

// Import Firebase per aggiornamenti stanza
import { db, doc, updateDoc } from './firebase-modules.js';

// Import moduli interni
import { state, views } from './state.js';                  // Stato globale e riferimenti view
import { showToast, switchView } from './utils.js';         // Utility UI
import { renderPlayerList } from './player-filters.js';    // Rendering lista giocatori
import { updateDraftUI } from './ui-renderer.js';          // Aggiornamento UI draft

/**
 * Routing intelligente tra lobby e draft based sullo stato della stanza
 * 
 * Analizza lo stato della stanza e decide quale view mostrare:
 * - Se status = 'started' o 'drafting' → Mostra vista Draft
 * - Altrimenti → Mostra vista Lobby
 * 
 * Gestisce anche il rendering iniziale quando si cambia view.
 * 
 * @function renderLobbyOrDraft
 * @param {Object} data - Dati completi della stanza Firebase
 * @returns {void}
 * 
 * @example
 * // Chiamato automaticamente dal listener real-time della stanza
 * onSnapshot(roomRef, (snap) => {
 *   const data = snap.data();
 *   renderLobbyOrDraft(data);
 * });
 */
export function renderLobbyOrDraft(data) {
    if (data.status === 'started' || data.status === 'drafting') {
        // ── Modalità Draft ──────────────────────────────────────────────
        if (views.draft.classList.contains('hidden')) {
            switchView('draft');
            renderPlayerList(); // Rendering iniziale lista giocatori
        }
        updateDraftUI(data);

    } else {
        // ── Modalità Lobby ──────────────────────────────────────────────
        if (views.lobby.classList.contains('hidden')) {
            switchView('lobby');
        }
        renderLobby(data);
    }
}

/**
 * Renderizza l'intera interfaccia della lobby
 * 
 * Aggiorna:
 * - Contatore squadre nell'header
 * - Lista utenti connessi
 * - Griglia squadre con assegnazioni
 * 
 * @function renderLobby
 * @param {Object} data - Dati della stanza
 * @returns {void}
 */
export function renderLobby(data) {
    // Aggiorna contatore squadre nell'header
    document.getElementById('team-count-display').textContent = `(${data.teams.length})`;

    // Rendering componenti lobby
    renderConnectedUsers(data);
    renderTeamsGrid(data);
}

/**
 * Renderizza la lista degli utenti connessi alla stanza
 * 
 * Per ogni utente mostra:
 * - Nome (recuperato da participantNames o user object)
 * - Stato assegnazione (grigio se già assegnato a una squadra)
 * - Selezione visiva se cliccato dall'host
 * 
 * Solo l'host può cliccare sugli utenti non assegnati per selezionarli.
 * Dopo la selezione, l'host può cliccare su uno slot squadra per completare l'assegnazione.
 *
 * @function renderConnectedUsers
 * @param {Object} data - Dati della stanza
 * @returns {void}
 */
export function renderConnectedUsers(data) {
    const list = document.getElementById('lobby-connected-list');
    list.innerHTML = '';

    // Aggiorna contatore utenti connessi
    document.getElementById('connected-count').innerText = `(${data.connectedUsers.length})`;

    data.connectedUsers.forEach(u => {
        // Normalizza formato (supporta sia string UID che object {uid, name})
        const uid = typeof u === 'string' ? u : u.uid;

        // Verifica se l'utente è già assegnato a una squadra
        const isAssigned = data.teams.some(t => t.ownerUid === uid);

        // Crea elemento lista
        const li = document.createElement('li');
        li.className = `user-item ${isAssigned ? 'assigned' : ''}`;

        // Evidenzia utente selezionato (se host e non assegnato)
        if (!isAssigned && state.selectedUserUid === uid) {
            li.classList.add('selected');
        }

        // Recupera nome visualizzato dell'utente
        const userDisplayName = data.participantNames?.[uid] ||
            (typeof u === 'object' && u.name) || // Fallback formato vecchio
            (state.user.uid === uid ? state.user.displayName : `User ${uid.substring(0, 6)}`);

        li.innerHTML = `<span>${userDisplayName}</span>`;

        // ── Interazione Host: selezione utente ──────────────────────────
        if (state.isHost && !isAssigned) {
            li.addEventListener('click', () => {
                // Seleziona utente per assegnazione a squadra
                state.selectedUserUid = uid;

                // Re-render per mostrare selezione visiva
                renderConnectedUsers(state.roomData);
                renderTeamsGrid(state.roomData); // Mostra "Place here" sugli slot
            });
        }

        list.appendChild(li);
    });
}

/**
 * Renderizza la griglia delle squadre con sistema di preservazione del focus
 * 
 * Per ogni squadra mostra:
 * - Numero slot (Slot 1, Slot 2, ...)
 * - Input modificabile per il nome squadra (solo host)
 * - Proprietario assegnato o "Non assegnato"
 * - Highlight se è lo slot target per l'assegnazione
 * 
 * Sistema di preservazione focus:
 * Prima del re-render, salva quale input aveva il focus e la posizione del cursore.
 * Dopo il re-render, ripristina il focus sullo stesso input alla stessa posizione.
 * Questo evita che l'utente perda il focus mentre digita durante gli aggiornamenti real-time.
 * 
 * @function renderTeamsGrid
 * @param {Object} data - Dati della stanza
 * @returns {void}
 */
export function renderTeamsGrid(data) {
    const grid = document.getElementById('lobby-teams-grid');

    // ── Preservazione Focus ─────────────────────────────────────────────
    // Salva quale input era focalizzato e la posizione del cursore
    let focusedElementId = null;
    let focusedCursorPos = null;
    if (document.activeElement &&
        document.activeElement.tagName === 'INPUT' &&
        document.activeElement.classList.contains('team-name-edit')) {
        focusedElementId = document.activeElement.id;
        focusedCursorPos = document.activeElement.selectionStart;
    }

    grid.innerHTML = '';

    // ── Rendering slot squadre ──────────────────────────────────────────
    data.teams.forEach((team, index) => {
        const div = document.createElement('div');
        div.className = 'team-slot';

        // Highlight se è il target per l'assegnazione corrente
        if (state.selectedUserUid && !team.ownerUid) {
            div.classList.add('active-assignment');
        }

        // ID univoco per l'input (usato per preservare il focus)
        const inputId = `team-input-${index}`;

        div.innerHTML = `
            <div>
                <h4>Slot ${index + 1}</h4>
                <input type="text" 
                       id="${inputId}" 
                       class="team-name-edit" 
                       value="${team.name}" 
                       ${state.isHost ? '' : 'disabled'}>
            </div>
            <div class="team-owner">
                ${team.ownerName ? `👤 ${team.ownerName}` : '<i>Non assegnato</i>'}
            </div>
        `;

        // ── Interazioni Host ────────────────────────────────────────────
        if (state.isHost) {
            const input = div.querySelector('input');

            // Aggiornamento nome squadra quando si esce dall'input
            input.addEventListener('change', (e) => {
                updateTeamName(index, e.target.value);
            });

            // Click su slot per assegnare utente selezionato
            div.addEventListener('click', (e) => {
                // Ignora click sull'input (per permettere editing)
                if (e.target.tagName === 'INPUT') return;

                // Se c'è un utente selezionato e lo slot è libero, assegna
                if (state.selectedUserUid && !team.ownerUid) {
                    assignUserToTeam(index, state.selectedUserUid);
                }
            });
        }

        grid.appendChild(div);
    });

    // ── Ripristino Focus ────────────────────────────────────────────────
    // Ripristina il focus sull'input che lo aveva prima del re-render
    if (focusedElementId) {
        const el = document.getElementById(focusedElementId);
        if (el) {
            el.focus();
            // Ripristina anche la posizione del cursore
            if (typeof focusedCursorPos === 'number') {
                el.setSelectionRange(focusedCursorPos, focusedCursorPos);
            }
        }
    }
}

/**
 * Aggiorna il nome di una squadra su Firebase
 * 
 * @function updateTeamName
 * @param {number} index - Indice della squadra nell'array teams
 * @param {string} newName - Nuovo nome da assegnare
 * @returns {Promise<void>}
 * 
 * @example
 * updateTeamName(0, 'I Campioni'); // Rinomina la prima squadra
 */
export async function updateTeamName(index, newName) {
    const roomRef = doc(db, 'rooms', state.currentRoomId);
    const newTeams = [...state.roomData.teams];
    newTeams[index].name = newName;
    await updateDoc(roomRef, { teams: newTeams });
}

/**
 * Assegna un utente a una squadra su Firebase
 * 
 * Aggiorna sia l'UID che il nome visualizzato del proprietario.
 * Resetta la selezione utente dopo l'assegnazione.
 * 
 * @function assignUserToTeam
 * @param {number} teamIndex - Indice della squadra nell'array teams
 * @param {string} userUid - UID Firebase dell'utente da assegnare
 * @returns {Promise<void>}
 * 
 * @example
 * assignUserToTeam(2, 'abc123xyz'); // Assegna utente alla terza squadra
 */
export async function assignUserToTeam(teamIndex, userUid) {
    // Recupera nome utente da participantNames o fallback
    const userName = state.roomData.participantNames?.[userUid] ||
        (state.user.uid === userUid ? state.user.displayName : `User ${userUid.substring(0, 4)}`);

    const roomRef = doc(db, 'rooms', state.currentRoomId);
    const newTeams = [...state.roomData.teams];
    newTeams[teamIndex].ownerUid = userUid;
    newTeams[teamIndex].ownerName = userName;

    await updateDoc(roomRef, { teams: newTeams });

    // Reset selezione utente
    state.selectedUserUid = null;
}

/**
 * Salva le modifiche dalla modal Team Manager su Firebase
 * 
 * Permette di modificare:
 * - Nome squadra
 * - Utente assegnato (con validazione per evitare doppi assegnamenti)
 * 
 * @function saveTeamManager
 * @returns {Promise<void>}
 */
export async function saveTeamManager() {
    const teamId = document.getElementById('tm-team-id').value;
    const name = document.getElementById('tm-team-name').value;
    const userId = document.getElementById('tm-user-select').value;

    // Trova squadra da modificare
    const teamIndex = state.roomData.teams.findIndex(t => t.id === teamId);
    if (teamIndex === -1) return;

    const newTeams = [...state.roomData.teams];
    newTeams[teamIndex].name = name;

    // Assegna nuovo proprietario se selezionato
    if (userId) {
        const userName = state.roomData.participantNames?.[userId] ||
            (userId === state.user.uid ? state.user.displayName : `User ${userId.substring(0, 6)}`);

        newTeams[teamIndex].ownerUid = userId;
        newTeams[teamIndex].ownerName = userName;
    }

    try {
        await updateDoc(doc(db, 'rooms', state.currentRoomId), { teams: newTeams });
        showToast("Squadra aggiornata!");
        document.getElementById('modal-team-manager').classList.add('hidden');
    } catch (err) {
        console.error(err);
        showToast("Errore aggiornamento");
    }
}

/**
 * Gestisce il click su una squadra per aprire la modal Team Manager (solo host)
 * 
 * Funzione globale chiamabile dal template HTML.
 * Popola la select con gli utenti connessi, disabilitando quelli già assegnati ad altre squadre.
 * 
 * @function assignTeam
 * @param {string} teamId - ID della squadra da gestire
 * @global
 */
window.assignTeam = function (teamId) {
    if (!state.isHost) return;

    const team = state.roomData.teams.find(t => t.id === teamId);
    if (!team) return;

    // ── Popola campi modal ──────────────────────────────────────────────
    document.getElementById('tm-team-id').value = team.id;
    document.getElementById('tm-team-name').value = team.name;

    const select = document.getElementById('tm-user-select');
    select.innerHTML = '<option value="">-- Seleziona Utente --</option>';

    // ── Popola select utenti ────────────────────────────────────────────
    state.roomData.connectedUsers.forEach(uid => {
        // Verifica se l'utente è già assegnato a un'ALTRA squadra
        const otherTeamOwner = state.roomData.teams.find(t => t.ownerUid === uid && t.id !== team.id);

        const opt = document.createElement('option');
        opt.value = uid;

        const userName = state.roomData.participantNames?.[uid] ||
            (uid === state.user.uid ? state.user.displayName : `User ${uid.substring(0, 6)}`);

        let label = userName;

        // Disabilita se già assegnato altrove
        if (otherTeamOwner) {
            label += ` (Già su ${otherTeamOwner.name})`;
            opt.disabled = true;
        }

        opt.textContent = label;
        if (uid === team.ownerUid) opt.selected = true; // Preseleziona owner corrente
        select.appendChild(opt);
    });

    // Aggiungi host come fallback se non in connectedUsers
    if (!state.roomData.connectedUsers.includes(state.user.uid)) {
        const opt = document.createElement('option');
        opt.value = state.user.uid;
        opt.textContent = `${state.user.displayName || 'Me'} (Host)`;
        if (state.user.uid === team.ownerUid) opt.selected = true;
        select.appendChild(opt);
    }

    // Mostra modal
    document.getElementById('modal-team-manager').classList.remove('hidden');
}

/**
 * Configura gli event listener per la lobby
 * 
 * Collega il pulsante "Salva" della modal Team Manager.
 * Da chiamare durante l'inizializzazione dell'app.
 * 
 * @function setupLobbyListeners
 * @returns {void}
 * 
 * @example
 * // In app.js durante DOMContentLoaded
 * setupLobbyListeners();
 */
export function setupLobbyListeners() {
    document.getElementById('btn-tm-save').addEventListener('click', saveTeamManager);
}
