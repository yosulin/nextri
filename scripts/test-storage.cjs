#!/usr/bin/env node
// scripts/test-storage.cjs
// Prueba el ciclo guardar → cargar → reanudar sobre partidas reales, y
// sobre todo que los fallos de localStorage (cuota llena, modo privado)
// NO rompan nada: guardar es una comodidad, no debe poder tumbar la app.
//
//   node scripts/test-storage.cjs
const { readFileSync } = require('node:fs');
const path = require('path');

const html = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');
const randomJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'random.js'), 'utf-8');
const geometryJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'geometry.js'), 'utf-8');
const rulesJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'rules.js'), 'utf-8');
const boardJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'board.js'), 'utf-8');
const stateJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'state.js'), 'utf-8');
const storageJs = readFileSync(path.join(__dirname, '..', 'src', 'platform', 'storage.js'), 'utf-8');

function extract(name) {
  const re = new RegExp(`(?:export )?function ${name}\\(.*?\\n\\}\\n`, 's');
  const m = html.match(re) || randomJs.match(re) || geometryJs.match(re) || rulesJs.match(re) ||
            boardJs.match(re) || stateJs.match(re) || storageJs.match(re);
  if (!m) throw new Error(`No se encontró function ${name}()`);
  return m[0].replace(/(^|\n)export /g, '$1');
}

const DIST_EPS = 1e-6;
const RNG_STREAMS = ['board','dice','ai'];
const STREAM_OFFSET = { board: 0x9E3779B9, dice: 0x85EBCA6B, ai: 0xC2B2AE35 };
const STATE_SCHEMA_VERSION = 3;
const RULES_VERSION = 1;
const SAVE_KEY = 'nextri:partida';
const SAVE_KEY_ANTERIOR = 'juego-circulos:partida';
const ADJACENCY_TARGET = { minDegree: 3, p10Degree: 5, meanMin: 8, meanMax: 11 };
const APP_VERSION = 'test';
const MOVE_REASON_TEXT = {};
let CIRCLE_R, HIT_R, MIN_DIST, MAX_DIST, MAX_DIST_SQ, N_CIRCLES, W, H;
let circles, edges, triangles, players, currentPlayer, linesLeft, diceRolled;
let lastRolledValue, gameStatus, aiDifficulty, selectedCircle, turnPhase = 'drawing';
let candidatePairs, candidateNeighbors, lastMoveSnapshot, eventLog = [];
let activeCirclesCache, selectedTargetsCache;
let rngSeed, rngCalls, streams;

// localStorage simulado, con interruptor para provocar fallos.
let failMode = null; // null | 'set' | 'get' | 'all'
const store = new Map();
const localStorage = {
  setItem(k, v) { if (failMode === 'set' || failMode === 'all') throw new Error('QuotaExceededError'); store.set(k, v); },
  getItem(k) { if (failMode === 'get' || failMode === 'all') throw new Error('SecurityError'); return store.has(k) ? store.get(k) : null; },
  removeItem(k) { if (failMode === 'all') throw new Error('SecurityError'); store.delete(k); }
};

