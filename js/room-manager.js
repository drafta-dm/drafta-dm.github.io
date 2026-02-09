// ============================================================================
// MODULO: Gestione Completa Stanze
// ============================================================================
// Modulo centrale per la gestione del ciclo di vita completo delle stanze draft.
// Funzionalità principali:
// - Creazione nuove stanze con configurazione personalizzata
// - Join stanze esistenti con validazione password
// - Uscita da stanze e cleanup risorse
// - Eliminazione stanze (solo host)
// - Sistema real-time con listener Firebase
// - Sistema di presenza basato su heartbeat (5s)
// - Gestione stanze recenti con auto-join
// - Sistema nudge per sollecitare utenti offline
// - Sincronizzazione liste giocatori personalizzate
// - Modal ordine turni (randomizer e impostazioni)
// ============================================================================

// Import Firebase per gestione stanze
import { db, doc, setDoc, getDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, serverTimestamp, onSnapshot, collection, query, where } from './firebase-modules.js';

// Import moduli interni
import { state } from './state.js';                              // Stato globale
import { showToast, switchView, generateRoomId, showDashboard } from './utils.js';  // Utility UI
import { playerService } from './player-service.js';            // Servizio caricamento giocatori
import { renderLobbyOrDraft } from './lobby.js';                 // Routing lobby/draft
import { renderPlayerList } from './player-filters.js';          // Rendering lista giocatori
import { renderOrderPreview } from './draft-logic.js';           // Preview ordine turni

// ── Variabili modulo ────────────────────────────────────────────────────
// Unsubscribe function per il listener real-time della stanza corrente
let roomUnsubscribe = null;

/**
 * Crea una nuova stanza draft con le impostazioni configurate dall'utente
 * 
 * Flusso:
 * 1. Genera ID stanza univoco (4 caratteri alfanumerici)
 * 2. Genera password casuale (4 caratteri maiuscoli)
 * 3. Legge impostazioni dal form (numero squadre, blocco GK, ordine ruoli)
 * 4. Crea struttura squadre vuote con 500 crediti ciascuna
 * 5. Crea documento Firebase con stato iniziale 'lobby'
 * 6. Mostra modal con ID e password per condivisione
 * 
 * Struttura stanza:
 * - teams: array di squadre (id, nome, owner, crediti=500, roster=[])
 * - status: 'lobby' | 'started' | 'drafting'
 * - connectedUsers: array di UID utenti online (sistema heartbeat)
 * - participantIds: array di tutti gli UID che sono stati nella stanza
 * - participantNames: mappa {uid: displayName} per lookup nomi
 * - settings: {blockGK, strictRoles, sortMode}
 * 
 * @function createRoom
 * @returns {Promise<void>}
 * 
 * @example
 * // Utente compila form e clicca "Crea Stanza"
 * await createRoom();
 * // Mostra modal con: ID=AB12, Password=XY34
 */
