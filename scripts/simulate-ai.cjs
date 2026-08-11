#!/usr/bin/env node
// scripts/simulate-ai.cjs
// Compara estadísticamente Fácil/Medio/Difícil sobre muchos escenarios de
// partida reproducibles (semilla fija). No se valida una única jugada al
// azar — se repite cada escenario cientos de veces por nivel y se comparan
// medias. No forma parte de la app — se corre a mano al tocar chooseAIMove(ST)
// o AI_LEVELS.
//
//   node scripts/simulate-ai.cjs
const { readFileSync } = require('node:fs');
const path = require('path');
const html = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');
const randomJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'random.js'), 'utf-8');
const geometryJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'geometry.js'), 'utf-8');
const rulesJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'rules.js'), 'utf-8');
const boardJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'board.js'), 'utf-8');
const levelsJs = readFileSync(path.join(__dirname, '..', 'src', 'ai', 'levels.js'), 'utf-8');
const aiJs = readFileSync(path.join(__dirname, '..', 'src', 'ai', 'ai.js'), 'utf-8');

function extract(name) {
  const re = new RegExp(`(?:export )?function ${name}\\(.*?\\n\\}\\n`, 's');
  const m = html.match(re) || randomJs.match(re) || geometryJs.match(re) || rulesJs.match(re) || boardJs.match(re) || aiJs.match(re);
  if (!m) throw new Error(`No se encontró function ${name}() en index.html, geometry.js, rules.js, board.js ni ai.js`);
  return m[0].replace(/(^|\n)export /g, '$1');
}
function extractConst(name) {
  const re = new RegExp(`(?:export )?const ${name} = (\\{.*?\\n\\});\\n`, 's');
  const m = html.match(re) || levelsJs.match(re);
  if (!m) throw new Error(`No se encontró const ${name} en index.html ni en src/ai/levels.js`);
  return m[1]; // solo el objeto literal, sin "const NOMBRE ="
}

const DIST_EPS = 1e-6;
const RNG_STREAMS = ['board','dice','ai'];
const STREAM_OFFSET = { board: 0x9E3779B9, dice: 0x85EBCA6B, ai: 0xC2B2AE35 };
const ADJACENCY_TARGET = { minDegree: 3, p10Degree: 5, meanMin: 8, meanMax: 11 };
let CIRCLE_R, MAX_DIST_SQ, circles, edges, triangles, candidatePairs, candidateNeighbors, linesLeft, DEBUG = false;

let rngSeed, rngCalls, streams;

eval(extract('seedRng')); eval(extract('rngNext')); eval(extract('rngInt'));
eval(extract('getRngSeed')); eval(extract('getRngCalls'));
eval(extract('rngNextFrom')); eval(extract('rngIntFrom'));
eval(extract('getRngState')); eval(extract('restoreRngState'));
seedRng(20260810); // semilla fija: la simulacion queda reproducible
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
const MOVE_REASON_TEXT = {};
eval(extract('checkMoveValidity'));
eval(extract('findNewTriangles'));
eval(extract('chooseAdjacency'));
eval(extract('finalizeAdjacency'));
eval(extract('shuffleInPlace'));
eval(extract('pickUniform'));
eval(extract('weightedPickByGain'));
eval(extract('createsScoringReply'));
eval(extract('chooseAIMove'));
let AI_LEVELS = eval('(' + extractConst('AI_LEVELS') + ')');
let aiDifficulty = 'medium';