eval(extract('mulberry32')); eval(extract('seedRng')); eval(extract('rngNext'));
eval(extract('rngInt')); eval(extract('getRngSeed')); eval(extract('getRngCalls'));
eval(extract('rngNextFrom')); eval(extract('rngIntFrom'));
eval(extract('getRngState')); eval(extract('restoreRngState'));
seedRng(1); // secuencia conocida para estas pruebas
eval(extract('dist')); eval(extract('distSq')); eval(extract('cross2d'));
eval(extract('segmentsIntersect')); eval(extract('pointInTriangle'));
eval(extract('segmentPassesOverCircle')); eval(extract('edgeKey'));
eval(extract('edgeExists')); eval(extract('areAdjacent'));
eval(extract('triangleTraps')); eval(extract('lineIntersectsAny'));
eval(extract('checkMoveValidity')); eval(extract('findNewTriangles'));
eval(extract('chooseAdjacency')); eval(extract('finalizeAdjacency'));
eval(extract('serializeGameState')); eval(extract('candidatePairsFor')); eval(extract('buildCandidateGraph'));
eval(extract('restoreGameState')); eval(extract('esNumFinito')); eval(extract('esEnteroEnRango'));
eval(extract('migrateGameSnapshot')); eval(extract('isValidGameSnapshot'));
eval(extract('saveGame')); eval(extract('loadSavedGame'));
eval(extract('clearSavedGame')); eval(extract('hasSavedGame'));

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildScenario(seed, movesPlayed) {
  const rng = mulberry32(seed);
  N_CIRCLES = 35; W = 380; H = 700;
  CIRCLE_R = Math.max(7, Math.min(16, Math.round(16 - (N_CIRCLES - 25) * (9 / 75))));
  HIT_R = Math.max(20, CIRCLE_R + 8);
  const avgDist = Math.sqrt((W * H) / N_CIRCLES);
  MIN_DIST = Math.max(CIRCLE_R * 2 + 6, avgDist * 0.55);
  let adjacency = null, positions = null;
  for (let a = 0; a < 20; a++) {
    positions = [];
    const padding = CIRCLE_R + 20;
    let attempts = 0;
    while (positions.length < N_CIRCLES && attempts < 5000) {
      attempts++;
      const x = padding + rng() * (W - padding * 2);
      const y = padding + rng() * (H - padding * 2);
      if (positions.every(c => dist(x, y, c.x, c.y) >= MIN_DIST)) positions.push({ x, y });
    }
    if (positions.length !== N_CIRCLES) continue;
    adjacency = chooseAdjacency(positions, CIRCLE_R);
    if (adjacency) break;
  }
  if (!adjacency) return false;
  circles = positions;
  MAX_DIST = adjacency.maxDistance; MAX_DIST_SQ = adjacency.maxDistanceSq;
  candidatePairs = adjacency.pairs;
  candidateNeighbors = Array.from({ length: circles.length }, () => []);
  for (const { i, j } of candidatePairs) { candidateNeighbors[i].push(j); candidateNeighbors[j].push(i); }
  edges = new Set(); triangles = [];
  players = [
    { id: 'p1', userId: null, name: 'Josu', initial: 'J', score: 0, colorIndex: 0 },
    { id: 'p2', userId: null, name: 'Circuit', initial: '🤖', score: 0, colorIndex: 1, isAI: true }
  ];
  currentPlayer = 0; linesLeft = 2; diceRolled = true; lastRolledValue = 2;
  gameStatus = 'playing'; aiDifficulty = 'hard';
  for (let m = 0; m < movesPlayed; m++) {
    const legal = candidatePairs.filter(({ i, j }) => checkMoveValidity(ST, i, j).valid);
    if (legal.length === 0) break;
    const { i, j } = legal[Math.floor(rng() * legal.length)];
    edges.add(edgeKey(i, j));
    const ownerId = m % 2 === 0 ? 'p1' : 'p2';
    findNewTriangles(ST, i, j).forEach(t => { triangles.push({ ...t, ownerId }); players.find(p=>p.id===ownerId).score++; });
  }
  return true;
}

function fingerprint() {
  return [
    [...edges].sort().join(','),
    triangles.map(t => `${t.a}-${t.b}-${t.c}:${t.ownerId}`).sort().join(','),
    players.map(p => `${p.id}:${p.name}:${p.score}:${p.colorIndex}:${!!p.isAI}`).join(','),
    `${currentPlayer}/${linesLeft}/${diceRolled}/${lastRolledValue}/${gameStatus}/${aiDifficulty}`
  ].join('||');
}

