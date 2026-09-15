/**
 * FIREBASE backend — Cloud Firestore, real multi-device sync.
 *
 * This is the backend to use for the actual class: every participant's
 * phone, and the host's laptop, read/write the SAME Firestore database, so
 * state is shared across any number of physical devices on any network.
 *
 * Data model (matches the facilitator's spec), one Firestore collection
 * group per concept, all nested under a single session so a whole class's
 * data lives at one predictable path and is trivial to wipe/reset:
 *
 *   sessions/{SESSION_ID}/participants/{participantId} -> {id, name, teamId, joinedAt}
 *   sessions/{SESSION_ID}/teams/{teamId}               -> {id, name, memberIds, locked, createdAt}
 *   sessions/{SESSION_ID}/submissions/{teamId_questionId} -> {id, teamId, questionId, selected,
 *                                                              explanation, auto:{...}, manualBonus,
 *                                                              finalScore, submittedAt}
 *   sessions/{SESSION_ID}/meta/state                    -> {phase, currentQuestionIndex,
 *                                                              revealLeaderboard, startedAt, endedAt}
 *
 * Using one document per participant/team/submission (instead of one giant
 * document with arrays) means two different students submitting at the same
 * moment write two different documents — no read-modify-write race, no
 * transactions needed for the common case. This is also why the Firestore
 * security rules needed for this app are a single, short rule block (see
 * SETUP_GUIDE.md): everything lives under `sessions/{sessionId}/**`.
 *
 * Auth: anonymous sign-in (`signInAnonymously`) — no login screen for
 * students, but every read/write is tied to a real (if anonymous) Firebase
 * Auth session, so `request.auth != null` is a meaningful rule condition
 * and casual drive-by scripts hitting the database from outside the app
 * still need to go through Firebase Auth first.
 *
 * ANTI-CHEAT NOTE (also explained to the user in the final writeup):
 * this is NOT bank-level security. A student who opens DevTools and knows
 * the Firestore collection paths could, in principle, call the Firestore
 * SDK directly to write a fabricated score. What this design DOES achieve,
 * which a purely static/local-state app cannot: editing the page's HTML/JS
 * on your OWN phone never changes what anyone else — including the host's
 * projected leaderboard — sees, because the source of truth lives in the
 * cloud database, not in the page. Casual tampering (the realistic risk in
 * a 40-minute class) is blocked; a determined attacker with DevTools
 * knowledge is not, short of adding server-side validation (Cloud
 * Functions), which is intentionally out of scope for a 15-minute non-
 * technical setup. This tradeoff is documented, not hidden.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.GtcStoreFirebase = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function initialMeta() {
    return {
      phase: "REGISTRATION",
      currentQuestionIndex: 0,
      revealLeaderboard: false,
      startedAt: null,
      endedAt: null,
    };
  }

  /**
   * @param {Object} firebaseConfig - the object copy-pasted from the Firebase console.
   * @param {string} sessionId
   * @returns {Promise<Object>} resolves to the store once auth + Firestore are ready.
   */
  function createFirebaseStore(firebaseConfig, sessionId) {
    return new Promise((resolve, reject) => {
      // The Firebase SDK <script> tags are deliberately marked `defer` and
      // placed AFTER app.js in index.html (see the comment there): this way
      // a slow/blocked connection to gstatic.com never blocks DEMO mode from
      // becoming interactive. The tradeoff is that, in FIREBASE mode, boot()
      // can run (and reach this function) before those deferred scripts have
      // had a chance to execute — deferred scripts run in strict document
      // order, not "whichever finishes downloading first". So instead of
      // failing instantly on `typeof firebase === "undefined"`, we poll
      // briefly for the global to appear before giving up for real.
      const startedWaitingAt = Date.now();
      const maxWaitMs = 8000;

      function waitForFirebaseSdk() {
        if (typeof firebase !== "undefined") {
          proceed();
          return;
        }
        if (Date.now() - startedWaitingAt > maxWaitMs) {
          reject(new Error("Firebase SDK no cargó. Revisa tu conexión a internet y que los <script> de Firebase estén antes de app.js."));
          return;
        }
        setTimeout(waitForFirebaseSdk, 100);
      }

      waitForFirebaseSdk();

      function proceed() {
      let app;
      try {
        app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
      } catch (e) {
        reject(e);
        return;
      }

      const auth = firebase.auth();
      const db = firebase.firestore();
      const base = db.collection("sessions").doc(sessionId);
      const participantsCol = base.collection("participants");
      const teamsCol = base.collection("teams");
      const submissionsCol = base.collection("submissions");
      const metaDoc = base.collection("meta").doc("state");

      const listeners = [];
      let latest = { participants: [], teams: [], submissions: [], meta: initialMeta() };
      let unsubs = [];

      function emit() {
        listeners.forEach((cb) => {
          try {
            cb(latest);
          } catch (e) {
            console.error("gtc firebase store listener error", e);
          }
        });
      }

      function attachListeners() {
        unsubs.push(
          participantsCol.onSnapshot(
            (snap) => {
              latest = Object.assign({}, latest, { participants: snap.docs.map((d) => d.data()) });
              emit();
            },
            (err) => console.error("participants onSnapshot error", err)
          )
        );
        unsubs.push(
          teamsCol.onSnapshot(
            (snap) => {
              latest = Object.assign({}, latest, { teams: snap.docs.map((d) => d.data()) });
              emit();
            },
            (err) => console.error("teams onSnapshot error", err)
          )
        );
        unsubs.push(
          submissionsCol.onSnapshot(
            (snap) => {
              latest = Object.assign({}, latest, { submissions: snap.docs.map((d) => d.data()) });
              emit();
            },
            (err) => console.error("submissions onSnapshot error", err)
          )
        );
        unsubs.push(
          metaDoc.onSnapshot(
            (doc) => {
              latest = Object.assign({}, latest, { meta: Object.assign(initialMeta(), doc.exists ? doc.data() : {}) });
              emit();
            },
            (err) => console.error("meta onSnapshot error", err)
          )
        );
      }

      async function ensureMetaExists() {
        const snap = await metaDoc.get();
        if (!snap.exists) await metaDoc.set(initialMeta());
      }

      auth.signInAnonymously().catch(reject);
      auth.onAuthStateChanged((user) => {
        if (!user) return;
        ensureMetaExists()
          .then(() => {
            attachListeners();
            resolve(buildStoreApi());
          })
          .catch(reject);
      });

      function buildStoreApi() {
        return {
          mode: "firebase",

          onChange(cb) {
            listeners.push(cb);
            cb(latest);
            return () => {
              const idx = listeners.indexOf(cb);
              if (idx !== -1) listeners.splice(idx, 1);
            };
          },

          getState() {
            return latest;
          },

          addParticipant(participant) {
            return participantsCol.doc(participant.id).set(participant);
          },

          updateParticipant(id, patch) {
            return participantsCol.doc(id).set(patch, { merge: true });
          },

          removeParticipant(id) {
            const batch = db.batch();
            batch.delete(participantsCol.doc(id));
            latest.teams.forEach((t) => {
              if ((t.memberIds || []).includes(id)) {
                batch.set(teamsCol.doc(t.id), { memberIds: t.memberIds.filter((m) => m !== id) }, { merge: true });
              }
            });
            return batch.commit();
          },

          setTeams(teams) {
            // Bulk replace: delete existing team docs, write the new set.
            return teamsCol
              .get()
              .then((snap) => {
                const batch = db.batch();
                snap.docs.forEach((d) => batch.delete(d.ref));
                teams.forEach((t) => batch.set(teamsCol.doc(t.id), t));
                return batch.commit();
              });
          },

          updateTeam(id, patch) {
            return teamsCol.doc(id).set(patch, { merge: true });
          },

          upsertSubmission(submission) {
            return submissionsCol.doc(submission.id).set(submission, { merge: true });
          },

          updateSubmission(id, patch) {
            return submissionsCol.doc(id).set(patch, { merge: true });
          },

          clearSubmissions() {
            return submissionsCol.get().then((snap) => {
              const batch = db.batch();
              snap.docs.forEach((d) => batch.delete(d.ref));
              return batch.commit();
            });
          },

          setMeta(patch) {
            return metaDoc.set(patch, { merge: true });
          },

          resetParticipants() {
            return Promise.all([participantsCol.get(), teamsCol.get()]).then(([pSnap, tSnap]) => {
              const batch = db.batch();
              pSnap.docs.forEach((d) => batch.delete(d.ref));
              tSnap.docs.forEach((d) => batch.delete(d.ref));
              return batch.commit();
            });
          },

          resetChallenge() {
            return Promise.all([participantsCol.get(), teamsCol.get(), submissionsCol.get()]).then(([pSnap, tSnap, sSnap]) => {
              const batch = db.batch();
              pSnap.docs.forEach((d) => batch.delete(d.ref));
              tSnap.docs.forEach((d) => batch.delete(d.ref));
              sSnap.docs.forEach((d) => batch.delete(d.ref));
              batch.set(metaDoc, initialMeta());
              return batch.commit();
            });
          },

          destroy() {
            unsubs.forEach((u) => u());
            unsubs = [];
          },
        };
      }
      } // end proceed()
    });
  }

  return { createFirebaseStore: createFirebaseStore };
});
