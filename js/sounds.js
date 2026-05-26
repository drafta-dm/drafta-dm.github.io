// ============================================================================
// MODULO: Effetti Sonori
// ============================================================================
// Gestisce il feedback audio per eventi importanti del draft.
// Genera suoni tramite Web Audio API (nessun file esterno necessario).
// Toggle mute persistente in localStorage.
// ============================================================================

// ── Stato audio ─────────────────────────────────────────────────────────
let audioCtx = null;
let isMuted = localStorage.getItem('drafta-muted') === 'true';

/**
 * Inizializza AudioContext al primo click utente (richiesto dai browser)
 */
function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

/**
 * Riproduce un suono specifico
 * 
 * @param {string} type - Tipo di suono: 'turn', 'pick', 'timer', 'nudge', 'chat'
 */
export function playSound(type) {
    if (isMuted) return;

    try {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();

        switch (type) {
            case 'turn':
                // Chime melodico (2 note)
                playTone(ctx, 523.25, 0.15, 'sine', 0.3);    // C5
                setTimeout(() => playTone(ctx, 659.25, 0.2, 'sine', 0.3), 150);  // E5
                break;

            case 'pick':
                // Suono successo (arpeggio ascendente rapido)
                playTone(ctx, 440, 0.08, 'sine', 0.2);        // A4
                setTimeout(() => playTone(ctx, 554.37, 0.08, 'sine', 0.2), 80);   // C#5
                setTimeout(() => playTone(ctx, 659.25, 0.15, 'sine', 0.25), 160);  // E5
                break;

            case 'timer':
                // Tick urgente
                playTone(ctx, 880, 0.05, 'square', 0.15);
                break;

            case 'nudge':
                // Notifica (2 beep)
                playTone(ctx, 587.33, 0.1, 'sine', 0.25);     // D5
                setTimeout(() => playTone(ctx, 783.99, 0.15, 'sine', 0.25), 120); // G5
                break;

            case 'chat':
                // Pop discreto
                playTone(ctx, 700, 0.06, 'sine', 0.12);
                break;
        }
    } catch (e) {
        console.warn('Sound error:', e);
    }
}

/**
 * Genera un singolo tono
 * 
 * @param {AudioContext} ctx - AudioContext
 * @param {number} freq - Frequenza in Hz
 * @param {number} duration - Durata in secondi
 * @param {string} type - Tipo di onda (sine, square, triangle, sawtooth)
 * @param {number} volume - Volume (0-1)
 */
function playTone(ctx, freq, duration, type = 'sine', volume = 0.3) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
}

/**
 * Toggle mute/unmute
 * 
 * @returns {boolean} Nuovo stato mute
 */
export function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem('drafta-muted', String(isMuted));
    updateMuteUI();
    return isMuted;
}

/**
 * Aggiorna l'icona del pulsante mute
 */
function updateMuteUI() {
    const btn = document.getElementById('btn-toggle-sound');
    if (btn) {
        btn.innerHTML = isMuted ? '🔇 Suoni Disattivati' : '🔊 Suoni Attivi';
        btn.title = isMuted ? 'Riattiva suoni' : 'Disattiva suoni';
    }
}

/**
 * Configura listener per il pulsante mute
 */
export function setupSoundListeners() {
    const btn = document.getElementById('btn-toggle-sound');
    if (btn) {
        btn.addEventListener('click', () => {
            toggleMute();
            // Feedback sonoro se appena riattivato
            if (!isMuted) {
                playSound('pick');
            }
        });
    }
    // Inizializza UI
    updateMuteUI();
}

/**
 * Getter per lo stato mute
 * @returns {boolean}
 */
export function isSoundMuted() {
    return isMuted;
}
