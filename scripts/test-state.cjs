#!/usr/bin/env node
// scripts/test-state.cjs
// Verifica que una partida serializada y restaurada es EXACTAMENTE la
// misma partida — no solo que el objeto se parezca, sino que el juego se
// comporta igual: mismo grafo de candidatos, mismas jugadas legales,
// mismos triángulos que cerraría cada jugada.
//
//   node scripts/test-state.cjs
const { readFileSync } = require('node:fs');
const path = require('path');

const html = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');
const randomJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'random.js'), 'utf-8');
const geometryJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'geometry.js'), 'utf-8');
const rulesJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'rules.js'), 'utf-8');
const boardJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'board.js'), 'utf-8');
const stateJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'state.js'), 'utf-8');

function extract(name) {
  const re = new RegExp(`function ${name}\\(.*?\\n\\}\\n`, 's');
  const m = html.match(re) || randomJs.match(re) || geometryJs.match(re) || rulesJs.match(re) || boardJs.match(re) || stateJs.match(re);
  if (!m) throw new Error(`No se encontró function ${name}()`);
  return m[0];
}

const DIST_EPS = 1e-6;
const RNG_STREAMS = ['board','dice','ai'];
const STREAM_OFFSET = { board: 0x9E3779B9, dice: 0x85EBCA6B, ai: 0xC2B2AE35 };
const STATE_SCHEMA_VERSION = 2;
const RULES_VERSION = 1;
const ADJACENCY_TARGET = { minDegree: 3, p10Degree: 5, meanMin: 8, meanMax: 11 };
const APP_VERSION = 'test';
const MOVE_REASON_TEXT = {};
let CIRCLE_R, HIT_R, MIN_DIST, MAX_DIST, MAX_DIST_SQ, N_CIRCLES, W, H;
let circles, edges, triangles, players, currentPlayer, linesLeft, diceRolled;
let lastRolledValue, gameStatus, aiDifficulty, selectedCircle, turnPhase = 'drawing';
let candidatePairs, candidateNeighbors, lastMoveSnapshot;
let activeCirclesCache, selectedTargetsCache;
let rngSeed, rngCalls, streams;

eval(extract('mulberry32')); eval(extract('seedRng')); eval(extract('rngNext'));
eval(extract('rngInt')); eval(extract('getRngSeed')); eval(extract('getRngCalls'));
eval(extract('rngNextFrom')); eval(extract('rngIntFrom'));
eval(extract('getRngState')); eval(extract('restoreRngState'));
seedRng(1); // secuencia conocida para estas pruebas
eval(extract('dist'));
eval(extract('distSq'));
eval(extract('cross2d'));
eval(extract('segmentsIntersect'));
eval(extract('pointInTriangle'));
eval(extract('segmentPassesOverCircle'));
eval(extract('edgeKey'));
eval(extract('edgeExists'));
eval(extract('areAdjacent'));
eval(extract('triangleTraps'));
eval(extract('lineIntersectsAny'));
eval(extract('checkMoveValidity'));
eval(extract('findNewTriangles'));
eval(extract('chooseAdjacency'));
eval(extract('finalizeAdjacency'));
eval(extract('serializeGameState'));
eval(extract('rebuildCandidateGraph'));
eval(extract('restoreGameState'));
eval(extract('esNumFinito')); eval(extract('esEnteroEnRango'));
eval(extract('migrateGameSnapshot')); eval(extract('isValidGameSnapshot'));

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function placeCircles(N, minDist, rng) {
  const padding = CIRCLE_R + 20;
  const placed = [];
  let attempts = 0;
  while (placed.length < N && attempts < 5000) {
    attempts++;
    const x = padding + rng() * (W - padding * 2);
    const y = padding + rng() * (H - padding * 2);
    if (placed.every(c => dist(x, y, c.x, c.y) >= minDist)) placed.push({ x, y });
  }
  return placed;
}

