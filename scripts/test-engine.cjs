#!/usr/bin/env node
// scripts/test-engine.cjs
// Prueba el motor puro: applyAction(state, action). Comprueba sobre todo
// lo que hace falta para que el mismo código pueda correr en un servidor:
// que valide de quién es el turno, que rechace lo ilegal, que NO mute el
// estado recibido, y que los identificadores de jugador sean estables.
//
//   node scripts/test-engine.cjs
const { readFileSync } = require('node:fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

const fuentes = ['index.html', 'src/game/random.js', 'src/game/geometry.js',
  'src/game/rules.js', 'src/game/board.js', 'src/game/engine.js']
  .map(f => readFileSync(path.join(raiz, f), 'utf-8'));

function extract(nombre) {
  const re = new RegExp(`(?:export )?function ${nombre}\\(.*?\\n\\}\\n`, 's');
  for (const src of fuentes) { const m = src.match(re); if (m) return m[0].replace(/(^|\n)export /g, '$1'); }
  throw new Error(`No se encontró function ${nombre}()`);
}

const DIST_EPS = 1e-6;
const RNG_STREAMS = ['board', 'dice', 'ai'];
const STREAM_OFFSET = { board: 0x9E3779B9, dice: 0x85EBCA6B, ai: 0xC2B2AE35 };
const ADJACENCY_TARGET = { minDegree: 3, p10Degree: 5, meanMin: 8, meanMax: 11 };
const MOVE_REASON_TEXT = {};
let rngSeed, rngCalls, streams;
let CIRCLE_R, N_CIRCLES, W, H, MIN_DIST;

eval(extract('mulberry32')); eval(extract('seedRng'));
eval(extract('rngNextFrom')); eval(extract('rngIntFrom'));
eval(extract('rngNext')); eval(extract('rngInt'));
eval(extract('getRngSeed')); eval(extract('getRngCalls'));
eval(extract('getRngState')); eval(extract('restoreRngState'));
eval(extract('dist')); eval(extract('distSq')); eval(extract('cross2d'));
eval(extract('segmentsIntersect')); eval(extract('pointInTriangle'));
eval(extract('segmentPassesOverCircle'));
eval(extract('edgeKey')); eval(extract('edgeExists')); eval(extract('areAdjacent'));
eval(extract('triangleTraps')); eval(extract('lineIntersectsAny'));
eval(extract('checkMoveValidity')); eval(extract('findNewTriangles'));
eval(extract('chooseAdjacency')); eval(extract('finalizeAdjacency'));
eval(extract('generateCirclePositions'));
eval(extract('createPlayer')); eval(extract('playerById')); eval(extract('currentPlayerOf'));
eval(extract('nextPlayerId')); eval(extract('applyAction')); eval(extract('rechazar'));
eval(extract('accionTirarDado')); eval(extract('accionConectar'));
eval(extract('accionAvanzarTurno')); eval(extract('hasAnyLegalMove'));
eval(extract('eventToAction')); eval(extract('replayFromLog'));

let fallos = 0;
function check(etiqueta, ok, detalle) {
  if (ok) console.log(`OK: ${etiqueta}`);
  else { console.error(`FALLO: ${etiqueta}${detalle ? ' — ' + detalle : ''}`); fallos++; }
}

// Construye un estado de partida real, sin tocar nada global del juego.
function nuevoEstado(semilla) {
  seedRng(semilla);
  N_CIRCLES = 35; W = 380; H = 700;
  CIRCLE_R = 13;
  MIN_DIST = Math.max(CIRCLE_R * 2 + 6, Math.sqrt((W * H) / N_CIRCLES) * 0.55);
  let pos = null, ady = null;
  for (let a = 0; a < 20; a++) {
    pos = generateCirclePositions({ count: N_CIRCLES, width: W, height: H, circleRadius: CIRCLE_R }, MIN_DIST);
    if (pos.length !== N_CIRCLES) continue;
    ady = chooseAdjacency(pos, CIRCLE_R);
    if (ady) break;
  }
  if (!ady) return null;
  const vecinos = Array.from({ length: pos.length }, () => []);
  for (const { i, j } of ady.pairs) { vecinos[i].push(j); vecinos[j].push(i); }
  return {
    circles: pos, edges: new Set(), triangles: [],
    players: [createPlayer(0, { name: 'Josu' }), createPlayer(1, { name: 'Circuit', isAI: true })],
    currentPlayerId: 'p1',
    maxDistSq: ady.maxDistanceSq, circleRadius: CIRCLE_R,
    candidatePairs: ady.pairs, candidateNeighbors: vecinos,
    linesLeft: 0, lastRolledValue: 0, diceRolled: false,
    turnPhase: 'awaiting-roll', status: 'playing'
  };
}

console.log('Verificando el motor puro (applyAction)...\n');

const s0 = nuevoEstado(1234);
check('Se puede construir un estado de partida sin tocar nada global', s0 !== null);

// Identificadores estables
check('Los jugadores tienen id estable, no índice',
  s0.players[0].id === 'p1' && s0.players[1].id === 'p2' && s0.currentPlayerId === 'p1');
check('playerById() encuentra por id', playerById(s0, 'p2').name === 'Circuit');

// Turno ajeno
const ajeno = applyAction(s0, { type: 'ROLL_DICE', playerId: 'p2' });
check('Rechaza tirar en el turno de otro', !ajeno.ok && ajeno.reason === 'not-your-turn');

// Tirada válida
const r1 = applyAction(s0, { type: 'ROLL_DICE', playerId: 'p1' });
check('Acepta la tirada de quien tiene el turno',
  r1.ok && r1.state.linesLeft >= 1 && r1.state.linesLeft <= 6 && r1.state.turnPhase === 'drawing');
check('La tirada emite un evento DICE_ROLLED',
  r1.events.length === 1 && r1.events[0].type === 'DICE_ROLLED' && r1.events[0].value === r1.state.linesLeft);

// Doble tirada
const r2 = applyAction(r1.state, { type: 'ROLL_DICE', playerId: 'p1' });
check('Rechaza tirar dos veces en el mismo turno', !r2.ok && r2.reason === 'already-rolled');

// INMUTABILIDAD: el estado original no debe cambiar
check('applyAction NO muta el estado recibido',
  s0.linesLeft === 0 && s0.diceRolled === false && s0.turnPhase === 'awaiting-roll' && s0.edges.size === 0);

// Conexión válida
const parLegal = r1.state.candidatePairs.find(({ i, j }) => checkMoveValidity(r1.state, i, j).valid);
const r3 = applyAction(r1.state, { type: 'CONNECT', playerId: 'p1', from: parLegal.i, to: parLegal.j });
check('Acepta una conexión legal', r3.ok && r3.state.edges.size === 1);
check('La conexión emite EDGE_ADDED', r3.events[0].type === 'EDGE_ADDED');
check('El estado anterior sigue sin la arista (inmutable)', r1.state.edges.size === 0);

// Conexión repetida
const r4 = applyAction(r3.state, { type: 'CONNECT', playerId: 'p1', from: parLegal.i, to: parLegal.j });
check('Rechaza repetir una arista existente', !r4.ok && r4.reason === 'edge-exists');

// Conexión en turno ajeno
const r5 = applyAction(r3.state, { type: 'CONNECT', playerId: 'p2', from: parLegal.i, to: parLegal.j });
check('Rechaza conectar en el turno de otro', !r5.ok && r5.reason === 'not-your-turn');

// Agotar el turno lleva a handoff
let est = r1.state;
let vueltas = 0;
while (est.linesLeft > 0 && vueltas < 10) {
  const par = est.candidatePairs.find(({ i, j }) => checkMoveValidity(est, i, j).valid);
  if (!par) break;
  est = applyAction(est, { type: 'CONNECT', playerId: 'p1', from: par.i, to: par.j }).state;
  vueltas++;
}
check('Al agotar las líneas el turno pasa a fase handoff', est.turnPhase === 'handoff' && est.linesLeft === 0);

// Avanzar turno
const r6 = applyAction(est, { type: 'ADVANCE_TURN' });
check('ADVANCE_TURN cambia de jugador y vuelve a awaiting-roll',
  r6.ok && r6.state.currentPlayerId === 'p2' && r6.state.turnPhase === 'awaiting-roll');
check('ADVANCE_TURN emite TURN_STARTED', r6.events[0].type === 'TURN_STARTED' && r6.events[0].playerId === 'p2');
check('El ciclo de turnos vuelve al primero', nextPlayerId(r6.state) === 'p1');

// Triángulos con ownerId, no índice
let est2 = nuevoEstado(777);
est2 = { ...est2, linesLeft: 6, diceRolled: true, turnPhase: 'drawing' };
let conTriangulo = null;
for (let paso = 0; paso < 60 && !conTriangulo; paso++) {
  const par = est2.candidatePairs.find(({ i, j }) => checkMoveValidity(est2, i, j).valid);
  if (!par) break;
  const r = applyAction({ ...est2, linesLeft: 6 }, { type: 'CONNECT', playerId: 'p1', from: par.i, to: par.j });
  if (!r.ok) break;
  est2 = r.state;
  if (r.events.some(e => e.type === 'TRIANGLE_COMPLETED')) conTriangulo = r;
}
check('Los triángulos guardan ownerId (no índice de array)',
  conTriangulo !== null && conTriangulo.state.triangles.every(t => typeof t.ownerId === 'string'),
  conTriangulo ? JSON.stringify(conTriangulo.state.triangles[0]) : 'no se cerró ninguno');
check('Cerrar triángulo suma al jugador correcto por id',
  conTriangulo !== null && playerById(conTriangulo.state, 'p1').score === conTriangulo.state.triangles.length);

// Partida terminada: no se acepta nada
const terminada = { ...s0, status: 'finished' };
check('Con la partida terminada se rechaza cualquier acción',
  !applyAction(terminada, { type: 'ROLL_DICE', playerId: 'p1' }).ok &&
  !applyAction(terminada, { type: 'CONNECT', playerId: 'p1', from: 0, to: 1 }).ok);

// Acción desconocida
check('Una acción desconocida se rechaza sin lanzar',
  !applyAction(s0, { type: 'INVENTADA' }).ok);

check('hasAnyLegalMove() detecta que quedan jugadas', hasAnyLegalMove(s0) === true);

// ── Replay: el registro de eventos debe bastar para reconstruir ────────
function huella(st) {
  return [
    [...st.edges].sort().join(','),
    st.triangles.map(t => `${t.a}-${t.b}-${t.c}:${t.ownerId}`).sort().join(','),
    st.players.map(p => `${p.id}:${p.score}`).join(','),
    `${st.currentPlayerId}/${st.linesLeft}/${st.diceRolled}/${st.turnPhase}`
  ].join('||');
}

let replaysMal = 0, replaysProbados = 0;
for (const semilla of [101, 202, 303, 404, 505]) {
  seedRng(semilla);
  const inicial = nuevoEstado(semilla);
  if (!inicial) continue;
  // Reiniciar la secuencia para que el estado inicial sea reproducible
  const estadoRngInicial = getRngState();

  // Jugar una partida registrando los eventos
  let est = inicial;
  const registro = [];
  for (let turno = 0; turno < 12; turno++) {
    const r = applyAction(est, { type: 'ROLL_DICE', playerId: est.currentPlayerId });
    if (!r.ok) break;
    est = r.state; registro.push(...r.events);
    while (est.linesLeft > 0) {
      const par = est.candidatePairs.find(({ i, j }) => checkMoveValidity(est, i, j).valid);
      if (!par) break;
      const rc = applyAction(est, { type: 'CONNECT', playerId: est.currentPlayerId, from: par.i, to: par.j });
      if (!rc.ok) break;
      est = rc.state; registro.push(...rc.events);
    }
    const ra = applyAction(est, { type: 'ADVANCE_TURN' });
    if (!ra.ok) break;
    est = ra.state; registro.push(...ra.events);
  }
  const huellaFinal = huella(est);

  // Reproducir desde el estado inicial, con la secuencia aleatoria
  // rebobinada al punto de partida.
  restoreRngState(estadoRngInicial);
  const rep = replayFromLog(inicial, registro);
  replaysProbados++;
  if (!rep.ok || huella(rep.state) !== huellaFinal) replaysMal++;
}
check(`El replay del registro reconstruye la partida exacta (${replaysProbados} partidas)`,
  replaysProbados > 0 && replaysMal === 0, `${replaysMal} no cuadraron`);

// Y debe DETECTAR un registro manipulado en vez de reconstruir algo falso
seedRng(909);
const base = nuevoEstado(909);
const rngBase = getRngState();
const r1b = applyAction(base, { type: 'ROLL_DICE', playerId: 'p1' });
const registroFalso = r1b.events.map(e => e.type === 'DICE_ROLLED' ? { ...e, value: (e.value % 6) + 1 } : e);
restoreRngState(rngBase);
const repFalso = replayFromLog(base, registroFalso);
check('El replay detecta un registro manipulado', !repFalso.ok && repFalso.mismatch.reason === 'dice-value-mismatch');

// ── Integridad del motor (v2.59) ───────────────────────────────────────
// ADVANCE_TURN no puede saltarse un turno a medias
const enCurso = { ...nuevoEstado(555), linesLeft: 3, diceRolled: true, turnPhase: 'drawing' };
const prematuro = applyAction(enCurso, { type: 'ADVANCE_TURN', playerId: 'p1' });
check('ADVANCE_TURN se rechaza con el turno a medias',
  !prematuro.ok && prematuro.reason === 'turn-not-finished', prematuro.reason);

const enHandoff = { ...enCurso, linesLeft: 0, diceRolled: false, turnPhase: 'handoff' };
check('ADVANCE_TURN se acepta desde handoff', applyAction(enHandoff, { type: 'ADVANCE_TURN' }).ok);
check('ADVANCE_TURN se rechaza si lo pide otro jugador',
  !applyAction(enHandoff, { type: 'ADVANCE_TURN', playerId: 'p2' }).ok);

// El motor detecta el fin de partida por su cuenta
const sinJugadas = { ...nuevoEstado(556), turnPhase: 'handoff', linesLeft: 0, diceRolled: false };
sinJugadas.candidatePairs = []; // ninguna pareja candidata: no quedan jugadas
const finPorMotor = applyAction(sinJugadas, { type: 'ADVANCE_TURN' });
check('El motor termina la partida cuando no quedan jugadas',
  finPorMotor.ok && finPorMotor.state.status === 'finished' &&
  finPorMotor.events.some(e => e.type === 'GAME_FINISHED'),
  JSON.stringify(finPorMotor.events.map(e => e.type)));

// Replay de una partida CON deshacer: la jugada anulada no debe repetirse
let estU = { ...nuevoEstado(557), linesLeft: 3, diceRolled: true, turnPhase: 'drawing' };
const logU = [];
const par1 = estU.candidatePairs.find(({ i, j }) => checkMoveValidity(estU, i, j).valid);
const r1u = applyAction(estU, { type: 'CONNECT', playerId: 'p1', from: par1.i, to: par1.j });
logU.push(...r1u.events);
const trasPrimera = r1u.state;
// deshacer esa jugada: se anota MOVE_UNDONE y se vuelve al estado previo
logU.push({ type: 'MOVE_UNDONE', playerId: 'p1', edge: edgeKey(par1.i, par1.j) });
// y jugar otra distinta
const par2 = estU.candidatePairs.find(({ i, j }) =>
  checkMoveValidity(estU, i, j).valid && edgeKey(i, j) !== edgeKey(par1.i, par1.j));
const r2u = applyAction(estU, { type: 'CONNECT', playerId: 'p1', from: par2.i, to: par2.j });
logU.push(...r2u.events);

const repU = replayFromLog({ ...nuevoEstado(557), linesLeft: 3, diceRolled: true, turnPhase: 'drawing' }, logU);
check('El replay NO reproduce una jugada deshecha',
  repU.ok && !repU.state.edges.has(edgeKey(par1.i, par1.j)) &&
  repU.state.edges.has(edgeKey(par2.i, par2.j)),
  repU.ok ? `aristas: ${[...repU.state.edges].join(',')}` : repU.mismatch?.reason);

console.log('');
if (fallos > 0) { console.error(`${fallos} comprobación(es) fallaron`); process.exit(1); }
console.log('Todas las comprobaciones pasaron.');
