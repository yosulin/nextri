// src/game/engine.js
//
// Motor puro: recibe un estado y una acción, devuelve el estado siguiente
// más los eventos que ocurrieron. No conoce el DOM, ni el canvas, ni
// localStorage, ni temporizadores. Justo lo que después podrá ejecutar un
// servidor de sala remota exactamente igual que el navegador.
//
//   const r = applyAction(state, { type: 'CONNECT', playerId: 'p1', from: 12, to: 18 });
//   r.ok      -> true/false
//   r.state   -> estado resultante (el mismo objeto si falló)
//   r.events  -> [{ type: 'EDGE_ADDED', ... }, ...]
//   r.reason  -> motivo si no fue válida
//
// IDS ESTABLES: los jugadores se identifican por id ('p1', 'p2'...), no
// por posición en el array, y los triángulos guardan ownerId. Con índices
// bastaba para local, pero en una sala remota el orden puede cambiar
// (alguien se va, se baraja el turno) y un índice dejaría de señalar a
// quien creíamos. playerId es el asiento en ESTA partida; userId (que
// llegará con las cuentas) es la persona — no deben confundirse.
//
// Requiere: rules.js, random.js.

import { checkMoveValidity, findNewTriangles, edgeKey } from './rules.js?v=2.74';
import { rngIntFrom } from './random.js?v=2.74';

export function createPlayer(index, { name, isAI = false, userId = null } = {}) {
  const nombre = name || `Jugador ${index + 1}`;
  return {
    id: `p${index + 1}`,
    userId,
    name: nombre,
    initial: isAI ? '🤖' : nombre[0].toUpperCase(),
    colorIndex: index,
    score: 0,
    isAI
  };
}

export function playerById(state, id) {
  return state.players.find(p => p.id === id) || null;
}

export function currentPlayerOf(state) {
  return playerById(state, state.currentPlayerId);
}

export function nextPlayerId(state) {
  const i = state.players.findIndex(p => p.id === state.currentPlayerId);
  return state.players[(i + 1) % state.players.length].id;
}

// ── Acciones ───────────────────────────────────────────────────────────
// Todas comprueban de quién es el turno: el motor nunca se fía de que
// quien manda la acción tenga derecho a hacerla. En local es redundante;
// en red es la línea que impide jugar en el turno ajeno.

export function applyAction(state, action) {
  switch (action.type) {
    case 'ROLL_DICE':   return accionTirarDado(state, action);
    case 'CONNECT':     return accionConectar(state, action);
    case 'ADVANCE_TURN': return accionAvanzarTurno(state, action);
    default:
      return { ok: false, reason: 'unknown-action', state, events: [] };
  }
}

export function rechazar(state, reason) {
  return { ok: false, reason, state, events: [] };
}

export function accionTirarDado(state, action) {
  if (state.status !== 'playing') return rechazar(state, 'game-not-playing');
  if (action.playerId !== state.currentPlayerId) return rechazar(state, 'not-your-turn');
  if (state.turnPhase !== 'awaiting-roll') return rechazar(state, 'already-rolled');

  const value = rngIntFrom('dice', 6) + 1;
  const next = {
    ...state,
    linesLeft: value,
    lastRolledValue: value,
    diceRolled: true,
    turnPhase: 'drawing'
  };
  return { ok: true, state: next, events: [{ type: 'DICE_ROLLED', playerId: action.playerId, value }] };
}

export function accionConectar(state, action) {
  if (state.status !== 'playing') return rechazar(state, 'game-not-playing');
  if (action.playerId !== state.currentPlayerId) return rechazar(state, 'not-your-turn');
  if (state.turnPhase !== 'drawing' || state.linesLeft <= 0) return rechazar(state, 'no-lines-left');

  const validez = checkMoveValidity(state, action.from, action.to);
  if (!validez.valid) return rechazar(state, validez.reason);

  const clave = edgeKey(action.from, action.to);
  const edges = new Set(state.edges);
  edges.add(clave);

  const eventos = [{ type: 'EDGE_ADDED', playerId: action.playerId, from: action.from, to: action.to }];

  // findNewTriangles necesita ver la arista ya puesta
  const conArista = { ...state, edges };
  const nuevos = findNewTriangles(conArista, action.from, action.to);
  const triangles = state.triangles.concat(
    nuevos.map(t => ({ a: t.a, b: t.b, c: t.c, ownerId: action.playerId }))
  );
  const players = state.players.map(p =>
    p.id === action.playerId ? { ...p, score: p.score + nuevos.length } : p
  );
  for (const t of nuevos) {
    eventos.push({ type: 'TRIANGLE_COMPLETED', ownerId: action.playerId, a: t.a, b: t.b, c: t.c });
  }

  const linesLeft = state.linesLeft - 1;
  const next = {
    ...state,
    edges,
    triangles,
    players,
    linesLeft,
    diceRolled: linesLeft > 0,
    turnPhase: linesLeft > 0 ? 'drawing' : 'handoff'
  };
  if (linesLeft === 0) {
    eventos.push({ type: 'TURN_FINISHED', playerId: action.playerId });
  }

  // Si tras esta línea ya no queda ninguna jugada posible en todo el
  // tablero, la partida termina aquí — lo decide el motor, no la interfaz.
  if (!hasAnyLegalMove(next)) {
    next.status = 'finished';
    eventos.push({ type: 'GAME_FINISHED', scores: next.players.map(p => ({ id: p.id, score: p.score })) });
  }
  return { ok: true, state: next, events: eventos };
}

