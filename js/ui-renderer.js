// Draft view: turn pill, player on stage, team columns, mobile tabs.

import { state, views } from './state.js';
import { getTeamColor, esc, icon, ROLE_NAMES } from './utils.js';
import { sendTurnNotification } from './notifications.js';
import { updatePlayerListVisuals, cardUrl } from './player-filters.js';
import { playSound } from './sounds.js';
import { renderPresence } from './lobby.js';
import { sendNudge } from './room-manager.js';
import { markChatAsRead, markChatAsClosed } from './chat.js';
import { SLOTS, ROLES, countRoles, takenIds, neededRole } from './draft-rules.js';

export function updateDraftUI(data) {
    if (!data.draftOrder?.length) return;
    const team = data.teams.find((t) => t.id === data.draftOrder[data.currentTurnIndex]);
    const turn = document.getElementById('turn-indicator-box');
    const label = document.getElementById('txt-current-turn-team');
    const mine = !!team && team.ownerUid === state.user.uid;

    turn.classList.toggle('is-me', mine);
    label.textContent = !team ? 'Asta finita' : mine ? 'Tocca a te' : team.name;
    if (mine && state.lastTurnOwner !== state.user.uid) {
        sendTurnNotification(`Tocca a te con ${team.name}: fai la tua scelta.`);
        playSound('turn');
    }
    state.lastTurnOwner = team?.ownerUid ?? null;

    const round = document.getElementById('txt-round');
    round.textContent = `Giro ${data.roundNumber}`;
    round.classList.toggle('hidden', !!data.settings?.sortMode);

    updateStage(data.currentPick ? state.byId.get(String(data.currentPick.playerId)) : null, team);
    renderTeamsMatrix(data);

    const counts = team ? countRoles(team.roster, state.byId) : null;
    // with the role order on, only the role the team needs can be picked: hide the others
    const hidden = !counts ? ROLES
        : data.settings?.strictRoles ? ROLES.filter((r) => r !== neededRole(counts))
        : ROLES.filter((r) => counts[r] >= SLOTS[r]);
    updatePlayerListVisuals(takenIds(data.teams), hidden, data.currentPick?.playerId);
}

export function renderTeamsMatrix(data) {
    const box = document.getElementById('teams-matrix');
    if (!data.draftOrder?.length) return (box.innerHTML = '');
    const n = data.draftOrder.length;
    const last = data.draftHistory?.at(-1);
    const fresh = last && Date.now() - last.timestamp < 5000 ? String(last.playerId) : null;

    // the team on turn first, then the others in turn order
    box.innerHTML = data.draftOrder.map((_, i) => data.draftOrder[(data.currentTurnIndex + i) % n]).map((id, i) => {
        const team = data.teams.find((t) => t.id === id);
        if (!team) return '';
        const active = i === 0 && data.currentTurnIndex < n;
        const counts = countRoles(team.roster, state.byId);
        const owner = team.ownerUid;
        const head = `<span class="matrix-title">${active ? '<span class="now">di turno</span>' : ''}<h3>${esc(team.name)}</h3>${state.isHost ? icon('pencil') : ''}</span>
            <span class="matrix-meta"><span title="Valore della rosa">${icon('gem')}${team.totalValue || 0}</span><span title="Giocatori in rosa">${icon('users')}${team.roster.length}/25</span></span>`;
        return `<section class="matrix-column ${active ? 'active-turn' : ''}" style="--team:${esc(getTeamColor(team.id, data))}" aria-label="${esc(team.name)}${active ? ', di turno' : ''}">
            <div class="matrix-top">
                ${state.isHost ? `<button class="matrix-header" data-edit="${esc(team.id)}" aria-label="Modifica ${esc(team.name)}">${head}</button>` : `<div class="matrix-header">${head}</div>`}
                <div class="matrix-owner">
                    ${owner ? `<span class="status" data-presence="${esc(owner)}"></span><span>${esc(team.ownerName || 'Allenatore')}</span>
                        ${owner !== state.user.uid ? `<button class="nudge" data-presence="${esc(owner)}" data-nudge="${esc(owner)}" data-team="${esc(team.name)}" title="Non ha Drafta aperta: mandagli una notifica">${icon('bell-ring')}Sollecita</button>` : ''}`
                    : '<span>Nessun allenatore</span>'}
                </div>
            </div>
            <ul class="matrix-roster">${rosterRows(team.roster, fresh)}</ul>
            <div class="matrix-footer">${ROLES.map((r) => `<span class="need-count ${counts[r] >= SLOTS[r] ? 'done' : ''}" title="${ROLE_NAMES[r]}: ${counts[r]} su ${SLOTS[r]}">${r} ${counts[r]}/${SLOTS[r]}</span>`).join('')}</div>
        </section>`;
    }).join('');
    renderPresence();
}

