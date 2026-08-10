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

function createPlayer(index, { name, isAI = false, userId = null } = {}) {
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

function playerById(state, id) {
  return state.players.find(p => p.id === id) || null;
}

function currentPlayerOf(state) {
  return playerById(state, state.currentPlayerId);
}

function nextPlayerId(state) {
  const i = state.players.findIndex(p => p.id === state.currentPlayerId);
  return state.players[(i + 1) % state.players.length].id;
}

// ── Acciones ───────────────────────────────────────────────────────────
// Todas comprueban de quién es el turno: el motor nunca se fía de que
// quien manda la acción tenga derecho a hacerla. En local es redundante;
// en red es la línea que impide jugar en el turno ajeno.

function applyAction(state, action) {
  switch (action.type) {
    case 'ROLL_DICE':   return accionTirarDado(state, action);
    case 'CONNECT':     return accionConectar(state, action);
    case 'ADVANCE_TURN': return accionAvanzarTurno(state, action);
    default:
      return { ok: false, reason: 'unknown-action', state, events: [] };
  }
}

function rechazar(state, reason) {
  return { ok: false, reason, state, events: [] };
}

function accionTirarDado(state, action) {
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

function accionConectar(state, action) {
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
  return { ok: true, state: next, events: eventos };
}

function accionAvanzarTurno(state) {
  if (state.status !== 'playing') return rechazar(state, 'game-not-playing');
  const siguiente = nextPlayerId(state);
  const next = {
    ...state,
    currentPlayerId: siguiente,
    linesLeft: 0,
    diceRolled: false,
    turnPhase: 'awaiting-roll'
  };
  return { ok: true, state: next, events: [{ type: 'TURN_STARTED', playerId: siguiente }] };
}

// ¿Queda alguna jugada legal para quien tenga el turno?
function hasAnyLegalMove(state) {
  for (const { i, j } of state.candidatePairs) {
    if (checkMoveValidity(state, i, j).valid) return true;
  }
  return false;
}
