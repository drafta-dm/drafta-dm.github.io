// ============================================================================
// MODULO: Sistema Notifiche e Firebase Cloud Messaging
// ============================================================================
// Gestisce l'intero sistema di notifiche push dell'applicazione.
// Funzionalità principali:
// - Richiesta permessi di notifica con modal dedicata
// - Registrazione e gestione token FCM (Firebase Cloud Messaging)
// - Salvataggio token su Firestore per invio notifiche server-side
// - Gestione notifiche foreground (app aperta) e background
// - Notifiche turno draft e nudge utenti
// ============================================================================

// Import Firebase Cloud Messaging
import { messaging, getToken, onMessage } from './firebase-modules.js';
import { doc, setDoc, serverTimestamp } from './firebase-modules.js';
import { db } from './firebase-modules.js';

// Import moduli interni
import { state } from './state.js';            // Stato globale
import { showToast } from './utils.js';        // Notifiche toast in-app

/**
 * Controlla se mostrare la modal per richiedere i permessi di notifica
 * 
 * La modal viene mostrata solo se:
 * - Le notifiche sono supportate dal browser
 * - Il permesso è ancora "default" (non concesso né negato)
 * - L'utente non ha mai visto la richiesta prima (check localStorage)
 * 
 * Viene mostrata con un delay di 1 secondo per permettere prima il caricamento della dashboard.
 * 
 * @function checkAndShowNotificationModal
 * @returns {void}
 * 
 * @example
 * // Chiamato automaticamente dopo il login
 * checkAndShowNotificationModal();
 */
export function checkAndShowNotificationModal() {
    // Verifica supporto notifiche nel browser
    if (typeof Notification === 'undefined') return;

    // Controlla se abbiamo già chiesto in passato (persistenza tramite localStorage)
    const hasAsked = localStorage.getItem('drafta-notification-asked');

    // Mostra modal solo se necessario
    if (Notification.permission === 'default' && !hasAsked) {
        // Piccolo delay per permettere il caricamento della dashboard
        setTimeout(() => {
            document.getElementById('modal-notifications').classList.remove('hidden');
        }, 1000);
    }
}

/**
 * Abilita le notifiche richiedendo i permessi dell'utente
 * 
 * Flusso:
 * 1. Richiede permesso tramite API nativa Notification.requestPermission()
 * 2. Salva in localStorage che la richiesta è stata fatta (evita di richiederla ad ogni login)
 * 3. Chiude la modal
 * 4. Se concesso: richiede token FCM e mostra notifica di test
 * 5. Se negato: mostra istruzioni per abilitarle manualmente
 * 
 * @function enableNotifications
 * @returns {void}
 * 
 * @example
 * // Collegato al pulsante "Abilita" nella modal
 * enableNotifications();
 */
export function enableNotifications() {
    if (typeof Notification === 'undefined') {
        showToast('Notifiche non supportate su questo browser');
        return;
    }

    Notification.requestPermission().then(async permission => {
        // Salva che abbiamo chiesto (evita di rechiedere)
        localStorage.setItem('drafta-notification-asked', 'true');
        document.getElementById('modal-notifications').classList.add('hidden');

        if (permission === 'granted') {
            // ── Permesso concesso ───────────────────────────────────────
            showToast('✅ Notifiche abilitate!');

            // Richiedi token FCM per questo dispositivo
            await requestFCMToken();

            // Invia notifica di test per confermare funzionamento
            try {
                new Notification('Drafta', {
                    body: 'Notifiche abilitate correttamente! 🎉',
                    icon: 'icons/icon-192x192.png'
                });
            } catch (e) {
                console.log('Test notification failed:', e);
            }

        } else if (permission === 'denied') {
            // ── Permesso negato ─────────────────────────────────────────
            showToast('Notifiche bloccate. Puoi abilitarle dalle impostazioni del browser.');
        }
    }).catch(err => {
        // Gestione errori durante la richiesta permesso
        console.error('Notification error:', err);
        showToast('Errore richiesta notifiche');
        localStorage.setItem('drafta-notification-asked', 'true');
        document.getElementById('modal-notifications').classList.add('hidden');
    });
}

/**
 * Chiude la modal delle notifiche senza abilitarle (pulsante "Più tardi")
 * 
 * Salva comunque in localStorage che la modal è stata mostrata,
 * evitando di mostrarla di nuovo ai prossimi login.
 * 
 * @function closeNotificationModal
 * @returns {void}
 */
export function closeNotificationModal() {
    localStorage.setItem('drafta-notification-asked', 'true');
    document.getElementById('modal-notifications').classList.add('hidden');
    showToast('Puoi abilitare le notifiche in seguito dalle impostazioni del browser');
}

/**
 * Inizializza Firebase Cloud Messaging e registra il Service Worker
 * 
 * Operazioni eseguite:
 * 1. Registra il service worker (firebase-messaging-sw.js) con path dinamico
 * 2. Salva la registration nello stato globale per uso futuro
 * 3. Se i permessi sono già concessi, richiede subito il token FCM
 * 4. Configura listener per messaggi in foreground (app aperta)
 * 
 * Notifiche foreground:
 * - Mostra toast in-app con titolo e messaggio
 * - Crea anche notifica browser nativa se permessi concessi
 * 
 * @function initializeFCM
 * @returns {Promise<void>}
 * 
 * @example
 * // Chiamato automaticamente dopo il login
 * await initializeFCM();
 */