// 25 fixed rows: 3 P, 8 D, 8 C, 6 A, filled in the order they were picked.
function rosterRows(roster, fresh) {
    const byRole = { P: [], D: [], C: [], A: [] };
    for (const r of roster) {
        const p = state.byId.get(String(r.playerId));
        const role = r.role || p?.role;
        if (byRole[role]) byRole[role].push({ name: r.name || p?.name || `#${r.playerId}`, cost: r.cost, id: String(r.playerId) });
    }
    return ROLES.flatMap((role) => Array.from({ length: SLOTS[role] }, (_, i) => {
        const p = byRole[role][i];
        return p
            ? `<li class="roster-item role-${role} ${p.id === fresh ? 'is-new' : ''}"><span class="r">${role}</span><span class="roster-name">${esc(p.name)}</span><span class="roster-cost">${p.cost ?? ''}</span></li>`
            : `<li class="roster-item empty"><span class="r">${role}</span><span class="roster-name"></span></li>`;
    })).join('');
}

export function updateStage(player, team) {
    const card = document.getElementById('active-player-card');
    const img = document.getElementById('active-player-img');
    const role = document.getElementById('active-player-role');
    const wasId = card.dataset.id;
    card.classList.toggle('is-empty', !player);
    card.dataset.id = player ? player.id : '';
    role.className = `role-badge ${player ? `role-${player.role}` : ''}`;
    role.textContent = player ? player.role : '?';
    role.title = player ? ROLE_NAMES[player.role] : '';
    document.getElementById('active-player-name').textContent = player ? player.name : 'Scegli un giocatore';
    document.getElementById('active-player-team').textContent = player ? `${player.team} · ${ROLE_NAMES[player.role]}` : (canPick(team) ? 'Tocca un nome nella lista' : 'In attesa della scelta');
    document.getElementById('active-player-fvm').textContent = player ? `FVM ${player.cost}` : 'FVM –';
    if (String(wasId) !== String(card.dataset.id)) {
        img.onerror = () => { img.onerror = null; img.src = 'icons/0000.png'; };
        img.src = player ? cardUrl(player) : 'icons/0000.png';
        img.alt = player ? `Figurina di ${player.name}` : '';
    }
    document.getElementById('host-bid-controls').classList.toggle('is-off', !player || !canPick(team));
}

const canPick = (team) => state.isHost || (!!team && team.ownerUid === state.user.uid);

// Mobile: one panel at a time, chosen from the bottom bar. On desktop CSS ignores data-tab.
export function setDraftTab(tab) {
    views.draft.dataset.tab = tab;
    document.querySelectorAll('.mobile-nav-btn').forEach((b) => {
        const on = b.dataset.target === tab;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
    });
    if (window.matchMedia('(max-width: 899px)').matches) {
        document.getElementById('chat-panel').classList.toggle('hidden', tab !== 'chat');
        document.getElementById('draft-history-panel').classList.toggle('hidden', tab !== 'history');
        tab === 'chat' ? markChatAsRead() : markChatAsClosed();
    }
}

export function setupDraftUIListeners() {
    document.querySelectorAll('.mobile-nav-btn').forEach((b) => b.addEventListener('click', () => setDraftTab(b.dataset.target)));
    document.getElementById('teams-matrix').addEventListener('click', (e) => {
        const nudge = e.target.closest('[data-nudge]');
        if (nudge) sendNudge(nudge.dataset.nudge, nudge.dataset.team);
    });
}
