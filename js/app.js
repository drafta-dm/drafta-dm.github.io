// Drafta: entry point. Wires every module to the page.

import { initAuth, setupAuthListeners } from './auth.js';
import { setupNotificationListeners } from './notifications.js';
import { setupRoomListeners } from './room-manager.js';
import { setupLobbyListeners } from './lobby.js';
import { setupFilters } from './player-filters.js';
import { setupDraftListeners } from './draft-logic.js';
import { setupDraftUIListeners } from './ui-renderer.js';
import { setupCSVListeners } from './csv-handler.js';
import { initTeamsMatrixDragScroll } from './drag-scroll.js';
import { setupHistoryListeners } from './draft-history.js';
import { setupChatListeners } from './chat.js';
import { setupSoundListeners } from './sounds.js';

setupAuthListeners();
setupNotificationListeners();
setupRoomListeners();
setupLobbyListeners();
setupFilters();
setupDraftListeners();
setupDraftUIListeners();
setupCSVListeners();
initTeamsMatrixDragScroll();
setupHistoryListeners();
setupChatListeners();
setupSoundListeners();
initAuth();

// [data-close] buttons close their dialog
document.addEventListener('click', (e) => e.target.closest('[data-close]')?.closest('dialog')?.close());

// cards light up where the pointer is, like on davide-mariotti.github.io
document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('.spot');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--x', `${e.clientX - r.left}px`);
    card.style.setProperty('--y', `${e.clientY - r.top}px`);
}, { passive: true });
