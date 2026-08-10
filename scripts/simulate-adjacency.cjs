#!/usr/bin/env node
// scripts/simulate-adjacency.cjs
// Simulación fuera del navegador de la generación de tablero + calibración
// de MAX_DIST, sobre muchas semillas y tamaños distintos. No forma parte
// de la app — se corre a mano al tocar la geometría del juego.
//
//   node scripts/simulate-adjacency.cjs
const { readFileSync } = require('node:fs');

// Extrae las funciones puras directamente de index.html y de
// src/game/geometry.js (donde viven las funciones de geometría desde que
// se extrajeron a fichero aparte), para no mantener una copia separada
// que se desincronice del código real.
const path = require('path');
const html = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');
const geometryJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'geometry.js'), 'utf-8');
const rulesJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'rules.js'), 'utf-8');
const boardJs = readFileSync(path.join(__dirname, '..', 'src', 'game', 'board.js'), 'utf-8');
function extract(name) {
  const re = new RegExp(`function ${name}\\(.*?\\n\\}\\n`, 's');
  const m = html.match(re) || geometryJs.match(re) || rulesJs.match(re) || boardJs.match(re);
  if (!m) throw new Error(`No se encontró function ${name}() en index.html, geometry.js, rules.js ni board.js`);
  return m[0];
}
const ADJACENCY_TARGET = { minDegree: 3, p10Degree: 5, meanMin: 8, meanMax: 11 };
const DIST_EPS = 1e-6;
let CIRCLE_R; // las funciones extraídas la referencian como global, igual que en la app real
eval(extract('dist'));
eval(extract('segmentPassesOverCircle'));
eval(extract('chooseAdjacency'));
eval(extract('finalizeAdjacency'));

// PRNG con semilla — Math.random() no es reproducible: un fallo raro
// ("N=100 minDegree=2") no se podía volver a ver ni cambiando nada. Con
// esto, cada intento tiene un número de semilla y "FAIL seed=X" es
// exactamente reproducible volviendo a llamar a esta función con esa X.
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
  const circles = [];
  let attempts = 0;
  while (circles.length < N && attempts < 5000) {
    attempts++;
    const x = padding + rng() * (W - padding * 2);
    const y = padding + rng() * (H - padding * 2);
    if (circles.every(c => dist(x, y, c.x, c.y) >= minDist)) circles.push({ x, y });
  }
  return circles;
}

function attemptBoardGeneration(W, H, N, minDist, maxAttempts, rng) {
  let best = null;
  for (let i = 0; i < maxAttempts; i++) {
    const circles = placeCircles(W, H, N, minDist, rng);
    if (circles.length !== N) continue;
    const adjacency = chooseAdjacency(circles);
    if (!adjacency) continue;
    best = adjacency;
    const m = adjacency.metrics;
    if (m.p10Degree >= ADJACENCY_TARGET.p10Degree &&
        m.meanDegree >= ADJACENCY_TARGET.meanMin &&
        m.meanDegree <= ADJACENCY_TARGET.meanMax) {
      return best;
    }
  }
  return best;
}

// Mismo esquema de reintentos + relajación de MIN_DIST que generateCircles()
// en la app real (v2.25) — antes la simulación solo probaba los 20
// intentos a distancia completa, no la relajación de respaldo.
function runOne(N, seed) {
  const W = 380, H = 700; // tablero vertical típico de móvil
  CIRCLE_R = Math.max(7, Math.min(16, Math.round(16 - (N - 25) * (9 / 75))));
  const area = W * H;
  const avgDist = Math.sqrt(area / N);
  const MIN_DIST = Math.max(CIRCLE_R * 2 + 6, avgDist * 0.55);
  const rng = mulberry32(seed);

  const t0 = performance.now();
  let best = attemptBoardGeneration(W, H, N, MIN_DIST, 20, rng);
  for (const relax of [0.97, 0.94, 0.91, 0.88]) {
    if (best) break;
    best = attemptBoardGeneration(W, H, N, MIN_DIST * relax, 10, rng);
  }
  const ms = performance.now() - t0;

  if (!best) return { ok: false, reason: 'ni-relajando-min-dist-4-veces', ms, seed };

  const m = best.metrics;
  const problems = [];
  if (m.connectedComponents !== 1) problems.push('desconectado');
  if (m.minDegree < ADJACENCY_TARGET.minDegree) problems.push(`minDegree=${m.minDegree}`);
  if (m.p10Degree < ADJACENCY_TARGET.p10Degree) problems.push(`p10Degree=${m.p10Degree}`);

  return { ok: problems.length === 0, reason: problems.join(', '), metrics: m, ms, seed };
}

const SAMPLE_SIZES = [25, 35, 50, 65, 80, 100];
const RUNS_PER_SIZE = Number(process.env.RUNS_PER_SIZE) || 250; // configurable para CI
let anyFailure = false;
const failedSeeds = [];

console.log(`Simulando ${RUNS_PER_SIZE} tableros por tamaño (${SAMPLE_SIZES.join(', ')}), con semillas reproducibles...\n`);

for (const N of SAMPLE_SIZES) {
  const results = [];
  let failures = 0;
  for (let run = 0; run < RUNS_PER_SIZE; run++) {
    const seed = N * 100000 + run;
    const r = runOne(N, seed);
    results.push(r);
    if (!r.ok) { failures++; failedSeeds.push({ N, seed, reason: r.reason }); }
  }

  const withMetrics = results.filter(r => r.metrics);
  const avg = (key) => withMetrics.reduce((s, r) => s + r.metrics[key], 0) / withMetrics.length;
  const avgMs = results.reduce((s, r) => s + r.ms, 0) / results.length;

  console.log(`N=${N}: ${RUNS_PER_SIZE - failures}/${RUNS_PER_SIZE} ok` +
    (failures ? `  ⚠️  ${failures} fallo(s)` : '  ✅'));
  if (withMetrics.length) {
    console.log(`  minDegree medio=${avg('minDegree').toFixed(1)} ` +
      `p10 medio=${avg('p10Degree').toFixed(1)} ` +
      `meanDegree medio=${avg('meanDegree').toFixed(1)} ` +
      `candidateEdges medio=${Math.round(avg('candidateEdges'))} ` +
      `generación=${avgMs.toFixed(2)}ms`);
  }
  console.log('');
}

if (failedSeeds.length > 0) {
  anyFailure = true;
  console.error(`❌ ${failedSeeds.length} fallo(s) — reproducible con estas semillas exactas:\n`);
  for (const f of failedSeeds.slice(0, 15)) {
    console.error(`  FAIL N=${f.N} seed=${f.seed}  (${f.reason})`);
  }
  if (failedSeeds.length > 15) console.error(`  ... y ${failedSeeds.length - 15} más`);
} else {
  console.log('✅ Todos los tamaños cumplen ADJACENCY_TARGET (o al menos el mínimo tras relajar MIN_DIST) en las 250 muestras.');
}

process.exit(anyFailure ? 1 : 0);
