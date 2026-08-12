#!/usr/bin/env node
// scripts/test-stats.cjs
// Prueba la capa PURA de estadísticas: agregaciones, medianas, cambios de
// líder, remontadas y agrupaciones. No toca IndexedDB ni el DOM.
//
//   node scripts/test-stats.cjs
const { readFileSync } = require('node:fs');
const path = require('path');

const src = readFileSync(path.join(__dirname, '..', 'src/stats/aggregates.js'), 'utf-8');
// Quitar import/export para poder evaluarlo aquí como script normal.
const código = src.replace(/^import[^;]+;$/gm, '').replace(/(^|\n)export /g, '$1');
eval(código);

let fallos = 0;
function check(etiqueta, ok, detalle) {
  if (ok) console.log(`OK: ${etiqueta}`);
  else { console.error(`FALLO: ${etiqueta}${detalle !== undefined ? ' — ' + detalle : ''}`); fallos++; }
}

console.log('Verificando las agregaciones de estadísticas...\n');

// ── Mediana ────────────────────────────────────────────────────────────
check('mediana de impares', mediana([5, 1, 3]) === 3);
check('mediana de pares promedia los centrales', mediana([1, 2, 3, 4]) === 2.5);
check('mediana sin datos devuelve null', mediana([]) === null);
check('la mediana ignora valores no numéricos', mediana([1, null, 3, undefined, 5]) === 3);
// La mediana importa más que la media justo por esto:
check('la mediana resiste un valor extremo', mediana([5, 6, 7, 8, 9999]) === 7,
  `media sería ${media([5,6,7,8,9999])}`);

// ── Porcentaje ─────────────────────────────────────────────────────────
check('porcentaje normal', porcentaje(1, 4) === 25);
// 0% y "no hay datos" son cosas distintas y la pantalla los muestra distinto
check('porcentaje sin total devuelve null, no 0', porcentaje(0, 0) === null);

// ── Cambios de líder ───────────────────────────────────────────────────
const t1 = [{move:1,human:1,ai:0},{move:2,human:1,ai:1},{move:3,human:1,ai:2}];
const a1 = analizarTimeline(t1);
check('un empate por medio no parte el cambio de líder en dos', a1.leadChanges === 1, a1.leadChanges);
check('detecta que el humano llegó a ir por delante', a1.humanWasAhead === true);
check('ventaja máxima de cada uno', a1.humanMaxLead === 1 && a1.aiMaxLead === 1);

const t2 = [{move:1,human:0,ai:0},{move:2,human:0,ai:0}];
check('sin nadie por delante no hay cambios de líder', analizarTimeline(t2).leadChanges === 0);

const t3 = [{move:1,human:2,ai:0},{move:2,human:2,ai:3},{move:3,human:4,ai:3}];
check('ida y vuelta cuenta dos cambios', analizarTimeline(t3).leadChanges === 2);

check('timeline vacía no rompe', analizarTimeline([]).leadChanges === 0);

// ── Remontada ──────────────────────────────────────────────────────────
const remonta = { result: 'ai-win', scoreAt50: { human: 5, ai: 2 } };
const noRemonta = { result: 'ai-win', scoreAt50: { human: 1, ai: 4 } };
const ganaHumano = { result: 'human-win', scoreAt50: { human: 1, ai: 4 } };
check('es remontada si la IA gana yendo por detrás a mitad', esRemontadaIA(remonta));
check('no es remontada si ya iba ganando', !esRemontadaIA(noRemonta));
check('no es remontada si gana el humano', !esRemontadaIA(ganaHumano));

