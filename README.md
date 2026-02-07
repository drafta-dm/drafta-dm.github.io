# 🏆 DRAFTA v4.0

**Live Serie A Fantasy Draft** - Sistema di draft in tempo reale perFantaCalcio con notifiche push avanzate.

[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## ✨ Features

### 🔔 **Push Notifications (v4.0 - NEW!)**
- **Notifiche anche con browser chiuso** tramite Firebase Cloud Messaging
- Notifica automatica quando è il tuo turno
- Sistema di solleciti per utenti offline
- Service Worker per notifiche background
- Supporto multi-dispositivo

### 🎮 **Draft Management**
- Draft in tempo reale multi-utente
- Ordine draft randomizzabile o manuale
- Supporto snake draft
- Visualizzazione matrice team in tempo reale
- Import/export formazioni CSV

### 👥 **Team & Users**
- Autenticazione Google Firebase
- Gestione squadre multiple
- Tracking utenti online/offline
- Solleciti per utenti inattivi

### 📊 **Player Database**
- Database giocatori Serie A integrato
- Filtri per ruolo (P, D, C, A)
- Ricerca giocatori
- Statistiche complete

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+**
- **Firebase CLI**: `npm install -g firebase-tools`
- **Firebase Project** con piano Blaze (gratis fino a 2M invocazioni/mese)

### Installation

```bash
# Clone del repository
git clone https://github.com/davide-mariotti/davide-mariotti.github.io.git
cd davide-mariotti.github.io/games/drafta

# Installa dipendenze Cloud Functions
cd functions
npm install
cd ..

# Login Firebase
firebase login

# Deploy Cloud Functions (per le notifiche)
firebase deploy --only functions
```

### Configuration

1. **Firebase Setup:**
   - Crea progetto su [Firebase Console](https://console.firebase.google.com)
   - Abilita Authentication (Google provider)
   - Abilita Firestore Database
   - Abilita Cloud Messaging
   - Ottieni VAPID key da Project Settings → Cloud Messaging

2. **Aggiorna `firebase-modules.js`** con la tua config Firebase

3. **Aggiorna `firebase-messaging-sw.js`** con la stessa config

4. **Aggiorna `app.js`** con la tua VAPID key nella funzione `requestFCMToken()`

---

## 📁 Project Structure

```
drafta/
├── index.html              # UI principale
├── app.js                  # Logic applicazione + FCM
├── firebase-modules.js     # Firebase SDK config
├── firebase-messaging-sw.js # Service Worker per notifiche
├── player-service.js       # Gestione database giocatori
├── styles.css              # Styling
├── functions/              # Cloud Functions backend
│   ├── index.js           # Turn & nudge notifications
│   └── package.json       # Dipendenze
├── firebase.json          # Firebase config
└── .firebaserc            # Progetto Firebase ID
```

---

## 🔔 Notification System

### Come Funziona

1. **User Login** → Richiesta permessi notifiche → Registrazione FCM token
2. **Token salvato** in Firestore: `users/{uid}/fcmTokens/{token}`
3. **Cambio turno** → Cloud Function `onTurnChange` → Invia notifica
4. **Sollecito** → Cloud Function `onNudge` → Invia notifica al target

### Cloud Functions

#### `onTurnChange`
Trigger: `onDocumentWritten("rooms/{roomId}")`
- Detecta cambio `currentTurnIndex`
- Trova owner del nuovo turno
- Recupera FCM tokens
- Invia notifica push

#### `onNudge`
Trigger: `onDocumentWritten("rooms/{roomId}")`
- Detecta campo `notification` modificato
- Trova utente target
- Invia sollecito via push notification

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla JavaScript (ES6 modules)
- **Backend**: Firebase Cloud Functions (Node.js 20)
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication (Google)
- **Notifications**: Firebase Cloud Messaging + Service Worker
- **Hosting**: GitHub Pages

---

## 📝 Changelog

### v4.0 (2026-02-05) - **FCM Notification System** 🔔
- ✅ Implementato Firebase Cloud Messaging
- ✅ Notifiche push anche con browser chiuso
- ✅ Service Worker per background notifications
- ✅ Cloud Functions per turn & nudge notifications
- ✅ Token management in Firestore
- ✅ Multi-device support

### v3.2 (2026-02-05) - **Bug Fixes**
- 🐛 Fixed appendChild null error
- 🐛 Fixed random order modal appearing every turn
- 🐛 Fixed nudge notification listener

### v3.1 (2026-02-05) - **Notification Modal**
- ✨ Added notification permission modal on first login
- ✨ localStorage tracking for modal display

### v3.0 (2026-02-05) - **Pick Button Visibility**
- 🔧 Fixed pick buttons visible for all users during their turn

### v2.9 and earlier
- Initial release with core draft functionality

---

## 🧪 Testing

### Test Notifications

1. **Browser aperto:**
   ```
   - Login → Verifica console: "FCM Token obtained"
   - Unisciti a room → Aspetta turno → Notifica ✅
   ```

2. **Browser chiuso (FCM):**
   ```
   - Login e abilita notifiche
   - Chiudi completamente browser
   - Da altro device, cambia turno
   - Notifica dovrebbe arrivare! 🎉
   ```

3. **Solleciti:**
   ```
   - Clicca pallino rosso (●) utente offline
   - Utente riceve notifica push
   ```

### Debug Logs

```bash
# Logs Cloud Functions in tempo reale
firebase functions:log

# Oppure su Firebase Console → Functions → Logs
```

---

## 💰 Costs

| Service | Free Tier | Costo Stimato |
|---------|-----------|---------------|
| **FCM** | Unlimited | **€0** ✅ |
| **Cloud Functions** | 2M invocazioni/mese | **€0** ✅ |
| **Firestore** | 1GB storage + 50K reads/day | **€0** ✅ |
| **Authentication** | Unlimited | **€0** ✅ |

**Total:** Completamente gratis per uso normale! 🎉

---

## 🤝 Contributing

Contributions are welcome! Per favore apri una issue prima di fare modifiche maggiori.

---

## 📄 License

MIT License - vedi [LICENSE](LICENSE) per dettagli

---

## 👨‍💻 Author

**Davide Mariotti**
- GitHub: [@davide-mariotti](https://github.com/davide-mariotti)
- Email: d.mariotti1991@gmail.com

---

## 🙏 Acknowledgments

- Firebase Team per le API fantastiche
- Serie A per i dati giocatori
- Community FantaCalcio italiana

---

**Made with ❤️ for FantaCalcio lovers**
