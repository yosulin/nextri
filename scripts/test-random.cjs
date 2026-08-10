#!/usr/bin/env node
// scripts/test-random.cjs
// Verifica el determinismo del motor: misma semilla = misma partida, y
// que una partida guardada y reanudada CONTINÚA con la misma secuencia,
// no con una distinta.
//
//   node scripts/test-random.cjs
const { readFileSync } = require('node:fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const fuentes = {
  html: readFileSync(path.join(raiz, 'index.html'), 'utf-8'),
  random: readFileSync(path.join(raiz, 'src/game/random.js'), 'utf-8'),
  geometry: readFileSync(path.join(raiz, 'src/game/geometry.js'), 'utf-8'),
  rules: readFileSync(path.join(raiz, 'src/game/rules.js'), 'utf-8'),
  board: readFileSync(path.join(raiz, 'src/game/board.js'), 'utf-8'),
  state: readFileSync(path.join(raiz, 'src/game/state.js'), 'utf-8'),
  ai: readFileSync(path.join(raiz, 'src/ai/ai.js'), 'utf-8'),
  levels: readFileSync(path.join(raiz, 'src/ai/levels.js'), 'utf-8')
};

function extract(nombre) {
  const re = new RegExp(`function ${nombre}\\(.*?\\n\\}\\n`, 's');
  for (const src of Object.values(fuentes)) {
    const m = src.match(re);
    if (m) return m[0];
  }
  throw new Error(`No se encontró function ${nombre}()`);
}
function extractConst(nombre) {
  const re = new RegExp(`const ${nombre} = (\\{.*?\\n\\});\\n`, 's');
  for (const src of Object.values(fuentes)) {
    const m = src.match(re);
    if (m) return m[1];
  }
  throw new Error(`No se encontró const ${nombre}`);
}

const DIST_EPS = 1e-6;
const STATE_SCHEMA_VERSION = 1;
const ADJACENCY_TARGET = { minDegree: 3, p10Degree: 5, meanMin: 8, meanMax: 11 };
const APP_VERSION = 'test';
const MOVE_REASON_TEXT = {};
let CIRCLE_R, HIT_R, MIN_DIST, MAX_DIST, MAX_DIST_SQ, N_CIRCLES, W, H;
let circles, edges, triangles, players, currentPlayer, linesLeft, diceRolled;
let lastRolledValue, gameStatus, aiDifficulty, selectedCircle, DEBUG = false;
let candidatePairs, candidateNeighbors, lastMoveSnapshot;
let activeCirclesCache, selectedTargetsCache;
let rngSeed, rngCalls, rngFn;

eval(extract('mulberry32')); eval(extract('seedRng')); eval(extract('rngNext'));
eval(extract('rngInt')); eval(extract('getRngSeed')); eval(extract('getRngCalls'));
eval(extract('restoreRng'));
eval(extract('dist')); eval(extract('distSq')); eval(extract('cross2d'));
eval(extract('segmentsIntersect')); eval(extract('pointInTriangle'));
eval(extract('segmentPassesOverCircle')); eval(extract('edgeKey'));
eval(extract('edgeExists')); eval(extract('areAdjacent'));
eval(extract('triangleTraps')); eval(extract('lineIntersectsAny'));
eval(extract('checkMoveValidity')); eval(extract('findNewTriangles'));
eval(extract('chooseAdjacency')); eval(extract('finalizeAdjacency'));
eval(extract('generateCirclePositions')); eval(extract('buildCandidateGraph'));
eval(extract('attemptBoardGeneration'));
eval(extract('serializeGameState')); eval(extract('rebuildCandidateGraph'));
eval(extract('restoreGameState')); eval(extract('isValidGameSnapshot'));
eval(extract('shuffleInPlace')); eval(extract('pickUniform'));
eval(extract('weightedPickByGain')); eval(extract('createsScoringReply'));
eval(extract('isAITurn')); eval(extract('chooseAIMove'));
const AI_LEVELS = eval('(' + extractConst('AI_LEVELS') + ')');

let fallos = 0;
function check(etiqueta, ok, detalle) {
  if (ok) console.log(`OK: ${etiqueta}`);
  else { console.error(`FALLO: ${etiqueta}${detalle ? ' — ' + detalle : ''}`); fallos++; }
}

function prepararMedidas() {
  N_CIRCLES = 35; W = 380; H = 700;
  CIRCLE_R = Math.max(7, Math.min(16, Math.round(16 - (N_CIRCLES - 25) * (9 / 75))));
  HIT_R = Math.max(20, CIRCLE_R + 8);
  MIN_DIST = Math.max(CIRCLE_R * 2 + 6, Math.sqrt((W * H) / N_CIRCLES) * 0.55);
}

