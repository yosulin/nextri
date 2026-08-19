// src/ai/ai.js
//
// La decisión de Circuit: dado el tablero actual, ¿qué línea traza? UN
// solo algoritmo (chooseAIMove) parametrizado por AI_LEVELS — ver
// levels.js para la filosofía de dificultad.
//
// checkMoveValidity() (rules.js) sigue siendo la única fuente de verdad
// sobre legalidad: aquí NO se reimplementa ninguna regla del juego.
//
// Lo que NO está aquí, a propósito: scheduleAITurnIfNeeded() y
// runAIMoves(), que se quedan en index.html porque son orquestación de
// turno (temporizadores, tirar el dado, aplicar la jugada, avisar a la
// interfaz), no la decisión en sí. Mismo criterio que con generateCircles()
// respecto a board.js.
//
// Requiere: levels.js (AI_LEVELS, aiDifficulty) y rules.js
// (checkMoveValidity, findNewTriangles, edgeExists, edgeKey) cargados antes.
//
// NOTA de orden de carga: nada de este fichero debe LEER variables de
// index.html en el nivel superior (fuera de una función). index.html se
// ejecuta DESPUÉS que estos scripts, así que un `if (DEBUG)` suelto aquí
// petaría al cargar — por eso el registro de window.circlesAI() se quedó
// allí. Dentro de las funciones no hay problema: se leen al llamarlas.

import { AI_LEVELS } from './levels.js?v=2.85';
import { checkMoveValidity, findNewTriangles, edgeExists, edgeKey } from '../game/rules.js?v=2.85';
import { rngNextFrom, rngIntFrom } from '../game/random.js?v=2.85';

// isAITurn() vive ahora en index.html: depende del turno actual de la
// interfaz, no del motor.

