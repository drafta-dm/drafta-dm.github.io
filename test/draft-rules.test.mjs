// node test/draft-rules.test.mjs
import assert from 'node:assert/strict';
import { countRoles, neededRole, nextTurn, pickError, applyPick, bestAvailable, dynamicOrder, firstOpenIndex } from '../js/draft-rules.js';

const players = [];
let id = 1;
for (const [role, n] of Object.entries({ P: 9, D: 20, C: 20, A: 15 })) {
    for (let i = 0; i < n; i++) players.push({ id: String(id++), name: `${role}${i}`, team: ['Inter', 'Milan', 'Roma'][i % 3], role, cost: 100 - i });
}
const byId = new Map(players.map((p) => [p.id, p]));
const fill = (spec) => Object.entries(spec).flatMap(([role, n]) => players.filter((p) => p.role === role).slice(0, n).map((p) => ({ playerId: p.id, cost: p.cost })));
const team = (tid, roster = [], totalValue = 0) => ({ id: tid, name: tid, roster, totalValue, credits: 500 });

// roles and what is missing
assert.deepEqual(countRoles(fill({ P: 2, D: 1 }), byId), { P: 2, D: 1, C: 0, A: 0 });
assert.equal(neededRole(countRoles(fill({ P: 3, D: 8 }), byId)), 'C');
assert.equal(neededRole(countRoles(fill({ P: 3, D: 8, C: 8, A: 6 }), byId)), null);
// a roster entry that knows its role does not need the player list (player gone from the new season)
assert.equal(countRoles([{ playerId: 'gone', role: 'A' }], byId).A, 1);

// snake: next team, then a new round re-sorted by money spent
const room = { teams: [team('t1', [], 50), team('t2', [], 10)], draftOrder: ['t1', 't2'], currentTurnIndex: 0, roundNumber: 1, settings: {} };
assert.deepEqual(nextTurn(room, room.teams, byId), { draftOrder: ['t1', 't2'], roundNumber: 1, currentTurnIndex: 1 });
assert.deepEqual(nextTurn({ ...room, currentTurnIndex: 1 }, room.teams, byId), { draftOrder: ['t2', 't1'], roundNumber: 2, currentTurnIndex: 0 });

// complete teams are skipped, and a full draft ends
const full = fill({ P: 3, D: 8, C: 8, A: 6 });
const r2 = { ...room, teams: [team('t1'), team('t2', full), team('t3')], draftOrder: ['t1', 't2', 't3'] };
assert.equal(nextTurn(r2, r2.teams, byId).currentTurnIndex, 2);
const done = [team('t1', full), team('t2', full)];
assert.equal(nextTurn({ ...room, teams: done }, done, byId).currentTurnIndex, 2);
assert.equal(firstOpenIndex(['t2', 't3'], r2.teams), 1);

// dynamic order: whoever is behind on roles picks first, round stays put
const behind = team('late', fill({ P: 1 })), ahead = team('early', fill({ P: 3, D: 2 }));
assert.deepEqual(dynamicOrder([ahead, behind], 'strict', byId, true), ['late', 'early']);
const dyn = { teams: [ahead, behind], draftOrder: ['late', 'early'], currentTurnIndex: 0, roundNumber: 3, settings: { sortMode: 'strict', strictRoles: true } };
assert.deepEqual(nextTurn(dyn, dyn.teams, byId), { draftOrder: ['late', 'early'], roundNumber: 3, currentTurnIndex: 0 });

// pick checks: taken, slots full, strict order
const p0 = players[0], d0 = players.find((p) => p.role === 'D');
const r3 = { teams: [team('a', [{ playerId: p0.id, cost: p0.cost }]), team('b')], settings: { strictRoles: true } };
assert.match(pickError(r3, r3.teams[1], p0, byId), /già/);
assert.match(pickError(r3, r3.teams[1], d0, byId), /prima servono i P/);
assert.equal(pickError({ ...r3, settings: {} }, r3.teams[1], d0, byId), null);
const r4 = { teams: [team('a', fill({ P: 3 }))], settings: {} };
assert.match(pickError(r4, r4.teams[0], players[5], byId), /Slot P/);

// goalkeeper block: two free team-mates in goal come along, costs add up
const gk = players.find((p) => p.role === 'P' && p.team === 'Milan');
const r5 = { teams: [team('a')], settings: { blockGK: true } };
const { teams, items } = applyPick(r5, 'a', gk, players, byId);
assert.equal(items.length, 3);
assert.ok(items.every((p) => p.team === 'Milan' && p.role === 'P'));
assert.equal(teams[0].roster.length, 3);
assert.equal(teams[0].totalValue, items.reduce((s, p) => s + p.cost, 0));
assert.equal(r5.teams[0].roster.length, 0, 'the room passed in is not touched');

// auto pick: most expensive free player in the needed role
assert.equal(bestAvailable([team('a')], team('a'), players, byId).id, players[0].id);
assert.equal(bestAvailable(r3.teams, team('c', fill({ P: 3 })), players, byId).role, 'D');

console.log('draft-rules: ok');
