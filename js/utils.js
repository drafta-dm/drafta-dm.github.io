// ============================================================================
// MODULO: Funzioni di Utilità
// ============================================================================
// Collezione di helper functions riutilizzabili in tutta l'applicazione.
// 
// Categorie:
// - Navigazione: cambio view, redirect
// - Notifiche: toast, modal di errore
// - Generazione: ID stanze, colori
// - UI: utility varie per interfaccia
// ============================================================================

import { views } from './state.js';

/**
 * Cambia la view attiva dell'applicazione con transizione CSS
 * 
 * Gestisce il sistema di navigazione single-page dell'app.
 * Nasconde tutte le view e mostra solo quella richiesta.
 * 
 * Flusso:
 * 1. Rimuove classe 'active' da tutte le view
 * 2. Aggiunge classe 'hidden' a tutte le view
 * 3. Rimuove 'hidden' dalla view target
 * 4. Forza reflow per attivare transizioni CSS
 * 5. Aggiunge 'active' alla view target (trigger transizioni)
 * 
 * View disponibili:
 * - 'login': Schermata login con Google
 * - 'dashboard': Dashboard con crea/join stanza
 * - 'lobby': Lobby pre-draft
 * - 'draft': Vista draft principale
 * 
 * @function switchView
 * @param {string} viewName - Nome della view da mostrare ('login' | 'dashboard' | 'lobby' | 'draft')
 * @returns {void}
 * 
 * @example
 * switchView('dashboard');  // Mostra dashboard
 * switchView('lobby');      // Mostra lobby
 */
export function switchView(viewName) {
    // Nascondi tutte le view
    Object.values(views).forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden');
    });

    // Mostra view target
    const target = views[viewName];
    target.classList.remove('hidden');

    // Forza reflow per attivare transizioni CSS
    void target.offsetWidth;

    // Attiva transizioni di entrata
    target.classList.add('active');
}

/**
 * Mostra un messaggio toast temporaneo in basso a destra
 * 
 * I toast sono notifiche non-invasive che scompaiono automaticamente.
 * Vengono usati per feedback utente (successo operazioni, errori lievi).
 * 
 * Caratteristiche:
 * - Durata fissa: 3 secondi
 * - Posizione: bottom-right (gestito da CSS)
 * - Multiple toast possono essere mostrati contemporaneamente (stack verticale)
 * - Auto-remove dopo timeout
 * 
 * @function showToast
 * @param {string} msg - Messaggio da mostrare nel toast
 * @returns {void}
 * 
 * @example
 * showToast("Stanza creata con successo!");
 * showToast("⚠️ Password errata");
 * showToast("✅ Giocatore assegnato");
 */