export function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rngIntFrom('ai', i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function pickUniform(arr) {
  return arr[rngIntFrom('ai', arr.length)];
}

// Selección ponderada por número de triángulos (gain), no determinista —
// más triángulos aumenta la PROBABILIDAD de elegirse, no la garantiza.
// Sin esto, la máquina jugaría sistemáticamente mejor que una persona
// (que no siempre ve/prioriza la jugada objetivamente óptima).
export function weightedPickByGain(scoringMoves, power) {
  const weights = scoringMoves.map(m => Math.pow(m.gain, power));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rngNextFrom('ai') * total;
  for (let k = 0; k < scoringMoves.length; k++) {
    r -= weights[k];
    if (r <= 0) return [scoringMoves[k].i, scoringMoves[k].j];
  }
  const last = scoringMoves[scoringMoves.length - 1];
  return [last.i, last.j];
}

// ¿Añadir la arista i-j deja lista una jugada posterior que cerraría un
// triángulo? La INTERPRETACIÓN depende de quién juega a continuación:
// con linesLeft>1 puede ser una oportunidad para la propia máquina (ver
// chooseAIMove); con linesLeft===1 sería un regalo al siguiente jugador.
// Esta función solo contesta el hecho geométrico, no decide si es bueno o
// malo — por eso ya no se llama "wouldGift...".
//
// Optimizada: cualquier triángulo nuevo causado por la arista i-j tiene
// que tener la forma i-j-k, así que solo hace falta mirar los vecinos
// candidatos de i o de j, no candidatePairs entero (evitaba acercarse a
// candidatos×candidatos comparaciones). try/finally garantiza que la
// arista de prueba se retira siempre, incluso si algo de en medio lanzara
// un error.
export function createsScoringReply(st, i, j) {
  const key = edgeKey(i, j);
  st.edges.add(key);
  try {
    const neighbors = new Set([...(st.candidateNeighbors[i] || []), ...(st.candidateNeighbors[j] || [])]);
    for (const k of neighbors) {
      if (k === i || k === j) continue;
      const ik = edgeExists(st, i, k);
      const jk = edgeExists(st, j, k);
      if (ik === jk) continue; // hace falta que falte EXACTAMENTE el tercer lado
      const from = ik ? j : i;
      if (!checkMoveValidity(st, from, k).valid) continue;
      if (findNewTriangles(st, from, k).length > 0) return true;
    }
    return false;
  } finally {
    st.edges.delete(key);
  }
}

export function chooseAIMove(st, debug) {
  const level = AI_LEVELS[st.aiDifficulty] || AI_LEVELS.medium;

  // Movimientos legales — checkMoveValidity() sigue siendo la única fuente
  // de verdad, aquí no se reimplementa ninguna regla por su cuenta.
  const legalMoves = [];
  for (const { i, j } of st.candidatePairs) {
    if (checkMoveValidity(st, i, j).valid) legalMoves.push([i, j]);
  }
  if (legalMoves.length === 0) return null;

  // "Visión" limitada según dificultad — no analiza el tablero entero,
  // una muestra al azar de hasta candidateLimit movimientos. Así Fácil de
  // verdad se deja cosas por mirar, no es que juegue mal a propósito con
  // información completa.
  shuffleInPlace(legalMoves);
  const visible = legalMoves.slice(0, level.candidateLimit);

  // Si le queda otra línea este mismo turno, sentar la base de un
  // triángulo no es un regalo al rival — es preparar cerrarlo ella misma
  // en la siguiente jugada (ver v2.27). Solo en la última línea del turno
  // ese mismo patrón sería un regalo de verdad.
  const canFollowUpThisTurn = st.linesLeft > 1;
  const scoringMoves = []; // {i, j, gain}
  const buildingMoves = [];
  const safeMoves = [];

  for (const [i, j] of visible) {
    const gain = findNewTriangles(st, i, j).length;
    if (gain > 0) {
      scoringMoves.push({ i, j, gain });
      continue;
    }
    const setsUpReply = createsScoringReply(st, i, j);
    if (setsUpReply && canFollowUpThisTurn) {
      buildingMoves.push([i, j]);
    } else if (!setsUpReply) {
      safeMoves.push([i, j]);
    }
  }

  // 1. Intentar puntuar ahora
  let selectedType, move;
  if (scoringMoves.length > 0 && rngNextFrom('ai') < level.scoringAwareness) {
    selectedType = 'scoring';
    if (rngNextFrom('ai') < level.bestScoringChance) {
      const maxGain = Math.max(...scoringMoves.map(m => m.gain));
      const best = scoringMoves.filter(m => m.gain === maxGain);
      const chosen = pickUniform(best);
      move = [chosen.i, chosen.j];
    } else {
      move = weightedPickByGain(scoringMoves, level.scoringPower);
    }
  } else if (buildingMoves.length > 0 && rngNextFrom('ai') < level.buildingAwareness) {
    // 2. Preparar un triángulo propio (si le queda otra línea este turno)
    selectedType = 'building';
    move = pickUniform(buildingMoves);
  } else if (safeMoves.length > 0 && rngNextFrom('ai') < level.safetyAwareness) {
    // 3. Evitar dejar un cierre servido
    selectedType = 'safe';
    move = pickUniform(safeMoves);
  } else {
    // 4. No hay alternativa (o el nivel decidió no aplicar ninguna de las
    // anteriores): cualquier movimiento legal de los visibles.
    selectedType = 'any';
    move = pickUniform(visible);
  }

  if (debug) {
    const gain = selectedType === 'scoring' ? findNewTriangles(st, move[0], move[1]).length : 0;
    globalThis.aiDebug = {
      difficulty: st.aiDifficulty, linesLeft: st.linesLeft, legalMoves: legalMoves.length,
      consideredMoves: visible.length, scoringMoves: scoringMoves.length,
      buildingMoves: buildingMoves.length, safeMoves: safeMoves.length,
      selectedType, selectedMove: move, gain
    };
  }
  return move;
}