export function accionAvanzarTurno(state, action = {}) {
  if (state.status !== 'playing') return rechazar(state, 'game-not-playing');

  // Solo se puede pasar turno desde 'handoff' (turno agotado) o cuando
  // quien tiene el turno se ha quedado sin jugadas posibles. Antes se
  // aceptaba en cualquier momento: un ADVANCE_TURN prematuro saltaba el
  // turno de alguien sin que nada lo impidiera. En red eso sería una vía
  // para robar turnos.
  const bloqueado = state.turnPhase === 'drawing' && !hasAnyLegalMove(state);
  if (state.turnPhase !== 'handoff' && !bloqueado) {
    return rechazar(state, 'turn-not-finished');
  }
  // Si se indica quién lo pide, tiene que ser el del turno.
  if (action.playerId && action.playerId !== state.currentPlayerId) {
    return rechazar(state, 'not-your-turn');
  }

  const siguiente = nextPlayerId(state);
  const eventos = [{ type: 'TURN_STARTED', playerId: siguiente }];
  const next = {
    ...state,
    currentPlayerId: siguiente,
    linesLeft: 0,
    diceRolled: false,
    turnPhase: 'awaiting-roll'
  };

  // El fin de partida lo decide el MOTOR, no la interfaz: si al siguiente
  // no le queda ninguna jugada posible, la partida ha terminado. Antes
  // esto vivía en endGame() de index.html, fuera del motor, así que un
  // servidor que ejecutara las mismas acciones no habría terminado nunca
  // la partida.
  if (!hasAnyLegalMove(next)) {
    next.status = 'finished';
    eventos.push({ type: 'GAME_FINISHED', scores: next.players.map(p => ({ id: p.id, score: p.score })) });
  }
  return { ok: true, state: next, events: eventos };
}

// ¿Queda alguna jugada legal para quien tenga el turno?
export function hasAnyLegalMove(state) {
  for (const { i, j } of state.candidatePairs) {
    if (checkMoveValidity(state, i, j).valid) return true;
  }
  return false;
}

// ── Replay ─────────────────────────────────────────────────────────────
// Reconstruye una partida reproduciendo su registro de eventos sobre el
// estado inicial. Los eventos son RESULTADOS, así que se traducen de
// vuelta a las acciones que los causaron y se pasan por applyAction() —
// no se aplican "a mano". Esa es la garantía que importa: si el replay
// cuadra, es que el registro basta para reconstruir la partida usando
// exactamente las mismas reglas, sin un segundo camino que pueda
// desviarse del real.
//
// Devuelve { ok, state, appliedActions, mismatch } — mismatch señala el
// primer evento cuyo resultado no coincidió con lo registrado.
export function eventToAction(ev) {
  switch (ev.type) {
    case 'DICE_ROLLED':  return { type: 'ROLL_DICE', playerId: ev.playerId };
    case 'EDGE_ADDED':   return { type: 'CONNECT', playerId: ev.playerId, from: ev.from, to: ev.to };
    case 'TURN_STARTED': return { type: 'ADVANCE_TURN' };
    // TRIANGLE_COMPLETED y TURN_FINISHED son consecuencias de CONNECT, no
    // acciones propias: al reproducir el CONNECT se generan solas.
    default: return null;
  }
}

export function replayFromLog(initialState, events) {
  let state = initialState;
  let appliedActions = 0;

  // El registro es solo-añadir: un MOVE_UNDONE anula el CONNECT anterior
  // de esa misma arista en vez de borrarlo. Para reproducir la partida
  // REAL hay que descartar ambos, o el replay volvería a trazar una línea
  // que la persona ya deshizo.
  const anulados = new Set();
  events.forEach((ev, i) => {
    if (ev.type !== 'MOVE_UNDONE') return;
    anulados.add(i);
    for (let k = i - 1; k >= 0; k--) {
      if (anulados.has(k)) continue;
      const e = events[k];
      if (e.type === 'EDGE_ADDED' && edgeKey(e.from, e.to) === ev.edge) { anulados.add(k); break; }
    }
  });
  // Los triángulos y el fin de turno de una jugada anulada tampoco cuentan.
  const efectiva = events.filter((ev, i) => !anulados.has(i));

  for (const ev of efectiva) {
    const action = eventToAction(ev);
    if (!action) continue;

    const r = applyAction(state, action);
    if (!r.ok) {
      return { ok: false, state, appliedActions, mismatch: { event: ev, reason: r.reason } };
    }
    // Comprobar que el resultado coincide con lo que se registró: si una
    // tirada reproducida diera otro número, el registro y la secuencia
    // aleatoria no cuadran y el replay no vale de nada.
    if (ev.type === 'DICE_ROLLED') {
      const nuevo = r.events.find(e => e.type === 'DICE_ROLLED');
      if (!nuevo || nuevo.value !== ev.value) {
        return { ok: false, state, appliedActions, mismatch: { event: ev, reason: 'dice-value-mismatch' } };
      }
    }
    state = r.state;
    appliedActions++;
  }
  return { ok: true, state, appliedActions, mismatch: null };
}