// PRNG con semilla — mismo esquema que simulate-adjacency.cjs
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function placeCircles(W, H, N, minDist, rng) {
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

// Genera un tablero jugable real y le aplica unas cuantas jugadas al azar
// para tener escenarios de mitad de partida, no solo tableros vacíos.
function buildMidGameScenario(seed, movesPlayed) {
  const rng = mulberry32(seed);
  const N = 35, W = 380, H = 700;
  CIRCLE_R = Math.max(7, Math.min(16, Math.round(16 - (N - 25) * (9 / 75))));
  const avgDist = Math.sqrt((W * H) / N);
  const MIN_DIST = Math.max(CIRCLE_R * 2 + 6, avgDist * 0.55);

  let adjacency = null, positions = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    positions = placeCircles(W, H, N, MIN_DIST, rng);
    if (positions.length !== N) continue;
    adjacency = chooseAdjacency(positions, CIRCLE_R);
    if (adjacency) break;
  }
  if (!adjacency) return null;

  circles = positions;
  MAX_DIST_SQ = adjacency.maxDistanceSq;
  candidatePairs = adjacency.pairs;
  candidateNeighbors = Array.from({ length: circles.length }, () => []);
  for (const { i, j } of candidatePairs) {
    candidateNeighbors[i].push(j);
    candidateNeighbors[j].push(i);
  }
  edges = new Set();
  triangles = [];

  for (let m = 0; m < movesPlayed; m++) {
    const legal = candidatePairs.filter(({ i, j }) => checkMoveValidity(ST, i, j).valid);
    if (legal.length === 0) break;
    const { i, j } = legal[Math.floor(rng() * legal.length)];
    edges.add(edgeKey(i, j));
    const tris = findNewTriangles(ST, i, j);
    tris.forEach(t => triangles.push({ ...t, owner: 0 }));
  }
  return true;
}

const ST = {
  get circles(){return circles;}, get edges(){return edges;}, get triangles(){return triangles;},
  get players(){return players;}, get maxDistSq(){return MAX_DIST_SQ;}, get circleRadius(){return CIRCLE_R;},
  get candidatePairs(){return candidatePairs;}, get candidateNeighbors(){return candidateNeighbors;},
  get linesLeft(){return linesLeft;}, get currentPlayer(){return currentPlayer;}, get aiDifficulty(){return aiDifficulty;}
};

const LEVELS = ['easy', 'medium', 'hard'];
// OJO al bajar SCENARIOS para que corra más rápido: las 40 repeticiones son
// sobre el MISMO tablero, así que la muestra efectiva son los escenarios, no
// las repeticiones. La métrica averageGain depende de que existan jugadas que
// cierren 2 triángulos de una vez, que son raras y van por tablero — con ~35
// escenarios puede salir 1.000 exacto en los tres niveles y parecer una
// regresión que no lo es (comprobado: otros 35 escenarios distintos sí
// diferencian). giftRate y "movimientos ilegales" sí dan señal fiable con
// pocos escenarios. Para juzgar averageGain, dejar 120.
// Configurable para CI (SCENARIOS=50 node scripts/simulate-ai.cjs). Por
// defecto 120, que es lo que hace falta para juzgar averageGain.
const SCENARIOS = Number(process.env.SCENARIOS) || 120;
const MUESTRA_FIABLE_GAIN = 120; // por debajo, averageGain no es concluyente
const TRIALS_PER_SCENARIO = 40;

const stats = {};
for (const level of LEVELS) stats[level] = { gains: [], giftCount: 0, giftTrials: 0, illegalMoves: 0 };

for (let s = 0; s < SCENARIOS; s++) {
  const seed = 900000 + s;
  const movesPlayed = 8 + (s % 14);
  if (!buildMidGameScenario(seed, movesPlayed)) continue;

  for (const level of LEVELS) {
    aiDifficulty = level;

    linesLeft = 3;
    for (let t = 0; t < TRIALS_PER_SCENARIO; t++) {
      const move = chooseAIMove(ST);
      if (!move) continue;
      const check = checkMoveValidity(ST, move[0], move[1]);
      if (!check.valid) { stats[level].illegalMoves++; continue; }
      const gain = findNewTriangles(ST, move[0], move[1]).length;
      if (gain > 0) stats[level].gains.push(gain);
    }

    linesLeft = 1;
    for (let t = 0; t < TRIALS_PER_SCENARIO; t++) {
      const move = chooseAIMove(ST);
      if (!move) continue;
      const check = checkMoveValidity(ST, move[0], move[1]);
      if (!check.valid) { stats[level].illegalMoves++; continue; }
      const scoresNow = findNewTriangles(ST, move[0], move[1]).length > 0;
      if (!scoresNow) {
        stats[level].giftTrials++;
        if (createsScoringReply(ST, move[0], move[1])) stats[level].giftCount++;
      }
    }
  }
}

