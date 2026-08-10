// src/game/state.js
//
// Estado de partida serializable: convierte entre las variables vivas del
// juego y un objeto plano que se puede guardar con JSON.stringify() y
// restaurar después siendo EXACTAMENTE la misma partida.
//
// Por qué así y no "el motor recibe estado y devuelve estado nuevo":
// convertir de golpe las ~30 variables globales en un objeto que se pasa
// por parámetro obligaría a tocar ~90 funciones a la vez, y no hay forma
// automática de probar el cableado con la interfaz (las simulaciones de
// scripts/ prueban el motor, no la pantalla). Esta capa es ADITIVA: no
// reescribe nada de lo que ya funciona, se puede verificar con dureza
// (ida y vuelta + comparación de comportamiento), y es lo que hace falta
// para guardar/reanudar. El rediseño a estado inmutable puede venir
// después, apoyado en esto.
//
// Requiere geometry.js (distSq, segmentPassesOverCircle) cargado antes.

// Sube SCHEMA_VERSION solo si cambia la FORMA del objeto guardado, de modo
// que una partida guardada con un formato viejo se pueda detectar y
// descartar en vez de restaurarse mal y a medias.
const STATE_SCHEMA_VERSION = 1;

// Qué NO se guarda, a propósito:
//   - canvas/ctx, audioCtx, referencias al DOM: se recrean al montar la UI.
//   - temporizadores (rollTimer, lastInvalidReasonTimer, aiHighlightGen...)
//     y gestos a medias (traceGesture, pcGesture): son momentáneos; una
//     partida restaurada empieza "en reposo", no a mitad de un arrastre.
//   - cachés derivadas (activeCirclesCache, selectedTargetsCache): se
//     recalculan solas a partir del estado real.
//   - lastMoveSnapshot (deshacer): deliberadamente NO se conserva. Deshacer
//     es "me acabo de equivocar ahora mismo"; cruzar con eso un guardado y
//     una reanudación posterior sería confuso más que útil.
//   - candidatePairs/candidateNeighbors: se RECONSTRUYEN (ver más abajo),
//     no se guardan — son derivables al 100% de circles + MAX_DIST_SQ +
//     CIRCLE_R, y guardarlos duplicaría cientos de entradas que podrían
//     quedar incoherentes con el resto.

function serializeGameState() {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    rulesVersion: APP_VERSION,

    config: {
      circleCount: N_CIRCLES,
      aiDifficulty
    },

    // Semilla y cuántos números se han consumido: sin el contador, una
    // partida reanudada seguiría con números distintos de los que le
    // tocaban, y dejaría de coincidir con la partida original.
    rng: {
      seed: getRngSeed(),
      calls: getRngCalls()
    },

    // Geometría del tablero. Se congela al generar la partida y no cambia
    // hasta la siguiente, así que basta con guardarla tal cual.
    board: {
      width: W,
      height: H,
      circleRadius: CIRCLE_R,
      hitRadius: HIT_R,
      minDist: MIN_DIST,
      maxDist: MAX_DIST,
      maxDistSq: MAX_DIST_SQ,
      circles: circles.map(c => ({ x: c.x, y: c.y }))
    },

    // edges es un Set en memoria; en el guardado va como array (un Set no
    // sobrevive a JSON.stringify: se convertiría en {}).
    edges: [...edges],
    triangles: triangles.map(t => ({ a: t.a, b: t.b, c: t.c, owner: t.owner })),

    players: players.map(p => ({
      name: p.name,
      initial: p.initial,
      score: p.score,
      colorIndex: p.colorIndex,
      isAI: !!p.isAI
    })),

    turn: {
      currentPlayer,
      linesLeft,
      diceRolled,
      lastRolledValue
    },

    status: gameStatus
  };
}