export async function createRoom() {
    // ── Generazione credenziali stanza ─────────────────────────────────
    const roomId = generateRoomId();                                    // Es: "AB12"
    const password = Math.random().toString(36).slice(-4).toUpperCase(); // Es: "XY34"

    // ── Lettura configurazione dall'UI ──────────────────────────────────
    const teamCount = parseInt(document.getElementById('input-team-count').value);
    const blockGK = document.getElementById('input-block-gk').checked;
    const strictRoles = document.getElementById('input-strict-roles').checked;

    // ── Creazione struttura squadre vuote ───────────────────────────────
    const teams = [];
    for (let i = 0; i < teamCount; i++) {
        teams.push({
            id: `team-${i + 1}`,
            name: `Team ${i + 1}`,           // Nome default, modificabile in lobby
            ownerUid: null,                  // Assegnato in lobby
            ownerName: null,
            credits: 500,                     // Budget iniziale
            roster: [],                       // Lista giocatori (vuota all'inizio)
            totalValue: 0                     // Valore totale rosa (per ordinamento)
        });
    }

    // ── Creazione documento Firebase ────────────────────────────────────
    const roomRef = doc(db, 'rooms', roomId);

    const roomData = {
        hostId: state.user.uid,
        password: password,
        status: 'lobby',                      // Stato iniziale: in attesa di partecipanti
        participantIds: [state.user.uid],    // Host è il primo partecipante
        connectedUsers: [{                    // Formato vecchio per retrocompatibilità
            uid: state.user.uid,
            name: state.user.displayName,
            photoURL: state.user.photoURL
        }],
        teams: teams,
        currentTurnIndex: 0,
        roundNumber: 1,
        draftOrder: [],                       // Riempito quando inizia il draft
        currentPick: null,                    // Giocatore selezionato per preview
        settings: {
            blockGK: blockGK,                 // Se true, prende automaticamente tutti 3 GK della squadra
            strictRoles: strictRoles          // Se true, ordine obbligatorio P->D->C->A
        },
        createdAt: serverTimestamp()
    };

    try {
        await setDoc(roomRef, roomData);

        // ── Mostra modal condivisione ──────────────────────────────────
        document.getElementById('modal-room-id').textContent = roomId;
        document.getElementById('modal-room-pass').textContent = password;
        document.getElementById('modal-room-created').classList.remove('hidden');

    } catch (e) {
        console.error(e);
        showToast("Errore creazione stanza: " + e.message);
    }
}

/**
 * Entra in una stanza esistente richiedendo ID e password
 * 
 * Validazioni:
 * 1. Verifica che ID stanza sia compilato
 * 2. Verifica che la stanza esista su Firebase
 * 3. Verifica password (se impostata dall'host)
 * 
 * Se è il primo accesso:
 * - Aggiunge utente a connectedUsers
 * - Aggiunge UID a participantIds
 * 
 * Poi chiama enterRoom() per configurare i listener real-time.
 * 
 * @function joinRoom
 * @returns {Promise<void>}
 * 
 * @example
 * // Utente inserisce ID="AB12" e Password="XY34", clicca "Entra"
 * await joinRoom();
 */
export async function joinRoom() {
    // ── Lettura credenziali dal form ────────────────────────────────────
    const roomId = document.getElementById('input-room-id').value.trim().toUpperCase();
    const password = document.getElementById('input-room-pass').value.trim();

    if (!roomId) return showToast("Inserisci ID stanza");

    // ── Verifica esistenza stanza ───────────────────────────────────────
    const roomRef = doc(db, 'rooms', roomId);
    const snap = await getDoc(roomRef);

    if (!snap.exists()) return showToast("Stanza non trovata");

    // ── Validazione password ────────────────────────────────────────────
    const data = snap.data();
    if (data.password && data.password !== password) {
        return showToast("Password errata");
    }

    // ── Primo accesso: registra utente ──────────────────────────────────
    const isParticipant = data.participantIds && data.participantIds.includes(state.user.uid);

    if (!isParticipant) {
        // Aggiungi nuovo utente alla stanza
        const newUser = {
            uid: state.user.uid,
            name: state.user.displayName,
            photoURL: state.user.photoURL
        };
        await updateDoc(roomRef, {
            connectedUsers: arrayUnion(newUser),
            participantIds: arrayUnion(state.user.uid)
        });
    }

    // ── Entra nella stanza ──────────────────────────────────────────────
    enterRoom(roomId, data.hostId === state.user.uid, password);
}

/**
 * Esce dalla stanza corrente e torna alla dashboard
 * 
 * Operazioni di cleanup:
 * - Resetta stato globale (currentRoomId, roomData, isHost)
 * - Chiama unsubscribe sul listener real-time
 * - Torna alla vista dashboard
 * 
 * Il sistema di heartbeat rimuoverà automaticamente l'utente dal connectedUsers
 * dopo che smette di inviare battiti (5 secondi + tempo cleanup).
 * 
 * @function leaveRoom
 * @returns {void}
 * 
 * @example
 * // Utente clicca "Esci dalla Lobby"
 * leaveRoom();
 */
