// Draft actions: start, select, confirm, undo, timer, auto pick. The rules themselves are in draft-rules.js.

import { db, doc, updateDoc } from './firebase-modules.js';
import { state } from './state.js';
import { showToast, showBigError, closeModal, esc } from './utils.js';
import { playSound } from './sounds.js';
import { nextTurn, pickError, applyPick, bestAvailable, dynamicOrder, firstOpenIndex } from './draft-rules.js';

const roomRef = () => doc(db, 'rooms', state.currentRoomId);
const currentTeam = (room = state.roomData) => room?.teams.find((t) => t.id === room.draftOrder?.[room.currentTurnIndex]);
const canAct = (team) => state.isHost || (team && team.ownerUid === state.user.uid);

// Pre-selects the obvious pick for whoever starts, so the first screen isn't empty.
const suggestion = (teams, team) => {
    const p = team && bestAvailable(teams, team, state.players, state.byId);
    return p ? { playerId: String(p.id) } : null;
};

export async function startDraft() {
    if (!state.isHost) return;
    const room = state.roomData;
    if (!room.teams.some((t) => t.ownerUid) && !confirm('Nessuna squadra ha un allenatore: le scelte le farai tutte tu. Parto lo stesso?')) return;
    state.hasShownOrderModal = false;
    const order = room.teams.map((t) => t.id);
    const index = firstOpenIndex(order, room.teams);
    await updateDoc(roomRef(), {
        status: 'started',
        draftOrder: order,
        currentTurnIndex: index,
        roundNumber: 1,
        turnStartedAt: Date.now(),
        timerPaused: false,
        pausedElapsed: 0,
        draftHistory: [],
        currentPick: suggestion(room.teams, room.teams.find((t) => t.id === order[index])),
    });
}

export function renderOrderPreview(order) {
    document.getElementById('order-preview-list').innerHTML = order.map((id, i) => {
        const team = state.roomData.teams.find((t) => t.id === id);
        return `<li style="--n:${i}">${esc(team ? team.name : id)}</li>`;
    }).join('');
}

// Fisher-Yates on the first-round order (host, before the first pick).
export async function shuffleOrder() {
    const room = state.roomData;
    if (!state.isHost || !room?.draftOrder) return;
    const order = [...room.draftOrder];
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    const index = firstOpenIndex(order, room.teams);
    await updateDoc(roomRef(), {
        draftOrder: order,
        currentTurnIndex: index,
        turnStartedAt: Date.now(),
        currentPick: suggestion(room.teams, room.teams.find((t) => t.id === order[index])),
    }).catch((e) => console.error('shuffle', e));
}

export function selectPlayerForAuction(playerId) {
    if (!canAct(currentTeam())) return showToast('Non è il tuo turno: guarda pure, scegli quando tocca a te.');
    updateDoc(roomRef(), { currentPick: { playerId: String(playerId) } }).catch((e) => showToast('Selezione non salvata: ' + e.message));
}

// One write for every turn change: teams, next turn, undo snapshot, history.
async function commitPick(room, team, player, auto = false) {
    const { teams, items } = applyPick(room, team.id, player, state.players, state.byId);
    const turn = nextTurn(room, teams, state.byId);
    await updateDoc(roomRef(), {
        teams,
        ...turn,
        currentPick: null,
        turnStartedAt: Date.now(),
        pausedElapsed: 0,
        lastPickState: { teams: room.teams, currentTurnIndex: room.currentTurnIndex, roundNumber: room.roundNumber, draftOrder: room.draftOrder },
        draftHistory: [...(room.draftHistory || []), ...items.map((p) => ({
            teamId: team.id, teamName: team.name, playerId: String(p.id), playerName: p.name, role: p.role, cost: p.cost,
            round: room.roundNumber, timestamp: Date.now(), ...(auto && { isAutoPick: true }),
        }))],
    });
    const extra = items.length > 1 ? ` e ${items.length - 1} portier${items.length > 2 ? 'i' : 'e'} della stessa squadra` : '';
    showToast(`${auto ? 'Tempo scaduto: d\'ufficio ' : ''}${player.name}${extra} a ${team.name}.`);
    playSound('pick');
}

export async function confirmPick() {
    const room = state.roomData;
    const team = currentTeam(room);
    if (!team) return showToast("L'asta è finita.");
    if (!room.currentPick) return showToast('Prima scegli un giocatore dalla lista.');
    if (!canAct(team)) return showToast(`Non è il tuo turno: tocca a ${team.name}.`);
    if (state.isHost && team.ownerUid !== state.user.uid && !confirm(`Fai la scelta al posto di "${team.name}"?`)) return;

    const player = state.byId.get(String(room.currentPick.playerId));
    if (!player) return showBigError('Questo giocatore non è più nel listone. Scegline un altro.');
    const err = pickError(room, team, player, state.byId);
    if (err) return showBigError(err);

    const btn = document.getElementById('btn-confirm-pick');
    btn.disabled = true;
    try {
        await commitPick(room, team, player);
        document.getElementById('active-player-card').classList.remove('flash');
        void document.getElementById('active-player-card').offsetWidth;
        document.getElementById('active-player-card').classList.add('flash');
    } catch (e) {
        console.error(e);
        showToast('Scelta non salvata: ' + e.message);
    } finally {
        btn.disabled = false;
    }
}

