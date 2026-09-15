/**
 * GMAT Team Challenge — question bank.
 *
 * Same 5 verified boolean-logic problems used in the individual "GMAT Logic
 * Sprint" simulator (exhaustively checked for a unique correct answer in
 * verify.py), reframed for team play:
 *   - No per-question timer (teams discuss and submit when ready).
 *   - Every question carries `conceptGroups` and `constraintGroups`: lists of
 *     synonym clusters used by the rule-based reasoning scorer (lib/scoring.js)
 *     to detect whether a team's written explanation actually engages with
 *     the relevant logical structure and the specific facts of the case,
 *     not just whether they guessed the right letter.
 *
 * Difficulty progression matches the facilitator's spec:
 *   Q1 Easy (AND) -> Q2 Easy/Intermediate (NOT+OR / conditional-ish) ->
 *   Q3 Intermediate (implication + necessary/sufficient framing) ->
 *   Q4 Intermediate/Hard (compound AND+OR) -> Q5 Hard (multiple constraints,
 *   XOR + implications + cardinality).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.GmatQuestions = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const QUESTIONS = [
    {
      id: "q1",
      n: 1,
      difficulty: "Fácil",
      dots: 1,
      concept: "AND (condición compuesta)",
      context: "Eres analista en un fondo de venture capital. Política de inversión del comité:",
      rule: '"Invertimos en una startup SOLO SI (1) tiene MRR ≥ $50,000 USD, Y (2) al menos un cofundador tiene un exit exitoso previo."',
      question: "¿En cuál de las siguientes startups invertiría el fondo?",
      tableHeaders: ["Startup", "MRR mensual", "Exit previo de cofundador"],
      tableRows: [
        ["A", "$60,000", "No"],
        ["B", "$40,000", "Sí"],
        ["C", "$55,000", "Sí"],
        ["D", "$80,000", "No"],
        ["E", "$30,000", "No"],
      ],
      correct: "C",
      explanationModel:
        "La regla es un AND: se necesitan AMBAS condiciones (MRR≥50K Y exit previo). A y D fallan en el exit pese a su MRR alto; B falla en MRR; E falla en ambas. Solo C cumple las dos simultáneamente.",
      insight: "En un AND, ningún atajo funciona: si falla una sola condición, la opción queda descartada sin importar qué tan bien cumpla la otra.",
      conceptGroups: [
        ["and", "ambas", "los dos", "las dos", "simultaneamente", "a la vez", "cumple las dos", "cumplir ambas"],
        ["condicion compuesta", "dos condiciones", "dos requisitos"],
      ],
      constraintGroups: [
        ["mrr", "50,000", "50000", "50k"],
        ["exit", "cofundador", "cofundadores"],
        ["descarta", "elimina", "queda fuera", "no califica", "falla en"],
      ],
    },
    {
      id: "q2",
      n: 2,
      difficulty: "Fácil–Intermedio",
      dots: 2,
      concept: "NOT + OR (De Morgan)",
      context: "Trabajas en el comité de crédito de un banco de inversión boutique. Política de rechazo automático:",
      rule: '"Rechazamos automáticamente si el solicitante NO tiene al menos 2 años de historial crediticio, O si su DTI (deuda/ingreso) es MAYOR al 40%."',
      question: "¿Cuál de los siguientes solicitantes SÍ sería aprobado?",
      tableHeaders: ["Solicitante", "Años de historial", "DTI"],
      tableRows: [
        ["A", "3", "45%"],
        ["B", "1", "20%"],
        ["C", "2", "40%"],
        ["D", "5", "55%"],
        ["E", "0.5", "25%"],
      ],
      correct: "C",
      explanationModel:
        "Rechazo = (historial<2) OR (DTI>40%). Por De Morgan, Aprobación = (historial≥2) AND (DTI≤40%). A y D caen por DTI>40%; B y E caen por historial<2; C tiene historial=2 (cumple 'al menos 2') y DTI=40% exacto (no es 'mayor a 40%'), así que no dispara ninguna causal de rechazo.",
      insight: 'Negar "A OR B" exige negar AMBAS partes (De Morgan). El GMAT ama poner la respuesta correcta justo en el borde de una desigualdad.',
      conceptGroups: [
        ["or", "de morgan", "negar", "negacion", "opuesto"],
        ["al menos", "mayor a", "limite", "borde", "justo en"],
      ],
      constraintGroups: [
        ["historial", "2 años", "dos años"],
        ["dti", "40%", "deuda"],
        ["rechaz", "aprobad"],
      ],
    },
    {
      id: "q3",
      n: 3,
      difficulty: "Intermedio",
      dots: 3,
      concept: "Implicación + Contrapositiva",
      context: "La tesis de inversión del fondo establece esta regla para todo el portafolio:",
      rule: '"Si una startup ha cerrado una ronda Serie A, ENTONCES tiene al menos un inversionista institucional en su cap table."',
      fact: "Dato: la startup Nébula NO tiene ningún inversionista institucional en su cap table.",
      question: "¿Cuál conclusión se puede afirmar con certeza lógica?",
      options: [
        "Nébula no ha cerrado una ronda Serie A.",
        "Nébula ha cerrado una ronda Serie A.",
        "Todas las startups sin inversionista institucional nunca cerrarán una Serie A.",
        "Si Nébula tuviera un inversionista institucional, habría cerrado una Serie A.",
        "No se puede concluir nada sobre el estado de la ronda de Nébula.",
      ],
      correct: "A",
      explanationModel:
        "La regla es Serie A → Institucional. El dato es NOT Institucional. La única transformación válida es la contrapositiva (NOT B → NOT A): como Nébula no tiene institucional, por contraposición no ha cerrado Serie A. B contradice esto; D es la falacia del recíproco; C sobregeneraliza al futuro; E ignora que sí se puede concluir.",
      insight: "La contrapositiva (NOT B → NOT A) SIEMPRE es válida. El recíproco (B→A) y la inversa (NOT A→NOT B) NUNCA lo son — la trampa más común del GMAT.",
      conceptGroups: [
        ["contrapositiv", "implicacion", "entonces", "si...entonces"],
        ["reciproco", "inversa", "falacia"],
      ],
      constraintGroups: [
        ["serie a", "institucional"],
        ["nebula"],
        ["certeza", "necesariamente", "se puede concluir", "no se puede concluir"],
      ],
    },
    {
      id: "q4",
      n: 4,
      difficulty: "Intermedio–Difícil",
      dots: 4,
      concept: "AND + OR combinados (necesario vs. suficiente)",
      context: "El equipo de reclutamiento de un banco de inversión define así la entrevista final:",
      rule: '"Un candidato es invitado SI Y SOLO SI tiene ≥1 año de experiencia en IB o consultoría, Y ADEMÁS cumple al menos una de estas dos: (a) GMAT ≥ 665, o (b) fue referido por un socio (partner)."',
      question: "¿Cuál candidato SÍ sería invitado a la entrevista final?",
      tableHeaders: ["Candidato", "GMAT", "Experiencia IB/consultoría", "Referido por partner"],
      tableRows: [
        ["A", "680", "0.5 años", "No"],
        ["B", "620", "2 años", "Sí"],
        ["C", "700", "0 años", "Sí"],
        ["D", "640", "3 años", "No"],
        ["E", "664", "1 año", "No"],
      ],
      correct: "B",
      explanationModel:
        "Invitado ⟺ (Experiencia≥1) AND [(GMAT≥665) OR (Referido)] — una condición obligatoria (necesaria) y una flexible (suficiente entre dos opciones). A y C quedan eliminados por experiencia insuficiente sin importar su GMAT o referido. D y E cumplen experiencia pero fallan el OR. Solo B cumple experiencia (2 años) y fue referido, satisfaciendo el OR.",
      insight: "En un AND que contiene un OR anidado, evalúa primero la parte 'no negociable' (necesaria). Si esa falla, nada del OR la puede salvar — ni un GMAT de 700.",
      conceptGroups: [
        ["necesari", "suficiente", "obligatoria", "no negociable"],
        ["and", "or", "anidado", "combinada"],
      ],
      constraintGroups: [
        ["experiencia", "1 año", "un año"],
        ["gmat", "665"],
        ["referido", "partner", "socio"],
      ],
    },
    {
      id: "q5",
      n: 5,
      difficulty: "Difícil",
      dots: 5,
      concept: "XOR + implicaciones + restricción de cardinalidad",
      context: "El comité de inversión decide, en su reunión trimestral, a cuáles de tres startups del portafolio —Aurora, Boreal y Cedro— inyectará capital. Reglas ya aprobadas por la junta:",
      rulesList: [
        "1. Exactamente una de Aurora o Boreal recibe capital este trimestre (nunca ambas, nunca ninguna).",
        "2. Si Cedro recibe capital, entonces Boreal también debe recibirlo.",
        "3. Al menos dos de las tres startups deben recibir capital este trimestre.",
        "4. Aurora no puede recibir capital a menos que Cedro también lo reciba.",
      ],
      question: "¿Cuál combinación es la ÚNICA que cumple TODAS las reglas?",
      options: [
        "Aurora y Boreal (Cedro no)",
        "Boreal y Cedro (Aurora no)",
        "Las tres startups",
        "Aurora y Cedro (Boreal no)",
        "Solo Boreal",
      ],
      correct: "B",
      explanationModel:
        "(1) XOR(Aurora,Boreal); (2) Cedro→Boreal; (3) Aurora+Boreal+Cedro≥2; (4) Aurora→Cedro. Si Aurora=Sí, por (4) Cedro=Sí, por (2) Boreal=Sí, pero (1) exige Boreal=No — contradicción, así que Aurora=No. Con Aurora=No, por (1) Boreal=Sí, y por (3) se necesita un tercero: Cedro=Sí. Única solución: Boreal y Cedro, Aurora no.",
      insight: "Con restricciones combinadas, empieza por la más restrictiva (la que genera una contradicción más rápido) para eliminar ramas completas en vez de probar las 8 combinaciones una por una.",
      conceptGroups: [
        ["xor", "exactamente una", "nunca ambas"],
        ["contradiccion", "rama", "restriccion"],
      ],
      constraintGroups: [
        ["aurora"],
        ["boreal"],
        ["cedro"],
        ["al menos dos", "cardinalidad"],
      ],
    },
  ];

  return { QUESTIONS: QUESTIONS };
});