// Genera un tablero completo con la semilla dada, igual que el juego.
function generarConSemilla(semilla) {
  seedRng(semilla);
  prepararMedidas();
  circles = [];
  const best = attemptBoardGeneration(MIN_DIST, 20);
  if (!best) return null;
  circles = best.positions;
  MAX_DIST = best.adjacency.maxDistance;
  MAX_DIST_SQ = best.adjacency.maxDistanceSq;
  buildCandidateGraph(best.adjacency.pairs);
  edges = new Set(); triangles = [];
  players = [
    { name: 'Josu', initial: 'J', score: 0, colorIndex: 0 },
    { name: 'Circuit', initial: '🤖', score: 0, colorIndex: 1, isAI: true }
  ];
  currentPlayer = 0; linesLeft = 3; diceRolled = true; lastRolledValue = 3;
  gameStatus = 'playing'; aiDifficulty = 'medium';
  activeCirclesCache = null; selectedTargetsCache = null;
  return circles.map(c => `${c.x.toFixed(6)},${c.y.toFixed(6)}`).join('|');
}

console.log('Verificando determinismo con semilla...\n');

// 1. Misma semilla, mismo tablero — repetido varias veces
let tablerosDistintos = 0;
for (const semilla of [1, 42, 12345, 999999]) {
  const a = generarConSemilla(semilla);
  const b = generarConSemilla(semilla);
  if (a === null || a !== b) tablerosDistintos++;
}
check('La misma semilla genera siempre el mismo tablero', tablerosDistintos === 0, `${tablerosDistintos} discrepancias`);

// 2. Semillas distintas, tableros distintos (si no, la semilla no se usa)
const t1 = generarConSemilla(1), t2 = generarConSemilla(2);
check('Semillas distintas generan tableros distintos', t1 !== t2);

// 3. Las tiradas de dado también son deterministas
function tiradas(semilla, n) {
  seedRng(semilla);
  const out = [];
  for (let i = 0; i < n; i++) out.push(rngInt(6) + 1);
  return out.join(',');
}
check('Las tiradas de dado son deterministas', tiradas(7, 20) === tiradas(7, 20));
check('Semillas distintas dan tiradas distintas', tiradas(7, 20) !== tiradas(8, 20));

// 4. Las decisiones de Circuit son deterministas con la misma semilla
function decisionesIA(semilla, n) {
  generarConSemilla(semilla);
  aiDifficulty = 'medium';
  const out = [];
  for (let i = 0; i < n; i++) {
    const m = chooseAIMove();
    if (!m) break;
    out.push(`${m[0]}-${m[1]}`);
    edges.add(edgeKey(m[0], m[1]));
    activeCirclesCache = null;
  }
  return out.join(',');
}
check('Las decisiones de Circuit son deterministas', decisionesIA(21, 12) === decisionesIA(21, 12));

// 5. LO IMPORTANTE: una partida guardada y reanudada CONTINÚA la misma
//    secuencia. Sin guardar el contador de consumos, el tablero se
//    restauraría bien pero las tiradas futuras divergirían.
let divergencias = 0;
for (const semilla of [11, 22, 33, 44, 55]) {
  generarConSemilla(semilla);
  // consumir unos cuantos números, como haría una partida en marcha
  for (let i = 0; i < 17; i++) rngNext();

  const guardado = JSON.parse(JSON.stringify(serializeGameState()));
  const siguientesSinGuardar = [];
  for (let i = 0; i < 10; i++) siguientesSinGuardar.push(rngInt(6) + 1);

  // Ahora restaurar desde el guardado y pedir los mismos 10 números
  restoreGameState(guardado);
  const siguientesTrasRestaurar = [];
  for (let i = 0; i < 10; i++) siguientesTrasRestaurar.push(rngInt(6) + 1);

  if (siguientesSinGuardar.join(',') !== siguientesTrasRestaurar.join(',')) divergencias++;
}
check('Tras guardar y reanudar, las tiradas siguientes son las mismas', divergencias === 0,
  `${divergencias} partidas divergieron`);

// 6. La semilla viaja en el guardado
generarConSemilla(31337);
const snap = JSON.parse(JSON.stringify(serializeGameState()));
check('La semilla queda registrada en el guardado',
  snap.rng && snap.rng.seed === 31337 && typeof snap.rng.calls === 'number',
  JSON.stringify(snap.rng));

console.log('');
if (fallos > 0) { console.error(`${fallos} comprobación(es) fallaron`); process.exit(1); }
console.log('Todas las comprobaciones pasaron.');