export function leaveRoom() {
    // Cleanup stato
    state.currentRoomId = null;
    state.roomData = null;
    state.isHost = false;

    // Rimuovi listener real-time
    if (roomUnsubscribe) {
        roomUnsubscribe();
        roomUnsubscribe = null;
    }

    // Torna alla dashboard
    switchView('dashboard');
}

/**
 * Elimina permanentemente una stanza dal database (solo host)
 * 
 * Chiede conferma prima di procedere.
 * Dopo l'eliminazione, tutti gli utenti connessi vedranno la stanza scomparire
 * grazie ai listener real-time e verranno reindirizzati alla dashboard.
 * 
 * @function deleteRoom
 * @param {string} roomId - ID della stanza da eliminare
 * @returns {Promise<void>}
 * 
 * @example
 * // Host clicca "Elimina" sulla stanza AB12
 * await deleteRoom('AB12');
 */
export async function deleteRoom(roomId) {
    if (!confirm("Sei sicuro di voler eliminare questa stanza?")) return;

    try {
        await deleteDoc(doc(db, "rooms", roomId));
        // Il listener onSnapshot gestirà automaticamente la rimozione dalla UI
    } catch (e) {
        console.error(e);
        showToast("Errore eliminazione");
    }
}

/**
 * Entra in una stanza e configura tutto il sistema real-time
 * 
 * Questa è la funzione più complessa del modulo. Gestisce:
 * 
 * 1. Configurazione stato e UI iniziale
 * 2. Sistema di presenza basato su heartbeat (aggiornamento ogni 5s)
 * 3. Cleanup presenza quando utente esce (beforeunload/pagehide)
 * 4. Listener real-time Firebase per sincronizzazione stanza
 * 5. Deduplicazione array connectedUsers
 * 6. Aggiornamento header con ID/password stanza
 * 7. Routing automatico tra lobby e draft
 * 8. Modal automatiche (ordine turni, randomizer)
 * 9. Sistema nudge per notifiche sollecito
 * 10. Event listener per pulsanti modal ordine turni
 * 
 * Sistema Heartbeat:
 * - Ogni 5 secondi aggiorna lastSeen[uid] con timestamp corrente
 * - Aggiorna participantNames[uid] con nome visualizzato
 * - Mantiene uid in connectedUsers tramite arrayUnion
 * 
 * Listener Real-time:
 * - Si attiva ad ogni cambio nel documento Firebase
 * - Aggiorna state.roomData con i nuovi dati
 * - Chiama renderLobbyOrDraft() per aggiornare la vista
 * - Gestisce modal automatiche in base allo stato
 * 
 * @function enterRoom
 * @param {string} roomId - ID della stanza
 * @param {boolean} isHost - true se l'utente è l'host della stanza
 * @param {string|null} [password=null] - Password (solo per host, per visualizzazione persistente)
 * @returns {void}
 * 
 * @example
 * // Dopo joinRoom() o dopo creazione stanza
 * enterRoom('AB12', true, 'XY34');  // Host entra
 * enterRoom('AB12', false);         // Partecipante entra
 */