export function showToast(msg) {
    const container = document.getElementById('toast-container');

    // Crea elemento toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;

    // Aggiungi al container
    container.appendChild(toast);

    // Auto-remove dopo 3 secondi
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

/**
 * Genera un ID univoco casuale per una nuova stanza
 * 
 * Algoritmo:
 * 1. Genera numero random
 * 2. Converte in base-36 (0-9, a-z)
 * 3. Prende 6 caratteri dalla posizione 2 (salta "0.")
 * 4. Converte in maiuscolo
 * 
 * Risultato: ID di 6 caratteri alfanumerici maiuscoli (es: "AB12XY", "K3M9P2")
 * 
 * Probabilità collisione:
 * - 36^6 = 2,176,782,336 combinazioni possibili
 * - Con poche migliaia di stanze contemporanee, probabilità collisione ~0%
 * 
 * @function generateRoomId
 * @returns {string} ID stanza univoco di 6 caratteri maiuscoli
 * 
 * @example
 * const roomId = generateRoomId();  // "AB12XY"
 * console.log(roomId.length);       // 6
 */
export function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Ottiene un colore CSS per la visualizzazione della squadra
 * 
 * Attualmente ritorna un colore neutro per tutte le squadre.
 * Può essere esteso in futuro per assegnare colori diversi basati sull'ID.
 * 
 * Possibile implementazione futura:
 * - Hash dell'ID per selezionare da palette predefinita
 * - Assegnazione sequenziale da array di colori
 * - Colori personalizzabili dall'utente
 * 
 * @function getTeamColor
 * @param {string} id - ID della squadra (es: "team-1", "team-2")
 * @returns {string} Colore CSS (variabile CSS o hex/rgb)
 * 
 * @example
 * const color = getTeamColor('team-1');  // "var(--bg-surface)"
 */
export function getTeamColor(id) {
    // Placeholder: colore neutro per tutte le squadre
    // Possibile estensione: hash ID per selezionare da palette
    return 'var(--bg-surface)';
}

/**
 * Mostra una modal di errore grande e vistosa con effetto sonoro
 * 
 * Utilizzata per errori critici durante il draft che richiedono
 * attenzione immediata dell'utente (es: ordine ruoli non rispettato,
 * slot pieni, crediti insufficienti).
 * 
 * Caratteristiche:
 * - Fullscreen overlay con sfondo scuro
 * - Icona grande 🚫
 * - Bordo rosso e ombra colorata
 * - Suono di errore (best-effort, può fallire se permessi bloccati)
 * - Pulsante OK per chiudere
 * - Creazione lazy: modal viene creata solo al primo utilizzo
 * 
 * Differenza con toast:
 * - Toast: errori lievi, auto-dismissal, non bloccante
 * - Big Error: errori critici, richiede azione utente, bloccante
 * 
 * @function showBigError
 * @param {string} msg - Messaggio di errore da mostrare
 * @returns {void}
 * 
 * @example
 * showBigError("Devi completare i portieri prima!");
 * showBigError("Slot Difensori completi!");
 * showBigError("Crediti insufficienti!");
 */
export function showBigError(msg) {
    // ── Creazione lazy della modal ─────────────────────────────────────
    let modal = document.getElementById('modal-error-big');

    if (!modal) {
        // Crea modal al primo utilizzo
        modal = document.createElement('div');
        modal.id = 'modal-error-big';

        // Stile inline per garantire massima visibilità
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); display:flex; align-items:center; justify-content:center; z-index:9999;';

        modal.innerHTML = `
            <div style="background:#1a1a1a; padding:2rem; border-radius:1rem; border:2px solid #ff4444; max-width:400px; text-align:center; box-shadow:0 20px 60px rgba(255,68,68,0.5);">
                <div style="font-size:4rem; margin-bottom:1rem;">🚫</div>
                <h3 style="color:#ff4444; font-size:1.5rem; margin-bottom:1rem; font-weight:bold;">ATTENZIONE</h3>
                <p id="modal-error-text" style="color:white; font-size:1.1rem; margin-bottom:2rem; font-weight:500;"></p>
                <button onclick="document.getElementById('modal-error-big').style.display='none'" 
                        style="background:#ff4444; color:white; border:none; padding:0.75rem 2rem; border-radius:0.5rem; font-size:1rem; font-weight:bold; cursor:pointer; width:100%;">OK</button>
            </div>
        `;

        document.body.appendChild(modal);
    }

    // ── Aggiorna contenuto e mostra ────────────────────────────────────
    document.getElementById('modal-error-text').textContent = msg;
    modal.style.display = 'flex';

    // ── Effetto sonoro di errore ────────────────────────────────────────
    // Best-effort: potrebbe fallire se autoplay bloccato o connessione assente
    const audio = new Audio('https://actions.google.com/sounds/v1/alarms/error_buzzer.ogg');
    audio.volume = 0.5;
    audio.play().catch(e => {
        // Fallimento silenzioso: suono è opzionale
    });
}

/**
 * Reindirizza l'utente alla dashboard
 * 
 * Semplicemente un wrapper per switchView('dashboard').
 * Utilizzata principalmente in room-manager quando una stanza
 * viene eliminata o non esiste più.
 * 
 * Fornire una funzione dedicata migliora la leggibilità del codice
 * e permette di aggiungere logica aggiuntiva in futuro se necessario
 * (es: cleanup stato, reset variabili).
 * 
 * @function showDashboard
 * @returns {void}
 * 
 * @example
 * // In room-manager quando stanza non esiste
 * if (!docSnap.exists()) {
 *   showToast("La stanza non esiste più.");
 *   showDashboard();  // Torna alla dashboard
 * }
 */
export function showDashboard() {
    switchView('dashboard');
}