const ST = {
  get circles(){return circles;}, get edges(){return edges;}, get triangles(){return triangles;},
  get players(){return players;}, get maxDistSq(){return MAX_DIST_SQ;}, get circleRadius(){return CIRCLE_R;},
  get candidatePairs(){return candidatePairs;}, get candidateNeighbors(){return candidateNeighbors;},
  get linesLeft(){return linesLeft;}, get currentPlayer(){return currentPlayer;}, get aiDifficulty(){return aiDifficulty;}
};

function estadoVivo() {
  return { rulesVersion: RULES_VERSION, circleCount: N_CIRCLES, aiDifficulty,
    width: W, height: H, circleRadius: CIRCLE_R, hitRadius: HIT_R,
    minDist: MIN_DIST, maxDist: MAX_DIST, maxDistSq: MAX_DIST_SQ,
    circles, edges, triangles, players, currentPlayer, linesLeft,
    diceRolled, lastRolledValue, turnPhase, status: gameStatus, events: [] };
}
function aplicar(n) {
  if (!n) return false;
  N_CIRCLES=n.circleCount; aiDifficulty=n.aiDifficulty; W=n.width; H=n.height;
  CIRCLE_R=n.circleRadius; HIT_R=n.hitRadius; MIN_DIST=n.minDist;
  MAX_DIST=n.maxDist; MAX_DIST_SQ=n.maxDistSq; circles=n.circles;
  candidatePairs=n.candidatePairs; candidateNeighbors=n.candidateNeighbors;
  edges=n.edges; triangles=n.triangles; players=n.players;
  currentPlayer=n.currentPlayer; linesLeft=n.linesLeft; diceRolled=n.diceRolled;
  lastRolledValue=n.lastRolledValue; turnPhase=n.turnPhase; gameStatus=n.status;
  return true;
}

let failures = 0;
function check(label, ok, detail) {
  if (ok) console.log(`OK: ${label}`);
  else { console.error(`FALLO: ${label}${detail ? ' — ' + detail : ''}`); failures++; }
}

console.log('Verificando guardar / continuar partida...\n');

// 1. Ciclo completo sobre varias partidas
let cycleMismatches = 0;
for (let s = 0; s < 25; s++) {
  store.clear(); failMode = null;
  if (!buildScenario(800000 + s, 5 + (s % 12))) continue;
  const before = fingerprint();
  saveGame(estadoVivo());
  // Simular "cerrar la app": ensuciar el estado vivo por completo
  circles = []; edges = new Set(); triangles = []; players = [];
  currentPlayer = 99; linesLeft = -1; diceRolled = false; gameStatus = 'setup';
  const snap = loadSavedGame();
  if (!snap || !aplicar(restoreGameState(snap)) || fingerprint() !== before) cycleMismatches++;
}
check('25 partidas se guardan y recuperan idénticas', cycleMismatches === 0, `${cycleMismatches} distintas`);

// 2. Solo se guardan partidas EN CURSO
store.clear(); failMode = null;
buildScenario(800000, 8);
gameStatus = 'finished';
saveGame(estadoVivo());
check('Una partida terminada no se guarda', !hasSavedGame());
gameStatus = 'setup';
saveGame(estadoVivo());
check('El menú (setup) no se guarda', !hasSavedGame());

// 3. clearSavedGame lo borra de verdad
gameStatus = 'playing'; saveGame(estadoVivo());
const hadSave = hasSavedGame();
clearSavedGame();
check('clearSavedGame() borra el guardado', hadSave && !hasSavedGame());

// 4. Fallos de localStorage: nunca deben lanzar
store.clear(); buildScenario(800000, 8); gameStatus = 'playing';
let threw = null;
try {
  failMode = 'set'; saveGame(estadoVivo());
  failMode = 'get'; loadSavedGame(); hasSavedGame();
  failMode = 'all'; saveGame(estadoVivo()); loadSavedGame(); clearSavedGame(); hasSavedGame();
} catch (e) { threw = e.message; }
failMode = null;
check('Fallos de localStorage (cuota, modo privado) no lanzan excepción', threw === null, threw);

