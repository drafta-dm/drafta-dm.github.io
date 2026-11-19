// Lobby: who joined, which team they coach, and the switch to the draft view.

import { db, doc, updateDoc } from './firebase-modules.js';
import { state, views } from './state.js';
import { showToast, switchView, getTeamColor, TEAM_PALETTE, esc, icon, openModal, closeModal } from './utils.js';
import { renderPlayerList } from './player-filters.js';
import { updateDraftUI, setDraftTab } from './ui-renderer.js';

const ONLINE_FOR = 180_000;
export const isOnline = (uid) => uid === state.user?.uid || Date.now() - (state.presence[uid] || 0) < ONLINE_FOR;
const nameOf = (uid) => state.roomData?.participantNames?.[uid] || `Giocatore ${uid.slice(0, 4)}`;

export function renderLobbyOrDraft(data) {
    if (data.status === 'started') {
        if (views.draft.classList.contains('hidden')) {
            switchView('draft');
            renderPlayerList();
            setDraftTab('players');
        }
        updateDraftUI(data);
    } else {
        if (views.lobby.classList.contains('hidden')) switchView('lobby');
        renderLobby(data);
    }
}

// Presence changes only touch the dots and the nudge buttons, not the whole view.
export function renderPresence() {
    document.querySelectorAll('[data-presence]').forEach((el) => {
        const on = isOnline(el.dataset.presence);
        if (el.classList.contains('status')) {
            el.classList.toggle('on', on);
            el.title = on ? 'Ha Drafta aperta' : 'Non ha Drafta aperta';
        } else {
            el.hidden = on;
        }
    });
}

export function renderLobby(data) {
    const ids = data.participantIds || [];
    document.getElementById('connected-count').textContent = `(${ids.length})`;
    document.getElementById('team-count-display').textContent = `(${data.teams.length})`;
    document.getElementById('lobby-hint').textContent = state.isHost
        ? 'Tocca un partecipante, poi lo slot della sua squadra. Rinomina le squadre direttamente, con la matita scegli colore e allenatore.'
        : "L'host sta assegnando le squadre. Quando avvia l'asta, si parte da qui.";
    renderPeople(data);
    renderSlots(data);
    renderPresence();
}

function renderPeople(data) {
    const list = document.getElementById('lobby-connected-list');
    list.innerHTML = (data.participantIds || []).map((uid) => {
        const team = data.teams.find((t) => t.ownerUid === uid);
        const inner = `<span class="status" data-presence="${esc(uid)}"></span><span class="name">${esc(nameOf(uid))}${uid === data.hostId ? ' · host' : ''}</span>${team ? `<small>${esc(team.name)}</small>` : ''}`;
        if (!state.isHost || team) return `<li><div class="person ${team ? 'is-assigned' : ''}">${inner}</div></li>`;
        return `<li><button class="person" data-uid="${esc(uid)}" aria-pressed="${state.selectedUserUid === uid}">${inner}</button></li>`;
    }).join('');
}

function renderSlots(data) {
    const grid = document.getElementById('lobby-teams-grid');
    // keep focus and caret in the name being typed while snapshots re-render the grid
    const active = document.activeElement?.classList.contains('team-name-edit') ? document.activeElement : null;
    const focus = active && { id: active.id, pos: active.selectionStart };

    grid.innerHTML = data.teams.map((team, i) => {
        const target = state.isHost && state.selectedUserUid && !team.ownerUid;
        return `<div class="slot ${target ? 'is-target' : ''}" style="--team:${esc(getTeamColor(team.id, data))}">
            <div class="slot-top">
                <span class="kicker">Slot ${i + 1}</span>
                ${state.isHost ? `<button class="icon-btn icon-btn-sm" data-edit="${esc(team.id)}" aria-label="Modifica ${esc(team.name)}">${icon('pencil')}</button>` : ''}
            </div>
            <input type="text" id="team-input-${i}" class="field team-name-edit" data-index="${i}" value="${esc(team.name)}" maxlength="30" aria-label="Nome della squadra ${i + 1}" ${state.isHost ? '' : 'disabled'}>
            ${target
                ? `<button class="slot-assign" data-assign="${i}">Assegna a ${esc(nameOf(state.selectedUserUid))}</button>`
                : `<div class="slot-owner">${icon('user')}${team.ownerUid ? `<b>${esc(team.ownerName || nameOf(team.ownerUid))}</b>` : '<span>Nessun allenatore</span>'}</div>`}
        </div>`;
    }).join('');

    if (focus) {
        const el = document.getElementById(focus.id);
        el?.focus();
        el?.setSelectionRange(focus.pos, focus.pos);
    }
}

