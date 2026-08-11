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
// v1 (v2.45-v2.47): sin datos del generador aleatorio.
// v2 (v2.49+): incluye rng con los tres flujos, y turnPhase.
import { distSq, segmentPassesOverCircle } from './geometry.js?v=2.55';
import { getRngState, restoreRngState, seedRng } from './random.js?v=2.55';
import { buildCandidateGraph } from './board.js?v=2.55';

export const STATE_SCHEMA_VERSION = 3; // v3: ownerId/playerId estables y registro de eventos

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

export function serializeGameState(g) {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    // RULES_VERSION, no APP_VERSION: la versión de la app sube por cosas
    // como cambiar un icono, y eso no es una regla de juego distinta.
    rulesVersion: g.rulesVersion,

    config: {
      circleCount: g.circleCount,
      aiDifficulty: g.aiDifficulty
    },

    // Semilla y cuántos números se han consumido: sin el contador, una
    // partida reanudada seguiría con números distintos de los que le
    // tocaban, y dejaría de coincidir con la partida original.
    rng: getRngState(),

    // Geometría del tablero. Se congela al generar la partida y no cambia
    // hasta la siguiente, así que basta con guardarla tal cual.
    board: {
      width: g.width,
      height: g.height,
      circleRadius: g.circleRadius,
      hitRadius: g.hitRadius,
      minDist: g.minDist,
      maxDist: g.maxDist,
      maxDistSq: g.maxDistSq,
      circles: g.circles.map(c => ({ x: c.x, y: c.y }))
    },

    // edges es un Set en memoria; en el guardado va como array (un Set no
    // sobrevive a JSON.stringify: se convertiría en {}).
    edges: [...g.edges],
    triangles: g.triangles.map(t => ({ a: t.a, b: t.b, c: t.c, ownerId: t.ownerId })),

    players: g.players.map(p => ({
      id: p.id,
      userId: p.userId ?? null,
      name: p.name,
      initial: p.initial,
      score: p.score,
      colorIndex: p.colorIndex,
      isAI: !!p.isAI
    })),

    // Registro de eventos: permite repetir la partida y, más adelante,
    // sincronizar una sala. Se guarda recortado por si acaso.
    events: g.events.slice(-500),

    turn: {
      currentPlayer: g.currentPlayer,
      linesLeft: g.linesLeft,
      diceRolled: g.diceRolled,
      lastRolledValue: g.lastRolledValue,
      // Sin esto no se puede distinguir al reanudar entre "esperando una
      // tirada nueva" y "acaba de terminar el turno, en el margen para
      // deshacer" — los dos tienen diceRolled=false y linesLeft=0.
      phase: g.turnPhase
    },

    status: g.status
  };
}

// Reconstruye candidatePairs/candidateNeighbors a partir del tablero.
// Reproduce exactamente el mismo criterio que chooseAdjacency() +
// finalizeAdjacency() en board.js: parejas dentro de maxDistanceSq que
// además no pasen por encima de otro círculo.
export function candidatePairsFor(circles, maxDistSq, circleRadius) {
  const pairs = [];
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const d2 = distSq(circles[i].x, circles[i].y, circles[j].x, circles[j].y);
      if (d2 > maxDistSq + DIST_EPS) continue;
      if (segmentPassesOverCircle(circles, i, j, circleRadius)) continue;
      pairs.push({ i, j, distSq: d2 });
    }
  }
  pairs.sort((a, b) => a.distSq - b.distSq); // mismo orden que board.js
  return pairs;
}

// Devuelve true si se restauró, false si el guardado no es utilizable.
// No lanza excepción con datos corruptos: una partida guardada rota no
// debería impedir abrir la app.
// Devuelve un objeto de estado listo para usar, o null si el guardado no
// sirve. Antes ESCRIBÍA las variables globales del juego directamente;
// ahora es una función pura y quien llama decide qué hacer con lo que
// devuelve — necesario para que este archivo sea un módulo de verdad.
export function restoreGameState(snapshot) {
  if (!isValidGameSnapshot(snapshot)) return null;

  restoreRngState(snapshot.rng);

  const b = snapshot.board;
  const circles = b.circles.map(c => ({ x: c.x, y: c.y }));
  const pares = candidatePairsFor(circles, b.maxDistSq, b.circleRadius);

  return {
    circleCount: snapshot.config.circleCount,
    aiDifficulty: snapshot.config.aiDifficulty || 'medium',
    width: b.width, height: b.height,
    circleRadius: b.circleRadius, hitRadius: b.hitRadius,
    minDist: b.minDist, maxDist: b.maxDist, maxDistSq: b.maxDistSq,
    circles,
    candidatePairs: pares,
    candidateNeighbors: buildCandidateGraph(pares, circles.length),
    edges: new Set(snapshot.edges),
    triangles: snapshot.triangles.map(t => ({ a: t.a, b: t.b, c: t.c, ownerId: t.ownerId })),
    players: snapshot.players.map(p => ({ ...p })),
    currentPlayer: snapshot.turn.currentPlayer,
    linesLeft: snapshot.turn.linesLeft,
    diceRolled: snapshot.turn.diceRolled,
    lastRolledValue: snapshot.turn.lastRolledValue,
    turnPhase: snapshot.turn.phase || 'awaiting-roll',
    status: snapshot.status,
    events: Array.isArray(snapshot.events) ? snapshot.events.slice() : []
  };
}

