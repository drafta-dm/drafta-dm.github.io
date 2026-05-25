# 🏆 Drafta

**Live Serie A Fantasy Draft Platform** - Real-time multiplayer draft system for FantaCalcio with advanced push notifications and professional architecture.

[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=flat&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## ✨ Features

### 🔔 Push Notifications
- **Background notifications** via Firebase Cloud Messaging
- Automatic turn notifications with browser closed
- Nudge system for offline users
- Service Worker for background delivery
- Multi-device support

### 🎮 Draft Management
- Real-time multi-user draft
- Dynamic turn order (role-based, count-based, value-based)
- Snake draft support
- Live team matrix visualization with desktop mouse drag-to-scroll support
- Improved roster needs counters (current/max format with green/red status color-coding)
- CSV import/export

### 👥 User Management
- Google Firebase Authentication
- Multi-team support
- Online/offline presence tracking
- Heartbeat-based presence system

### 📊 Player Database
- Complete Serie A player database
- Role-based filters (P, D, C, A)
- Player search
- Dynamic roster management (25 fixed slots)

### 🏗️ Professional Architecture
- **16 modular JavaScript files** in `js/`
- **10 modular CSS files** in `css/`
- Clean separation of concerns
- Comprehensive Italian documentation
- Scalable and maintainable codebase

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+**
- **Firebase CLI**: `npm install -g firebase-tools`
- **Firebase Project** with Blaze plan (free up to 2M invocations/month)

### Installation

```bash
# Clone repository
git clone https://github.com/drafta-dm/drafta-dm.github.io.git
cd drafta-dm.github.io

# Install Cloud Functions dependencies
cd functions
npm install
cd ..

# Login to Firebase
firebase login

# Deploy Cloud Functions
firebase deploy --only functions

# Deploy Firestore rules
firebase deploy --only firestore:rules
```

### Configuration

1. **Firebase Setup:**
   - Create project on [Firebase Console](https://console.firebase.google.com)
   - Enable Authentication (Google provider)
   - Enable Firestore Database
   - Enable Cloud Messaging
   - Get VAPID key from Project Settings → Cloud Messaging

2. **Update `js/firebase-modules.js`** with your Firebase config

3. **Update `firebase-messaging-sw.js`** with same config

4. **Update VAPID key** in `js/notifications.js`

---

## 📁 Project Structure

```
drafta-dm.github.io/
├── index.html                      # Main entry point
├── manifest.json                   # PWA manifest
├── firebase-messaging-sw.js        # Service Worker
├── favicon.ico                     # Favicon
├── version.json                    # App version
├── firebase.json, .firebaserc      # Firebase config
├── firestore.rules                 # Security rules
│
├── js/                             # JavaScript Modules (16 files)
│   ├── app.js                      # Application entry point
│   ├── firebase-modules.js         # Firebase SDK initialization
│   ├── player-service.js           # Player data service
│   ├── state.js                    # Global state management
│   ├── utils.js                    # Utility functions
│   ├── auth.js                     # Authentication
│   ├── notifications.js            # FCM notifications
│   ├── room-manager.js             # Room lifecycle
│   ├── lobby.js                    # Lobby interface
│   ├── draft-logic.js              # Draft game logic
│   ├── ui-renderer.js              # UI rendering
│   ├── player-filters.js           # Player filtering
│   ├── version-check.js            # Version checking
│   ├── csv-handler.js              # CSV operations
│   ├── drag-scroll.js              # Mouse drag-to-scroll for teams matrix
│   └── data/
│       └── players.js              # Serie A player data
│
├── css/                            # CSS Modules (10 files)
│   ├── style.css                   # Main CSS orchestrator
│   ├── variables.css               # CSS custom properties
│   ├── reset.css                   # Reset & base styles
│   ├── typography.css              # Typography
│   ├── buttons.css                 # Button styles
│   ├── forms.css                   # Form elements
│   ├── components.css              # Reusable components
│   ├── views.css                   # View-specific styles
│   ├── draft.css                   # Draft view styles
│   └── responsive.css              # Responsive design
│
├── scripts/                        # Development & automation scripts
│   ├── download_excel.py           # Download automatico Excel da fantacalcio.it
│   ├── convert_excel_to_js.py      # Convertitore Excel → players.js
│   ├── update_players.py           # Script combinato (download + conversione)
│   └── inspect_excel.py            # Excel inspector (debug)
│
├── .github/workflows/
│   └── update-players.yml          # GitHub Action: aggiornamento giornaliero DB
├── examples/                       # Example files
├── icons/                          # PWA icons
└── functions/                      # Firebase Cloud Functions
    ├── index.js                    # Turn & nudge notifications
    └── package.json                # Dependencies
```

---

## 🔄 Aggiornamento automatico del Database Giocatori

Il database dei giocatori (`js/data/players.js`) viene aggiornato automaticamente ogni giorno tramite **GitHub Actions**.

### Come funziona

1. Il workflow `.github/workflows/update-players.yml` si avvia ogni giorno alle **09:00 ora italiana** (07:00 UTC).
2. Lo script `scripts/download_excel.py` si autentica su **fantacalcio.it** con Playwright (browser headless) e scarica il file Excel ufficiale delle quotazioni.
3. Lo script `scripts/convert_excel_to_js.py` converte il file in `js/data/players.js`.
4. Il file aggiornato viene committato automaticamente nel repository.

### Setup dei GitHub Secrets

Per far funzionare l'automazione devi configurare **due Secrets** nel tuo repository GitHub:

1. Vai su **GitHub → Repository → Settings → Secrets and variables → Actions**
2. Clicca **"New repository secret"** e aggiungi:

| Secret | Valore |
|--------|--------|
| `FANTACALCIO_USERNAME` | Il tuo username di Fantacalcio.it |
| `FANTACALCIO_PASSWORD` | La tua password di Fantacalcio.it |

### Esecuzione manuale

Puoi anche eseguire il workflow manualmente da **GitHub → Actions → Update Players Database → Run workflow**.

Oppure in locale:
```bash
# Solo download Excel
python scripts/download_excel.py

# Solo conversione (se hai già l'Excel)
python scripts/convert_excel_to_js.py

# Download + conversione in un comando
python scripts/update_players.py
```

---

## 🔔 Notification System

### Architecture

1. **User Login** → Request notification permissions → Register FCM token
2. **Token saved** in Firestore: `users/{uid}/fcmTokens/{token}`
3. **Turn change** → Cloud Function `onTurnChange` → Send notification
4. **Nudge** → Cloud Function `onNudge` → Send targeted notification

### Cloud Functions

#### `onTurnChange`
- **Trigger**: `onDocumentWritten("rooms/{roomId}")`
- Detects `currentTurnIndex` change
- Finds owner of new turn
- Retrieves FCM tokens
- Sends push notification

#### `onNudge`
- **Trigger**: `onDocumentWritten("rooms/{roomId}")`
- Detects `notification` field modified
- Finds target user
- Sends nudge via push notification

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla JavaScript (ES6 modules) |
| **Backend** | Firebase Cloud Functions (Node.js 20) |
| **Database** | Firebase Firestore |
| **Authentication** | Firebase Authentication (Google) |
| **Notifications** | Firebase Cloud Messaging + Service Worker |
| **Hosting** | GitHub Pages |
| **PWA** | Manifest + Service Worker |

---

## 📝 Changelog

### v6.7.9 (2026-05-25) - **Priorità Ruoli in Asta & Salto Squadre Complete** 📋🔄
- ✅ **Priorità Ruoli su Costo**: Quando la regola `strictRoles` è attiva, l'ordinamento dinamico delle chiamate (`compareTeamsSmart`) dà priorità assoluta alla copertura dei ruoli in ordine P -> D -> C -> A. Chi deve completare un reparto precedente sceglie sempre prima di chi si trova a un reparto successivo, a prescindere dal costo totale della rosa.
- ✅ **Salto Automatico Squadre Complete**: Le squadre con rose completate (25/25 giocatori) vengono automaticamente saltate durante il draft, prevenendo blocchi o attese del timer inutili.
- ✅ **Version Bump**: Aggiornato `version.json` a `6.7.9`.

### v6.7.8 (2026-05-25) - **Tooltip Crea Stanza Aggiornati** 💬ℹ️
- ✅ **Tooltip Numero Squadre**: Aggiunto un tooltip esplicativo per specificare lo scopo del selettore del numero di partecipanti.
- ✅ **Tooltip Timer Turno**: Aggiunto un tooltip esplicativo dettagliato che descrive il funzionamento del timer e l'assegnazione automatica d'ufficio alla scadenza del tempo.
- ✅ **Tooltip Esistenti Aggiornati**: Riformulati i tooltip di *Blocco Portieri* e *Ordine Ruoli* per riflettere le regole in modo più chiaro e corretto.
- ✅ **Version Bump**: Aggiornato `version.json` a `6.7.8`.

### v6.7.7 (2026-05-25) - **Top 2 per Ruolo & Condivisione Email/Clipboard** 🏆✉️📋
- ✅ **Top 2 per Ruolo**: Ciascuna card squadra nel riepilogo ora mostra i 2 migliori acquisti per ciascun ruolo (D, C, A) invece che un unico best pick.
- ✅ **Invia per Email**: Aggiunto un pulsante che genera automaticamente un'email pre-compilata (tramite link `mailto`) con l'intero report testuale ordinato dell'asta per tutti i partecipanti.
- ✅ **Copia Report Testo**: Aggiunto un pulsante per copiare negli appunti il report strutturato in formato testo pulito (ideale da incollare su WhatsApp, Telegram o fogli di calcolo).
- ✅ **Version Bump**: Aggiornato `version.json` a `6.7.7`.

### v6.7.6 (2026-05-25) - **Riepilogo Fine Draft Potenziato & Fix N/A** 🏆📊
- ✅ **Fix Best Pick N/A**: Corretto il bug per cui il miglior acquisto (best pick) mostrava "N/A" invece del nome del giocatore (ora viene risolto correttamente tramite lookup dello stato giocatori globale).
- ✅ **Bypass Crediti Rimasti**: Rimosso il dato sui crediti rimasti dal riepilogo (non significativo in modalità draft).
- ✅ **Ripartizione Spesa per Ruolo**: Aggiunto sotto ogni squadra un grafico/dettaglio compatto con la spesa effettuata per ruolo (P, D, C, A) colorata a tema.
- ✅ **Statistiche Globali del Draft**: Inserito un pannello di Highlights a inizio riepilogo che mostra il record dell'asta (Top Pick assoluto con relativa squadra), il giocatore più economico acquistato (Affare) e la spesa complessiva di tutta la lega con costo medio a giocatore.
- ✅ **Version Bump**: Aggiornato `version.json` a `6.7.6`.

### v6.7.5 (2026-05-25) - **Selezione Colori Squadra & Player Info Popup** 🎨ℹ️
- ✅ **Selezione Colori Squadra**: L'host può ora scegliere manualmente il colore di ogni squadra tramite una griglia di color bubble interattive presente nella modal di gestione squadra.
- ✅ **Player Info Popup**: I link alle schede fantacalcio.it dei giocatori si aprono ora in un popup dedicato (`window.open` con dimensioni controllate) mantenendo l'utente all'interno della stessa finestra principale senza aprire nuove tab intere.
- ✅ **Version Bump**: Aggiornato `version.json` a `6.7.5`.

### v6.7.4 (2026-05-25) - **Bypass Limiti Budget nel Draft** 💸
- ✅ **Bypass Limite Crediti**: Rimosso il blocco dei crediti/budget residui sia nei pick manuali che nell'assegnazione automatica (timeout) e blocco portieri, poiché nel draft puro non c'è un tetto massimo di budget all'acquisto dei giocatori (il costo influenza solo il valore rosa finale e l'ordine dei turni successivi).
- ✅ **Version Bump**: Aggiornato `version.json` a `6.7.4`.

### v6.7.3 (2026-05-25) - **Auto-Pick d'Ufficio per Timeout & Nuovi Timer** ⏱️🤖
- ✅ **Auto-Pick di Ufficio**: Quando scade il timer del turno, non si salta più il turno. Viene invece assegnato automaticamente il giocatore disponibile più caro per il ruolo corrente della squadra, penalizzandone i crediti per i turni successivi.
- ✅ **Nuove Selezioni Timer**: Opzioni di scelta del timer aggiornate a: 1m, 5m, 10m, 20m, 30m, 1h, 2h, 4h.
- ✅ **Format Countdown**: I timer lunghi sono formattati elegantemente in formato `MM:SS` o `H:MM:SS`.
- ✅ **Version Bump**: Aggiornato `version.json` a `6.7.3`.

### v6.7.2 (2026-05-25) - **Supporto Link in Dashboard** ☕
- ✅ **Support Button in Dashboard**: Aggiunto il pulsante "Buy me a beer! 🍺" anche nella schermata di dashboard (selezione stanza) oltre che alla login.
- ✅ **Version Bump**: Aggiornato `version.json` a `6.7.2`.

### v6.7 (2026-05-25) - **Riepilogo, Mobile Nav & Final Polish** 🏆📱
- ✅ **Riepilogo Fine Draft**: Overlay automatico a fine asta con ranking squadre, crediti spesi/rimasti, media costo, best pick per squadra.
- ✅ **Mobile Bottom Nav**: Barra di navigazione fissa in basso su mobile con tabs rapide per Giocatori, Squadre, Chat e Log.
- ✅ **Spectator-ready**: Le regole Firestore permettono la lettura a qualsiasi utente autenticato (base per future modalità spettatore).

### v6.6 (2026-05-25) - **Colori, Info Link & Condivisione** 🎨ℹ️🔗
- ✅ **Colori Squadra**: Palette di 20 colori vivaci assegnati automaticamente ad ogni squadra. Bordo colorato sulle colonne della matrice.
- ✅ **Player Info Link**: Icona ℹ️ accanto ad ogni giocatore nella lista, link diretto alla pagina fantacalcio.it del giocatore.
- ✅ **Share via Link**: Pulsante "📋 Copia Link Invito" nella modal di creazione stanza. Link con auto-join (parametri URL room + pass).
- ✅ **Deep Link Auto-Join**: Gli ospiti che aprono il link vengono automaticamente uniti alla stanza dopo il login.

### v6.5.2 (2026-05-25) - **Chat & Effetti Sonori** 💬🔊
- ✅ **Chat in Stanza**: Messaggi real-time via Firestore sub-collection. Emoji rapide, badge unread, XSS sanitization.
- ✅ **Effetti Sonori**: Feedback audio via Web Audio API (turn chime, pick success, nudge, timer tick, chat pop). Toggle mute persistente in localStorage.

### v6.5 (2026-05-25) - **Timer, Undo & Draft History** ⏱️↩️📜
- ✅ **Timer Turno**: Countdown configurabile per ogni turno (30s, 60s, 90s, 120s, illimitato). Barra animata con transizione colore verde→giallo→rosso. Auto-skip se scaduto. Host può mettere in pausa/riprendere.
- ✅ **Undo Pick (solo host)**: Pulsante ↩️ per annullare l'ultimo pick. Ripristina completamente roster, crediti, turno e round. Disponibile solo dopo il primo pick.
- ✅ **Draft History Log**: Cronologia in tempo reale di tutti i pick effettuati. Feed scrollabile con round, ruolo, giocatore e costo. Toggle dal pulsante 📜 nell'header.
- ✅ **Timer nella creazione stanza**: Nuovo selettore "Timer Turno" nella configurazione stanza (default: Illimitato).

### v6.4.2 (2026-05-25) - **Pick confirmation logic** ⚙️
- ✅ **Richiesta conferma pick per host**: Aggiunta una finestra di conferma quando l'host forza un pick per conto di un'altra squadra (evitando selezioni accidentali).

### v6.4.1 (2026-05-25) - **Firestore Rules Patch** 🔒
- ✅ **Risolto bug di join ospiti**: Sostituita la logica di comparazione dei set nelle regole di sicurezza di Firestore con controlli nativi su liste (basati su `hasAll`, `size` e operatore `in`), eliminando il problema di permessi (`Missing or insufficient permissions`) che bloccava il primo accesso dei partecipanti non-host.

### v6.4 (2026-05-25) - **Supporto per Asta a 4 Squadre** 👥
- ✅ **Aggiunto supporto a 4 squadre**: Permesso agli host di scegliere un minimo di 4 squadre quando creano una stanza (mantenendo solo il conteggio delle squadre pari: 4, 6, 8, ecc.).

### v6.3 (2026-05-20) - **Draft Navigation, Profile Menu & Excel Automation** 🚀
- ✅ **Draft Navigation**: Added a `← Home` exit button inside the draft header to allow leaving the draft and returning to the dashboard cleanly (with a confirmation prompt to prevent accidental exits).
- ✅ **Unified User Profile Modal**: Introduced a modal displaying Google account information (Name, Email, Avatar) and a "Logout" action, accessible by clicking the user avatar from both the dashboard and draft header.
- ✅ **Excel Conversion Automation**: Updated `convert_excel_to_js.py` to automatically output the converted `players.js` file directly inside the `js/data/` folder, removing the manual file-move requirement.

### v6.2 (2026-05-20) - **Security & Stability Release** 🚀
- ✅ **Fixed presence bug**: `connectedUsers` now strictly stores UID strings instead of object literals, resolving the bug where disconnected users remained online forever.
- ✅ **Fixed memory/timer leaks**: Heartbeat and window event listeners are now fully cleaned up when leaving a room or logging out.
- ✅ **Enhanced security rules**: Restructured Firestore rules to protect critical room settings/passwords from manipulation by non-host participants.
- ✅ **Valid HTML**: Relocated modals from `<head>` to `<body>`.
- ✅ **Lobby improvements**: Allowed hosts to unassign/reset a team owner.
- ✅ **Drag scroll enhancement**: Captured and stopped click propagation during drag scroll to prevent opening modals accidentally.

### v6.1 (2026-02-09) - **UX Improvements & Database Release** 🚀
- ✅ **Added Serie A Players Database**: `players.js` with 761 players.
- ✅ **Desktop Drag-to-Scroll**: Integrated new `drag-scroll.js` module to enable click-and-drag horizontal scrolling on the teams matrix.
- ✅ **Improved Roster Counters**: Need counters updated to show current/max format (e.g., `2/8` instead of `6`) with red/green status color-coding.
- ✅ **CSS Variables Optimization**: Consolidated spacing and colors into `variables.css` across all 10 CSS modules, achieving zero hardcoded hex/rgba values.
- ✅ **UI/UX Refinements**: Updated role colors (DEF: green, MID: blue), changed active tab/value color to `--text`, and added spacing to player lists.
- ✅ **Code Cleanup**: Removed obsolete `old-style.css`.

### v6.0 (2026-02-09) - **Complete Architecture Refactor** 🏗️
- ✅ **Complete project reorganization** with modular architecture
- ✅ **15 JavaScript modules** organized in `js/` directory
- ✅ **10 CSS modules** organized in `css/` directory
- ✅ Split 1974-line `app.js` into focused modules
- ✅ Split 1749-line `style.css` into thematic modules
- ✅ Professional directory structure
- ✅ Comprehensive Italian documentation on all modules
- ✅ Clean root directory (only 11 essential files)
- ✅ Improved maintainability and scalability

### v5.0 (2026-02-07) - **Domain Migration & Fixes** 🚀
- Improved notification system (works with app closed)
- Migration to root domain `drafta-dm.github.io`
- PWA icon and manifest fixes

### v4.0 (2026-02-05) - **FCM Notification System** 🔔
- Implemented Firebase Cloud Messaging
- Push notifications with browser closed
- Service Worker for background notifications
- Cloud Functions for turn & nudge notifications
- Token management in Firestore
- Multi-device support

### v3.x and earlier
- Core draft functionality
- Bug fixes and improvements

---

## 🧪 Testing

### Manual Testing Checklist

- [ ] **Authentication** - Google login/logout
- [ ] **Room Management** - Create, join, delete rooms
- [ ] **Lobby** - User assignment, team editing
- [ ] **Draft** - Player selection, turn rotation, filters
- [ ] **Notifications** - Turn alerts, nudges (browser open & closed)
- [ ] **CSV** - Import/export functionality
- [ ] **Real-time Sync** - Multi-user synchronization
- [ ] **Presence** - Online/offline tracking
- [ ] **Responsive** - Mobile, tablet, desktop

### Browser Compatibility

- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari (iOS/macOS)

---

## 💰 Costs

| Service | Free Tier | Status |
|---------|-----------|--------|
| **FCM** | Unlimited | **€0** ✅ |
| **Cloud Functions** | 2M invocations/month | **€0** ✅ |
| **Firestore** | 1GB storage + 50K reads/day | **€0** ✅ |
| **Authentication** | Unlimited | **€0** ✅ |

**Total:** Completely free for normal usage! 🎉

---

## 🤝 Contributing

Contributions are welcome! Please open an issue before making major changes.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

---

## 👨‍💻 Author

**Davide Mariotti**
- GitHub: [@davide-mariotti](https://github.com/davide-mariotti)
- Email: d.mariotti1991@gmail.com

---

## 🙏 Acknowledgments

- Firebase Team for excellent APIs
- Serie A for player data
- Italian FantaCalcio community

---

**Made with ❤️ for FantaCalcio lovers**
