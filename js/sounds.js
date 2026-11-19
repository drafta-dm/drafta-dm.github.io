// Sound effects synthesised with Web Audio (no files). Mute is remembered in localStorage.

let audioCtx = null;
let isMuted = false;
try { isMuted = localStorage.getItem('drafta-muted') === 'true'; } catch { /* private mode */ }

const TONES = {
    turn: [[523.25, 0.15, 'sine', 0.3, 0], [659.25, 0.2, 'sine', 0.3, 150]],
    pick: [[440, 0.08, 'sine', 0.2, 0], [554.37, 0.08, 'sine', 0.2, 80], [659.25, 0.15, 'sine', 0.25, 160]],
    nudge: [[587.33, 0.1, 'sine', 0.25, 0], [783.99, 0.15, 'sine', 0.25, 120]],
    error: [[220, 0.12, 'square', 0.12, 0], [165, 0.2, 'square', 0.12, 130]],
};

export function playSound(type) {
    if (isMuted || !TONES[type]) return;
    try {
        audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        for (const [freq, dur, wave, vol, delay] of TONES[type]) setTimeout(() => playTone(freq, dur, wave, vol), delay);
    } catch (e) {
        console.warn('Sound error:', e);
    }
}

function playTone(freq, duration, type, volume) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function updateMuteUI() {
    const btn = document.getElementById('btn-toggle-sound');
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(!isMuted));
    btn.querySelector('use').setAttribute('href', isMuted ? '#i-volume-x' : '#i-volume-2');
    btn.querySelector('span').textContent = isMuted ? 'Suoni spenti' : 'Suoni attivi';
}

export function setupSoundListeners() {
    document.getElementById('btn-toggle-sound')?.addEventListener('click', () => {
        isMuted = !isMuted;
        try { localStorage.setItem('drafta-muted', String(isMuted)); } catch { /* private mode */ }
        updateMuteUI();
        playSound('pick');
    });
    updateMuteUI();
}
