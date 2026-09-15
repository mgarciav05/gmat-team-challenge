/**
 * DEMO backend — BroadcastChannel + localStorage.
 *
 * Purpose: a ZERO-SETUP way to build, rehearse and demo the entire flow —
 * registration, team formation, questions, scoring, leaderboard — using
 * only multiple browser TABS/WINDOWS on the SAME computer, in the SAME
 * browser profile. No account, no internet, no config needed.
 *
 * IMPORTANT, HONEST LIMITATION (surfaced in the UI, not hidden):
 * localStorage and BroadcastChannel are scoped to one browser profile on
 * one device. Two different phones — or even Chrome vs. Safari on the same
 * laptop — do NOT share this state. This mode is for solo rehearsal only.
 * For a real class where 10-50 students join from their own phones, use
 * BACKEND_MODE = "firebase" (see config.js and SETUP_GUIDE.md).
 *
 * Data shape kept identical to the Firebase backend so the rest of the app
 * (app.js) never needs to know which backend is active:
 *   { participants: [...], teams: [...], submissions: [...], meta: {...} }
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.GtcStoreDemo = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STORAGE_KEY_PREFIX = "gtc_demo_state_";
  const CHANNEL_PREFIX = "gtc_demo_channel_";

  function initialState() {
    return {
      participants: [],
      teams: [],
      submissions: [],
      meta: {
        phase: "REGISTRATION",
        currentQuestionIndex: 0,
        revealLeaderboard: false,
        startedAt: null,
        endedAt: null,
      },
    };
  }

  function createDemoStore(sessionId) {
    const storageKey = STORAGE_KEY_PREFIX + sessionId;
    const channelName = CHANNEL_PREFIX + sessionId;
    const listeners = [];
    let channel = null;
    try {
      channel = new BroadcastChannel(channelName);
    } catch (e) {
      channel = null; // BroadcastChannel unsupported (rare) — storage event still works across tabs.
    }

    function readState() {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return initialState();
        const parsed = JSON.parse(raw);
        return {
          participants: parsed.participants || [],
          teams: parsed.teams || [],
          submissions: parsed.submissions || [],
          meta: Object.assign(initialState().meta, parsed.meta || {}),
        };
      } catch (e) {
        return initialState();
      }
    }

    function writeState(state) {
      localStorage.setItem(storageKey, JSON.stringify(state));
      notifyLocal(state);
      if (channel) {
        try {
          channel.postMessage({ type: "update" });
        } catch (e) {
          /* ignore */
        }
      }
    }

    function notifyLocal(state) {
      listeners.forEach((cb) => {
        try {
          cb(state);
        } catch (e) {
          console.error("gtc demo store listener error", e);
        }
      });
    }

    function mutate(fn) {
      const state = readState();
      fn(state);
      writeState(state);
      return Promise.resolve(state);
    }

    if (channel) {
      channel.onmessage = () => notifyLocal(readState());
    }
    // Fallback for browsers/tabs where BroadcastChannel delivery is flaky:
    // the native `storage` event fires in OTHER tabs whenever localStorage
    // changes (never in the tab that made the change, which is fine — that
    // tab already called notifyLocal() synchronously via writeState()).
    window.addEventListener("storage", (e) => {
      if (e.key === storageKey) notifyLocal(readState());
    });

    return {
      mode: "demo",

      onChange(cb) {
        listeners.push(cb);
        cb(readState());
        return () => {
          const idx = listeners.indexOf(cb);
          if (idx !== -1) listeners.splice(idx, 1);
        };
      },

      getState() {
        return readState();
      },

      addParticipant(participant) {
        return mutate((s) => {
          s.participants.push(participant);
        });
      },

      updateParticipant(id, patch) {
        return mutate((s) => {
          const p = s.participants.find((x) => x.id === id);
          if (p) Object.assign(p, patch);
        });
      },

      removeParticipant(id) {
        return mutate((s) => {
          s.participants = s.participants.filter((x) => x.id !== id);
          s.teams.forEach((t) => {
            t.memberIds = (t.memberIds || []).filter((mid) => mid !== id);
          });
        });
      },

      setTeams(teams) {
        return mutate((s) => {
          s.teams = teams;
        });
      },

      updateTeam(id, patch) {
        return mutate((s) => {
          const t = s.teams.find((x) => x.id === id);
          if (t) Object.assign(t, patch);
        });
      },

      upsertSubmission(submission) {
        return mutate((s) => {
          const idx = s.submissions.findIndex((x) => x.id === submission.id);
          if (idx === -1) s.submissions.push(submission);
          else s.submissions[idx] = Object.assign({}, s.submissions[idx], submission);
        });
      },

      updateSubmission(id, patch) {
        return mutate((s) => {
          const sub = s.submissions.find((x) => x.id === id);
          if (sub) Object.assign(sub, patch);
        });
      },

      clearSubmissions() {
        return mutate((s) => {
          s.submissions = [];
        });
      },

      setMeta(patch) {
        return mutate((s) => {
          Object.assign(s.meta, patch);
        });
      },

      resetParticipants() {
        return mutate((s) => {
          s.participants = [];
          s.teams = [];
        });
      },

      resetChallenge() {
        return mutate((s) => {
          const fresh = initialState();
          s.participants = fresh.participants;
          s.teams = fresh.teams;
          s.submissions = fresh.submissions;
          s.meta = fresh.meta;
        });
      },

      destroy() {
        if (channel) channel.close();
      },
    };
  }

  return { createDemoStore: createDemoStore };
});
