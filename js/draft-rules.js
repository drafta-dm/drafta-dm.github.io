// Draft rules with no DOM and no Firebase: what a team still needs, who picks next,
// what a pick adds. `node js/draft-rules.test.mjs` checks them.

export const SLOTS = { P: 3, D: 8, C: 8, A: 6 };
export const ROSTER_SIZE = 25;
export const ROLES = ['P', 'D', 'C', 'A'];

// Roster entries carry role and name since v7; older rooms only have the id, so fall back to the player list.
export function countRoles(roster, byId) {
    const c = { P: 0, D: 0, C: 0, A: 0 };
    for (const r of roster || []) {
        const role = r.role || byId.get(String(r.playerId))?.role;
        if (role in c) c[role]++;
    }
    return c;
}

// First role still missing, in the order P -> D -> C -> A. null = team complete.
export const neededRole = (counts) => ROLES.find((r) => counts[r] < SLOTS[r]) || null;

export const isOpen = (team) => (team?.roster?.length || 0) < ROSTER_SIZE;

export function takenIds(teams) {
    const s = new Set();
    for (const t of teams) for (const r of t.roster || []) s.add(String(r.playerId));
    return s;
}

// Who spent less picks first; with strict roles, whoever is further behind on roles goes before.
// Ties: compare the most expensive player, then the second, and so on.
export function compareTeams(a, b, byId, strict) {
    if (strict) {
        const prio = (t) => { const n = neededRole(countRoles(t.roster, byId)); return n ? ROLES.indexOf(n) : 4; };
        const d = prio(a) - prio(b);
        if (d) return d;
    }
    const d = (a.totalValue || 0) - (b.totalValue || 0);
    if (d) return d;
    const costs = (t) => (t.roster || []).map((r) => r.cost || 0).sort((x, y) => y - x);
    const ca = costs(a), cb = costs(b);
    for (let i = 0; i < Math.max(ca.length, cb.length); i++) {
        if ((ca[i] || 0) !== (cb[i] || 0)) return (ca[i] || 0) - (cb[i] || 0);
    }
    return 0;
}

// Order recomputed after every pick: 'strict' = missing roles first, 'count' = fewer players first, 'value' = spent less first.
export function dynamicOrder(teams, type, byId, strict) {
    const total = (t) => (t.roster || []).length;
    const phase = (t) => { const n = neededRole(countRoles(t.roster, byId)); return n ? ROLES.indexOf(n) : 4; };
    return [...teams].sort((a, b) => {
        if (type === 'strict' && phase(a) !== phase(b)) return phase(a) - phase(b);
        if (type === 'count' && total(a) !== total(b)) return total(a) - total(b);
        return compareTeams(a, b, byId, strict);
    }).map((t) => t.id);
}

// Turn after the current one, skipping complete teams. A new round re-sorts the teams (snake mode);
// with a sortMode the order is recomputed every pick. currentTurnIndex = draftOrder.length means the draft is over.
export function nextTurn(room, teams, byId) {
    const strict = !!room.settings?.strictRoles;
    const sortMode = room.settings?.sortMode;
    let order = room.draftOrder, round = room.roundNumber || 1, i = room.currentTurnIndex + 1;
    if (!teams.some(isOpen)) return { draftOrder: order, roundNumber: round, currentTurnIndex: order.length };
    if (sortMode) { order = dynamicOrder(teams, sortMode, byId, strict); i = 0; }
    const byTeam = new Map(teams.map((t) => [t.id, t]));
    for (let tries = 0; tries <= order.length * 2; tries++) {
        if (i >= order.length) {
            i = 0;
            if (!sortMode) { round++; order = [...teams].sort((a, b) => compareTeams(a, b, byId, strict)).map((t) => t.id); }
        }
        if (isOpen(byTeam.get(order[i]))) break;
        i++;
    }
    return { draftOrder: order, roundNumber: round, currentTurnIndex: i };
}

// Why this pick is not allowed, or null.
export function pickError(room, team, player, byId) {
    if (takenIds(room.teams).has(String(player.id))) return `${player.name} è già in un'altra rosa.`;
    const counts = countRoles(team.roster, byId);
    if (counts[player.role] >= SLOTS[player.role]) return `Slot ${player.role} già completi.`;
    const need = neededRole(counts);
    if (room.settings?.strictRoles && player.role !== need) return `Con l'ordine dei ruoli prima servono i ${need}.`;
    return null;
}

// Adds the player (and, with the goalkeeper block, up to two team-mates in goal) to the team.
export function applyPick(room, teamId, player, players, byId) {
    const teams = structuredClone(room.teams);
    const team = teams.find((t) => t.id === teamId);
    const items = [player];
    if (player.role === 'P' && room.settings?.blockGK && countRoles(team.roster, byId).P === 0) {
        const taken = takenIds(room.teams);
        items.push(...players.filter((p) => p.team === player.team && p.role === 'P' && p.id !== player.id && !taken.has(String(p.id))).slice(0, 2));
    }
    const spent = items.reduce((s, p) => s + p.cost, 0);
    team.roster.push(...items.map((p) => ({ playerId: p.id, cost: p.cost, role: p.role, name: p.name })));
    team.credits = (team.credits || 0) - spent;
    team.totalValue = (team.totalValue || 0) + spent;
    return { teams, items };
}

// Most expensive free player in the role the team needs (any role if that one is sold out).
export function bestAvailable(teams, team, players, byId) {
    const need = neededRole(countRoles(team.roster, byId));
    if (!need) return null;
    const taken = takenIds(teams);
    const free = players.filter((p) => !taken.has(String(p.id)));
    const pool = free.some((p) => p.role === need) ? free.filter((p) => p.role === need) : free;
    return pool.sort((a, b) => b.cost - a.cost || String(a.name).localeCompare(String(b.name)))[0] || null;
}

// First team in the order that still has room.
export function firstOpenIndex(order, teams) {
    const i = order.findIndex((id) => isOpen(teams.find((t) => t.id === id)));
    return i === -1 ? order.length : i;
}