// 5. Guardado corrupto o de formato antiguo: se ignora, no se restaura a medias
store.clear();
store.set(SAVE_KEY, '{esto no es json valido');
check('Un guardado con JSON roto se ignora', loadSavedGame() === null);
store.set(SAVE_KEY, JSON.stringify({ schemaVersion: 0, config: {}, board: {}, edges: [], triangles: [], players: [], turn: {}, status: 'playing' }));
check('Un guardado de un formato anterior se ignora', loadSavedGame() === null);

// Los formatos anteriores (1 y 2, con índices de jugador en vez de ids
// estables) se DESCARTAN limpiamente. Es una decisión explícita: el juego
// todavía no lo usa nadie más, así que no hay partidas ajenas que
// preservar y no merece la pena arrastrar conversiones para versiones que
// nunca salieron de un móvil. Lo que no vale es aceptarlas a medias.
store.clear(); failMode = null;
buildScenario(800000, 8); gameStatus = 'playing';
const v3 = JSON.parse(JSON.stringify(serializeGameState(estadoVivo())));

for (const esquemaViejo of [1, 2]) {
  const viejo = { ...v3, schemaVersion: esquemaViejo };
  store.set(SAVE_KEY, JSON.stringify(viejo));
  check(`Un guardado del formato ${esquemaViejo} se descarta limpiamente`, loadSavedGame() === null);
}

// Un formato MÁS NUEVO que esta versión debe descartarse, no adivinarse.
store.set(SAVE_KEY, JSON.stringify({ ...v3, schemaVersion: 99 }));
check('Un guardado de un formato más nuevo se descarta', loadSavedGame() === null);

// Guardados con valores imposibles: la validación endurecida debe pillarlos.
const casosInvalidos = {
  'turno fuera de rango': { ...v3, turn: { ...v3.turn, currentPlayer: 99 } },
  'coordenadas no finitas': { ...v3, board: { ...v3.board, circles: [{ x: NaN, y: 0 }] } },
  'arista fuera de rango': { ...v3, edges: ['0-9999'] },
  'fase de turno desconocida': { ...v3, turn: { ...v3.turn, phase: 'inventada' } },
  'dificultad inventada': { ...v3, config: { ...v3.config, aiDifficulty: 'imposible' } },
  'sin datos del generador': (() => { const c = { ...v3 }; delete c.rng; return c; })()
};
let colados = [];
for (const [nombre, caso] of Object.entries(casosInvalidos)) {
  store.set(SAVE_KEY, JSON.stringify(caso));
  if (loadSavedGame() !== null) colados.push(nombre);
}
check('Guardados con valores imposibles se rechazan', colados.length === 0, colados.join('; '));

// El color propio del rival debe sobrevivir a guardar y reanudar: si no,
// sus triángulos cambian de color al continuar una partida.
store.clear(); failMode = null;
buildScenario(800000, 6); gameStatus = 'playing';
players[1].color = '#a855f7';
saveGame(estadoVivo());
players[1].color = null;
const recuperadoColor = loadSavedGame();
check('El color propio del rival sobrevive a guardar y reanudar',
  recuperadoColor && recuperadoColor.players[1].color === '#a855f7',
  recuperadoColor ? String(recuperadoColor.players[1].color) : 'no se recuperó');

// Y un color inventado no debe colarse.
const conColorMalo = JSON.parse(JSON.stringify(recuperadoColor));
conColorMalo.players[1].color = 'javascript:alert(1)';
store.set(SAVE_KEY, JSON.stringify(conColorMalo));
check('Un color con formato inválido se rechaza', loadSavedGame() === null);

console.log('');
if (failures > 0) { console.error(`${failures} comprobación(es) fallaron`); process.exit(1); }
console.log('Todas las comprobaciones pasaron.');
