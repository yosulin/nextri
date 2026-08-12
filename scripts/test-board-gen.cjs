#!/usr/bin/env node
// scripts/test-board-gen.cjs
// Prueba el generador sobre muchas semillas y varios tamaños. Comprueba
// INVARIANTES DURAS (que nunca deben romperse) y, aparte, umbrales de
// calidad expresados como medianas y percentiles — nunca como "la calidad
// debe ser exactamente 83.71", que sería una prueba frágil que se rompe
// al tocar cualquier peso.
//
//   node scripts/test-board-gen.cjs [semillas]
const { readFileSync } = require('node:fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

const fuentes = ['src/game/random.js', 'src/game/geometry.js', 'src/game/board.js',
                 'src/game/board-quality.js'].map(f => readFileSync(path.join(raiz, f), 'utf-8'));

function extraer(nombre) {
  const re = new RegExp(`(?:export )?function ${nombre}\\(.*?\\n\\}\\n`, 's');
  for (const s of fuentes) { const m = s.match(re); if (m) return m[0].replace(/(^|\n)export /g, '$1'); }
  throw new Error(`no se encontró ${nombre}`);
}
function extraerConst(nombre) {
  const re = new RegExp(`(?:export )?const ${nombre} = (\\{[\\s\\S]*?\\n\\});`, '');
  for (const s of fuentes) { const m = s.match(re); if (m) return m[1]; }
  throw new Error(`no se encontró const ${nombre}`);
}

const DIST_EPS = 1e-6;
const RNG_STREAMS = ['board', 'dice', 'ai'];
const STREAM_OFFSET = { board: 0x9E3779B9, dice: 0x85EBCA6B, ai: 0xC2B2AE35 };
const ADJACENCY_TARGET = { minDegree: 3, p10Degree: 5, meanMin: 8, meanMax: 11 };
const BOARD_GENERATOR_VERSION = 2;
let rngSeed, rngCalls, streams;
const BOARD_QUALITY_TARGET = eval('(' + extraerConst('BOARD_QUALITY_TARGET') + ')');

eval(extraer('mulberry32')); eval(extraer('seedRng'));
eval(extraer('rngNextFrom')); eval(extraer('rngIntFrom'));
eval(extraer('rngNext')); eval(extraer('rngInt'));
eval(extraer('dist')); eval(extraer('distSq')); eval(extraer('segmentPassesOverCircle'));
eval(extraer('chooseAdjacency')); eval(extraer('finalizeAdjacency'));
eval(extraer('generateCirclePositions')); eval(extraer('buildCandidateGraph'));
eval(extraer('percentil')); eval(extraer('resumen')); eval(extraer('desviacion'));
eval(extraer('evaluateBoardQuality')); eval(extraer('attemptBoardGeneration'));

const SEMILLAS = Number(process.argv[2]) || 60;
const TAMAÑOS = [25, 35, 40, 45, 60, 100];
const W = 380, H = 700;

let fallos = 0;
function check(etiqueta, ok, detalle) {
  if (ok) console.log(`OK: ${etiqueta}`);
  else { console.error(`FALLO: ${etiqueta}${detalle !== undefined ? ' — ' + detalle : ''}`); fallos++; }
}

function generar(n, semilla) {
  seedRng(semilla);
  const CIRCLE_R = Math.max(7, Math.min(16, Math.round(16 - (n - 25) * (9 / 75))));
  const MIN_DIST = Math.max(CIRCLE_R * 2 + 6, Math.sqrt((W * H) / n) * 0.55);
  const cfg = { count: n, width: W, height: H, circleRadius: CIRCLE_R, minDistRelaxation: 0 };
  const best = attemptBoardGeneration(cfg, MIN_DIST, 20);
  return best ? { ...best, MIN_DIST, CIRCLE_R } : null;
}

console.log(`Probando el generador: ${SEMILLAS} semillas × ${TAMAÑOS.length} tamaños...\n`);

const calidadPorTamaño = {};
let sinTablero = 0, faltanCirculos = 0, violaMinDist = 0, desconectados = 0;
let gradoBajo = 0, paresIncoherentes = 0;

for (const n of TAMAÑOS) {
  const calidades = [];
  for (let s = 0; s < SEMILLAS; s++) {
    const r = generar(n, 700000 + s * 13 + n);
    if (!r) { sinTablero++; continue; }

    // INVARIANTE: exactamente los círculos pedidos, nunca menos
    if (r.positions.length !== n) faltanCirculos++;

    // INVARIANTE: ninguna pareja por debajo de la distancia mínima usada
    for (let i = 0; i < r.positions.length && !violaMinDist; i++) {
      for (let j = i + 1; j < r.positions.length; j++) {
        const d = Math.hypot(r.positions[j].x - r.positions[i].x, r.positions[j].y - r.positions[i].y);
        if (d < r.MIN_DIST - 0.001) { violaMinDist++; break; }
      }
    }

    // INVARIANTE: grafo conectado y grado mínimo
    const m = r.adjacency.metrics;
    if (m.connectedComponents !== 1) desconectados++;
    if (m.minDegree < ADJACENCY_TARGET.minDegree) gradoBajo++;

    // INVARIANTE: candidatePairs coherente con MAX_DIST
    for (const par of r.adjacency.pairs) {
      if (par.distSq > r.adjacency.maxDistanceSq + DIST_EPS) { paresIncoherentes++; break; }
    }

    calidades.push(r.quality.score);
  }
  calidadPorTamaño[n] = calidades;
}

check('Siempre se genera un tablero', sinTablero === 0, `${sinTablero} sin tablero`);
check('Siempre exactamente los círculos pedidos', faltanCirculos === 0, `${faltanCirculos} incompletos`);
check('Ninguna pareja viola la distancia mínima usada', violaMinDist === 0, `${violaMinDist} casos`);
check('El grafo siempre queda conectado', desconectados === 0, `${desconectados} desconectados`);
check('Grado mínimo respetado', gradoBajo === 0, `${gradoBajo} por debajo`);
check('candidatePairs coherente con MAX_DIST', paresIncoherentes === 0, `${paresIncoherentes} incoherentes`);

// Umbrales de calidad: medianas y percentiles, no valores exactos
console.log('');
for (const n of TAMAÑOS) {
  const v = [...calidadPorTamaño[n]].sort((a, b) => a - b);
  const p = (f) => v[Math.min(v.length - 1, Math.floor(v.length * f))];
  const mediana = p(0.5), p10 = p(0.10), peor = v[0];
  console.log(`  ${String(n).padStart(3)} círculos: mediana ${mediana.toFixed(1)}  p10 ${p10.toFixed(1)}  peor ${peor.toFixed(1)}`);
  check(`  ${n} círculos: mediana de calidad por encima de aceptable`,
    mediana >= BOARD_QUALITY_TARGET.aceptable, mediana.toFixed(1));
  check(`  ${n} círculos: ningún tablero pobre`,
    peor >= BOARD_QUALITY_TARGET.pobre, `el peor fue ${peor.toFixed(1)}`);
}

// 40 círculos es la configuración que se está valorando para Circuit y
// Vector, así que se le exige más.
const c40 = [...calidadPorTamaño[40]].sort((a, b) => a - b);
check('40 círculos: p10 por encima de "bueno"',
  c40[Math.floor(c40.length * 0.10)] >= BOARD_QUALITY_TARGET.aceptable + 10,
  c40[Math.floor(c40.length * 0.10)].toFixed(1));

// Determinismo
const a = generar(40, 12345), b = generar(40, 12345);
const huella = (r) => r.positions.map(p => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).join('|');
check('Misma semilla ⇒ mismo tablero', huella(a) === huella(b));
check('Semillas distintas ⇒ tableros distintos', huella(a) !== huella(generar(40, 12346)));

console.log('');
if (fallos > 0) { console.error(`${fallos} comprobación(es) fallaron`); process.exit(1); }
console.log('Todas las comprobaciones pasaron.');