export async function initializeFCM() {
    if (!messaging) {
        console.log('FCM not supported on this browser');
        return;
    }

    // ── Registrazione Service Worker ───────────────────────────────────
    try {
        // Path dinamico per compatibilità GitHub Pages e localhost
        const swPath = window.location.pathname.includes('/games/drafta/')
            ? '/games/drafta/firebase-messaging-sw.js'
            : './firebase-messaging-sw.js';

        const registration = await navigator.serviceWorker.register(swPath);
        console.log('Service Worker registered:', registration);

        // Salva registration nello stato globale
        state.swRegistration = registration;

        // Se già autorizzati, richiedi token subito
        if (Notification.permission === 'granted') {
            await requestFCMToken();
        }

        // ── Gestione messaggi in foreground ────────────────────────────
        // Quando l'app è aperta e arriva una notifica
        onMessage(messaging, (payload) => {
            console.log('Foreground message received:', payload);

            const notificationTitle = payload.notification?.title || 'Drafta';
            const notificationBody = payload.notification?.body || 'Nuova notifica';

            // Mostra toast in-app
            showToast(`${notificationTitle}: ${notificationBody}`);

            // Mostra anche notifica browser nativa
            if (Notification.permission === 'granted') {
                new Notification(notificationTitle, {
                    body: notificationBody,
                    icon: 'icons/icon-192x192.png',
                    requireInteraction: true  // Rimane visibile finché non viene chiusa
                });
            }
        });

    } catch (err) {
        console.error('Service Worker registration failed:', err);
    }
}

/**
 * Richiede un token FCM unico per questo dispositivo/browser
 * 
 * Il token FCM è un identificativo univoco per questo dispositivo che permette
 * al server di inviare notifiche push direttamente a questo client.
 * 
 * Dopo aver ottenuto il token, lo salva su Firestore nella collezione
 * users/{uid}/fcmTokens/{token} per uso server-side.
 * 
 * @function requestFCMToken
 * @returns {Promise<void>}
 * 
 * @example
 * // Chiamato automaticamente dopo che i permessi sono concessi
 * await requestFCMToken();
 */
export async function requestFCMToken() {
    if (!messaging) return;

    try {
        // Ottieni token FCM da Firebase
        const currentToken = await getToken(messaging, {
            vapidKey: 'BBP4-oexEv80hhemDsV2cq6SoOdelDUh0I3fI-hbiSy2OpBTzL7YODA2fNFYhIQJB2LSsrCHWInAFQFyoha5i0E',
            serviceWorkerRegistration: state.swRegistration  // Usa la nostra registration
        });

        if (currentToken) {
            console.log('FCM Token obtained:', currentToken);
            // Salva su Firestore per invio notifiche server-side
            await saveFCMToken(currentToken);
        } else {
            console.log('No FCM registration token available');
        }
    } catch (err) {
        console.error('Error getting FCM token:', err);
    }
}

/**
 * Salva il token FCM su Firestore nella collezione dell'utente
 * 
 * Struttura documento:
 * users/{uid}/fcmTokens/{token}
 * - token: string (il token stesso)
 * - createdAt: timestamp
 * - lastUsed: timestamp (aggiornato ad ogni salvataggio)
 * - userAgent: string (info browser/dispositivo)
 * 
 * Questo permette al backend/Cloud Functions di:
 * - Inviare notifiche a tutti i dispositivi di un utente
 * - Tracciare quali token sono attivi
 * - Rimuovere token obsoleti
 * 
 * @function saveFCMToken
 * @param {string} token - Token FCM da salvare
 * @returns {Promise<void>}
 * 
 * @example
 * saveFCMToken('abc123xyz...');
 */
export async function saveFCMToken(token) {
    if (!state.user) return;

    try {
        // Percorso documento: users/{uid}/fcmTokens/{token}
        const tokenRef = doc(db, `users/${state.user.uid}/fcmTokens/${token}`);

        await setDoc(tokenRef, {
            token: token,
            createdAt: serverTimestamp(),
            lastUsed: serverTimestamp(),
            userAgent: navigator.userAgent  // Info per tracking dispositivo
        });

        console.log('FCM token saved to Firestore');
    } catch (err) {
        console.error('Error saving FCM token:', err);
    }
}

/**
 * Invia una notifica locale all'utente quando è il suo turno
 * 
 * Notifica browser nativa che appare anche se l'utente è su un altro tab.
 * Funziona solo se i permessi di notifica sono stati concessi.
 * 
 * @function sendTurnNotification
 * @param {string} msg - Messaggio da mostrare nella notifica
 * @returns {void}
 * 
 * @example
 * sendTurnNotification("È il tuo turno! Scegli un giocatore.");
 */
export function sendTurnNotification(msg) {
    if (Notification.permission === "granted") {
        new Notification("Drafta", {
            body: msg,
            icon: 'icon-192.png'
        });
    }
}

/**
 * Configura gli event listener per i pulsanti della modal notifiche
 * 
 * Collega:
 * - Pulsante "Abilita" -> enableNotifications()
 * - Pulsante "Più tardi" -> closeNotificationModal()
 * 
 * Da chiamare durante l'inizializzazione dell'app.
 * 
 * @function setupNotificationListeners
 * @returns {void}
 * 
 * @example
 * // In app.js durante DOMContentLoaded
 * setupNotificationListeners();
 */
export function setupNotificationListeners() {
    document.getElementById('btn-notif-enable').addEventListener('click', enableNotifications);
    document.getElementById('btn-notif-later').addEventListener('click', closeNotificationModal);
}
