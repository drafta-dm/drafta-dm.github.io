// ============================================================================
// MODULO: Gestione Import/Export CSV
// ============================================================================
// Permette di esportare e importare le rose delle squadre in formato CSV.
// Funzionalità principali:
// - Export: salva tutte le squadre e i loro giocatori in un file CSV
// - Import: crea una nuova stanza partendo da un file CSV esistente
// - Parsing: analizza e valida il formato CSV
// ============================================================================

// Import Firebase per creazione e gestione stanze
import { db, doc, setDoc, serverTimestamp } from './firebase-modules.js';

// Import moduli interni dell'applicazione
import { state } from './state.js';                    // Stato globale con user e players
import { showToast, generateRoomId } from './utils.js'; // Utilità varie
import { enterRoom } from './room-manager.js';          // Ingresso in stanza

/**
 * Esporta tutte le squadre della stanza corrente in un file CSV
 * 
 * Formato CSV generato:
 * - Separatore squadre: "$,$,$" (riga vuota che delimita il cambio squadra)
 * - Dati giocatore: "NomeSquadra,PlayerID,0" (un giocatore per riga)
 * 
 * Il file viene scaricato automaticamente con nome:
 * drafta-export-{roomId}-{timestamp}.csv
 * 
 * Questa funzione è disponibile solo per l'host della stanza.
 * 
 * @function exportTeamsToCSV
 * @returns {void}
 * 
 * @example
 * // Esempio di CSV generato:
 * // $,$,$
 * // Team Alpha,1001,0
 * // Team Alpha,1002,0
 * // $,$,$
 * // Team Beta,2001,0
 */
export function exportTeamsToCSV() {
    // Verifica che ci siano dati da esportare
    if (!state.roomData || !state.roomData.teams) {
        showToast("Nessun dato da esportare");
        return;
    }

    const teams = state.roomData.teams;
    const csvLines = [];

    // ── Costruzione del contenuto CSV ───────────────────────────────────
    teams.forEach(team => {
        // Inserisce il separatore di squadra
        csvLines.push('$,$,$');

        // Aggiunge ogni giocatore nella rosa della squadra
        if (team.roster && team.roster.length > 0) {
            team.roster.forEach(rosterItem => {
                // Formato: NomeSquadra,PlayerID,0
                csvLines.push(`${team.name},${rosterItem.playerId},0`);
            });
        }
    });

    // Unisce tutte le righe con newline
    const csvContent = csvLines.join('\n');

    // ── Creazione del file per il download ──────────────────────────────
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Nome file: drafta-export-{roomId}-{timestamp}.csv
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    link.download = `drafta-export-${state.currentRoomId}-${timestamp}.csv`;

    // Trigger automatico del download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast("✅ CSV esportato!");
}

/**
 * Gestisce la selezione di un file CSV da parte dell'utente
 * 
 * Viene chiamata quando l'utente seleziona un file tramite l'input file.
 * Legge il contenuto del file e lo passa alla funzione di creazione stanza.
 * 
 * @function handleImportCSV
 * @param {Event} e - Evento di cambio dell'input file
 * @returns {void}
 * 
 * @example
 * // Collegato all'input file HTML
 * document.getElementById('input-import-csv').addEventListener('change', handleImportCSV);
 */
export function handleImportCSV(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Lettura del file come testo
    const reader = new FileReader();
    reader.onload = async (event) => {
        const text = event.target.result;
        try {
            // Tenta di creare una stanza dal contenuto CSV
            await createRoomFromCSV(text);
        } catch (err) {
            console.error(err);
            showToast("Errore importazione CSV: " + err.message);
        }
    };
    reader.readAsText(file);
}

/**
 * Crea una nuova stanza Draft importando i dati da un file CSV
 * 
 * Parsing del CSV:
 * - Divide il file in righe
 * - Ignora le righe separatore ($,$,$)
 * - Per ogni riga valida: estrae NomeSquadra e PlayerID
 * - Raggruppa i giocatori per squadra
 * 
 * Dopo il parsing:
 * - Crea una nuova stanza Firebase con ID univoco
 * - Stato iniziale: "started" (l'importazione parte già in modalità draft)
 * - Assegna automaticamente la prima squadra all'utente corrente
 * - Entra automaticamente nella stanza appena creata
 * 
 * @function createRoomFromCSV
 * @param {string} csvText - Contenuto del file CSV come stringa
 * @returns {Promise<void>}
 * @throws {Error} Se il CSV non contiene squadre valide
 * 
 * @example
 * const csvContent = "$,$,$\nTeam A,1001,0\nTeam A,1002,0\n$,$,$\nTeam B,2001,0";
 * await createRoomFromCSV(csvContent);
 */
