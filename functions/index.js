const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

// Initialize Firebase Admin
initializeApp();

const db = getFirestore();

/**
 * Send FCM notification when turn changes
 * Triggers on any change to /rooms/{roomId}
 */
exports.onTurnChange = onDocumentWritten("rooms/{roomId}", async (event) => {
    const beforeData = event.data.before?.data();
    const afterData = event.data.after?.data();

    // Check if document was deleted
    if (!afterData) {
        console.log("Room deleted, skipping notification");
        return null;
    }

    // Check if turn actually changed
    if (!beforeData || beforeData.currentTurnIndex !== afterData.currentTurnIndex) {
        console.log("Turn changed, sending notification");

        const currentTeamId = afterData.draftOrder?.[afterData.currentTurnIndex];
        if (!currentTeamId) {
            console.log("No current team found");
            return null;
        }

        const currentTeam = afterData.teams?.find(t => t.id === currentTeamId);
        if (!currentTeam || !currentTeam.ownerUid) {
            console.log("Team or owner not found");
            return null;
        }

        const ownerUid = currentTeam.ownerUid;
        const teamName = currentTeam.name;

        // Get user's FCM tokens
        const tokensSnapshot = await db.collection(`users/${ownerUid}/fcmTokens`).get();

        if (tokensSnapshot.empty) {
            console.log("No FCM tokens found for user:", ownerUid);
            return null;
        }

        const tokens = tokensSnapshot.docs.map(doc => doc.data().token);

        // Prepare message
        const message = {
            notification: {
                title: "È il tuo turno!",
                body: `Tocca a ${teamName} - Fai la tua scelta nel draft! 🎯`
            },
            data: {
                type: "turn_notification",
                roomId: event.params.roomId,
                teamId: currentTeamId
            },
            tokens: tokens,
            // 1) Web Push Config (Action Link)
            webpush: {
                fcm_options: {
                    link: `https://davide-mariotti.github.io/games/drafta/`
                }
            },
            // 2) APNs (Apple) Config for Background/Closed App
            apns: {
                headers: {
                    "apns-priority": "10"
                },
                payload: {
                    aps: {
                        "content-available": 1,
                        "sound": "default"
                    }
                }
            }
        };

        // Send to all user's devices
        try {
            const response = await getMessaging().sendEachForMulticast(message);
            console.log("Successfully sent turn notification:", response.successCount, "success,", response.failureCount, "failures");

            // Clean up invalid tokens
            if (response.failureCount > 0) {
                const tokensToRemove = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        tokensToRemove.push(tokens[idx]);
                    }
                });

                // Delete invalid tokens
                const batch = db.batch();
                tokensToRemove.forEach(token => {
                    const tokenRef = db.doc(`users/${ownerUid}/fcmTokens/${token}`);
                    batch.delete(tokenRef);
                });
                await batch.commit();
                console.log("Removed", tokensToRemove.length, "invalid tokens");
            }

            return response;
        } catch (error) {
            console.error("Error sending turn notification:", error);
            return null;
        }
    }

    return null;
});

/**
 * Send FCM notification when nudge is sent
 * Triggers when notification field is updated in room
 */
exports.onNudge = onDocumentWritten("rooms/{roomId}", async (event) => {
    const beforeData = event.data.before?.data();
    const afterData = event.data.after?.data();

    // Check if document was deleted
    if (!afterData) {
        return null;
    }

    // Check if notification field changed (nudge was sent)
    if (afterData.notification &&
        (!beforeData?.notification || beforeData.notification.timestamp !== afterData.notification.timestamp)) {

        console.log("Nudge detected, sending notification");

        const targetUid = afterData.notification.targetUid;
        const sender = afterData.notification.sender;
        const message = afterData.notification.msg;

        if (!targetUid) {
            console.log("No target UID in nudge");
            return null;
        }

        // Get user's FCM tokens
        const tokensSnapshot = await db.collection(`users/${targetUid}/fcmTokens`).get();

        if (tokensSnapshot.empty) {
            console.log("No FCM tokens found for nudged user:", targetUid);
            return null;
        }

        const tokens = tokensSnapshot.docs.map(doc => doc.data().token);

        // Prepare message
        const fcmMessage = {
            notification: {
                title: "Sollecito Drafta",
                body: `${sender}: ${message}`
            },
            data: {
                type: "nudge_notification",
                roomId: event.params.roomId,
                sender: sender
            },
            tokens: tokens,
            // 1) Web Push Config (Action Link)
            webpush: {
                fcm_options: {
                    link: `https://davide-mariotti.github.io/games/drafta/`
                }
            },
            // 2) APNs (Apple) Config for Background/Closed App
            apns: {
                headers: {
                    "apns-priority": "10"
                },
                payload: {
                    aps: {
                        "content-available": 1,
                        "sound": "default"
                    }
                }
            }
        };

        // Send to all user's devices
        try {
            const response = await getMessaging().sendEachForMulticast(fcmMessage);
            console.log("Successfully sent nudge notification:", response.successCount, "success,", response.failureCount, "failures");

            // Clean up invalid tokens
            if (response.failureCount > 0) {
                const tokensToRemove = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        tokensToRemove.push(tokens[idx]);
                    }
                });

                // Delete invalid tokens
                const batch = db.batch();
                tokensToRemove.forEach(token => {
                    const tokenRef = db.doc(`users/${targetUid}/fcmTokens/${token}`);
                    batch.delete(tokenRef);
                });
                await batch.commit();
                console.log("Removed", tokensToRemove.length, "invalid tokens");
            }

            return response;
        } catch (error) {
            console.error("Error sending nudge notification:", error);
            return null;
        }
    }

    return null;
});
