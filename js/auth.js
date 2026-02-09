// ============================================================================
// MODULO: Autenticazione Utente
// ============================================================================
// Gestisce l'intero ciclo di vita dell'autenticazione dell'applicazione:
// - Login tramite Google OAuth 2.0
// - Monitoraggio dello stato di autenticazione in tempo reale
// - Logout e pulizia sessione
// - Aggiornamento UI con dati utente
// ============================================================================

// Import SDK Firebase per autenticazione
import { auth, googleProvider, signInWithPopup, onAuthStateChanged, signOut } from './firebase-modules.js';

// Import moduli interni dell'applicazione
import { state } from './state.js';                                              // Stato globale
import { showToast, switchView } from './utils.js';                              // Utilità UI
import { verifyAppVersion } from './version-check.js';                           // Controllo versione
import { initializeFCM, checkAndShowNotificationModal } from './notifications.js'; // Sistema notifiche
import { loadRecentRooms } from './room-manager.js';                             // Gestione stanze

/**
 * Inizializza il sistema di autenticazione Firebase
 * 
 * Configura un observer sul cambiamento dello stato di autenticazione Firebase.
 * Quando l'utente effettua login/logout, questa funzione gestisce automaticamente:
 * - La transizione tra le schermate login/dashboard
 * - Il caricamento delle stanze recenti dell'utente
 * - L'inizializzazione del sistema di notifiche push (FCM)
 * - Il controllo della versione dell'applicazione
 * 
 * @function initAuth
 * @returns {void}
 * 
 * @fires onAuthStateChanged - Attiva il callback ogni volta che lo stato auth cambia
 * 
 * @example
 * // Chiamata tipica all'avvio dell'app
 * initAuth();
 */
export function initAuth() {
    // Registra un observer che viene chiamato ogni volta che lo stato di autenticazione cambia
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // ── Utente autenticato ──────────────────────────────────────────

            // Verifica se è disponibile una nuova versione dell'app
            verifyAppVersion();

            // Salva l'utente nello stato globale dell'applicazione
            state.user = user;

            // Aggiorna nome e avatar nella UI
            updateUserInfo(user);

            // Passa alla vista dashboard (schermata principale)
            switchView('dashboard');

            // Carica le stanze recenti a cui l'utente ha partecipato
            loadRecentRooms(user.uid);

            // Mostra un messaggio di benvenuto
            showToast(`Benvenuto, ${user.displayName}!`);

            // Inizializza Firebase Cloud Messaging per le notifiche push
            // Registra il service worker e richiede il token FCM
            initializeFCM();

            // Mostra la modal per richiedere i permessi di notifica (solo al primo accesso)
            checkAndShowNotificationModal();

        } else {
            // ── Utente non autenticato ──────────────────────────────────────

            // Rimuove l'utente dallo stato globale
            state.user = null;

            // Torna alla schermata di login
            switchView('login');
        }
    });
}

/**
 * Aggiorna gli elementi della UI con le informazioni dell'utente autenticato
 * 
 * Popola i campi nome e avatar presenti nell'header dell'applicazione
 * con i dati provenienti dal profilo Google dell'utente.
 * 
 * @function updateUserInfo
 * @param {firebase.User} user - Oggetto utente Firebase contenente displayName e photoURL
 * @returns {void}
 * 
 * @example
 * updateUserInfo(firebaseUser);
 * // Aggiorna #user-name => "Mario Rossi"
 * // Aggiorna #user-avatar => "https://lh3.googleusercontent.com/..."
 */
export function updateUserInfo(user) {
    // Aggiorna il nome visualizzato nell'header
    document.getElementById('user-name').textContent = user.displayName;

    // Aggiorna l'immagine del profilo nell'header
    document.getElementById('user-avatar').src = user.photoURL;
}

/**
 * Configura gli event listener per i pulsanti di autenticazione
 * 
 * Collega i gestori di eventi ai pulsanti HTML per:
 * - Login: apre popup OAuth di Google e gestisce il flusso di autenticazione
 * - Logout: termina la sessione Firebase e riporta l'utente alla schermata login
 * 
 * Questa funzione deve essere chiamata una sola volta durante l'inizializzazione
 * dell'applicazione (tipicamente in app.js al DOMContentLoaded).
 * 
 * @function setupAuthListeners
 * @returns {void}
 * 
 * @example
 * // In app.js
 * setupAuthListeners();
 */
export function setupAuthListeners() {
    // ── Pulsante Login con Google ───────────────────────────────────────
    document.getElementById('btn-login-google').addEventListener('click', async () => {
        try {
            // Apre il popup di autenticazione Google OAuth 2.0
            // Se il login ha successo, onAuthStateChanged verrà attivato automaticamente
            await signInWithPopup(auth, googleProvider);

        } catch (error) {
            // Gestione errori (popup chiuso, permessi negati, rete offline, ecc.)
            console.error(error);
            showToast('Errore Login: ' + error.message);
        }
    });

    // ── Pulsante Logout ─────────────────────────────────────────────────
    document.getElementById('btn-logout').addEventListener('click', () => {
        // Termina la sessione Firebase
        // onAuthStateChanged verrà chiamato con user = null
        signOut(auth);
    });
}
