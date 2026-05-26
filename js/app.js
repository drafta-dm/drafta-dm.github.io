// ============================================================================
// Drafta - Fantasy Draft Application
// ============================================================================
// Main application entry point that orchestrates all modules and initializes
// the application when the DOM is ready.
// ============================================================================

// Firebase SDK imports - Authentication, Firestore, and Messaging
import {
    auth, db, googleProvider,
    signInWithPopup, onAuthStateChanged, signOut,
    doc, setDoc, getDoc, onSnapshot, updateDoc, deleteDoc,
    arrayUnion, serverTimestamp,
    query, collection, where,
    messaging, getToken, onMessage
} from './firebase-modules.js';

// Player data service - Loads and manages Serie A player information
import { playerService } from './player-service.js';

// Core application modules
import { state } from './state.js';          // Global application state
import { showToast } from './utils.js';      // Utility functions

// Feature modules - Each handles a specific application domain
import { initAuth, setupAuthListeners } from './auth.js';
import { setupNotificationListeners } from './notifications.js';
import { setupRoomListeners } from './room-manager.js';
import { setupLobbyListeners } from './lobby.js';
import { setupFilters } from './player-filters.js';
import { setupDraftListeners } from './draft-logic.js';
import { setupCSVListeners } from './csv-handler.js';
import { initTeamsMatrixDragScroll } from './drag-scroll.js';
import { setupHistoryListeners } from './draft-history.js';
import { setupChatListeners } from './chat.js';
import { setupSoundListeners } from './sounds.js';

/**
 * Application initialization sequence
 * 
 * Executed when the DOM is fully loaded. Performs the following steps:
 * 1. Initializes Firebase authentication and sets up auth state observer
 * 2. Loads player data from the player service into global state
 * 3. Registers event listeners for all application features
 * 
 * @listens DOMContentLoaded - Waits for DOM to be ready before initialization
 */
document.addEventListener('DOMContentLoaded', () => {
    // Step 1: Initialize authentication system
    // Sets up Firebase auth state listener and handles login/logout flows
    initAuth();

    // Step 2: Load player database
    // Retrieves Serie A player data and stores in global state for draft usage
    state.players = playerService.getPlayers();

    // Step 3: Register all event listeners
    // Each setup function attaches DOM event handlers for its feature domain
    setupAuthListeners();           // Login/logout buttons
    setupNotificationListeners();   // Notification permission handling
    setupRoomListeners();            // Room creation/joining/deletion
    setupLobbyListeners();           // Team management and assignment
    setupFilters();                  // Player search and role filtering
    setupDraftListeners();           // Draft start and player selection
    setupCSVListeners();             // Import/export functionality
    initTeamsMatrixDragScroll();     // Enable mouse drag-to-scroll on teams matrix
    setupHistoryListeners();         // Draft history toggle panel
    setupChatListeners();            // Chat messaging
    setupSoundListeners();           // Sound effects toggle

    // ── Mobile Bottom Nav ─────────────────────────────────────────────
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Aggiorna stato attivo
            document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const target = btn.dataset.target;
            const leftPanel = document.querySelector('.draft-left-panel');
            const rightPanel = document.querySelector('.draft-right-panel');
            const chatPanel = document.getElementById('chat-panel');
            const historyPanel = document.getElementById('draft-history-panel');
            const teamsMatrix = document.getElementById('teams-matrix');

            if (target === 'players') {
                if (leftPanel) leftPanel.style.display = '';
                if (rightPanel) rightPanel.style.display = 'none';
                if (chatPanel) chatPanel.classList.add('hidden');
                if (historyPanel) historyPanel.classList.add('hidden');
            } else if (target === 'teams') {
                if (leftPanel) leftPanel.style.display = 'none';
                if (rightPanel) {
                    rightPanel.style.display = '';
                    if (teamsMatrix) teamsMatrix.style.display = '';
                }
                if (chatPanel) chatPanel.classList.add('hidden');
                if (historyPanel) historyPanel.classList.add('hidden');
            } else if (target === 'chat') {
                if (leftPanel) leftPanel.style.display = 'none';
                if (rightPanel) rightPanel.style.display = 'none';
                if (chatPanel) chatPanel.classList.remove('hidden');
                if (historyPanel) historyPanel.classList.add('hidden');
            } else if (target === 'history') {
                if (leftPanel) leftPanel.style.display = 'none';
                if (rightPanel) {
                    rightPanel.style.display = '';
                    if (teamsMatrix) teamsMatrix.style.display = 'none'; // Nasconde la matrice per visualizzare solo il log
                }
                if (historyPanel) historyPanel.classList.remove('hidden');
                if (chatPanel) chatPanel.classList.add('hidden');
            }
        });
    });

    // Initialization complete
    console.log('✅ Drafta initialized successfully!');
});
