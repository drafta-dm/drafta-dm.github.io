// ============================================================================
// MODULO: Controllo Versione Applicazione
// ============================================================================
// Sistema di aggiornamento automatico dell'applicazione.
// 
// Funzionamento:
// 1. Ogni volta che l'utente fa login, controlla version.json sul server
// 2. Confronta versione server con versione salvata in localStorage
// 3. Se diversa: disregistra service worker e forza reload
// 
// Questo assicura che gli utenti abbiano sempre l'ultima versione dell'app
// senza bisogno di hard refresh manuale (Ctrl+F5).
// ============================================================================

import { showToast } from './utils.js';

/**
 * Verifica se è disponibile una nuova versione dell'applicazione
 * 
 * Flusso completo:
 * 1. Fetcha /version.json con cache-busting (no-store + timestamp)
 * 2. Confronta version dal server con drafta_version in localStorage
 * 3. Se versioni diverse:
 *    a. Aggiorna localStorage con nuova versione
 *    b. Disregistra tutti i service worker per forzare aggiornamento
 *    c. Mostra toast di aggiornamento
 *    d. Ricarica pagina dopo 1.5s
 * 
 * Chiamata automaticamente:
 * - Al login (in auth.js dopo onAuthStateChanged)
 * 
 * Formato version.json:
 * ```json
 * {
 *   "version": "1.2.3"
 * }
 * ```
 * 
 * @function verifyAppVersion
 * @returns {Promise<void>}
 * 
 * @example
 * // All'interno di onAuthStateChanged
 * if (user) {
 *   verifyAppVersion(); // Controlla aggiornamenti disponibili
 *   // ...
 * }
 */
export async function verifyAppVersion() {
    try {
        // ── Fetch versione server ──────────────────────────────────────
        // Cache-busting con timestamp per evitare cache del browser
        const response = await fetch(`./version.json?t=${Date.now()}`, {
            cache: "no-store"  // Forza fetch dal server, bypassa cache HTTP
        });

        if (!response.ok) return;  // Errore network o file non trovato

        const data = await response.json();
        const serverVersion = data.version;

        // ── Lettura versione locale ────────────────────────────────────
        const localVersion = localStorage.getItem('drafta_version');

        // ── Confronto versioni ──────────────────────────────────────────
        if (serverVersion && serverVersion !== localVersion) {
            console.log(`New version found: ${serverVersion} (Local: ${localVersion})`);

            // Salva nuova versione in localStorage
            localStorage.setItem('drafta_version', serverVersion);

            // ── Disregistra Service Worker ─────────────────────────────
            // Necessario per forzare aggiornamento SW e cache
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
            }

            // ── Notifica e reload ───────────────────────────────────────
            showToast(`🚀 Aggiornamento a v${serverVersion} in corso...`);

            // Delay per permettere all'utente di leggere il toast
            setTimeout(() => {
                window.location.reload(true);  // Hard reload
            }, 1500);
        }

    } catch (e) {
        // Fallimento silenzioso: versione check non deve bloccare l'app
        console.error("Version check failed", e);
    }
}
