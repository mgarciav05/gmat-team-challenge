/* =====================================================================
   GMAT TEAM CHALLENGE — application logic
   Vanilla JS, no build step. Relies on globals defined by earlier
   <script> tags: BACKEND_MODE / FIREBASE_CONFIG / SESSION_ID / HOST_PASSWORD
   / APP_URL (config.js), GmatQuestions, GmatScoring, TeamFormation, GtcStore.
   ===================================================================== */

(function () {
  "use strict";

  const QUESTIONS = GmatQuestions.QUESTIONS;
  const TEAM_NAME_SUGGESTIONS = ["The Quantifiers", "Bulls & Bears", "The Consultants", "Logic Legends", "Ctrl+Alt+GMAT"];

  // ---------------------------------------------------------------
  // Identity — deliberately PER TAB (sessionStorage), not per browser
  // profile (localStorage). Two reasons:
  //  1. A student who closes and reopens the join link mid-class is a rare
  //     edge case (worst case: re-register in 5 seconds).
  //  2. It lets ONE person rehearse the whole multi-student flow solo, in
  //     demo mode, just by opening several regular browser tabs — each tab
  //     gets its own identity, while DEMO mode's BroadcastChannel+
  //     localStorage still syncs the shared challenge state between them.
  //     (If identity were in localStorage instead, every tab in the same
  //     browser would collide onto the same "me", which would break both
  //     real multi-tab rehearsal and this app's own test suite.)
  // ---------------------------------------------------------------
  const SS_ID_KEY = "gtc_myid_" + SESSION_ID;
  const SS_HOST_KEY = "gtc_host_ok_" + SESSION_ID;

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function getMyId() {
    let id = sessionStorage.getItem(SS_ID_KEY);
    if (!id) {
      id = uid("p");
      sessionStorage.setItem(SS_ID_KEY, id);
    }
    return id;
  }

  const MY_ID = getMyId();

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }

  // ---------------------------------------------------------------
  // Local (ephemeral, per-tab) UI state — not shared, not persisted
  // ---------------------------------------------------------------
  const ui = {
    role: qs("projector") ? "projector" : qs("host") ? "host" : "student",
    hostUnlocked: sessionStorage.getItem(SS_HOST_KEY) === "1",
    hostPasswordError: "",
    hostTab: "overview",
    showRubric: false,
    regStep: "landing", // landing -> form
    nameDraft: "",
    shuffleAnimFor: null,
    shuffleSeenTeamIds: new Set(),
    teamNameDraft: "",
    selectedLetter: null,
    explanationDraft: "",
    lastRenderedQuestionKey: null,
    countdownPlayedFor: null,
    winnerRevealPlayed: false,
    addParticipantDraft: "",
  };

  let store = null;
  let state = { participants: [], teams: [], submissions: [], meta: { phase: "REGISTRATION", currentQuestionIndex: 0, revealLeaderboard: false } };

  // ---------------------------------------------------------------
  // Derived helpers
  // ---------------------------------------------------------------
  function findMyTeam() {
    return state.teams.find((t) => (t.memberIds || []).includes(MY_ID));
  }
  function findMe() {
    return state.participants.find((p) => p.id === MY_ID);
  }
  function submissionId(teamId, questionId) {
    return teamId + "__" + questionId;
  }
  function getSubmission(teamId, questionId) {
    return state.submissions.find((s) => s.id === submissionId(teamId, questionId));
  }
  function teamsById() {
    const map = {};
    state.teams.forEach((t) => (map[t.id] = t));
    return map;
  }

  function computeTeamStats(team) {
    const subs = state.submissions.filter((s) => s.teamId === team.id);
    let totalScore = 0,
      correctCount = 0,
      reasoningSum = 0,
      reasoningMax = 0;
    subs.forEach((s) => {
      totalScore += s.finalScore || 0;
      if (s.auto && s.auto.isCorrect) correctCount++;
      reasoningSum += (s.auto ? s.auto.reasoningPts + s.auto.constraintPts : 0) + (s.manualBonus || 0);
      reasoningMax += 50; // 30 reasoning + 20 constraints per question
    });
    const reasoningPct = reasoningMax ? Math.round((reasoningSum / reasoningMax) * 100) : 0;
    return { totalScore, correctCount, reasoningPct, answered: subs.length, subs };
  }

  function computeLeaderboard() {
    return state.teams
      .map((t) => Object.assign({ team: t }, computeTeamStats(t)))
      .sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
        if (b.reasoningPct !== a.reasoningPct) return b.reasoningPct - a.reasoningPct;
        return (a.team.name || "").localeCompare(b.team.name || "");
      });
  }

  function computeBadges(ranked) {
    const badges = {}; // teamId -> [labels]
    ranked.forEach((r) => (badges[r.team.id] = []));
    if (!ranked.length) return badges;

    // Logic Master: best average reasoning% among teams that answered all 5.
    const fullyAnswered = ranked.filter((r) => r.answered === QUESTIONS.length);
    if (fullyAnswered.length) {
      const best = fullyAnswered.slice().sort((a, b) => b.reasoningPct - a.reasoningPct)[0];
      if (best.reasoningPct >= 70) badges[best.team.id].push("🧠 Logic Master");
    }

    // Perfect Reasoning: any single submission with 30/30 reasoning + 20/20 constraints.
    state.submissions.forEach((s) => {
      if (s.auto && s.auto.reasoningPts === 30 && s.auto.constraintPts === 20) {
        if (badges[s.teamId] && !badges[s.teamId].includes("🎯 Perfect Reasoning")) badges[s.teamId].push("🎯 Perfect Reasoning");
      }
    });

    // Best Explanation: highest single (reasoning+constraint) score overall.
    let bestExp = null;
    state.submissions.forEach((s) => {
      const val = s.auto ? s.auto.reasoningPts + s.auto.constraintPts : 0;
      if (!bestExp || val > bestExp.val) bestExp = { val: val, teamId: s.teamId };
    });
    if (bestExp && bestExp.val >= 35 && badges[bestExp.teamId]) badges[bestExp.teamId].push("💡 Best Explanation");

    // Comeback Team: avg score on Q4+Q5 notably higher than Q1+Q2.
    ranked.forEach((r) => {
      const early = r.subs.filter((s) => ["q1", "q2"].includes(s.questionId));
      const late = r.subs.filter((s) => ["q4", "q5"].includes(s.questionId));
      if (early.length && late.length) {
        const earlyAvg = early.reduce((a, s) => a + s.finalScore, 0) / early.length;
        const lateAvg = late.reduce((a, s) => a + s.finalScore, 0) / late.length;
        if (lateAvg - earlyAvg >= 25) badges[r.team.id].push("🔥 Comeback Team");
      }
    });

    return badges;
  }

  // ---------------------------------------------------------------
  // Store wiring
  // ---------------------------------------------------------------
  const root = document.getElementById("gtc-root");

  function boot() {
    root.innerHTML = '<div class="gtc-screen"><div class="gtc-eyebrow">GMAT Team Challenge</div><div class="gtc-subtitle">Conectando…</div></div>';
    GtcStore.createStore({ BACKEND_MODE: BACKEND_MODE, FIREBASE_CONFIG: FIREBASE_CONFIG, SESSION_ID: SESSION_ID })
      .then((s) => {
        store = s;
        store.onChange((newState) => {
          state = newState;
          render();
        });
      })
      .catch((err) => {
        console.error(err);
        root.innerHTML =
          '<div class="gtc-screen"><div class="gtc-title">No se pudo conectar</div><div class="gtc-subtitle">' +
          escapeHtml(err.message || String(err)) +
          "</div></div>";
      });
  }

  // ---------------------------------------------------------------
  // Render dispatch
  // ---------------------------------------------------------------
  function render() {
    if (ui.role === "projector") return renderProjector();
    if (ui.role === "host") return ui.hostUnlocked ? renderHostDashboard() : renderHostLogin();
    if (ui.showRubric) return renderRubricScreen();
    return renderStudent();
  }

  function renderRubricScreen() {
    const R = GmatScoring.RUBRIC;
    root.innerHTML =
      '<div class="gtc-screen">' +
      '<div class="gtc-eyebrow">Cómo se califica</div>' +
      '<h1 class="gtc-title" style="font-size:26px;">100 puntos por pregunta</h1>' +
      '<div class="gtc-card" style="max-width:520px;text-align:left;">' +
      '<div class="gtc-row" style="justify-content:space-between;margin-bottom:14px;">' +
      scoreChip(R.points.correctness, "Exactitud") +
      scoreChip(R.points.reasoning, "Calidad del razonamiento") +
      scoreChip(R.points.constraints, "Manejo de condiciones") +
      scoreChip(R.points.clarity, "Claridad") +
      "</div>" +
      '<div class="gtc-section-title" style="color:#1e2761;margin-top:0;">Rúbrica de razonamiento (60 de los 100 puntos)</div>' +
      R.bands
        .map(
          (b) =>
            '<div class="gtc-rubric-band"><span class="gtc-rubric-range">' + b.range + " · " + b.label + "</span><br/><span style=\"color:#7d87a6;font-size:13.5px;\">" + b.desc + "</span></div>"
        )
        .join("") +
      '<p style="color:#7d87a6;font-size:13.5px;margin-top:10px;">' +
      R.note +
      "</p>" +
      '<button class="gtc-btn gtc-btn-primary gtc-mt" style="width:100%;" onclick="GTC.closeRubric()">ENTENDIDO</button>' +
      "</div>" +
      "</div>";
  }
  function scoreChip(pts, label) {
    return '<div style="text-align:center;flex:1;"><div style="font-size:22px;font-weight:800;color:#1e2761;">' + pts + '</div><div style="font-size:11px;color:#7d87a6;text-transform:uppercase;">' + label + "</div></div>";
  }
  function openRubric() {
    ui.showRubric = true;
    render();
  }
  function closeRubric() {
    ui.showRubric = false;
    render();
  }

  function renderStudent() {
    const me = findMe();
    if (!me) return ui.regStep === "form" ? renderRegistrationForm() : renderLanding();

    const myTeam = findMyTeam();

    // Team-formation reveal animation: play once per newly-seen team id.
    if (myTeam && ui.shuffleAnimFor === null && !ui.shuffleSeenTeamIds.has(myTeam.id)) {
      ui.shuffleSeenTeamIds.add(myTeam.id);
      ui.shuffleAnimFor = myTeam.id;
      setTimeout(() => {
        ui.shuffleAnimFor = null;
        render();
      }, 2800);
    }
    if (myTeam && ui.shuffleAnimFor === myTeam.id) return renderShuffleReveal(myTeam);

    const phase = state.meta.phase;
    if (phase === "LEADERBOARD" || phase === "ENDED") return renderLeaderboardScreen(phase === "ENDED");

    if (!myTeam) return renderWaitingRoom(me);

    if (phase === "QUESTION") return renderQuestionScreen(myTeam);

    // REGISTRATION or TEAM_NAMING
    if (!myTeam.locked) return renderTeamNaming(myTeam);
    return renderLobby(myTeam);
  }

  // ---------------------------------------------------------------
  // STUDENT: Landing
  // ---------------------------------------------------------------
  function renderLanding() {
    root.innerHTML =
      '<div class="gtc-screen">' +
      '<div class="gtc-eyebrow">Finance &amp; Investment Club · Universidad de los Andes</div>' +
      '<h1 class="gtc-title">GMAT TEAM CHALLENGE</h1>' +
      '<p class="gtc-subtitle">Think better. Reason together. Win on quality.</p>' +
      '<div class="gtc-card" style="max-width:440px;">' +
      '<p style="margin:0 0 18px;line-height:1.55;color:#3a3f5c;">Este no es un examen de velocidad. Vas a resolver problemas de lógica estilo GMAT <b>en equipo</b>, y lo que más pesa en el puntaje es la <b>calidad de tu razonamiento</b> — no quién contesta primero.</p>' +
      '<button class="gtc-btn gtc-btn-primary" style="width:100%;" onclick="GTC.goToRegister()">JOIN THE CHALLENGE</button>' +
      "</div>" +
      '<div class="gtc-row gtc-mt">' +
      '<button class="gtc-link-btn" onclick="GTC.openRubric()">📊 ¿Cómo se califica?</button>' +
      '<button class="gtc-link-btn" onclick="GTC.openHostLoginFromStudent()">¿Eres el facilitador? Host login</button>' +
      "</div>" +
      "</div>";
  }

  function renderRegistrationForm() {
    root.innerHTML =
      '<div class="gtc-screen">' +
      '<div class="gtc-eyebrow">Paso 1 de 1</div>' +
      '<h1 class="gtc-title" style="font-size:28px;">¿Cuál es tu nombre?</h1>' +
      '<div class="gtc-card" style="max-width:420px;">' +
      '<label class="gtc-field-label">Nombre completo</label>' +
      '<input id="gtc-name-input" class="gtc-input" placeholder="Ej. Manuela García" value="' +
      escapeHtml(ui.nameDraft) +
      '" oninput="GTC.onNameInput(this.value)" onkeydown="if(event.key===\'Enter\')GTC.submitRegistration()" />' +
      '<button id="gtc-join-btn" class="gtc-btn gtc-btn-primary gtc-mt" style="width:100%;" ' +
      (ui.nameDraft.trim().length < 2 ? "disabled" : "") +
      ' onclick="GTC.submitRegistration()">JOIN</button>' +
      "</div>" +
      "</div>";
    setTimeout(() => {
      const el = document.getElementById("gtc-name-input");
      if (el) el.focus();
    }, 0);
  }

  function renderWaitingRoom(me) {
    const count = state.participants.length;
    root.innerHTML =
      '<div class="gtc-screen">' +
      '<div class="gtc-eyebrow"><span class="gtc-pulse-dot"></span>Estás dentro</div>' +
      '<h1 class="gtc-title" style="font-size:26px;">✓ You\'re in, ' +
      escapeHtml(me.name) +
      "!</h1>" +
      '<p class="gtc-subtitle">Esperando a los demás participantes…</p>' +
      '<div class="gtc-card-dark" style="max-width:340px;">' +
      '<div class="gtc-counter">' +
      count +
      "</div>" +
      '<div class="gtc-counter-label">Participantes conectados</div>' +
      "</div>" +
      '<p class="gtc-muted gtc-mt">El facilitador formará los equipos en cualquier momento.</p>' +
      "</div>";
  }

  function renderShuffleReveal(myTeam) {
    const names = (myTeam.memberIds || []).map((id) => {
      const p = state.participants.find((x) => x.id === id);
      return p ? p.name : "?";
    });
    root.innerHTML =
      '<div class="gtc-screen">' +
      '<div class="gtc-eyebrow">Formando equipos</div>' +
      '<h1 class="gtc-title" style="font-size:30px;">SHUFFLING PARTICIPANTS…</h1>' +
      '<div class="gtc-shuffle-stage">' +
      state.participants
        .slice(0, 24)
        .map((p) => '<span class="gtc-shuffle-chip">👤 ' + escapeHtml(p.name.split(" ")[0]) + "</span>")
        .join("") +
      "</div>" +
      '<div class="gtc-team-reveal-card">' +
      '<div class="gtc-team-reveal-title">TU EQUIPO — ' +
      escapeHtml(teamDisplayNumber(myTeam)) +
      "</div>" +
      names.map((n) => '<div class="gtc-team-reveal-member">👤 ' + escapeHtml(n) + "</div>").join("") +
      "</div>" +
      "</div>";
  }

  function teamDisplayNumber(team) {
    const idx = state.teams.findIndex((t) => t.id === team.id);
    return "EQUIPO " + String(idx + 1).padStart(2, "0");
  }

  function renderTeamNaming(myTeam) {
    const draft = ui.teamNameDraft !== "" ? ui.teamNameDraft : myTeam.name || "";
    root.innerHTML =
      '<div class="gtc-screen">' +
      '<div class="gtc-eyebrow">' +
      escapeHtml(teamDisplayNumber(myTeam)) +
      "</div>" +
      '<h1 class="gtc-title" style="font-size:26px;">Ponle nombre a tu equipo</h1>' +
      '<div class="gtc-card" style="max-width:440px;">' +
      renderMembersList(myTeam) +
      '<label class="gtc-field-label gtc-mt">Nombre del equipo</label>' +
      '<input id="gtc-team-name-input" class="gtc-input" placeholder="Ej. The Quantifiers" value="' +
      escapeHtml(draft) +
      '" oninput="GTC.onTeamNameInput(this.value)" />' +
      '<div class="gtc-row gtc-mt-sm" style="justify-content:flex-start;">' +
      TEAM_NAME_SUGGESTIONS.map((s) => '<button class="gtc-mini-btn" onclick="GTC.pickTeamNameSuggestion(\'' + s.replace(/'/g, "\\'") + "')\">" + s + "</button>").join("") +
      "</div>" +
      '<button class="gtc-btn gtc-btn-primary gtc-mt" style="width:100%;" ' +
      (draft.trim().length < 2 ? "disabled" : "") +
      ' onclick="GTC.lockTeamName(\'' +
      myTeam.id +
      '\')">LOCK TEAM NAME</button>' +
      "</div>" +
      "</div>";
  }

  function renderMembersList(team) {
    const names = (team.memberIds || []).map((id) => {
      const p = state.participants.find((x) => x.id === id);
      return p ? p.name : "?";
    });
    return '<div class="gtc-muted" style="text-align:left;">Miembros: ' + escapeHtml(names.join(", ")) + "</div>";
  }

  function renderLobby(myTeam) {
    root.innerHTML =
      '<div class="gtc-screen">' +
      '<div class="gtc-eyebrow">Sala de espera</div>' +
      '<h1 class="gtc-title" style="font-size:26px;">GMAT TEAM CHALLENGE</h1>' +
      '<p class="gtc-subtitle">Tu equipo: <b>' +
      escapeHtml(myTeam.name) +
      '</b> — esperando a que el facilitador inicie el reto.</p>' +
      '<div class="gtc-team-grid">' +
      state.teams.map((t) => renderTeamTile(t, t.id === myTeam.id)).join("") +
      "</div>" +
      "</div>";
  }

  function renderTeamTile(t, mine) {
    return (
      '<div class="gtc-team-tile' +
      (mine ? " gtc-team-mine" : "") +
      '">' +
      '<div class="gtc-team-tile-name">' +
      escapeHtml(t.name || "(sin nombre)") +
      "</div>" +
      '<div class="gtc-team-tile-meta">' +
      (t.memberIds || []).length +
      " integrantes</div>" +
      '<span class="gtc-status-pill ' +
      (t.locked ? "gtc-status-ready" : "gtc-status-waiting") +
      '">● ' +
      (t.locked ? "Ready" : "Eligiendo nombre") +
      "</span>" +
      "</div>"
    );
  }

  // ---------------------------------------------------------------
  // STUDENT: Question screen
  // ---------------------------------------------------------------
  function renderQuestionScreen(myTeam) {
    const qIndex = state.meta.currentQuestionIndex;
    const q = QUESTIONS[qIndex];
    const existing = getSubmission(myTeam.id, q.id);
    const qKey = myTeam.id + "_" + q.id;
    if (ui.lastRenderedQuestionKey !== qKey) {
      ui.lastRenderedQuestionKey = qKey;
      ui.selectedLetter = existing ? existing.selected : null;
      ui.explanationDraft = existing ? existing.explanation : "";
    }

    if (existing) return renderQuestionSubmitted(myTeam, q, existing, qIndex);

    const stepReasoning = ui.selectedLetter !== null;

    root.innerHTML =
      '<div class="gtc-screen" style="justify-content:flex-start;">' +
      '<div class="gtc-question-wrap">' +
      '<div class="gtc-qmeta">' +
      '<div class="gtc-qprogress">Pregunta ' +
      (qIndex + 1) +
      " de " +
      QUESTIONS.length +
      "</div>" +
      '<div class="gtc-quality-note">🧠 Take your time. Quality matters more than speed.</div>' +
      '<button class="gtc-link-btn" onclick="GTC.openRubric()">📊 rúbrica</button>' +
      "</div>" +
      '<div class="gtc-case-card">' +
      '<div class="gtc-step-badge">' +
      (stepReasoning ? "PASO 2 · Explica tu razonamiento" : "PASO 1 · Elige tu respuesta") +
      "</div>" +
      '<div class="gtc-case-context">' +
      escapeHtml(q.context) +
      "</div>" +
      (q.rule ? '<div class="gtc-case-rule">' + escapeHtml(q.rule) + "</div>" : "") +
      (q.fact ? '<div class="gtc-case-rule">' + escapeHtml(q.fact) + "</div>" : "") +
      (q.rulesList ? '<ul style="padding-left:18px;">' + q.rulesList.map((r) => "<li>" + escapeHtml(r) + "</li>").join("") + "</ul>" : "") +
      '<div class="gtc-case-question">' +
      escapeHtml(q.question) +
      "</div>" +
      (stepReasoning ? renderReasoningStep(myTeam, q) : renderAnswerOptions(q)) +
      "</div>" +
      "</div>" +
      "</div>";
  }

  function renderAnswerOptions(q) {
    if (q.tableHeaders) {
      return (
        '<table class="gtc-table"><thead><tr>' +
        q.tableHeaders.map((h) => "<th>" + escapeHtml(h) + "</th>").join("") +
        "</tr></thead><tbody>" +
        q.tableRows
          .map((row) => {
            const letter = row[0];
            const sel = ui.selectedLetter === letter;
            return (
              '<tr class="gtc-row-selectable' +
              (sel ? " selected" : "") +
              '" onclick="GTC.selectLetter(\'' +
              letter +
              '\')"><td class="gtc-rowletter">' +
              letter +
              "</td>" +
              row
                .slice(1)
                .map((c) => "<td>" + escapeHtml(c) + "</td>")
                .join("") +
              "</tr>"
            );
          })
          .join("") +
        "</tbody></table>"
      );
    }
    const letters = ["A", "B", "C", "D", "E"];
    return (
      '<div class="gtc-optlist">' +
      q.options
        .map((opt, i) => {
          const letter = letters[i];
          const sel = ui.selectedLetter === letter;
          return (
            '<div class="gtc-option' +
            (sel ? " selected" : "") +
            '" onclick="GTC.selectLetter(\'' +
            letter +
            '\')"><span class="gtc-option-letter">' +
            letter +
            "</span><span>" +
            escapeHtml(opt) +
            "</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderReasoningStep(myTeam, q) {
    return (
      '<div class="gtc-mt">' +
      '<div class="gtc-muted" style="margin-bottom:10px;">Respuesta elegida: <b style="color:#1a1a2e;">' +
      ui.selectedLetter +
      "</b> · <a href=\"#\" onclick=\"GTC.selectLetter(null);return false;\">cambiar</a></div>" +
      '<label class="gtc-field-label">Explica por qué su respuesta es correcta. Nos importa el razonamiento, no solo la letra final.</label>' +
      '<textarea id="gtc-explanation-input" class="gtc-textarea" placeholder="Ej. La regla es un AND, así que se necesitan las dos condiciones a la vez…" oninput="GTC.onExplanationInput(this.value)">' +
      escapeHtml(ui.explanationDraft) +
      "</textarea>" +
      '<div class="gtc-muted gtc-mt-sm">' +
      GmatScoring.wordCount(ui.explanationDraft) +
      " palabras · el puntaje de razonamiento premia una explicación real, no solo la letra correcta." +
      "</div>" +
      '<button class="gtc-btn gtc-btn-primary gtc-mt" style="width:100%;" ' +
      (ui.explanationDraft.trim().length < 3 ? "disabled" : "") +
      ' onclick="GTC.submitAnswer(\'' +
      myTeam.id +
      "', '" +
      q.id +
      '\')">ENVIAR RESPUESTA DEL EQUIPO</button>' +
      "</div>"
    );
  }

  function renderQuestionSubmitted(myTeam, q, sub, qIndex) {
    root.innerHTML =
      '<div class="gtc-screen">' +
      '<div class="gtc-eyebrow">Pregunta ' +
      (qIndex + 1) +
      " de " +
      QUESTIONS.length +
      "</div>" +
      '<h1 class="gtc-title" style="font-size:24px;">Respuesta enviada ✓</h1>' +
      '<div class="gtc-card" style="max-width:440px;text-align:left;">' +
      "<p><b>Su respuesta:</b> " +
      sub.selected +
      "</p>" +
      '<p style="color:#7d87a6;font-size:14px;">"' +
      escapeHtml(sub.explanation) +
      '"</p>' +
      '<p class="gtc-muted">Esperando a que el facilitador avance a la siguiente pregunta…</p>' +
      "</div>" +
      "</div>";
  }

  // ---------------------------------------------------------------
  // STUDENT: Leaderboard
  // ---------------------------------------------------------------
  function renderLeaderboardScreen(ended) {
    const ranked = computeLeaderboard();
    const badges = computeBadges(ranked);
    const showBuildUp = state.meta.phase === "LEADERBOARD" && !ui.winnerRevealPlayed && ranked.length;
    if (showBuildUp) {
      ui.winnerRevealPlayed = true;
      root.innerHTML =
        '<div class="gtc-screen"><div class="gtc-winner-build">AND THE WINNER IS…</div><div class="gtc-pulse-dot"></div></div>';
      setTimeout(() => render(), 2200);
      return;
    }
    root.innerHTML =
      '<div class="gtc-screen">' +
      '<div class="gtc-eyebrow">' +
      (ended ? "Reto finalizado" : "Resultados") +
      "</div>" +
      '<h1 class="gtc-title" style="font-size:28px;">🏆 Leaderboard</h1>' +
      (ranked.length
        ? '<div class="gtc-winner-name">' + escapeHtml(ranked[0].team.name) + "</div>"
        : "") +
      '<div class="gtc-lb-list">' +
      ranked.map((r, i) => renderLbRow(r, i, badges)).join("") +
      "</div>" +
      "</div>";
  }

  function medal(i) {
    return i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : String(i + 1) + ".";
  }

  function renderLbRow(r, i, badges) {
    const b = (badges[r.team.id] || []).join("  ");
    return (
      '<div class="gtc-lb-row' +
      (i === 0 ? " gtc-lb-top1" : "") +
      '">' +
      '<div class="gtc-lb-rank">' +
      medal(i) +
      "</div>" +
      '<div class="gtc-lb-info">' +
      '<div class="gtc-lb-name">' +
      escapeHtml(r.team.name || "(sin nombre)") +
      "</div>" +
      '<div class="gtc-lb-sub">' +
      r.correctCount +
      "/" +
      QUESTIONS.length +
      " correctas · Reasoning: " +
      r.reasoningPct +
      "%</div>" +
      (b ? '<div class="gtc-lb-badges">' + b + "</div>" : "") +
      "</div>" +
      '<div class="gtc-lb-score">' +
      r.totalScore +
      " pts</div>" +
      "</div>"
    );
  }

  // =================================================================
  // STUDENT event handlers (exposed on window.GTC)
  // =================================================================
  function goToRegister() {
    ui.regStep = "form";
    render();
  }
  function onNameInput(v) {
    ui.nameDraft = v;
    render();
    // render() replaces the whole screen's innerHTML (see root.innerHTML
    // assignments throughout this file), which destroys and recreates this
    // <input> node on every keystroke and would otherwise drop focus after
    // the first character typed. Re-focus and restore the cursor position
    // immediately after — same pattern already used for the explanation
    // textarea in onExplanationInput below.
    setTimeout(() => {
      const el = document.getElementById("gtc-name-input");
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = el.value.length;
      }
    }, 0);
  }
  function submitRegistration() {
    const name = ui.nameDraft.trim();
    if (name.length < 2) return;
    store.addParticipant({ id: MY_ID, name: name, teamId: null, joinedAt: Date.now() });
  }
  function selectLetter(letter) {
    ui.selectedLetter = letter;
    render();
    if (letter) {
      setTimeout(() => {
        const ta = document.getElementById("gtc-explanation-input");
        if (ta) ta.focus();
      }, 0);
    }
  }
  function onExplanationInput(v) {
    ui.explanationDraft = v;
    render();
    setTimeout(() => {
      const ta = document.getElementById("gtc-explanation-input");
      if (ta) {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = ta.value.length;
      }
    }, 0);
  }
  function submitAnswer(teamId, questionId) {
    const q = QUESTIONS.find((x) => x.id === questionId);
    const auto = GmatScoring.scoreSubmission({ selected: ui.selectedLetter, correct: q.correct, explanation: ui.explanationDraft, question: q });
    store.upsertSubmission({
      id: submissionId(teamId, questionId),
      teamId: teamId,
      questionId: questionId,
      selected: ui.selectedLetter,
      explanation: ui.explanationDraft,
      auto: auto,
      manualBonus: 0,
      finalScore: auto.total,
      submittedAt: Date.now(),
    });
  }
  function onTeamNameInput(v) {
    ui.teamNameDraft = v;
    render();
    // Same focus/cursor restore as onNameInput — render() recreates this
    // <input> node on every keystroke.
    setTimeout(() => {
      const el = document.getElementById("gtc-team-name-input");
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = el.value.length;
      }
    }, 0);
  }
  function pickTeamNameSuggestion(name) {
    ui.teamNameDraft = name;
    render();
  }
  function lockTeamName(teamId) {
    const name = ui.teamNameDraft.trim();
    if (name.length < 2) return;
    store.updateTeam(teamId, { name: name, locked: true });
    ui.teamNameDraft = "";
  }
  function openHostLoginFromStudent() {
    ui.role = "host";
    render();
  }

  // =================================================================
  // HOST
  // =================================================================
  function renderHostLogin() {
    root.innerHTML =
      '<div class="gtc-screen">' +
      '<div class="gtc-eyebrow">Host Dashboard</div>' +
      '<h1 class="gtc-title" style="font-size:26px;">Acceso del facilitador</h1>' +
      '<div class="gtc-card" style="max-width:360px;">' +
      '<label class="gtc-field-label">Contraseña</label>' +
      '<input id="gtc-host-pw" type="password" class="gtc-input" onkeydown="if(event.key===\'Enter\')GTC.tryHostLogin(this.value)" />' +
      (ui.hostPasswordError ? '<div style="color:#c0392b;font-size:13px;margin-top:6px;">' + escapeHtml(ui.hostPasswordError) + "</div>" : "") +
      '<button class="gtc-btn gtc-btn-primary gtc-mt" style="width:100%;" onclick="GTC.tryHostLogin(document.getElementById(\'gtc-host-pw\').value)">ENTRAR</button>' +
      "</div>" +
      '<button class="gtc-link-btn gtc-mt" onclick="GTC.backToStudent()">← Volver a la vista de estudiante</button>' +
      "</div>";
    setTimeout(() => {
      const el = document.getElementById("gtc-host-pw");
      if (el) el.focus();
    }, 0);
  }

  function tryHostLogin(pw) {
    if (pw === HOST_PASSWORD) {
      ui.hostUnlocked = true;
      sessionStorage.setItem(SS_HOST_KEY, "1");
      ui.hostPasswordError = "";
    } else {
      ui.hostPasswordError = "Contraseña incorrecta.";
    }
    render();
  }
  function backToStudent() {
    ui.role = "student";
    render();
  }

  function renderHostDashboard() {
    const phase = state.meta.phase;
    const teamsExist = state.teams.length > 0;
    const atLastQuestion = state.meta.currentQuestionIndex >= QUESTIONS.length - 1;

    root.innerHTML =
      '<div class="host-shell">' +
      '<div class="gtc-host-topbar">' +
      '<div class="gtc-host-brand">🎯 GMAT TEAM CHALLENGE <span class="gtc-tag">HOST</span></div>' +
      '<div class="gtc-row">' +
      '<button class="gtc-mini-btn" onclick="window.open(location.pathname+\'?projector=1\',\'_blank\')">🖥 Abrir vista de proyector</button>' +
      '<button class="gtc-mini-btn" onclick="GTC.backToStudent()">Salir</button>' +
      "</div>" +
      "</div>" +
      '<div class="gtc-host-controls">' +
      '<button class="gtc-btn gtc-btn-primary gtc-btn-sm" onclick="GTC.hostGenerateTeams()">' +
      (teamsExist ? "🔀 RESHUFFLE TEAMS" : "🔀 GENERATE TEAMS") +
      "</button>" +
      '<button class="gtc-btn gtc-btn-dark gtc-btn-sm" ' +
      (!teamsExist || phase === "QUESTION" || phase === "LEADERBOARD" || phase === "ENDED" ? "disabled" : "") +
      ' onclick="GTC.hostStartChallenge()">▶ START CHALLENGE</button>' +
      '<button class="gtc-btn gtc-btn-dark gtc-btn-sm" ' +
      (phase !== "QUESTION" || atLastQuestion ? "disabled" : "") +
      ' onclick="GTC.hostNextQuestion()">⏭ NEXT QUESTION</button>' +
      '<button class="gtc-btn gtc-btn-dark gtc-btn-sm" onclick="GTC.hostRevealLeaderboard()">🏆 REVEAL LEADERBOARD</button>' +
      '<button class="gtc-btn gtc-btn-dark gtc-btn-sm" ' +
      (phase === "ENDED" ? "disabled" : "") +
      ' onclick="GTC.hostEndChallenge()">⏹ END CHALLENGE</button>' +
      '<button class="gtc-btn gtc-btn-danger gtc-btn-sm" onclick="GTC.hostResetParticipants()">↺ Reset participants</button>' +
      '<button class="gtc-btn gtc-btn-danger gtc-btn-sm" onclick="GTC.hostResetChallenge()">⟲ Reset challenge</button>' +
      "</div>" +
      '<div class="gtc-host-body">' +
      '<div class="gtc-host-tabs">' +
      ["overview", "participants", "teams", "questions", "leaderboard"].map(hostTabBtn).join("") +
      "</div>" +
      renderHostTabContent(phase) +
      "</div>" +
      "</div>";
  }

  function hostTabBtn(tab) {
    const labels = { overview: "Overview", participants: "Participantes", teams: "Equipos", questions: "Preguntas", leaderboard: "Leaderboard" };
    return '<button class="gtc-host-tab' + (ui.hostTab === tab ? " active" : "") + '" onclick="GTC.setHostTab(\'' + tab + "')\">" + labels[tab] + "</button>";
  }
  function setHostTab(tab) {
    ui.hostTab = tab;
    render();
  }

  function renderHostTabContent(phase) {
    if (ui.hostTab === "overview") return renderHostOverview(phase);
    if (ui.hostTab === "participants") return renderHostParticipants();
    if (ui.hostTab === "teams") return renderHostTeams();
    if (ui.hostTab === "questions") return renderHostQuestions();
    return renderHostLeaderboardTab();
  }

  function renderHostOverview(phase) {
    const joinUrl = APP_URL && APP_URL.trim() ? APP_URL.trim() : location.href.split("?")[0];
    return (
      '<div class="gtc-stat-grid">' +
      statCard(state.participants.length, "Participantes") +
      statCard(state.teams.length, "Equipos") +
      statCard(phase, "Fase actual") +
      statCard(phase === "QUESTION" ? state.meta.currentQuestionIndex + 1 + " / " + QUESTIONS.length : "—", "Pregunta") +
      "</div>" +
      '<div class="gtc-section-title">JOIN THE CHALLENGE</div>' +
      '<div class="gtc-qr-panel">' +
      '<div class="gtc-qr-img-box"><img id="gtc-qr-img" alt="QR" width="220" height="220" onerror="this.style.display=\'none\';document.getElementById(\'gtc-qr-fallback\').style.display=\'block\';" src="' +
      qrImageUrl(joinUrl) +
      '"/><div id="gtc-qr-fallback" style="display:none;color:#1a1a2e;font-size:12px;width:220px;">No se pudo cargar el QR (sin internet). Usa el enlace de abajo.</div></div>' +
      '<div>' +
      '<div style="font-weight:800;font-size:18px;margin-bottom:6px;">SCAN TO JOIN</div>' +
      '<div class="gtc-muted" style="margin-bottom:10px;">Scan with your phone to join the challenge.</div>' +
      '<div class="gtc-qr-url">' +
      escapeHtml(joinUrl) +
      "</div>" +
      (APP_URL && APP_URL.trim() ? "" : '<div style="color:#e6c065;font-size:12.5px;margin-top:8px;">⚠ APP_URL no está configurado en config.js — este QR apunta a la URL actual del navegador, que solo funciona si ya está desplegado en internet. Ver SETUP_GUIDE.md.</div>') +
      "</div>" +
      "</div>" +
      '<div class="gtc-section-title">Panel de administración de equipos</div>' +
      renderTeamAdminTools()
    );
  }

  function statCard(value, label) {
    return '<div class="gtc-stat-card"><div class="gtc-stat-value">' + escapeHtml(String(value)) + '</div><div class="gtc-stat-label">' + label + "</div></div>";
  }

  function qrImageUrl(url) {
    return "https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=" + encodeURIComponent(url);
  }

  function renderTeamAdminTools() {
    const teamOptions = state.teams.map((t) => '<option value="' + t.id + '">' + escapeHtml(t.name || t.id) + "</option>").join("");
    return (
      '<div class="gtc-host-table-wrap"><table class="gtc-host-table"><thead><tr><th>Herramienta</th><th>Acción</th></tr></thead><tbody>' +
      '<tr><td>Agregar participante manual</td><td><input id="gtc-add-p-name" class="gtc-input" style="width:220px;display:inline-block;" placeholder="Nombre"/> <button class="gtc-mini-btn gold" onclick="GTC.hostAddParticipant()">Agregar</button></td></tr>' +
      '<tr><td>Renombrar equipo</td><td><select id="gtc-rename-team-select" class="gtc-select" style="width:180px;display:inline-block;">' +
      teamOptions +
      '</select> <input id="gtc-rename-team-input" class="gtc-input" style="width:180px;display:inline-block;" placeholder="Nuevo nombre"/> <button class="gtc-mini-btn gold" onclick="GTC.hostRenameTeam()">Renombrar</button></td></tr>' +
      "</tbody></table></div>"
    );
  }

  function hostAddParticipant() {
    const el = document.getElementById("gtc-add-p-name");
    const name = el ? el.value.trim() : "";
    if (name.length < 2) return;
    store.addParticipant({ id: uid("p"), name: name, teamId: null, joinedAt: Date.now() });
  }
  function hostRenameTeam() {
    const sel = document.getElementById("gtc-rename-team-select");
    const input = document.getElementById("gtc-rename-team-input");
    if (!sel || !input || !input.value.trim()) return;
    store.updateTeam(sel.value, { name: input.value.trim() });
  }

  function renderHostParticipants() {
    const tById = teamsById();
    return (
      '<div class="gtc-host-table-wrap"><table class="gtc-host-table"><thead><tr><th>Nombre</th><th>Equipo</th><th>Mover a</th><th></th></tr></thead><tbody>' +
      state.participants
        .map((p) => {
          const currentTeam = state.teams.find((t) => (t.memberIds || []).includes(p.id));
          const options = state.teams
            .map((t) => '<option value="' + t.id + '"' + (currentTeam && currentTeam.id === t.id ? " selected" : "") + ">" + escapeHtml(t.name || t.id) + "</option>")
            .join("");
          return (
            "<tr><td>" +
            escapeHtml(p.name) +
            "</td><td>" +
            (currentTeam ? escapeHtml(currentTeam.name || "(sin nombre)") : "<em>sin equipo</em>") +
            '</td><td><select class="gtc-select" style="width:160px;" onchange="GTC.hostMoveParticipant(\'' +
            p.id +
            "', this.value)\"><option value=''>—</option>" +
            options +
            '</select></td><td><button class="gtc-mini-btn danger" onclick="GTC.hostRemoveParticipant(\'' +
            p.id +
            "')\">Quitar</button></td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function hostMoveParticipant(participantId, newTeamId) {
    if (!newTeamId) return;
    const oldTeam = state.teams.find((t) => (t.memberIds || []).includes(participantId));
    const newTeam = state.teams.find((t) => t.id === newTeamId);
    if (oldTeam && oldTeam.id !== newTeamId) {
      store.updateTeam(oldTeam.id, { memberIds: oldTeam.memberIds.filter((id) => id !== participantId) });
    }
    if (newTeam && !(newTeam.memberIds || []).includes(participantId)) {
      store.updateTeam(newTeamId, { memberIds: (newTeam.memberIds || []).concat(participantId) });
    }
  }
  function hostRemoveParticipant(id) {
    store.removeParticipant(id);
  }

  function renderHostTeams() {
    return (
      '<div class="gtc-host-table-wrap"><table class="gtc-host-table"><thead><tr><th>Equipo</th><th>Miembros</th><th>Progreso</th><th>Score</th><th>Estado</th></tr></thead><tbody>' +
      state.teams
        .map((t) => {
          const stats = computeTeamStats(t);
          const names = (t.memberIds || [])
            .map((id) => {
              const p = state.participants.find((x) => x.id === id);
              return p ? p.name : "?";
            })
            .join(", ");
          return (
            "<tr><td><b>" +
            escapeHtml(t.name || "(sin nombre)") +
            "</b></td><td>" +
            escapeHtml(names) +
            "</td><td>" +
            stats.answered +
            "/" +
            QUESTIONS.length +
            "</td><td>" +
            stats.totalScore +
            " pts</td><td>" +
            (t.locked ? "🔒 Nombre confirmado" : "✏️ Eligiendo nombre") +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function renderHostQuestions() {
    return QUESTIONS.map((q, i) => {
      const subs = state.submissions.filter((s) => s.questionId === q.id);
      const avg = subs.length ? Math.round(subs.reduce((a, s) => a + s.finalScore, 0) / subs.length) : 0;
      return (
        '<div class="gtc-section-title">Q' +
        (i + 1) +
        ". " +
        escapeHtml(q.concept) +
        " — " +
        subs.length +
        "/" +
        state.teams.length +
        " equipos respondieron · promedio " +
        avg +
        " pts</div>" +
        '<div class="gtc-host-table-wrap"><table class="gtc-host-table"><thead><tr><th>Equipo</th><th>Resp.</th><th>Explicación</th><th>Auto</th><th>Manual</th><th>Final</th><th>Ajustar</th></tr></thead><tbody>' +
        (subs.length
          ? subs
              .map((s) => {
                const team = state.teams.find((t) => t.id === s.teamId);
                return (
                  "<tr><td>" +
                  escapeHtml(team ? team.name : s.teamId) +
                  "</td><td><b>" +
                  s.selected +
                  (s.auto.isCorrect ? " ✓" : " ✗") +
                  "</b></td><td><div class=\"gtc-explanation-box\">" +
                  escapeHtml(s.explanation) +
                  "</div></td><td>" +
                  s.auto.total +
                  "</td><td>+" +
                  (s.manualBonus || 0) +
                  "</td><td><b>" +
                  s.finalScore +
                  '</b></td><td><button class="gtc-mini-btn" onclick="GTC.hostAdjustBonus(\'' +
                  s.id +
                  "', 0)\">0</button> <button class=\"gtc-mini-btn\" onclick=\"GTC.hostAdjustBonus('" +
                  s.id +
                  "', 5)\">+5</button> <button class=\"gtc-mini-btn gold\" onclick=\"GTC.hostAdjustBonus('" +
                  s.id +
                  "', 10)\">+10</button></td></tr>"
                );
              })
              .join("")
          : '<tr><td colspan="7" class="gtc-muted">Sin respuestas todavía.</td></tr>') +
        "</tbody></table></div>"
      );
    }).join("");
  }

  function hostAdjustBonus(subId, bonus) {
    const sub = state.submissions.find((s) => s.id === subId);
    if (!sub) return;
    const finalScore = Math.min(100, sub.auto.total + bonus);
    store.updateSubmission(subId, { manualBonus: bonus, finalScore: finalScore });
  }

  function renderHostLeaderboardTab() {
    const ranked = computeLeaderboard();
    const badges = computeBadges(ranked);
    return (
      '<div class="gtc-host-table-wrap"><table class="gtc-host-table"><thead><tr><th>#</th><th>Equipo</th><th>Correctas</th><th>Reasoning %</th><th>Score total</th><th>Badges</th></tr></thead><tbody>' +
      ranked
        .map(
          (r, i) =>
            "<tr><td>" +
            (i + 1) +
            "</td><td><b>" +
            escapeHtml(r.team.name || "(sin nombre)") +
            "</b></td><td>" +
            r.correctCount +
            "/" +
            QUESTIONS.length +
            "</td><td>" +
            r.reasoningPct +
            "%</td><td><b>" +
            r.totalScore +
            "</b></td><td>" +
            (badges[r.team.id] || []).join(" ") +
            "</td></tr>"
        )
        .join("") +
      "</tbody></table></div>" +
      '<p class="gtc-muted">El ranking nunca depende del tiempo — solo de exactitud + calidad del razonamiento. Usa "REVEAL LEADERBOARD" en la barra de controles para mostrar la animación a los estudiantes.</p>'
    );
  }

  // =================================================================
  // HOST actions
  // =================================================================
  function hostGenerateTeams() {
    const already = state.teams.length > 0;
    if (already) {
      const ok = confirm("Ya existen equipos. Volver a barajar creará equipos NUEVOS y borrará las respuestas enviadas hasta ahora. ¿Continuar?");
      if (!ok) return;
    }
    const result = TeamFormation.formTeams(state.participants);
    if (result.degenerate) {
      alert("Solo hay 1 participante registrado — no se puede formar un equipo válido todavía. Espera a que se unan más personas.");
    }
    const teams = result.groups.map((members, i) => ({
      id: uid("team"),
      name: "",
      memberIds: members.map((p) => p.id),
      locked: false,
      createdAt: Date.now(),
    }));
    store.setTeams(teams);
    if (already) {
      store.clearSubmissions();
    }
    store.setMeta({ phase: "TEAM_NAMING", currentQuestionIndex: 0, revealLeaderboard: false });
    ui.hostTab = "teams";
  }

  function hostStartChallenge() {
    if (!state.teams.length) return;
    store.setMeta({ phase: "QUESTION", currentQuestionIndex: 0, startedAt: Date.now() });
  }
  function hostNextQuestion() {
    const next = Math.min(state.meta.currentQuestionIndex + 1, QUESTIONS.length - 1);
    store.setMeta({ currentQuestionIndex: next });
  }
  function hostRevealLeaderboard() {
    ui.winnerRevealPlayed = false;
    store.setMeta({ phase: "LEADERBOARD", revealLeaderboard: true });
  }
  function hostEndChallenge() {
    store.setMeta({ phase: "ENDED", endedAt: Date.now() });
  }
  function hostResetParticipants() {
    if (!confirm("Esto borra participantes y equipos (mantiene la configuración). ¿Continuar?")) return;
    store.resetParticipants();
    store.setMeta({ phase: "REGISTRATION", currentQuestionIndex: 0, revealLeaderboard: false });
    ui.shuffleSeenTeamIds = new Set();
  }
  function hostResetChallenge() {
    if (!confirm("Esto borra TODO (participantes, equipos y respuestas) y reinicia el reto por completo. ¿Continuar?")) return;
    store.resetChallenge();
    ui.shuffleSeenTeamIds = new Set();
    ui.winnerRevealPlayed = false;
  }

  // =================================================================
  // PROJECTOR view (read-only, no password — safe: no controls, just
  // the same aggregate info that will be shown on the big screen anyway)
  // =================================================================
  function renderProjector() {
    const phase = state.meta.phase;
    if (phase === "LEADERBOARD" || phase === "ENDED") {
      const ranked = computeLeaderboard();
      const badges = computeBadges(ranked);
      root.innerHTML =
        '<div class="gtc-projector">' +
        '<div class="gtc-projector-title">🏆 LEADERBOARD</div>' +
        (ranked.length ? '<div class="gtc-winner-name">' + escapeHtml(ranked[0].team.name) + "</div>" : "") +
        '<div class="gtc-lb-list">' +
        ranked
          .slice(0, 8)
          .map((r, i) => renderLbRow(r, i, badges))
          .join("") +
        "</div>" +
        "</div>";
      return;
    }
    root.innerHTML =
      '<div class="gtc-projector">' +
      '<div class="gtc-projector-title">GMAT TEAM CHALLENGE</div>' +
      '<div class="gtc-projector-stats">' +
      projectorStat(state.participants.length, "Participantes") +
      projectorStat(state.teams.length, "Equipos") +
      projectorStat(phase === "QUESTION" ? state.meta.currentQuestionIndex + 1 + "/" + QUESTIONS.length : phase, "Estado") +
      "</div>" +
      "</div>";
  }
  function projectorStat(value, label) {
    return '<div><div class="gtc-projector-stat-value">' + escapeHtml(String(value)) + '</div><div class="gtc-projector-stat-label">' + label + "</div></div>";
  }

  // =================================================================
  window.GTC = {
    openRubric,
    closeRubric,
    goToRegister,
    onNameInput,
    submitRegistration,
    selectLetter,
    onExplanationInput,
    submitAnswer,
    onTeamNameInput,
    pickTeamNameSuggestion,
    lockTeamName,
    openHostLoginFromStudent,
    tryHostLogin,
    backToStudent,
    setHostTab,
    hostGenerateTeams,
    hostStartChallenge,
    hostNextQuestion,
    hostRevealLeaderboard,
    hostEndChallenge,
    hostResetParticipants,
    hostResetChallenge,
    hostAddParticipant,
    hostRenameTeam,
    hostMoveParticipant,
    hostRemoveParticipant,
    hostAdjustBonus,
  };

  boot();
})();
