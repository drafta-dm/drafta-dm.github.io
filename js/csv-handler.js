// CSV in the Fantacalcio.it league format: "$,$,$" between teams, then "Team,PlayerId,Cost" rows.
// Export at the end of the draft; import to start a repair draft from rosters you already have.

import { db, doc, setDoc, serverTimestamp } from './firebase-modules.js';
import { state } from './state.js';
import { showToast, generateRoomId } from './utils.js';
import { enterRoom } from './room-manager.js';
import { bestAvailable, firstOpenIndex } from './draft-rules.js';

export function exportTeamsToCSV() {
    const room = state.roomData;
    if (!room?.teams) return showToast('Niente da esportare.');
    const clean = (s) => String(s).replace(/[,\r\n]/g, ' ');
    const lines = room.teams.flatMap((t) => ['$,$,$', ...(t.roster || []).map((r) => `${clean(t.name)},${r.playerId},0`)]);
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `drafta-${state.currentRoomId}-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV scaricato.');
}

export function parseCSV(text) {
    const teams = new Map();
    for (const row of text.split(/\r?\n/)) {
        const [name, id] = row.split(',').map((s) => s?.trim());
        if (!name || name === '$' || !id) continue;
        if (!teams.has(name)) teams.set(name, []);
        teams.get(name).push(id);
    }
    return teams;
}

export async function createRoomFromCSV(text) {
    if (!state.user) return;
    const parsed = parseCSV(text);
    if (!parsed.size) throw new Error('nessuna squadra nel file');
    if (parsed.size > 20) throw new Error(`${parsed.size} squadre, il massimo è 20`);

    let missing = 0;
    const teams = [...parsed].map(([name, ids], i) => {
        const roster = ids.map((id) => state.byId.get(String(id))).filter((p) => p || !++missing)
            .map((p) => ({ playerId: String(p.id), cost: p.cost, role: p.role, name: p.name }));
        const spent = roster.reduce((s, r) => s + r.cost, 0);
        return { id: `team-${i + 1}`, name: name.slice(0, 30), ownerUid: i === 0 ? state.user.uid : null, ownerName: i === 0 ? (state.user.displayName || 'Host') : null, credits: 500 - spent, roster, totalValue: spent };
    });

    const roomId = generateRoomId();
    const draftOrder = teams.map((t) => t.id);
    const index = firstOpenIndex(draftOrder, teams);
    const first = bestAvailable(teams, teams[index] || teams[0], state.players, state.byId);
    await setDoc(doc(db, 'rooms', roomId), {
        hostId: state.user.uid,
        password: generateRoomId(4),
        status: 'started',
        isImported: true,
        participantIds: [state.user.uid],
        participantNames: { [state.user.uid]: state.user.displayName || 'Host' },
        teams,
        draftOrder,
        currentTurnIndex: index,
        roundNumber: 1,
        turnStartedAt: Date.now(),
        draftHistory: [],
        currentPick: first ? { playerId: String(first.id) } : null,
        settings: { blockGK: false, strictRoles: true, timerDuration: 0 },
        createdAt: serverTimestamp(),
    });
    showToast(missing ? `Asta creata. ${missing} giocatori non sono nel listone di quest'anno e sono rimasti fuori.` : 'Asta creata dalle rose importate.');
    enterRoom(roomId, true);
}

export function setupCSVListeners() {
    document.getElementById('btn-export-csv').addEventListener('click', exportTeamsToCSV);
    const input = document.getElementById('input-import-csv');
    document.getElementById('btn-import-room').addEventListener('click', () => { input.value = ''; input.click(); });
    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        try {
            await createRoomFromCSV(await file.text());
        } catch (e) {
            console.error(e);
            showToast('Importazione non riuscita: ' + e.message);
        }
    });
}