async function saveTeams(teams, okMsg) {
    try {
        await updateDoc(doc(db, 'rooms', state.currentRoomId), { teams });
        if (okMsg) showToast(okMsg);
        return true;
    } catch (e) {
        console.error(e);
        showToast('Modifica non salvata: ' + e.message);
        return false;
    }
}

function openTeamManager(teamId) {
    if (!state.isHost) return;
    const data = state.roomData;
    const team = data.teams.find((t) => t.id === teamId);
    if (!team) return;
    document.getElementById('tm-team-id').value = team.id;
    document.getElementById('tm-team-name').value = team.name;

    const current = (team.color || getTeamColor(team.id)).toLowerCase();
    document.getElementById('tm-color-picker').innerHTML = TEAM_PALETTE.map((c, i) =>
        `<label title="Colore ${i + 1}"><input type="radio" name="tm-color" value="${c}" aria-label="Colore ${i + 1}" ${c.toLowerCase() === current ? 'checked' : ''}><span style="--c:${c}"></span></label>`).join('');

    const options = (data.participantIds || []).map((uid) => {
        const other = data.teams.find((t) => t.ownerUid === uid && t.id !== team.id);
        return `<option value="${esc(uid)}" ${uid === team.ownerUid ? 'selected' : ''} ${other ? 'disabled' : ''}>${esc(nameOf(uid))}${other ? ` (già in ${esc(other.name)})` : ''}</option>`;
    });
    document.getElementById('tm-user-select').innerHTML = `<option value="">Nessuno</option>${options.join('')}`;
    openModal('modal-team-manager');
}

async function saveTeamManager(e) {
    e.preventDefault();
    const teamId = document.getElementById('tm-team-id').value;
    const uid = document.getElementById('tm-user-select').value || null;
    const teams = structuredClone(state.roomData.teams);
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    team.name = document.getElementById('tm-team-name').value.trim() || team.name;
    team.color = document.querySelector('input[name="tm-color"]:checked')?.value || team.color || null;
    team.ownerUid = uid;
    team.ownerName = uid ? nameOf(uid) : null;
    if (await saveTeams(teams, 'Squadra aggiornata.')) closeModal('modal-team-manager');
}

export function setupLobbyListeners() {
    document.getElementById('form-team-manager').addEventListener('submit', saveTeamManager);

    document.getElementById('lobby-connected-list').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-uid]');
        if (!btn || !state.isHost) return;
        state.selectedUserUid = state.selectedUserUid === btn.dataset.uid ? null : btn.dataset.uid;
        renderLobby(state.roomData);
        // on a phone the slots are below the list: bring them up
        if (state.selectedUserUid && matchMedia('(max-width: 879px)').matches) document.getElementById('lobby-teams-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const grid = document.getElementById('lobby-teams-grid');
    grid.addEventListener('click', async (e) => {
        const edit = e.target.closest('[data-edit]');
        if (edit) return openTeamManager(edit.dataset.edit);
        const assign = e.target.closest('[data-assign]');
        if (!assign || !state.selectedUserUid) return;
        const teams = structuredClone(state.roomData.teams);
        const team = teams[+assign.dataset.assign];
        team.ownerUid = state.selectedUserUid;
        team.ownerName = nameOf(state.selectedUserUid);
        state.selectedUserUid = null;
        await saveTeams(teams);
    });
    grid.addEventListener('change', (e) => {
        if (!e.target.classList.contains('team-name-edit') || !state.isHost) return;
        const name = e.target.value.trim();
        if (!name) return renderLobby(state.roomData);
        const teams = structuredClone(state.roomData.teams);
        teams[+e.target.dataset.index].name = name;
        saveTeams(teams);
    });

    // the team columns of the draft open the same dialog
    document.getElementById('teams-matrix').addEventListener('click', (e) => {
        const head = e.target.closest('[data-edit]');
        if (head) openTeamManager(head.dataset.edit);
    });
}