export function enterRoom(roomId, isHost, password = null) {
    // ── Inizializzazione stato ──────────────────────────────────────────
    state.currentRoomId = roomId;
    state.isHost = isHost;

    // Mostra ID stanza nella lobby
    document.getElementById('lobby-room-id').textContent = roomId;

    // ── Configurazione UI per host ──────────────────────────────────────
    if (isHost && password) {
        document.getElementById('lobby-room-pass').textContent = password;
        document.getElementById('lobby-pass-display').classList.remove('hidden');
    } else {
        document.getElementById('lobby-pass-display').classList.add('hidden');
    }

    // Mostra/nascondi controlli host
    if (isHost) {
        document.getElementById('host-controls').classList.remove('hidden');
    } else {
        document.getElementById('host-controls').classList.add('hidden');
    }

    // ── Cleanup listener precedente ─────────────────────────────────────
    if (roomUnsubscribe) roomUnsubscribe();

    const roomRef = doc(db, 'rooms', roomId);

    // ── Sistema Presenza Basato su Heartbeat ────────────────────────────
    // Più affidabile di beforeunload per rilevare utenti online

    /**
     * Aggiorna la presenza dell'utente su Firebase
     * Viene chiamata all'ingresso e poi ogni 5 secondi
     */
    const updatePresence = () => {
        updateDoc(roomRef, {
            connectedUsers: arrayUnion(state.user.uid),         // Aggiunge UID (deduplica automatica)
            [`participantNames.${state.user.uid}`]: state.user.displayName || state.user.email,  // Salva nome per lookup
            [`lastSeen.${state.user.uid}`]: Date.now()          // Timestamp heartbeat
        }).catch(err => {
            console.error('Presence update error:', err);
        });
    };

    // Aggiornamento presenza immediato all'ingresso
    updatePresence();

    // Heartbeat ogni 5 secondi per mantenere presenza
    const heartbeatInterval = setInterval(updatePresence, 5000);

    /**
     * Rimuove la presenza dell'utente quando esce
     * Best-effort, non garantito (browser può killare processo)
     */
    const removePresence = () => {
        clearInterval(heartbeatInterval);
        updateDoc(roomRef, {
            connectedUsers: arrayRemove(state.user.uid)
            // NON rimuoviamo participantNames per preservare storico
        }).catch(e => console.error('Presence removal error:', e));
    };

    // Registra cleanup su eventi di uscita pagina
    window.addEventListener('beforeunload', removePresence);
    window.addEventListener('pagehide', removePresence);  // Migliore per mobile/iOS

    // Salva riferimenti per cleanup manuale se necessario
    state.presenceCleanup = removePresence;
    state.heartbeatInterval = heartbeatInterval;

    // ── Listener Real-Time Firebase ─────────────────────────────────────
    // Si attiva ad ogni modifica del documento stanza
    roomUnsubscribe = onSnapshot(doc(db, "rooms", roomId), (docSnap) => {
        // ── Verifica esistenza stanza ──────────────────────────────────
        if (!docSnap.exists()) {
            showToast("La stanza non esiste più.");
            showDashboard();
            return;
        }

        const data = docSnap.data();

        // ── Deduplicazione array connectedUsers ────────────────────────
        // Normalizza formato misto (sia oggetti {uid, name} che stringhe uid)
        if (data.connectedUsers && Array.isArray(data.connectedUsers)) {
            const uniqueUids = new Set();
            data.connectedUsers.forEach(u => {
                const uid = typeof u === 'string' ? u : u.uid;
                if (uid) uniqueUids.add(uid);
            });
            data.connectedUsers = Array.from(uniqueUids);
        }

        // ── Aggiornamento stato globale ────────────────────────────────
        state.roomData = data;
        state.isHost = (state.user.uid === data.hostId);

        // ── Aggiornamento classe CSS per styling host ──────────────────
        if (state.isHost) {
            document.body.classList.add('host-view');
        } else {
            document.body.classList.remove('host-view');
        }

        // ── Aggiornamento header stanza ────────────────────────────────
        document.getElementById('txt-room-id-display').textContent = `ID: ${roomId}`;
        const passEl = document.getElementById('txt-room-pass-display');
        const btnCsv = document.getElementById('btn-export-csv');

        // Mostra password e pulsante export solo all'host
        if (state.isHost) {
            passEl.textContent = `PSW: ${data.password}`;
            passEl.style.display = 'block';
            if (btnCsv) btnCsv.style.display = 'inline-block';
        } else {
            passEl.style.display = 'none';
            if (btnCsv) btnCsv.style.display = 'none';
        }

        // Aggiorna avatar utente nell'header
        const avatarEl = document.getElementById('header-user-avatar');
        avatarEl.src = state.user.photoURL || 'https://via.placeholder.com/32';

        // ── Sincronizzazione lista giocatori ────────────────────────────
        syncPlayersIfNeeded(data);

        // ── Routing automatico tra Lobby e Draft ───────────────────────
        renderLobbyOrDraft(data);

        // ── Logica Modal Automatiche ───────────────────────────────────

        // Modal 1: Stanza Importata -> Modal Impostazioni Ordine Turni
        if (state.isHost && data.status === 'started' && data.isImported && !data.orderSettingsApplied) {
            const modal = document.getElementById('modal-order-settings');
            if (modal && !state.hasShownOrderModal) {
                modal.classList.remove('hidden');
                state.hasShownOrderModal = true;
            }
        }
        // Modal 2: Stanza Normale -> Modal Randomizer (solo primo turno assoluto)
        else if (state.isHost && data.status === 'started' && !data.isImported &&
            data.currentTurnIndex === 0 && data.roundNumber === 1) {
            const modal = document.getElementById('modal-load-order');
            if (modal) {
                if (!state.hasShownOrderModal) {
                    modal.classList.remove('hidden');
                    state.hasShownOrderModal = true;
                }
                // Aggiorna preview ordine in tempo reale (per feedback randomizer)
                if (!modal.classList.contains('hidden') && typeof renderOrderPreview === 'function') {
                    renderOrderPreview(data.draftOrder);
                }
            }
        }

        // ── Sistema Nudge (sollecito utenti offline) ───────────────────
        if (data.notification && data.notification.targetUid === state.user.uid) {
            // Verifica se è una notifica nuova (evita elaborazioni duplicate)
            if (!state.lastNudgeTimestamp || data.notification.timestamp > state.lastNudgeTimestamp) {
                state.lastNudgeTimestamp = data.notification.timestamp;

                // Mostra notifica browser nativa
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    new Notification('Sollecito Drafta', {
                        body: data.notification.msg,
                        icon: 'icons/icon-192x192.png'
                    });
                }

                // Mostra anche toast in-app
                showToast(`📲 ${data.notification.sender}: ${data.notification.msg}`);
            }
        }
    });

    // ── Event Listener Modal Ordine Turni ───────────────────────────────
    const btnGen = document.getElementById('btn-gen-random-start');
    const btnConf = document.getElementById('btn-confirm-start-order');

    if (btnGen && btnConf) {
        // Usa onclick invece di addEventListener per evitare listener duplicati su re-entry

        /**
         * Pulsante "Genera Ordine Casuale"
         * Mescola l'ordine dei turni usando algoritmo Fisher-Yates
         */
        btnGen.onclick = async () => {
            if (!state.isHost) return;
            if (!state.roomData || !state.roomData.draftOrder) return;

            let order = [...state.roomData.draftOrder];

            // Algoritmo Fisher-Yates Shuffle
            for (let i = order.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [order[i], order[j]] = [order[j], order[i]];
            }

            try {
                await updateDoc(doc(db, 'rooms', state.currentRoomId), { draftOrder: order });
            } catch (e) {
                console.error("Error shuffling", e);
            }
        };

        /**
         * Pulsante "Conferma Ordine"
         * Chiude la modal e inizia il draft con l'ordine attuale
         */
        btnConf.onclick = () => {
            document.getElementById('modal-load-order').classList.add('hidden');
        };
    }
}

