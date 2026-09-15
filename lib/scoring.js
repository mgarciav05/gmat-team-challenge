/**
 * GMAT Team Challenge — rule-based scoring engine.
 *
 * Since the app has no server-side grader (and definitely no LLM in the
 * loop for a live classroom), reasoning quality is scored with an explicit,
 * disclosed heuristic rubric rather than pretending to "understand" the
 * explanation. The rubric is shown to students on the Cheat/Rubric screen
 * so nobody is surprised that a correct letter with no reasoning scores low.
 *
 * 100 points per question, split as the facilitator specified:
 *   40 pts — correctness (selected letter matches the verified answer)
 *   30 pts — reasoning quality (does the explanation use the relevant
 *            logical vocabulary for THIS question's structure — AND/OR/NOT/
 *            implication/contrapositive/necessary-sufficient/XOR — and is it
 *            substantial enough to be a real explanation, not a guess)
 *   20 pts — handling of the case's specific conditions/constraints (does the
 *            explanation actually reference the concrete facts/numbers of
 *            the case: MRR, DTI, GMAT score, the named startups, etc.)
 *   10 pts — clarity (a legible, appropriately-sized explanation — neither
 *            a one-word answer nor an unfocused wall of text)
 *
 * This is intentionally a HEURISTIC, not semantic grading: it rewards teams
 * for writing real, on-topic reasoning and does not reward keyword-stuffing
 * disconnected from an actual answer, because correctness is graded
 * separately and independently (40 of the 100 points), and the reasoning/
 * constraint scores both require a minimum explanation length to award any
 * points at all. The Host Dashboard lets the facilitator manually nudge the
 * reasoning score (+10 / +5 / 0) after actually reading the explanation —
 * the automatic score is a fair starting point, not a final verdict.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.GmatScoring = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const RUBRIC = {
    points: { correctness: 40, reasoning: 30, constraints: 20, clarity: 10 },
    bands: [
      { range: "0–10", label: "Sin explicación o lógica incorrecta", desc: "Respuesta sin justificar, o el razonamiento contradice la lógica de la regla." },
      { range: "11–20", label: "Parcial", desc: "Menciona algo relevante pero incompleto — falta conectar todas las condiciones o casos." },
      { range: "21–30", label: "Completo y bien estructurado", desc: "Razonamiento correcto, usa el vocabulario lógico de la pregunta y referencia los datos concretos del caso." },
    ],
    note: "Una respuesta correcta SIN explicación nunca alcanza el puntaje máximo: de los 100 puntos, 60 dependen de justificar el razonamiento (30 de calidad lógica + 20 de manejo de las condiciones del caso) y 10 de que esa explicación sea clara.",
  };

  function stripAccents(s) {
    return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s;
  }

  function normalize(text) {
    return stripAccents(String(text || "").toLowerCase());
  }

  function wordCount(text) {
    const t = String(text || "").trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }

  function groupsMatched(normalizedText, groups) {
    let matched = 0;
    const hits = [];
    for (const group of groups) {
      const found = group.find((term) => normalizedText.indexOf(normalize(term)) !== -1);
      if (found) {
        matched++;
        hits.push(found);
      }
    }
    return { matched, total: groups.length, hits: hits };
  }

  function clarityScore(words) {
    if (words === 0) return 0;
    if (words < 5) return 2;
    if (words < 12) return 5;
    if (words <= 90) return 10;
    if (words <= 160) return 8;
    return 6;
  }

  /**
   * @param {Object} params
   * @param {string} params.selected - letter the team selected (A-E)
   * @param {string} params.correct - correct letter for the question
   * @param {string} params.explanation - free-text reasoning submitted
   * @param {Object} params.question - question object with conceptGroups/constraintGroups
   * @returns {Object} breakdown + total (0-100)
   */
  function scoreSubmission(params) {
    const selected = params.selected;
    const correct = params.correct;
    const explanation = params.explanation || "";
    const question = params.question || {};
    const conceptGroups = question.conceptGroups || [];
    const constraintGroups = question.constraintGroups || [];

    const isCorrect = !!selected && selected === correct;
    const correctnessPts = isCorrect ? RUBRIC.points.correctness : 0;

    const words = wordCount(explanation);
    const normalized = normalize(explanation);
    const hasMinimalText = words >= 4;

    let reasoningPts = 0;
    let reasoningHits = [];
    if (hasMinimalText && conceptGroups.length) {
      const cm = groupsMatched(normalized, conceptGroups);
      reasoningHits = cm.hits;
      const ratio = cm.total ? cm.matched / cm.total : 0;
      // Substance floor: any real attempt (>=15 words) with zero concept
      // matches still earns a small base for effort; strong concept coverage
      // earns up to the full 30.
      const base = words >= 15 ? 6 : 0;
      reasoningPts = Math.round(Math.min(30, base + ratio * 24));
    }

    let constraintPts = 0;
    let constraintHits = [];
    if (hasMinimalText && constraintGroups.length) {
      const cm = groupsMatched(normalized, constraintGroups);
      constraintHits = cm.hits;
      const ratio = cm.total ? cm.matched / cm.total : 0;
      constraintPts = Math.round(Math.min(20, ratio * 20));
    }

    const clarityPts = clarityScore(words);

    const total = correctnessPts + reasoningPts + constraintPts + clarityPts;

    return {
      isCorrect: isCorrect,
      words: words,
      correctnessPts: correctnessPts,
      reasoningPts: reasoningPts,
      constraintPts: constraintPts,
      clarityPts: clarityPts,
      total: Math.max(0, Math.min(100, total)),
      reasoningHits: reasoningHits,
      constraintHits: constraintHits,
    };
  }

  return { scoreSubmission: scoreSubmission, RUBRIC: RUBRIC, wordCount: wordCount, normalize: normalize };
});