// Reconstruye candidatePairs/candidateNeighbors a partir del tablero.
// Reproduce exactamente el mismo criterio que chooseAdjacency() +
// finalizeAdjacency() en board.js: parejas dentro de maxDistanceSq que
// además no pasen por encima de otro círculo.
function rebuildCandidateGraph() {
  const pairs = [];
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const d2 = distSq(circles[i].x, circles[i].y, circles[j].x, circles[j].y);
      if (d2 > MAX_DIST_SQ + DIST_EPS) continue;
      if (segmentPassesOverCircle(circles, i, j, CIRCLE_R)) continue;
      pairs.push({ i, j, distSq: d2 });
    }
  }
  pairs.sort((a, b) => a.distSq - b.distSq); // mismo orden que board.js
  candidatePairs = pairs;
  candidateNeighbors = Array.from({ length: circles.length }, () => []);
  for (const { i, j } of pairs) {
    candidateNeighbors[i].push(j);
    candidateNeighbors[j].push(i);
  }
  return pairs;
}

// Devuelve true si se restauró, false si el guardado no es utilizable.
// No lanza excepción con datos corruptos: una partida guardada rota no
// debería impedir abrir la app.
function restoreGameState(snapshot) {
  if (!isValidGameSnapshot(snapshot)) return false;

  N_CIRCLES = snapshot.config.circleCount;
  aiDifficulty = snapshot.config.aiDifficulty || 'medium';

  const b = snapshot.board;
  W = b.width;
  H = b.height;
  CIRCLE_R = b.circleRadius;
  HIT_R = b.hitRadius;
  MIN_DIST = b.minDist;
  MAX_DIST = b.maxDist;
  MAX_DIST_SQ = b.maxDistSq;
  circles = b.circles.map(c => ({ x: c.x, y: c.y }));

  edges = new Set(snapshot.edges);
  triangles = snapshot.triangles.map(t => ({ a: t.a, b: t.b, c: t.c, owner: t.owner }));
  players = snapshot.players.map(p => ({
    name: p.name,
    initial: p.initial,
    score: p.score,
    colorIndex: p.colorIndex,
    ...(p.isAI ? { isAI: true } : {})
  }));

  // Rebobinar la secuencia al punto exacto en que se guardó.
  if (snapshot.rng) restoreRng(snapshot.rng.seed, snapshot.rng.calls);

  currentPlayer = snapshot.turn.currentPlayer;
  linesLeft = snapshot.turn.linesLeft;
  diceRolled = snapshot.turn.diceRolled;
  lastRolledValue = snapshot.turn.lastRolledValue;
  gameStatus = snapshot.status;

  rebuildCandidateGraph();

  // Estado momentáneo: una partida restaurada arranca en reposo.
  lastMoveSnapshot = null;
  selectedCircle = null;
  activeCirclesCache = null;
  selectedTargetsCache = null;

  return true;
}

// Comprobaciones mínimas de forma. No pretende validar que la partida sea
// coherente jugablemente (eso lo garantiza haberla generado el propio
// juego), solo que el objeto tiene lo que restoreGameState() va a leer, y
// que viene de un formato que esta versión entiende.
function isValidGameSnapshot(s) {
  if (!s || typeof s !== 'object') return false;
  if (s.schemaVersion !== STATE_SCHEMA_VERSION) return false;
  if (!s.config || typeof s.config.circleCount !== 'number') return false;
  if (!s.board || !Array.isArray(s.board.circles) || s.board.circles.length === 0) return false;
  if (typeof s.board.maxDistSq !== 'number' || typeof s.board.circleRadius !== 'number') return false;
  if (!Array.isArray(s.edges) || !Array.isArray(s.triangles)) return false;
  if (!Array.isArray(s.players) || s.players.length === 0) return false;
  if (!s.turn || typeof s.turn.currentPlayer !== 'number') return false;
  if (s.turn.currentPlayer < 0 || s.turn.currentPlayer >= s.players.length) return false;
  if (typeof s.status !== 'string') return false;
  return true;
}