/**
 * Sincronizza la lista giocatori se la stanza ha un URL personalizzato
 * 
 * Alcune stanze possono usare liste giocatori customizzate (es. campionati stranieri)
 * caricate da un URL. Questa funzione verifica se roomData.dataSourceUrl esiste
 * e in caso positivo carica i giocatori da quell'URL.
 * 
 * @function syncPlayersIfNeeded
 * @param {Object} roomData - Dati completi della stanza
 * @returns {Promise<void>}
 * 
 * @example
 * // Stanza con giocatori custom
 * const roomData = { dataSourceUrl: 'https://example.com/players.json', ... };
 * await syncPlayersIfNeeded(roomData);
 * // Carica e aggiorna state.players con i dati custom
 */
export async function syncPlayersIfNeeded(roomData) {
    // Verifica se la stanza ha un URL giocatori personalizzato
    if (roomData.dataSourceUrl) {
        try {
            // Carica giocatori dall'URL custom
            await playerService.loadFromUrl(roomData.dataSourceUrl);
            state.players = playerService.getPlayers();

            // Aggiorna lista giocatori nella UI
            renderPlayerList();
        } catch (e) {
            console.error("Failed to sync players", e);
            showToast("Impossibile caricare lista giocatori personalizzata");
        }
    }
}

