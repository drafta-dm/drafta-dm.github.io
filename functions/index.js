const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const APP = "https://drafta-dm.github.io/";
const DEAD = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"];

// Push to every device of a user; tokens the service says are gone get deleted.
async function push(uid, { title, body, tag, data }) {
    const snap = await db.collection(`users/${uid}/fcmTokens`).get();
    if (snap.empty) return;
    const tokens = snap.docs.map((d) => d.id);
    const res = await getMessaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        data,
        // same tag as the notification the open app shows, so the two collapse into one
        webpush: { notification: { tag, icon: `${APP}icons/icon-192x192.png` }, fcmOptions: { link: APP } },
        apns: { payload: { aps: { sound: "default" } } },
    });
    const dead = res.responses.map((r, i) => (!r.success && DEAD.includes(r.error?.code) ? tokens[i] : null)).filter(Boolean);
    if (dead.length) {
        const batch = db.batch();
        dead.forEach((t) => batch.delete(db.doc(`users/${uid}/fcmTokens/${t}`)));
        await batch.commit();
    }
}

// One trigger for both: turn changes and nudges. Presence and chat live in subcollections and don't wake it up.
exports.onRoomUpdate = onDocumentUpdated("rooms/{roomId}", async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    const roomId = event.params.roomId;
    const jobs = [];
    // any member can write the room: notify only people who are in it, with short texts
    const inRoom = (uid) => typeof uid === "string" && (after.participantIds || []).includes(uid);
    const cut = (s, n) => String(s ?? "").slice(0, n);

    // compare the team on turn, not the index: with a dynamic order the index stays 0 every pick
    const teamOnTurn = (d) => d.status === "started" ? d.draftOrder?.[d.currentTurnIndex] : null;
    const teamId = teamOnTurn(after);
    if (teamId && teamId !== teamOnTurn(before)) {
        const team = after.teams?.find((t) => t.id === teamId);
        if (inRoom(team?.ownerUid)) {
            jobs.push(push(team.ownerUid, {
                title: "Tocca a te",
                body: `${cut(team.name, 30)}: fai la tua scelta nel draft.`,
                tag: "drafta-turn",
                data: { type: "turn_notification", roomId, teamId },
            }));
        }
    }

    const n = after.notification;
    if (inRoom(n?.targetUid) && n.timestamp !== before.notification?.timestamp) {
        jobs.push(push(n.targetUid, {
            title: "Sollecito",
            body: `${cut(n.sender, 40)}: ${cut(n.msg, 120)}`,
            tag: "drafta-nudge",
            data: { type: "nudge_notification", roomId },
        }));
    }

    await Promise.all(jobs);
});