// ── Escenario completo ─────────────────────────────────────────────────
const partidas = [
  { gameId:'g1', sessionId:'s1', mode:'solo', opponentId:'circuit', circleCount:35,
    status:'finished', result:'ai-win', humanScore:9, aiScore:10, scoreDifference:-1,
    activeDurationMs:381000, startReason:'new', resumedCount:0, acceptedMoves:40,
    undoCount:1, invalidMoveCount:2, invalidReasons:{'too-far':2},
    scoreAt50:{human:5,ai:3}, finishedAt: 100 },
  { gameId:'g2', sessionId:'s1', mode:'solo', opponentId:'circuit', circleCount:35,
    status:'finished', result:'human-win', humanScore:12, aiScore:8, scoreDifference:4,
    activeDurationMs:300000, startReason:'rematch', rematchOfGameId:'g1', resumedCount:2,
    acceptedMoves:38, undoCount:0, invalidMoveCount:1, invalidReasons:{'crosses-edge':1},
    scoreAt50:{human:6,ai:4}, finishedAt: 200 },
  { gameId:'g3', sessionId:'s2', mode:'solo', opponentId:'vector', circleCount:50,
    status:'abandoned', result:null, humanScore:2, aiScore:5, scoreDifference:-3,
    activeDurationMs:60000, startReason:'new', resumedCount:0, acceptedMoves:10,
    undoCount:0, invalidMoveCount:0, invalidReasons:{}, finishedAt: 300 },
  { gameId:'g4', sessionId:'s2', mode:'local', opponentId:null, circleCount:50,
    status:'finished', result:'draw', humanScore:7, aiScore:7, scoreDifference:0,
    activeDurationMs:200000, startReason:'new', resumedCount:0, acceptedMoves:30,
    playerCount:3, undoCount:0, invalidMoveCount:0, invalidReasons:{}, finishedAt: 400 }
];

const resumen = aggregateStats(partidas);
check('cuenta partidas iniciadas', resumen.iniciadas === 4);
check('cuenta terminadas y abandonadas', resumen.terminadas === 3 && resumen.abandonadas === 1);
check('porcentaje de abandono', resumen.porcentajeAbandono === 25);
check('cuenta las continuadas', resumen.continuadas === 1);
check('suma el tiempo activo', resumen.tiempoTotalMs === 941000);
check('partidas por sesión', resumen.partidasPorSesion === 2);
check('agrega los motivos de rechazo', resumen.motivosInvalidos['too-far'] === 2 &&
  resumen.motivosInvalidos['crosses-edge'] === 1);

const porRival = statsByOpponent(partidas);
check('agrupa por rival', porRival.circuit.partidas === 2 && porRival.vector.partidas === 1);
check('el modo local NO cuenta como rival', porRival.circuit.partidas + porRival.vector.partidas + porRival.delta.partidas === 3);
check('% de selección sobre partidas Solo', Math.round(porRival.circuit.porcentajeSeleccion) === 67);
check('victorias del humano por rival', porRival.circuit.victorias === 1 && porRival.circuit.derrotas === 1);
check('cuenta la remontada de Circuit', porRival.circuit.remontadas === 1);
check('derrota por 1 punto clasificada', porRival.circuit.derrotasPor1 === 1);
check('revancha tras derrota se mide por rematchOfGameId', porRival.circuit.revanchaTrasDerrota === 100);
check('rival sin partidas no rompe', porRival.delta.partidas === 0 && porRival.delta.porcentajeVictoriaHumana === null);

const porTablero = statsByCircleCount(partidas);
check('agrupa por número de círculos', porTablero.length === 2);
check('ordena por tamaño', porTablero[0].circleCount === 35 && porTablero[1].circleCount === 50);
check('abandono por tamaño de tablero', porTablero[1].porcentajeAbandono === 50);

const ultimas = ultimasPartidas(partidas, 5);
check('las últimas partidas excluyen las abandonadas', ultimas.length === 3);
check('vienen de más reciente a más antigua', ultimas[0].circleCount === 50 && ultimas[0].result === 'draw');
check('las últimas partidas NO llevan nombres',
  !JSON.stringify(ultimas).toLowerCase().includes('josu'));

// Sin partidas, nada debe reventar
const vacio = aggregateStats([]);
check('sin partidas no rompe y devuelve null en vez de ceros',
  vacio.iniciadas === 0 && vacio.porcentajeAbandono === null && vacio.duracionMedianaMs === null);
check('agrupaciones vacías no rompen',
  statsByCircleCount([]).length === 0 && statsByOpponent([]).delta.partidas === 0);

check('formatea duraciones', formatearDuracion(381000) === '6:21', formatearDuracion(381000));
check('formatea duraciones largas', formatearDuracion(3900000) === '1h 05m', formatearDuracion(3900000));
check('sin duración muestra raya', formatearDuracion(null) === '—');

console.log('');
if (fallos > 0) { console.error(`${fallos} comprobación(es) fallaron`); process.exit(1); }
console.log('Todas las comprobaciones pasaron.');