/**
 * Carica e visualizza le stanze recenti a cui l'utente ha partecipato
 * 
 * Funzionalità:
 * - Query Firebase: trova tutte le stanze dove participantIds contiene uid
 * - Listener real-time: si aggiorna automaticamente quando stanze vengono create/eliminate
 * - Per ogni stanza mostra: ID, data creazione, pulsante join rapido
 * - Se utente è host: mostra anche pulsante "Elimina"
 * - Click su stanza: pre-compila ID e password, poi fa auto-join
 * 
 * @function loadRecentRooms
 * @param {string} uid - UID Firebase dell'utente
 * @returns {void}
 * 
 * @example
 * // Chiamato automaticamente dopo login
 * loadRecentRooms(user.uid);
 */
export function loadRecentRooms(uid) {
    const container = document.getElementById('recent-rooms-container');
    const list = document.getElementById('recent-rooms-list');

    // ── Query Firebase ──────────────────────────────────────────────────
    // Trova stanze dove l'utente è in participantIds
    const q = query(
        collection(db, "rooms"),
        where("participantIds", "array-contains", uid)
    );

    // ── Listener Real-Time ──────────────────────────────────────────────
    onSnapshot(q, (snapshot) => {
        list.innerHTML = '';

        // Nascondi sezione se nessuna stanza recente
        if (snapshot.empty) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');

        // ── Rendering lista stanze ──────────────────────────────────────
        snapshot.forEach(doc => {
            const data = doc.data();
            const li = document.createElement('li');
            li.className = 'recent-item';

            // Formattazione data creazione
            let timeStr = "";
            if (data.createdAt) {
                timeStr = new Date(data.createdAt.seconds * 1000).toLocaleDateString();
            }

            // HTML elemento lista
            li.innerHTML = `
                <div>
                   <span style="font-weight:bold">Stanza <code style="color:var(--primary)">${doc.id}</code></span>
                   <small style="display:block; color:#888; font-size:0.75rem">${timeStr}</small>
                </div>
                <span>➔</span>
            `;

            // ── Click per auto-join ────────────────────────────────────
            li.addEventListener('click', () => {
                // Pre-compila campi con ID e password
                document.getElementById('input-room-id').value = doc.id;
                if (data.password) {
                    document.getElementById('input-room-pass').value = data.password;
                }
                // Auto-join per UX migliore
                joinRoom();
            });

            // ── Pulsante Elimina (solo per host) ───────────────────────
            if (uid === data.hostId) {
                const delBtn = document.createElement('button');
                delBtn.className = 'btn-delete-room';
                delBtn.textContent = 'Elimina';
                delBtn.onclick = (e) => {
                    e.stopPropagation(); // Previene join mentre si elimina
                    deleteRoom(doc.id);
                };
                li.querySelector('div').appendChild(delBtn);
            }

            list.appendChild(li);
        });
    });
}

