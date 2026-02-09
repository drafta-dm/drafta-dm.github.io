// ============================================================================
// MODULO: Filtri e Ricerca Giocatori
// ============================================================================
// Gestisce il sistema di filtri e ricerca per la lista giocatori disponibili.
// Permette di:
// - Filtrare giocatori per ruolo (P, D, C, A)
// - Cercare giocatori per nome
// - Nascondere giocatori già assegnati o con ruoli completi
// - Visualizzare messaggi di stato (lista vuota, draft completato)
// ============================================================================

// Import moduli interni
import { state } from './state.js';                          // Stato globale (players, roomData)
import { selectPlayerForAuction } from './draft-logic.js';   // Funzione per selezionare giocatore

/**
 * Renderizza la lista dei giocatori disponibili applicando filtri e ricerca
 * 
 * Logica di funzionamento:
 * 1. Filtra i giocatori escludendo quelli già assegnati a squadre
 * 2. Applica filtro per ruolo se specificato (P/D/C/A)
 * 3. Applica ricerca testuale sul nome del giocatore
 * 4. Ordina per costo decrescente (giocatori più costosi in cima)
 * 5. Crea gli elementi HTML <li> con badge ruolo, nome, squadra e valore
 * 6. Aggiunge event listener per selezione al click
 * 
 * @function renderPlayerList
 * @param {string} [filterRole='all'] - Ruolo da filtrare: 'all', 'P', 'D', 'C', 'A'
 * @param {string} [searchTerm=''] - Termine di ricerca per il nome (case-insensitive)
 * @returns {void}
 * 
 * @example
 * renderPlayerList('D', 'ronaldo'); // Mostra solo difensori con "ronaldo" nel nome
 * renderPlayerList();               // Mostra tutti i giocatori disponibili
 */
export function renderPlayerList(filterRole = 'all', searchTerm = '') {
    const list = document.getElementById('player-list');
    list.innerHTML = '';

    // ── Applicazione filtri ─────────────────────────────────────────────
    let players = state.players.filter(p => {
        // Esclude giocatori già assegnati a qualsiasi squadra
        const isAssigned = state.roomData.teams.some(t => t.roster && t.roster.some(r => String(r.playerId) === String(p.id)));
        if (isAssigned) return false;

        // Filtro per ruolo
        if (filterRole !== 'all' && p.role !== filterRole) return false;

        // Filtro per nome (ricerca case-insensitive)
        if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;

        return true;
    });

    // Ordina per valore decrescente (più costosi in cima)
    players.sort((a, b) => b.cost - a.cost);

    // ── Creazione elementi lista ────────────────────────────────────────
    players.forEach(p => {
        const li = document.createElement('li');
        li.className = 'player-item';
        li.dataset.id = p.id;
        li.dataset.role = p.role; // Attributo data per filtering dinamico

        // Determina il colore CSS del badge ruolo
        const roleColorClass = p.role === 'P' ? 'gk' : p.role === 'D' ? 'def' : p.role === 'C' ? 'mid' : 'att';

        li.innerHTML = `
            <span class="p-role-badge role-${p.role}" style="background:var(--role-${roleColorClass})">${p.role}</span>
            <div class="p-info">
                <span class="p-name">${p.name}</span>
                <span class="p-team">${p.team}</span>
            </div>
            <span class="p-value">${p.cost}</span>
        `;

        // Event listener per selezione giocatore
        li.addEventListener('click', () => {
            selectPlayerForAuction(p.id);
        });

        list.appendChild(li);
    });
}

/**
 * Aggiorna la visibilità degli elementi giocatore già presenti nel DOM
 * 
 * Utilizzato per nascondere/mostrare giocatori senza rifare il rendering completo.
 * Applica le classi CSS 'hidden' in base a:
 * - Giocatori già presi da squadre
 * - Ruoli che devono essere nascosti (es. squadra ha completato tutti i portieri)
 * 
 * Se tutti i giocatori sono nascosti, mostra un messaggio di stato appropriato.
 * 
 * @function updatePlayerListVisuals
 * @param {Set<string>} takenIds - Set di ID giocatori già assegnati
 * @param {Array<string>} [hiddenRoles=[]] - Array di ruoli da nascondere ('P', 'D', 'C', 'A')
 * @returns {void}
 * 
 * @example
 * const taken = new Set(['101', '102', '103']);
 * const hidden = ['P', 'D']; // Nascondi portieri e difensori
 * updatePlayerListVisuals(taken, hidden);
 */
export function updatePlayerListVisuals(takenIds, hiddenRoles = []) {
    const items = document.querySelectorAll('.player-item');

    // ── Nascondi giocatori presi o con ruolo nascosto ───────────────────
    items.forEach(item => {
        const isTaken = takenIds.has(item.dataset.id);
        const isHiddenRole = hiddenRoles.includes(item.dataset.role);

        if (isTaken || isHiddenRole) {
            item.classList.add('hidden');
        } else {
            item.classList.remove('hidden');
        }
    });

    // ── Gestione messaggio lista vuota ──────────────────────────────────
    const visible = document.querySelectorAll('.player-item:not(.hidden)');
    const msgEl = document.getElementById('list-status-msg');

    if (visible.length === 0) {
        // Determina il messaggio appropriato
        const message = hiddenRoles.length >= 4
            ? "Draft Completato! 🎉"                              // Tutti ruoli completi
            : "Nessun giocatore disponibile per i ruoli richiesti."; // Solo alcuni ruoli esauriti

        if (!msgEl) {
            // Crea il messaggio se non esiste
            const msg = document.createElement('div');
            msg.id = 'list-status-msg';
            msg.style.padding = '20px';
            msg.style.textAlign = 'center';
            msg.style.color = '#888';
            msg.textContent = message;

            const container = document.querySelector('.player-list-container');
            if (container) {
                container.appendChild(msg);
            }
        } else {
            // Aggiorna il messaggio esistente
            msgEl.textContent = message;
            msgEl.style.display = 'block';
        }
    } else {
        // Nascondi il messaggio se ci sono giocatori visibili
        if (msgEl) msgEl.style.display = 'none';
    }
}

/**
 * Configura gli event listener per i controlli di filtro e ricerca
 * 
 * Collega:
 * - Clic sui tab ruolo (P, D, C, A, Tutti) -> filtra la lista
 * - Input nella barra di ricerca -> filtra per nome in tempo reale
 * 
 * Questa funzione deve essere chiamata una sola volta durante l'inizializzazione.
 * 
 * @function setupFilters
 * @returns {void}
 * 
 * @example
 * // In app.js durante DOMContentLoaded
 * setupFilters();
 */
export function setupFilters() {
    // ── Tab filtro ruoli ────────────────────────────────────────────────
    document.querySelectorAll('.role-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Rimuove classe active da tutti i tab
            document.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));

            // Aggiunge active al tab cliccato
            e.target.classList.add('active');

            // Applica filtro ruolo + eventuali filtri di ricerca
            const role = e.target.dataset.role;
            const search = document.getElementById('search-player').value;
            renderPlayerList(role, search);
        });
    });

    // ── Input ricerca ───────────────────────────────────────────────────
    document.getElementById('search-player').addEventListener('input', (e) => {
        // Mantiene il filtro ruolo attivo mentre si digita
        const activeTab = document.querySelector('.role-tab.active');
        renderPlayerList(activeTab.dataset.role, e.target.value);
    });
}