let autoPickedTurn = null;

// Timer at zero: the host's browser assigns the most expensive free player in the role the team needs.
export async function autoPickForTimeout() {
    const room = state.roomData;
    const team = currentTeam(room);
    if (!state.isHost || !team) return;
    const key = `${room.roundNumber}/${room.currentTurnIndex}/${room.turnStartedAt}`;
    if (autoPickedTurn === key) return;   // snapshots re-run the timer: one auto pick per turn
    autoPickedTurn = key;

    const player = bestAvailable(room.teams, team, state.players, state.byId);
    try {
        if (player && !pickError({ ...room, settings: { ...room.settings, strictRoles: false } }, team, player, state.byId)) {
            return await commitPick(room, team, player, true);
        }
        await updateDoc(roomRef(), { ...nextTurn(room, room.teams, state.byId), currentPick: null, turnStartedAt: Date.now(), pausedElapsed: 0 });
        showToast(`Tempo scaduto: ${team.name} salta il turno.`);
    } catch (e) {
        console.error('auto pick', e);
    }
}

// Imported rosters: the host picks how turns are decided, recomputed after every pick.
export async function applyDraftOrder(type) {
    const room = state.roomData;
    if (!state.isHost || !room) return;
    const order = dynamicOrder(room.teams, type, state.byId, !!room.settings?.strictRoles);
    const index = firstOpenIndex(order, room.teams);
    await updateDoc(roomRef(), {
        draftOrder: order,
        currentTurnIndex: index,
        orderSettingsApplied: true,
        turnStartedAt: Date.now(),
        currentPick: suggestion(room.teams, room.teams.find((t) => t.id === order[index])),
        'settings.sortMode': type,
    });
    closeModal('modal-order-settings');
    showToast('Ordine dei turni aggiornato.');
}

export async function undoPick() {
    const room = state.roomData;
    if (!state.isHost || !room?.lastPickState) return showToast('Non c\'è una scelta da annullare.');
    if (!confirm("Annulli l'ultima scelta? La squadra torna di turno.")) return;
    const s = room.lastPickState;
    // the last pick added one history entry per player (the goalkeeper block adds up to three)
    const added = s.teams.reduce((n, t) => n - (t.roster?.length || 0), room.teams.reduce((n, t) => n + (t.roster?.length || 0), 0));
    try {
        await updateDoc(roomRef(), {
            teams: s.teams,
            currentTurnIndex: s.currentTurnIndex,
            roundNumber: s.roundNumber,
            draftOrder: s.draftOrder,
            draftHistory: (room.draftHistory || []).slice(0, -Math.max(1, added)),
            currentPick: null,
            lastPickState: null,
            turnStartedAt: Date.now(),
            pausedElapsed: 0,
        });
        closeModal('modal-profile');
        showToast('Ultima scelta annullata.');
    } catch (e) {
        console.error(e);
        showToast('Annullamento non riuscito.');
    }
}

// Pause keeps the time already used, so resuming gives back exactly what was left.
export async function toggleTimerPause() {
    const room = state.roomData;
    if (!state.isHost || !room) return;
    const update = room.timerPaused
        ? { timerPaused: false, turnStartedAt: Date.now() - (room.pausedElapsed || 0) }
        : { timerPaused: true, pausedElapsed: Date.now() - room.turnStartedAt };
    await updateDoc(roomRef(), update).catch((e) => console.error('pause', e));
    showToast(room.timerPaused ? 'Timer ripartito.' : 'Timer in pausa.');
}

export function setupDraftListeners() {
    document.getElementById('btn-start-draft').addEventListener('click', startDraft);
    document.getElementById('btn-confirm-pick').addEventListener('click', confirmPick);
    document.getElementById('btn-clear-pick').addEventListener('click', () => {
        if (state.currentRoomId && canAct(currentTeam())) updateDoc(roomRef(), { currentPick: null });
    });
    for (const type of ['strict', 'count', 'value']) {
        document.getElementById(`btn-order-${type}`).addEventListener('click', () => applyDraftOrder(type));
    }
    document.getElementById('btn-undo-pick').addEventListener('click', undoPick);
    document.getElementById('btn-timer-pause').addEventListener('click', toggleTimerPause);
}