// Monta una partida real de mitad de juego, igual que haría el juego.
function buildScenario(seed, movesPlayed) {
  const rng = mulberry32(seed);
  N_CIRCLES = 35; W = 380; H = 700;
  CIRCLE_R = Math.max(7, Math.min(16, Math.round(16 - (N_CIRCLES - 25) * (9 / 75))));
  HIT_R = Math.max(20, CIRCLE_R + 8);
  const avgDist = Math.sqrt((W * H) / N_CIRCLES);
  MIN_DIST = Math.max(CIRCLE_R * 2 + 6, avgDist * 0.55);

  let adjacency = null, positions = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    positions = placeCircles(N_CIRCLES, MIN_DIST, rng);
    if (positions.length !== N_CIRCLES) continue;
    adjacency = chooseAdjacency(positions, CIRCLE_R);
    if (adjacency) break;
  }
  if (!adjacency) return false;

  circles = positions;
  MAX_DIST = adjacency.maxDistance;
  MAX_DIST_SQ = adjacency.maxDistanceSq;
  candidatePairs = adjacency.pairs;
  candidateNeighbors = Array.from({ length: circles.length }, () => []);
  for (const { i, j } of candidatePairs) {
    candidateNeighbors[i].push(j);
    candidateNeighbors[j].push(i);
  }

  edges = new Set();
  triangles = [];
  players = [
    { name: 'Josu', initial: 'J', score: 0, colorIndex: 0 },
    { name: 'Circuit', initial: '🤖', score: 0, colorIndex: 1, isAI: true }
  ];
  currentPlayer = 0; linesLeft = 3; diceRolled = true; lastRolledValue = 3;
  gameStatus = 'playing'; aiDifficulty = 'medium';

  for (let m = 0; m < movesPlayed; m++) {
    const legal = candidatePairs.filter(({ i, j }) => checkMoveValidity(ST, i, j).valid);
    if (legal.length === 0) break;
    const { i, j } = legal[Math.floor(rng() * legal.length)];
    edges.add(edgeKey(i, j));
    const owner = m % 2;
    findNewTriangles(ST, i, j).forEach(t => { triangles.push({ ...t, owner }); players[owner].score++; });
  }
  return true;
}

// Huella completa del comportamiento del juego en el estado actual: para
// CADA pareja candidata, si es legal y cuántos triángulos cerraría. Si
// esta huella coincide antes y después de restaurar, la partida no solo
// "se parece": responde exactamente igual a cualquier jugada posible.
function behaviourFingerprint() {
  const out = [];
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const v = checkMoveValidity(ST, i, j);
      out.push(`${i}-${j}:${v.valid ? 'ok' : v.reason}:${v.valid ? findNewTriangles(ST, i, j).length : 0}`);
    }
  }
  return out.join('|');
}

function snapshotGraph() {
  return {
    pairs: candidatePairs.map(p => `${p.i}-${p.j}`).sort().join(','),
    neighbors: candidateNeighbors.map(list => [...list].sort((a, b) => a - b).join('.')).join('|')
  };
}

const ST = {
  get circles(){return circles;}, get edges(){return edges;}, get triangles(){return triangles;},
  get players(){return players;}, get maxDistSq(){return MAX_DIST_SQ;}, get circleRadius(){return CIRCLE_R;},
  get candidatePairs(){return candidatePairs;}, get candidateNeighbors(){return candidateNeighbors;},
  get linesLeft(){return linesLeft;}, get currentPlayer(){return currentPlayer;}, get aiDifficulty(){return aiDifficulty;}
};

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`OK: ${label}`); }
  else { console.error(`FALLO: ${label}${detail ? ' — ' + detail : ''}`); failures++; }
}

console.log('Verificando serialización/restauración de partidas...\n');

const SCENARIOS = 40;
let graphMismatches = 0, behaviourMismatches = 0, scoreMismatches = 0, jsonFailures = 0;

