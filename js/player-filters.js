// Free players list: role tabs, search, hiding who is taken or whose role is full.

import { state } from './state.js';
import { esc, icon, ROLE_NAMES } from './utils.js';
import { selectPlayerForAuction } from './draft-logic.js';
import * as data from './data/players.js';

const SEASON = data.playersSeason || 21;   // fantacalcio.it season id: 21 = 2026/27
let filter = { role: 'all', text: '' };
let hiddenNow = [];   // roles the team on turn has already filled

const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slug = (s) => fold(s).replace(/[.'’,]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/-$/, '');

export const cardUrl = (p) => `https://content.fantacalcio.it/web/campioncini/${SEASON}/card/${p.id}.png`;
const infoUrl = (p) => `https://www.fantacalcio.it/serie-a/squadre/${slug(p.team)}/${slug(p.name)}/${p.id}`;

export function renderPlayerList() {
    const taken = new Set(state.roomData.teams.flatMap((t) => (t.roster || []).map((r) => String(r.playerId))));
    const q = fold(filter.text.trim());
    const rows = state.players
        .filter((p) => !taken.has(String(p.id)) && (filter.role === 'all' || p.role === filter.role) && (!q || fold(`${p.name} ${p.team}`).includes(q)))
        .sort((a, b) => b.cost - a.cost);

    document.getElementById('player-list').innerHTML = rows.map((p) => `<li data-id="${esc(p.id)}" data-role="${p.role}">
        <button class="player-pick" data-pick="${esc(p.id)}" aria-label="${esc(p.name)}, ${esc(p.team)}, ${ROLE_NAMES[p.role]}, quotazione ${p.cost}">
            <span class="role-badge role-${p.role}" aria-hidden="true">${p.role}</span>
            <span class="p-info" aria-hidden="true"><span class="p-name">${esc(p.name)}</span><span class="p-team">${esc(p.team)}</span></span>
            <span class="p-value" aria-hidden="true">${p.cost}</span>
        </button>
        <a class="p-info-link" href="${esc(infoUrl(p))}" target="_blank" rel="noopener" aria-label="Scheda di ${esc(p.name)} su Fantacalcio.it">${icon('external-link')}</a>
    </li>`).join('');
    updatePlayerListVisuals(taken, hiddenNow, state.roomData.currentPick?.playerId);
}

export function updatePlayerListVisuals(takenIds, hiddenRoles = [], currentId = null) {
    hiddenNow = hiddenRoles;
    let visible = 0;
    document.querySelectorAll('#player-list > li').forEach((li) => {
        const hide = takenIds.has(li.dataset.id) || hiddenRoles.includes(li.dataset.role);
        li.classList.toggle('hidden', hide);
        if (!hide) visible++;
        li.firstElementChild.classList.toggle('is-current', li.dataset.id === String(currentId));
    });

    const done = hiddenRoles.length >= 4;
    let msg = document.getElementById('list-status-msg');
    if (!visible) {
        if (!msg) {
            msg = document.createElement('p');
            msg.id = 'list-status-msg';
            msg.className = 'list-status';
            document.querySelector('.player-list-container').appendChild(msg);
        }
        msg.textContent = done ? 'Rose complete: asta finita.' : filter.text ? 'Nessun giocatore libero con questo nome.' : 'Nessun giocatore libero nei ruoli che servono.';
    }
    msg?.classList.toggle('hidden', !!visible);
}

export function setupFilters() {
    const date = data.playersLastUpdated ? new Date(data.playersLastUpdated) : null;
    document.getElementById('players-last-updated').textContent = date
        ? date.toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
        : 'n.d.';

    document.getElementById('role-filters').addEventListener('click', (e) => {
        const tab = e.target.closest('.role-tab');
        if (!tab) return;
        document.querySelectorAll('.role-tab').forEach((t) => {
            t.classList.toggle('active', t === tab);
            t.setAttribute('aria-pressed', String(t === tab));
        });
        filter.role = tab.dataset.role;
        renderPlayerList();
    });
    document.getElementById('search-player').addEventListener('input', (e) => {
        filter.text = e.target.value;
        renderPlayerList();
    });
    document.getElementById('player-list').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-pick]');
        if (btn) selectPlayerForAuction(btn.dataset.pick);
    });
}
