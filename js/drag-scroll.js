// ============================================================================
// MODULO: Drag to Scroll
// ============================================================================
// Abilita lo scrolling con trascinamento mouse su elementi con overflow.
// Principalmente usato per #teams-matrix su desktop per permettere scroll
// orizzontale tramite click-and-drag invece di scrollbar.
// ============================================================================

/**
 * Abilita drag-to-scroll su un elemento DOM
 * 
 * Funzionalità:
 * - Click + drag per scrollare orizzontalmente/verticalmente
 * - Cursore cambia in "grab" quando hover, "grabbing" durante drag
 * - Smooth inertia/momentum (opzionale)
 * - Mobile-friendly (non interferisce con touch gestures)
 * 
 * @param {HTMLElement} element - Elemento DOM da rendere draggable
 * @param {Object} options - Opzioni configurazione
 * @param {boolean} options.horizontal - Abilita scroll orizzontale (default: true)
 * @param {boolean} options.vertical - Abilita scroll verticale (default: false)
 * @param {number} options.dragThreshold - Pixel minimi prima di considerare drag (default: 3)
 */
export function enableDragToScroll(element, options = {}) {
    const {
        horizontal = true,
        vertical = false,
        dragThreshold = 3
    } = options;

    let isDragging = false;
    let startX, startY;
    let scrollLeft, scrollTop;
    let hasDragged = false;

    // Applica cursore grab
    element.style.cursor = 'grab';

    // ── MOUSE DOWN: Inizio drag ──────────────────────────────────────────
    const onMouseDown = (e) => {
        // Ignora click destro e click su elementi interattivi
        if (e.button !== 0) return;
        if (e.target.closest('button, a, input, select, textarea')) return;

        isDragging = true;
        hasDragged = false;
        element.style.cursor = 'grabbing';
        element.style.userSelect = 'none';

        startX = e.pageX - element.offsetLeft;
        startY = e.pageY - element.offsetTop;
        scrollLeft = element.scrollLeft;
        scrollTop = element.scrollTop;
    };

    // ── MOUSE MOVE: Durante drag ────────────────────────────────────────
    const onMouseMove = (e) => {
        if (!isDragging) return;

        e.preventDefault();

        const x = e.pageX - element.offsetLeft;
        const y = e.pageY - element.offsetTop;

        // Calcola distanza percorsa
        const walkX = x - startX;
        const walkY = y - startY;

        // Verifica se ha superato threshold (per distinguere click da drag)
        if (Math.abs(walkX) > dragThreshold || Math.abs(walkY) > dragThreshold) {
            hasDragged = true;
        }

        // Applica scroll
        if (horizontal) {
            element.scrollLeft = scrollLeft - walkX;
        }
        if (vertical) {
            element.scrollTop = scrollTop - walkY;
        }
    };

    // ── MOUSE UP: Fine drag ─────────────────────────────────────────────
    const onMouseUp = () => {
        isDragging = false;
        element.style.cursor = 'grab';
        element.style.userSelect = '';
    };

    // ── MOUSE LEAVE: Esci dall'elemento durante drag ───────────────────
    const onMouseLeave = () => {
        if (isDragging) {
            isDragging = false;
            element.style.cursor = 'grab';
            element.style.userSelect = '';
        }
    };

    // Attach event listeners
    element.addEventListener('mousedown', onMouseDown);
    element.addEventListener('mousemove', onMouseMove);
    element.addEventListener('mouseup', onMouseUp);
    element.addEventListener('mouseleave', onMouseLeave);

    // Previeni selezione testo durante drag
    element.addEventListener('dragstart', (e) => e.preventDefault());

    // Return cleanup function
    return () => {
        element.removeEventListener('mousedown', onMouseDown);
        element.removeEventListener('mousemove', onMouseMove);
        element.removeEventListener('mouseup', onMouseUp);
        element.removeEventListener('mouseleave', onMouseLeave);
        element.style.cursor = '';
        element.style.userSelect = '';
    };
}

/**
 * Inizializza drag-to-scroll su #teams-matrix quando l'elemento è disponibile
 * Chiamata automaticamente da app.js dopo il caricamento del DOM
 */
export function initTeamsMatrixDragScroll() {
    const teamsMatrix = document.getElementById('teams-matrix');

    if (teamsMatrix) {
        enableDragToScroll(teamsMatrix, {
            horizontal: true,
            vertical: false,
            dragThreshold: 5
        });
        console.log('✓ Drag-to-scroll abilitato su #teams-matrix');
    }
}