/**
 * Configura tutti gli event listener per la gestione stanze
 * 
 * Collega:
 * - Dashboard: pulsanti "Crea Stanza" e "Entra"
 * - Lobby: pulsante "Esci dalla Lobby"
 * - Modal stanza creata: pulsante "Entra nella Stanza"
 * 
 * Gestione permessi notifiche:
 * - Su click "Entra", richiede permessi notifiche se necessario (richiesto per iOS)
 * 
 * Da chiamare durante l'inizializzazione dell'app.
 * 
 * @function setupRoomListeners
 * @returns {void}
 * 
 * @example
 * // In app.js durante DOMContentLoaded
 * setupRoomListeners();
 */
export function setupRoomListeners() {
    // ── Dashboard: Creazione stanza ────────────────────────────────────
    document.getElementById('btn-create-room').addEventListener('click', createRoom);

    // ── Dashboard: Join stanza ──────────────────────────────────────────
    document.getElementById('btn-join-room').addEventListener('click', () => {
        // Richiesta permessi notifiche su user click (necessario per iOS)
        if (Notification && Notification.permission === 'default') {
            Notification.requestPermission().catch(err => console.log(err));
        }
        joinRoom();
    });

    // ── Lobby: Uscita ───────────────────────────────────────────────────
    document.getElementById('btn-leave-lobby').addEventListener('click', leaveRoom);

    // ── Modal Stanza Creata: Ingresso ───────────────────────────────────
    document.getElementById('btn-modal-enter').addEventListener('click', () => {
        try {
            const roomId = document.getElementById('modal-room-id').innerText.trim();
            const password = document.getElementById('modal-room-pass').innerText.trim();

            showToast("Ingresso in corso..."); // Feedback utente

            // Richiesta permessi notifiche (richiesto per iOS, deve essere sincrono al click)
            try {
                if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                    Notification.requestPermission().catch(err => console.log('Notification permission error:', err));
                }
            } catch (notifyErr) {
                console.warn('Notification API not supported or failed:', notifyErr);
            }

            // Entra nella stanza appena creata
            enterRoom(roomId, true, password);
            document.getElementById('modal-room-created').classList.add('hidden');

        } catch (e) {
            console.error(e);
            showToast("Errore pulsante: " + e.message);
        }
    });
}

/**
 * Invia un sollecito (nudge) a un utente che è offline o non risponde
 * 
 * Il sollecito viene salvato nel documento Firebase della stanza.
 * L'utente target riceverà:
 * - Notifica browser (se permessi concessi)
 * - Toast in-app (se app è aperta)
 * - Notifica push via FCM (se configurato server-side)
 * 
 * Il sistema previene duplicati controllando il timestamp della notifica.
 * 
 * @function sendNudge
 * @param {string} targetUid - UID Firebase dell'utente da sollecitare
 * @param {string} teamName - Nome della squadra di cui è il turno
 * @returns {Promise<void>}
 * 
 * @example
 * // Host clicca "Sollecita" su Team Alpha (owner: uid123)
 * await sendNudge('uid123', 'Team Alpha');
 * // Invia: "Toc toc! È il turno di Team Alpha!"
 */
export async function sendNudge(targetUid, teamName) {
    try {
        await updateDoc(doc(db, 'rooms', state.currentRoomId), {
            notification: {
                targetUid: targetUid,
                sender: state.user.displayName || state.user.email,
                msg: `Toc toc! È il turno di ${teamName}!`,
                timestamp: Date.now()  // Usato per prevenire elaborazioni duplicate
            }
        });
        showToast("Sollecito inviato!");
    } catch (e) {
        console.error(e);
    }
}

// ── Esposizione Globale ─────────────────────────────────────────────────
// Espone sendNudge globalmente per poterla chiamare da onclick handler nell'HTML
window.sendNudge = sendNudge;
