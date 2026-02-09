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

    // Initialization complete
    console.log('✅ Drafta initialized successfully!');
});
