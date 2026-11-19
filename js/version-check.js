// New version on the server (version.json) = drop the service worker and reload once,
// so phones with the app installed don't keep an old copy.

import { showToast } from './utils.js';

export async function verifyAppVersion() {
    try {
        const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = await res.json();
        const local = localStorage.getItem('drafta_version');
        localStorage.setItem('drafta_version', version);
        if (!local || local === version) return;   // first visit: nothing old to replace
        for (const r of await navigator.serviceWorker?.getRegistrations() ?? []) await r.unregister();
        showToast(`Aggiorno Drafta alla ${version}…`);
        setTimeout(() => location.reload(), 1500);
    } catch (e) {
        console.warn('Version check failed', e);
    }
}
