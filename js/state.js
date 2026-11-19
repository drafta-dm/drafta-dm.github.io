// Shared state of the app: one object every module reads and writes.
import { playersDB } from './data/players.js';

export const state = {
    user: null,              // Firebase user
    currentRoomId: null,
    isHost: false,
    roomData: null,          // last snapshot of rooms/{roomId}
    presence: {},            // uid -> ms of the last heartbeat (rooms/{roomId}/presence)
    players: playersDB,
    byId: new Map(playersDB.map((p) => [String(p.id), p])),
    selectedUserUid: null,   // lobby: participant picked by the host, waiting for a slot
    lastTurnOwner: null,
    lastNudgeTimestamp: null,
    swRegistration: null,
    hasShownOrderModal: false,
    summaryShown: false,
};

export const views = {
    login: document.getElementById('view-login'),
    dashboard: document.getElementById('view-dashboard'),
    lobby: document.getElementById('view-lobby'),
    draft: document.getElementById('view-draft'),
};
