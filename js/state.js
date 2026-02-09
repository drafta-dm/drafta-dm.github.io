// ============================================================================
// MODULO: Gestione Stato Globale
// ============================================================================
// Modulo centrale per lo stato dell'applicazione Drafta.
// Contiene tutte le variabili di stato condivise tra i diversi moduli.
// 
// Categorie stato:
// - Autenticazione: dati utente corrente
// - Stanza: ID, dati, ruolo (host/partecipante)
// - Draft: giocatori disponibili, storico scelte
// - UI: selezioni temporanee, flag modal
// - Sistema: service worker, heartbeat, presenza
// ============================================================================

/**
 * Oggetto stato globale dell'applicazione
 * 
 * Questo è l'unico punto centralizzato per lo stato dell'app.
 * Tutti i moduli importano e modificano questo oggetto condiviso.
 * 
 * @constant {Object} state
 * @property {Object|null} user - Utente Firebase autenticato (da onAuthStateChanged)
 * @property {string|null} currentRoomId - ID della stanza corrente (es: "AB12")
 * @property {boolean} isHost - true se l'utente è host della stanza corrente
 * @property {Object|null} roomData - Dati completi della stanza da Firebase
 * @property {Array} players - Array giocatori caricati da player-service
 * @property {Array} draftHistory - Storico scelte draft (non utilizzato attualmente)
 * @property {string|null} selectedUserUid - UID utente selezionato in lobby per assegnazione squadra
 * @property {string|null} lastTurnOwner - UID owner del turno precedente (per confronti)
 * @property {number|null} lastNudgeTimestamp - Timestamp ultima notifica nudge ricevuta
 * @property {ServiceWorkerRegistration|null} swRegistration - Registrazione service worker FCM
 * @property {Function|null} presenceCleanup - Funzione cleanup presenza (rimuove heartbeat)
 * @property {number|null} heartbeatInterval - ID interval heartbeat presenza (clearInterval)
 * @property {boolean} hasShownOrderModal - Flag per mostrare modal ordine turni una sola volta
 */
export const state = {
    // ── Autenticazione ──────────────────────────────────────────────────
    user: null,                      // Oggetto user Firebase (uid, displayName, email, photoURL)

    // ── Stanza Corrente ─────────────────────────────────────────────────
    currentRoomId: null,             // ID stanza (es: "AB12", "XY34")
    isHost: false,                   // true se utente è creator/host della stanza
    roomData: null,                  // Snapshot completo documento Firebase rooms/{roomId}

    // ── Draft e Giocatori ───────────────────────────────────────────────
    players: [],                     // Array di oggetti giocatore caricati da player-service
    draftHistory: [],                // Storico pick (non utilizzato attualmente)

    // ── Stato UI Temporaneo ─────────────────────────────────────────────
    selectedUserUid: null,           // Utente cliccato in lobby (per assegnare a squadra)
    lastTurnOwner: null,             // Owner del turno precedente (per confronti/notifiche)
    lastNudgeTimestamp: null,        // Timestamp ultima notifica nudge (previene duplicati)

    // ── Service Worker e Notifiche ──────────────────────────────────────
    swRegistration: null,            // ServiceWorkerRegistration per FCM getToken()

    // ── Sistema Presenza e Heartbeat ────────────────────────────────────
    presenceCleanup: null,           // Funzione da chiamare per cleanup presenza su exit
    heartbeatInterval: null,         // ID interval (da clearInterval quando si esce)

    // ── Flag Modal ──────────────────────────────────────────────────────
    hasShownOrderModal: false        // Previene apertura ripetuta modal ordine turni
};

/**
 * Riferimenti agli elementi DOM delle view principali
 * 
 * Questi riferimenti vengono caricati una sola volta all'inizializzazione
 * per evitare ripetuti getElementById() durante le transizioni.
 * 
 * @constant {Object} views
 * @property {HTMLElement} login - View login con pulsante Google Sign-In
 * @property {HTMLElement} dashboard - View dashboard con crea/join stanza
 * @property {HTMLElement} lobby - View lobby pre-draft con assegnazione squadre
 * @property {HTMLElement} draft - View draft con lista giocatori e matrice squadre
 */
export const views = {
    login: document.getElementById('view-login'),
    dashboard: document.getElementById('view-dashboard'),
    lobby: document.getElementById('view-lobby'),
    draft: document.getElementById('view-draft')
};
