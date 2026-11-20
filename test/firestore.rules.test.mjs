// firestore.rules on the Firestore emulator. In test/: npm install, then npm test (needs Java 11+).
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, addDoc, arrayUnion } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const env = await initializeTestEnvironment({
    projectId: 'drafta-rules-test',
    firestore: { rules: readFileSync(process.argv[2], 'utf8'), host: '127.0.0.1', port: 8080 },
});
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = env.unauthenticatedContext().firestore();
const room = { hostId: 'host', password: 'AB12', status: 'lobby', participantIds: ['host'], participantNames: { host: 'Host' }, teams: [], settings: { blockGK: true } };
let ok = 0;
const check = async (name, p) => { await p; ok++; console.log('ok', name); };

// create: only as yourself and alone
await check('create own room', assertSucceeds(setDoc(doc(as('host'), 'rooms/R1'), room)));
await check('create for someone else', assertFails(setDoc(doc(as('eve'), 'rooms/R2'), { ...room })));
await check('create with extra members', assertFails(setDoc(doc(as('eve'), 'rooms/R3'), { ...room, hostId: 'eve', participantIds: ['eve', 'x'] })));

// reading
await check('anonymous read', assertFails(getDoc(doc(anon, 'rooms/R1'))));
await check('stranger read (password hidden)', assertFails(getDoc(doc(as('eve'), 'rooms/R1'))));
await check('stranger lists all rooms', assertFails(getDocs(collection(as('eve'), 'rooms'))));
await check('host reads', assertSucceeds(getDoc(doc(as('host'), 'rooms/R1'))));
await check('my rooms query', assertSucceeds(getDocs(query(collection(as('host'), 'rooms'), where('participantIds', 'array-contains', 'host')))));

// joining
const join = (uid, pass, extra = {}) => updateDoc(doc(as(uid), 'rooms/R1'), { participantIds: arrayUnion(uid), [`participantNames.${uid}`]: uid, [`joins.${uid}`]: pass, ...extra });
await check('join wrong password', assertFails(join('bob', 'XXXX')));
await check('join and change settings', assertFails(join('bob', 'AB12', { settings: {} })));
await check('join renaming someone else', assertFails(join('bob', 'AB12', { 'participantNames.host': 'pwned' })));
await check('join right password', assertSucceeds(join('bob', 'AB12')));
await check('member reads after joining', assertSucceeds(getDoc(doc(as('bob'), 'rooms/R1'))));

// members
await check('member plays (currentPick)', assertSucceeds(updateDoc(doc(as('bob'), 'rooms/R1'), { currentPick: { playerId: '1' } })));
await check('member changes password', assertFails(updateDoc(doc(as('bob'), 'rooms/R1'), { password: 'x' })));
await check('member kicks someone', assertFails(updateDoc(doc(as('bob'), 'rooms/R1'), { participantIds: ['bob'] })));
await check('member takes over host', assertFails(updateDoc(doc(as('bob'), 'rooms/R1'), { hostId: 'bob' })));
await check('member deletes room', assertFails(deleteDoc(doc(as('bob'), 'rooms/R1'))));
await check('member renames someone else', assertFails(updateDoc(doc(as('bob'), 'rooms/R1'), { 'participantNames.host': 'pwned' })));
await check('host changes settings', assertSucceeds(updateDoc(doc(as('host'), 'rooms/R1'), { 'settings.sortMode': 'strict' })));

// chat and presence
await check('member writes chat', assertSucceeds(addDoc(collection(as('bob'), 'rooms/R1/messages'), { uid: 'bob', text: 'ciao' })));
await check('chat as someone else', assertFails(addDoc(collection(as('bob'), 'rooms/R1/messages'), { uid: 'host', text: 'x' })));
await check('chat too long', assertFails(addDoc(collection(as('bob'), 'rooms/R1/messages'), { uid: 'bob', text: 'x'.repeat(501) })));
await check('stranger reads chat', assertFails(getDocs(collection(as('eve'), 'rooms/R1/messages'))));
await check('member reads chat', assertSucceeds(getDocs(collection(as('host'), 'rooms/R1/messages'))));
await check('own presence', assertSucceeds(setDoc(doc(as('bob'), 'rooms/R1/presence/bob'), { at: 1 })));
await check('someone else presence', assertFails(setDoc(doc(as('bob'), 'rooms/R1/presence/host'), { at: 1 })));
await check('stranger presence', assertFails(setDoc(doc(as('eve'), 'rooms/R1/presence/eve'), { at: 1 })));
await check('members read presence', assertSucceeds(getDocs(collection(as('host'), 'rooms/R1/presence'))));

// tokens
await check('own token', assertSucceeds(setDoc(doc(as('bob'), 'users/bob/fcmTokens/t1'), { token: 't1' })));
await check('read another user token', assertFails(getDoc(doc(as('eve'), 'users/bob/fcmTokens/t1'))));

await check('host deletes room', assertSucceeds(deleteDoc(doc(as('host'), 'rooms/R1'))));
await env.cleanup();
console.log(`rules: ${ok} checks ok`);