// Comprobaciones mínimas de forma. No pretende validar que la partida sea
// coherente jugablemente (eso lo garantiza haberla generado el propio
// juego), solo que el objeto tiene lo que restoreGameState() va a leer, y
// que viene de un formato que esta versión entiende.
export function esNumFinito(v) { return typeof v === 'number' && Number.isFinite(v); }
export function esEnteroEnRango(v, min, max) { return Number.isInteger(v) && v >= min && v <= max; }

// Migra un guardado de un formato anterior, o devuelve null si no se
// puede. v1 (v2.45-v2.47) no guardaba nada del generador aleatorio: al
// reanudar se le asigna una secuencia NUEVA. Es una decisión explícita y
// consciente — esas partidas nunca fueron reproducibles, así que no se
// pierde nada; lo que no vale es aceptarlas como si trajeran secuencia y
// continuar con números que no les corresponden, que es justo lo que
// pasaba al hacer el campo opcional.
export function migrateGameSnapshot(s) {
  if (!s || typeof s !== 'object') return null;
  if (s.schemaVersion === STATE_SCHEMA_VERSION) return s;
  // Los formatos 1 y 2 usaban índices de jugador; convertirlos a ids
  // estables es posible, pero el juego aún no lo usa nadie más y no hay
  // partidas ajenas que preservar, así que se descartan en vez de
  // arrastrar código de compatibilidad que solo existiría para versiones
  // que nunca salieron de un móvil.
  if (s.schemaVersion === 1 || s.schemaVersion === 2) return null;
  if (false) {
    const semilla = Math.floor(Math.random() * 0xFFFFFFFF);
    seedRng(semilla);
    return {
      ...s,
      schemaVersion: STATE_SCHEMA_VERSION,
      rng: getRngState(),
      turn: { ...s.turn, phase: 'awaiting-roll' }
    };
  }
  return null; // formato desconocido o más nuevo que esta versión
}

// Validación estricta: además de la forma, comprueba que los valores sean
// utilizables. Para localStorage esto es prudencia; cuando el estado
// llegue por red será imprescindible, porque un guardado manipulado no
// debe poder dejar la partida en un estado imposible.
export function isValidGameSnapshot(s) {
  if (!s || typeof s !== 'object') return false;
  if (s.schemaVersion !== STATE_SCHEMA_VERSION) return false;
  if (s.rulesVersion !== RULES_VERSION) return false;

  if (!s.config || !esEnteroEnRango(s.config.circleCount, 5, 500)) return false;
  if (s.config.aiDifficulty !== undefined &&
      !['easy', 'medium', 'hard'].includes(s.config.aiDifficulty)) return false;

  const b = s.board;
  if (!b || !Array.isArray(b.circles) || b.circles.length === 0) return false;
  if (b.circles.length !== s.config.circleCount) return false;
  for (const c of b.circles) {
    if (!c || !esNumFinito(c.x) || !esNumFinito(c.y)) return false;
  }
  for (const k of ['width', 'height', 'circleRadius', 'hitRadius', 'minDist', 'maxDist', 'maxDistSq']) {
    if (!esNumFinito(b[k]) || b[k] <= 0) return false;
  }

  if (!Array.isArray(s.edges)) return false;
  const n = b.circles.length;
  for (const clave of s.edges) {
    if (typeof clave !== 'string') return false;
    const partes = clave.split('-');
    if (partes.length !== 2) return false;
    const a = Number(partes[0]), z = Number(partes[1]);
    if (!esEnteroEnRango(a, 0, n - 1) || !esEnteroEnRango(z, 0, n - 1) || a >= z) return false;
  }

  if (!Array.isArray(s.players) || s.players.length === 0 || s.players.length > 6) return false;
  for (const p of s.players) {
    if (!p || typeof p.name !== 'string') return false;
    if (typeof p.id !== 'string' || !p.id) return false;
    if (!esEnteroEnRango(p.colorIndex, 0, 5)) return false;
    if (!Number.isInteger(p.score) || p.score < 0) return false;
  }

  if (!Array.isArray(s.triangles)) return false;
  for (const t of s.triangles) {
    if (!t) return false;
    for (const v of [t.a, t.b, t.c]) if (!esEnteroEnRango(v, 0, n - 1)) return false;
    if (typeof t.ownerId !== 'string' || !s.players.some(p => p.id === t.ownerId)) return false;
  }

  if (!s.turn || !esEnteroEnRango(s.turn.currentPlayer, 0, s.players.length - 1)) return false;
  if (!esEnteroEnRango(s.turn.linesLeft, 0, 6)) return false;
  if (typeof s.turn.diceRolled !== 'boolean') return false;
  if (!esEnteroEnRango(s.turn.lastRolledValue, 0, 6)) return false;
  if (!['awaiting-roll', 'drawing', 'handoff'].includes(s.turn.phase)) return false;

  // El generador: obligatorio desde el esquema 2, y con los tres flujos.
  if (!s.rng || !esNumFinito(s.rng.seed) || !s.rng.streams) return false;
  for (const nombre of ['board', 'dice', 'ai']) {
    const f = s.rng.streams[nombre];
    if (!f || !Number.isInteger(f.state) || !Number.isInteger(f.calls) || f.calls < 0) return false;
  }

  if (!['playing', 'finished'].includes(s.status)) return false;
  return true;
}