for (let s = 0; s < SCENARIOS; s++) {
  if (!buildScenario(700000 + s, 6 + (s % 15))) continue;

  const graphBefore = snapshotGraph();
  const behaviourBefore = behaviourFingerprint();
  const scoresBefore = players.map(p => p.score).join(',');
  const edgesBefore = [...edges].sort().join(',');
  const trianglesBefore = triangles.map(t => `${t.a}-${t.b}-${t.c}:${t.owner}`).sort().join(',');
  const turnBefore = `${currentPlayer}/${linesLeft}/${diceRolled}/${lastRolledValue}/${gameStatus}`;

  // Ida y vuelta REAL por JSON — no basta con pasar el objeto en memoria,
  // porque justo lo que se rompe al guardar de verdad (un Set que se
  // convierte en {}) solo se nota atravesando JSON.
  let restored;
  try {
    const json = JSON.stringify(serializeGameState());
    restored = restoreGameState(JSON.parse(json));
  } catch (e) {
    jsonFailures++;
    continue;
  }
  if (!restored) { jsonFailures++; continue; }

  if (snapshotGraph().pairs !== graphBefore.pairs ||
      snapshotGraph().neighbors !== graphBefore.neighbors) graphMismatches++;
  if (behaviourFingerprint() !== behaviourBefore) behaviourMismatches++;
  if (players.map(p => p.score).join(',') !== scoresBefore ||
      [...edges].sort().join(',') !== edgesBefore ||
      triangles.map(t => `${t.a}-${t.b}-${t.c}:${t.owner}`).sort().join(',') !== trianglesBefore ||
      `${currentPlayer}/${linesLeft}/${diceRolled}/${lastRolledValue}/${gameStatus}` !== turnBefore) {
    scoreMismatches++;
  }
}

check(`${SCENARIOS} partidas sobreviven a JSON.stringify/parse`, jsonFailures === 0, `${jsonFailures} fallaron`);
check('El grafo de candidatos reconstruido es idéntico al original', graphMismatches === 0, `${graphMismatches} distintos`);
check('Puntuaciones, aristas, triángulos y turno se conservan exactos', scoreMismatches === 0, `${scoreMismatches} distintos`);
check('El juego responde IGUAL a toda jugada posible tras restaurar', behaviourMismatches === 0, `${behaviourMismatches} distintos`);

// El Set de edges es la trampa clásica: JSON.stringify(new Set()) da {}.
buildScenario(700000, 10);
const edgeCount = edges.size;
const viaJson = JSON.parse(JSON.stringify(serializeGameState()));
check('edges viaja como array, no como Set vacío',
  Array.isArray(viaJson.edges) && viaJson.edges.length === edgeCount,
  `esperados ${edgeCount}, llegaron ${Array.isArray(viaJson.edges) ? viaJson.edges.length : 'no-array'}`);

// Datos corruptos o de otro formato: debe rechazar limpiamente, no petar.
const badInputs = [
  null, undefined, 42, 'texto', {},
  { schemaVersion: 999, config: {}, board: {}, edges: [], triangles: [], players: [], turn: {}, status: 'playing' },
  { schemaVersion: 1, config: { circleCount: 35 }, board: { circles: [] }, edges: [], triangles: [], players: [], turn: {}, status: 'playing' }
];
let threw = 0, wronglyAccepted = 0;
for (const bad of badInputs) {
  try { if (restoreGameState(bad) !== false) wronglyAccepted++; }
  catch (e) { threw++; }
}
check('Guardados corruptos se rechazan sin lanzar excepción', threw === 0 && wronglyAccepted === 0,
  `${threw} lanzaron, ${wronglyAccepted} aceptados por error`);

console.log('');
if (failures > 0) { console.error(`${failures} comprobación(es) fallaron`); process.exit(1); }
console.log('Todas las comprobaciones pasaron.');