console.log(`Simulados ${SCENARIOS} escenarios x ${TRIALS_PER_SCENARIO} repeticiones por nivel...\n`);

const summary = {};
for (const level of LEVELS) {
  const s = stats[level];
  const avgGain = s.gains.length ? s.gains.reduce((a, b) => a + b, 0) / s.gains.length : 0;
  const giftRate = s.giftTrials ? s.giftCount / s.giftTrials : 0;
  summary[level] = { avgGain, giftRate, illegalMoves: s.illegalMoves, scoringSamples: s.gains.length };
  console.log(`${level.padEnd(6)} -> averageGain=${avgGain.toFixed(3)}  giftRate=${(giftRate*100).toFixed(1)}%  ` +
    `movimientos ilegales=${s.illegalMoves}  muestras puntuables=${s.gains.length}`);
}

console.log('');
let ok = true;

const gainCreciente = summary.hard.avgGain > summary.medium.avgGain &&
                      summary.medium.avgGain > summary.easy.avgGain;
if (gainCreciente) {
  console.log('OK: averageGainHard > averageGainMedium > averageGainEasy');
} else if (SCENARIOS < MUESTRA_FIABLE_GAIN) {
  // Con pocos escenarios esta métrica NO es concluyente y hacerla fallar
  // seria una falsa alarma (comprobado: subconjuntos distintos del mismo
  // codigo dan 1.000 exacto o 1.017/1.022/1.028). Se avisa y se sigue;
  // giftRate y "movimientos ilegales" si dan señal fiable aqui.
  console.warn(`AVISO: averageGain no diferencia con SCENARIOS=${SCENARIOS} ` +
    `(${summary.hard.avgGain.toFixed(3)} / ${summary.medium.avgGain.toFixed(3)} / ${summary.easy.avgGain.toFixed(3)}). ` +
    `No es concluyente por debajo de ${MUESTRA_FIABLE_GAIN} escenarios; no se considera fallo.`);
} else {
  console.error(`FALLO: averageGain no es estrictamente creciente Hard>Medium>Easy (${summary.hard.avgGain.toFixed(3)} / ${summary.medium.avgGain.toFixed(3)} / ${summary.easy.avgGain.toFixed(3)})`);
  ok = false;
}

if (!(summary.hard.giftRate < summary.medium.giftRate && summary.medium.giftRate < summary.easy.giftRate)) {
  console.error(`FALLO: giftRate no es estrictamente decreciente Hard<Medium<Easy (${(summary.hard.giftRate*100).toFixed(1)}% / ${(summary.medium.giftRate*100).toFixed(1)}% / ${(summary.easy.giftRate*100).toFixed(1)}%)`);
  ok = false;
} else {
  console.log('OK: giftRateHard < giftRateMedium < giftRateEasy');
}

const totalIllegal = LEVELS.reduce((s, l) => s + stats[l].illegalMoves, 0);
if (totalIllegal > 0) {
  console.error(`FALLO: ${totalIllegal} movimiento(s) elegido(s) por la IA que checkMoveValidity() habria rechazado`);
  ok = false;
} else {
  console.log('OK: Ningun nivel eligio jamas un movimiento que checkMoveValidity() rechazara');
}

if (AI_LEVELS.hard.bestScoringChance >= 1) {
  console.error('FALLO: AI_LEVELS.hard.bestScoringChance >= 1 - Dificil jugaria de forma determinista/perfecta');
  ok = false;
} else {
  console.log(`OK: Dificil conserva aleatoriedad (bestScoringChance=${AI_LEVELS.hard.bestScoringChance} < 1)`);
}

process.exit(ok ? 0 : 1);