export async function createRoomFromCSV(csvText) {
    // Verifica che l'utente sia autenticato
    if (!state.user) return showToast("Devi essere loggato!");

    const rows = csvText.split(/\r?\n/);
    const teamsMap = new Map(); // NomeSquadra -> [ArrayPlayerIDs]

    // ── Parsing delle righe CSV ─────────────────────────────────────────
    rows.forEach(row => {
        const parts = row.split(',');
        if (parts.length < 2) return; // Riga non valida

        const teamName = parts[0].trim();
        const playerId = parts[1].trim();

        // Ignora i separatori e righe vuote
        if (teamName === '$' || !teamName) return;

        // Inizializza l'array per la squadra se non esiste
        if (!teamsMap.has(teamName)) {
            teamsMap.set(teamName, []);
        }

        // Aggiunge il giocatore all'array della squadra
        if (playerId) {
            teamsMap.get(teamName).push(playerId);
        }
    });

    // Verifica che ci siano squadre nel file
    if (teamsMap.size === 0) throw new Error("Nessuna squadra trovata nel file");

    // ── Creazione della struttura stanza ────────────────────────────────
    const roomId = generateRoomId();
    const password = Math.random().toString(36).slice(-4).toUpperCase();

    const teams = [];
    let i = 1;

    // Converte la mappa in array di team objects
    for (const [name, playerIds] of teamsMap) {
        // Costruisce la rosa calcolando costi e totale speso
        const roster = [];
        let totalSpent = 0;

        playerIds.forEach(pid => {
            const p = state.players.find(pl => String(pl.id) === String(pid));
            if (p) {
                roster.push({ playerId: p.id, cost: p.cost });
                totalSpent += p.cost;
            }
        });

        // Crea l'oggetto team
        teams.push({
            id: `team-${i}`,
            name: name,
            ownerUid: (i === 1) ? state.user.uid : null,     // Prima squadra assegnata all'utente
            ownerName: (i === 1) ? state.user.displayName : null,
            credits: 500 - totalSpent,                        // Crediti rimanenti
            roster: roster,
            totalValue: totalSpent                             // Valore totale rosa
        });
        i++;
    }

    // ── Creazione documento Firebase ────────────────────────────────────
    const roomRef = doc(db, 'rooms', roomId);

    const roomData = {
        hostId: state.user.uid,
        password: password,
        status: 'started',              // Stanza importata parte già in modalità draft
        participantIds: [state.user.uid],
        connectedUsers: [{
            uid: state.user.uid,
            name: state.user.displayName,
            photoURL: state.user.photoURL
        }],
        teams: teams,
        currentTurnIndex: 0,
        roundNumber: 1,
        draftOrder: teams.map(t => t.id), // Ordine turni iniziale = ordine squadre
        currentPick: null,
        settings: {
            blockGK: false,               // Blocco portieri disabilitato
            strictRoles: true             // Ordine ruoli P->D->C->A obbligatorio
        },
        createdAt: serverTimestamp(),
        isImported: true                  // Flag per identificare stanze importate
    };

    // Salva la stanza su Firebase
    await setDoc(roomRef, roomData);

    // ── Ingresso automatico nella stanza ────────────────────────────────
    state.currentRoomId = roomId;
    document.getElementById('input-room-id').value = roomId;

    showToast("Stanza importata con successo! Ingresso...");
    enterRoom(roomId, true, password);
}

/**
 * Configura gli event listener per le funzionalità import/export CSV
 * 
 * Collega:
 * - Pulsante export -> exportTeamsToCSV()
 * - Pulsante import -> apre file picker
 * - Input file change -> handleImportCSV()
 * 
 * Questa funzione deve essere chiamata durante l'inizializzazione dell'app.
 * 
 * @function setupCSVListeners
 * @returns {void}
 * 
 * @example
 * // In app.js durante il DOMContentLoaded
 * setupCSVListeners();
 */
export function setupCSVListeners() {
    // ── Pulsante Export CSV (solo host) ─────────────────────────────────
    document.getElementById('btn-export-csv').addEventListener('click', exportTeamsToCSV);

    // ── Pulsante Import Room ────────────────────────────────────────────
    document.getElementById('btn-import-room').addEventListener('click', () => {
        // Reset del valore per permettere di reimportare lo stesso file
        document.getElementById('input-import-csv').value = '';
        // Trigger del click sull'input nascosto
        document.getElementById('input-import-csv').click();
    });

    // ── Input File Hidden ───────────────────────────────────────────────
    document.getElementById('input-import-csv').addEventListener('change', handleImportCSV);
}
