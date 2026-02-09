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
- Live team matrix visualization
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
- **15 modular JavaScript files** in `js/`
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
├── js/                             # JavaScript Modules (15 files)
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
├── scripts/                        # Development scripts
│   ├── convert_excel_to_js.py      # Excel to JS converter
│   └── inspect_excel.py            # Excel inspector
│
├── examples/                       # Example files
├── icons/                          # PWA icons
└── functions/                      # Firebase Cloud Functions
    ├── index.js                    # Turn & nudge notifications
    └── package.json                # Dependencies
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
