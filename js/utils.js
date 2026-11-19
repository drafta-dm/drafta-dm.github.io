// Small helpers shared by every module: views, dialogs, toasts, escaping, icons.

import { views, state } from './state.js';
import { playSound } from './sounds.js';

export function switchView(viewName) {
    Object.values(views).forEach((el) => { el.classList.remove('active'); el.classList.add('hidden'); });
    views[viewName].classList.remove('hidden');
    views[viewName].classList.add('active');
    window.scrollTo(0, 0);
}

export const showDashboard = () => switchView('dashboard');

// Everything that comes from Firestore (team names, Google display names, chat) goes through here before innerHTML.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const icon = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function openModal(id) {
    const d = document.getElementById(id);
    if (d && !d.open) d.showModal();
}
export const closeModal = (id) => document.getElementById(id)?.close();

export function showToast(msg) {
    const box = document.getElementById('toast-container');
    // re-show the popover so it lands on top of any dialog opened since
    if (box.showPopover) { if (box.matches(':popover-open')) box.hidePopover(); box.showPopover(); }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    box.appendChild(toast);
    setTimeout(() => {
        toast.remove();
        if (!box.children.length && box.hidePopover && box.matches(':popover-open')) box.hidePopover();
    }, 3500);
}

export function showBigError(msg) {
    document.getElementById('modal-error-text').textContent = msg;
    openModal('modal-error-big');
    playSound('error');
}

export async function copyText(text, okMsg) {
    try {
        await navigator.clipboard.writeText(text);
        showToast(okMsg);
    } catch {
        prompt('Copia il testo:', text);
    }
}

export const inviteLink = (roomId, password) => `${location.origin}${location.pathname}?room=${roomId}&pass=${encodeURIComponent(password || '')}`;

// 6 characters from crypto, without the ones people misread (0/O, 1/I/L).
export function generateRoomId(len = 6) {
    const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => abc[b % abc.length]).join('');
}

export const TEAM_PALETTE = [
    '#2fe37f', '#7c3aed', '#ff6b35', '#3b82f6', '#ef4444', '#c6f36b', '#f59e0b', '#ec4899', '#06b6d4', '#a855f7',
    '#f97316', '#14b8a6', '#e11d48', '#8b5cf6', '#84cc16', '#0ea5e9', '#d946ef', '#facc15', '#64748b', '#fb923c',
];

export function getTeamColor(id, roomData = state.roomData) {
    const team = roomData?.teams?.find((t) => t.id === id);
    if (team?.color) return team.color;
    const n = parseInt(String(id).match(/\d+/)?.[0] || '0', 10);
    return TEAM_PALETTE[n % TEAM_PALETTE.length];
}

export const ROLE_NAMES = { P: 'Portiere', D: 'Difensore', C: 'Centrocampista', A: 'Attaccante' };
