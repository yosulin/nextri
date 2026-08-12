#!/usr/bin/env node
// scripts/compare-board-gen.cjs
// Compara el generador v1 (acepta el primer tablero que cumple el grado)
// con el v2 (genera varios candidatos y se queda con el mejor) sobre
// EXACTAMENTE LAS MISMAS SEMILLAS, para que la comparación sea justa.
//
//   node scripts/compare-board-gen.cjs [semillas] [circulos]
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
let rngSeed, rngCalls, streams;
const BOARD_GENERATOR_VERSION = 2;
const BOARD_QUALITY_TARGET = eval('(' + extraerConst('BOARD_QUALITY_TARGET') + ')');

eval(extraer('mulberry32')); eval(extraer('seedRng'));
eval(extraer('rngNextFrom')); eval(extraer('rngIntFrom'));
eval(extraer('rngNext')); eval(extraer('rngInt'));
eval(extraer('dist')); eval(extraer('distSq')); eval(extraer('segmentPassesOverCircle'));
eval(extraer('chooseAdjacency')); eval(extraer('finalizeAdjacency'));
eval(extraer('generateCirclePositions'));
eval(extraer('percentil')); eval(extraer('resumen')); eval(extraer('desviacion'));
eval(extraer('evaluateBoardQuality'));

const SEMILLAS = Number(process.argv[2]) || 300;
const CIRCULOS = Number(process.argv[3]) || 40;
const W = 380, H = 700;
const CIRCLE_R = Math.max(7, Math.min(16, Math.round(16 - (CIRCULOS - 25) * (9 / 75))));
const MIN_DIST = Math.max(CIRCLE_R * 2 + 6, Math.sqrt((W * H) / CIRCULOS) * 0.55);
const cfg = { count: CIRCULOS, width: W, height: H, circleRadius: CIRCLE_R };
const cfgCalidad = { width: W, height: H, padding: CIRCLE_R + 20, minDistRelaxation: 0 };
const INTENTOS = 20;

// v1: se queda con el PRIMERO que cumple el objetivo de grado.
function generarV1(semilla) {
  seedRng(semilla);
  let ultimo = null;
  for (let i = 0; i < INTENTOS; i++) {
    const pos = generateCirclePositions(cfg, MIN_DIST);
    if (pos.length !== CIRCULOS) continue;
    const ady = chooseAdjacency(pos, CIRCLE_R);
    if (!ady) continue;
    ultimo = { pos, ady };
    const m = ady.metrics;
    if (m.p10Degree >= 5 && m.meanDegree >= 8 && m.meanDegree <= 11) break;
  }
  return ultimo;
}

// v2: genera varios y se queda con el de mejor calidad.
function generarV2(semilla) {
  seedRng(semilla);
  let mejor = null;
  for (let i = 0; i < INTENTOS; i++) {
    const pos = generateCirclePositions(cfg, MIN_DIST);
    if (pos.length !== CIRCULOS) continue;
    const ady = chooseAdjacency(pos, CIRCLE_R);
    if (!ady) continue;
    const q = evaluateBoardQuality(pos, ady, cfgCalidad);
    if (!mejor || q.score > mejor.q.score) mejor = { pos, ady, q };
    if (q.score >= BOARD_QUALITY_TARGET.excelente) break;
  }
  return mejor;
}

function estadisticas(valores) {
  const v = [...valores].sort((a, b) => a - b);
  const p = (f) => v[Math.min(v.length - 1, Math.floor(v.length * f))];
  return { media: v.reduce((s, x) => s + x, 0) / v.length, mediana: p(0.5),
           p10: p(0.10), peor: v[0], mejor: v[v.length - 1] };
}

console.log(`Comparando generadores sobre ${SEMILLAS} semillas × ${CIRCULOS} círculos...\n`);

const res = { v1: { q: [], cov: [], hub: [], vacias: [], ms: [] },
              v2: { q: [], cov: [], hub: [], vacias: [], ms: [] } };

for (let s = 0; s < SEMILLAS; s++) {
  const semilla = 500000 + s;

  const t1 = process.hrtime.bigint();
  const a = generarV1(semilla);
  const ms1 = Number(process.hrtime.bigint() - t1) / 1e6;

  const t2 = process.hrtime.bigint();
  const b = generarV2(semilla);
  const ms2 = Number(process.hrtime.bigint() - t2) / 1e6;

  if (a) {
    const q = evaluateBoardQuality(a.pos, a.ady, cfgCalidad);
    res.v1.q.push(q.score); res.v1.cov.push(Math.min(q.spatial.coverageX, q.spatial.coverageY));
    res.v1.hub.push(q.degree.max); res.v1.vacias.push(q.spatial.emptyCells); res.v1.ms.push(ms1);
  }
  if (b) {
    res.v2.q.push(b.q.score); res.v2.cov.push(Math.min(b.q.spatial.coverageX, b.q.spatial.coverageY));
    res.v2.hub.push(b.q.degree.max); res.v2.vacias.push(b.q.spatial.emptyCells); res.v2.ms.push(ms2);
  }
}

const q1 = estadisticas(res.v1.q), q2 = estadisticas(res.v2.q);
const c1 = estadisticas(res.v1.cov), c2 = estadisticas(res.v2.cov);
const h1 = estadisticas(res.v1.hub), h2 = estadisticas(res.v2.hub);
const e1 = estadisticas(res.v1.vacias), e2 = estadisticas(res.v2.vacias);
const t1s = estadisticas(res.v1.ms), t2s = estadisticas(res.v2.ms);

const fila = (etiqueta, a, b, dec = 1) =>
  console.log(`${etiqueta.padEnd(26)} ${String(a.toFixed(dec)).padStart(8)} ${String(b.toFixed(dec)).padStart(8)}`);

console.log(`${''.padEnd(26)} ${'v1'.padStart(8)} ${'v2'.padStart(8)}`);
console.log('-'.repeat(44));
fila('calidad mediana', q1.mediana, q2.mediana);
fila('calidad media', q1.media, q2.media);
fila('calidad p10', q1.p10, q2.p10);
fila('calidad peor', q1.peor, q2.peor);
fila('cobertura mínima mediana', c1.mediana, c2.mediana, 2);
fila('grado máximo mediano', h1.mediana, h2.mediana);
fila('grado máximo peor', h1.mejor, h2.mejor);
fila('celdas vacías mediana', e1.mediana, e2.mediana);
fila('celdas vacías peor', e1.mejor, e2.mejor);
fila('generación ms mediana', t1s.mediana, t2s.mediana, 2);
fila('generación ms peor', t1s.mejor, t2s.mejor, 2);

const malos1 = res.v1.q.filter(x => x < BOARD_QUALITY_TARGET.pobre).length;
const malos2 = res.v2.q.filter(x => x < BOARD_QUALITY_TARGET.pobre).length;
console.log(`\ntableros pobres (<${BOARD_QUALITY_TARGET.pobre}): v1=${malos1}  v2=${malos2}`);

// Determinismo: la misma semilla debe dar el mismo tablero
const huella = (b) => b.pos.map(p => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join('|');
const det = huella(generarV2(500000)) === huella(generarV2(500000));
console.log(`determinismo (misma semilla ⇒ mismo tablero): ${det ? 'OK' : 'FALLO'}`);
