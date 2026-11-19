// Desktop: drag the team columns sideways with the mouse. Touch already scrolls natively.

export function initTeamsMatrixDragScroll() {
    const el = document.getElementById('teams-matrix');
    let startX = 0, startScroll = 0, dragging = false, moved = false;

    el.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('button, a, input, select')) return;
        dragging = true;
        moved = false;
        startX = e.clientX;
        startScroll = el.scrollLeft;
    });
    window.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 5) { moved = true; el.style.cursor = 'grabbing'; el.style.userSelect = 'none'; }
        el.scrollLeft = startScroll - dx;
    });
    window.addEventListener('pointerup', () => { dragging = false; el.style.cursor = ''; el.style.userSelect = ''; });
    // a drag is not a click on whatever is under the mouse at the end
    el.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
}
