#!/usr/bin/env node
// scripts/test-invitados.cjs
// Rotación del invitado semanal y progreso de desbloqueo.
//
//   node scripts/test-invitados.cjs
const { readFileSync } = require('node:fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

const limpiar = (s) => s.replace(/^import[^;]+;$/gm, '')
  .replace(/(^|\n)export /g, '$1')
  .replace(/(^|\n)const /g, '$1var ');
eval(limpiar(readFileSync(path.join(raiz, 'src/ai/invitados.js'), 'utf-8')));
eval(limpiar(readFileSync(path.join(raiz, 'src/stats/aggregates.js'), 'utf-8')));

let fallos = 0;
function check(etiqueta, ok, detalle) {
  if (ok) console.log(`OK: ${etiqueta}`);
  else { console.error(`FALLO: ${etiqueta}${detalle !== undefined ? ' — ' + detalle : ''}`); fallos++; }
}

console.log('Verificando el invitado semanal...\n');

// ── Perfiles ───────────────────────────────────────────────────────────
const ids = Object.keys(INVITADOS);
check('hay al menos 10 invitados definidos', ids.length >= 10, ids.length);
check('todos tienen nombre, apodo, color, nivel y descripción',
  ids.every(id => {
    const i = INVITADOS[id];
    return i.nombre && i.apodo && /^#[0-9a-f]{6}$/i.test(i.color) &&
           ['easy', 'medium', 'hard'].includes(i.nivel) && i.descripcion;
  }));
check('los nombres no se repiten',
  new Set(ids.map(id => INVITADOS[id].nombre)).size === ids.length);
check('los colores no se repiten',
  new Set(ids.map(id => INVITADOS[id].color)).size === ids.length);
// Los invitados no deben chocar de color con los rivales fijos
const coloresFijos = ['#6bcb77', '#2f7ef0', '#a855f7'];
check('ningún invitado usa el color de un rival fijo',
  ids.every(id => !coloresFijos.includes(INVITADOS[id].color.toLowerCase())));

// ── Rotación ───────────────────────────────────────────────────────────
// La misma semana debe dar SIEMPRE el mismo invitado: si no, dos personas
// verían rivales distintos el mismo día, y la gracia es que sea común.
const unLunes = new Date('2026-03-09T10:00:00Z');
const eseJueves = new Date('2026-03-12T22:00:00Z');
check('la misma semana da el mismo invitado en días distintos',
  invitadoDeLaSemana(unLunes).id === invitadoDeLaSemana(eseJueves).id,
  `${invitadoDeLaSemana(unLunes).id} vs ${invitadoDeLaSemana(eseJueves).id}`);
check('la misma fecha da siempre lo mismo (sin azar)',
  invitadoDeLaSemana(unLunes).id === invitadoDeLaSemana(unLunes).id);

// Semanas temáticas
const halloween = new Date('2026-10-29T12:00:00Z');
check('la semana de Halloween toca Vampir',
  invitadoDeLaSemana(halloween).id === 'vampir', invitadoDeLaSemana(halloween).id);
const navidad = new Date('2026-12-24T12:00:00Z');
check('la semana de Navidad toca Rudolf',
  invitadoDeLaSemana(navidad).id === 'rudolf', invitadoDeLaSemana(navidad).id);

// A lo largo del año deben aparecer varios distintos: si saliera siempre
// el mismo, la rotación no estaría funcionando.
const vistos = new Set();
for (let semana = 1; semana <= 52; semana++) {
  const f = new Date(Date.UTC(2026, 0, 1 + (semana - 1) * 7));
  vistos.add(invitadoDeLaSemana(f).id);
}
check('a lo largo del año rotan varios invitados', vistos.size >= 7, `${vistos.size} distintos`);

// ── Desbloqueo ─────────────────────────────────────────────────────────
check('sin victorias el progreso es 0', progresoDesbloqueo({}) === 0);
check('sin victorias está bloqueado', !estaDesbloqueado({}));
check('cumpliendo los tres requisitos se desbloquea',
  estaDesbloqueado({ delta: 3, circuit: 2, vector: 1 }));
check('superar los requisitos también vale',
  estaDesbloqueado({ delta: 9, circuit: 5, vector: 3 }));

// Lo importante: ganar mucho a UNO no debe desbloquear por sí solo. Hay
// que enfrentarse a los tres.
check('ganar mucho solo a Delta NO desbloquea',
  !estaDesbloqueado({ delta: 50 }), progresoDesbloqueo({ delta: 50 }));
check('faltando solo Vector sigue bloqueado',
  !estaDesbloqueado({ delta: 3, circuit: 2 }));

// El progreso avanza de forma monótona
const p0 = progresoDesbloqueo({});
const p1 = progresoDesbloqueo({ delta: 1 });
const p2 = progresoDesbloqueo({ delta: 3 });
const p3 = progresoDesbloqueo({ delta: 3, circuit: 2 });
check('el progreso crece al ganar más', p0 < p1 && p1 < p2 && p2 < p3, `${p0} ${p1} ${p2} ${p3}`);
check('el progreso nunca pasa de 1', progresoDesbloqueo({ delta: 99, circuit: 99, vector: 99 }) === 1);

// Qué falta
const falta = loQueFalta({ delta: 3, circuit: 1 });
check('dice exactamente lo que falta',
  falta.length === 2 && falta.find(f => f.rival === 'circuit').faltan === 1 &&
  falta.find(f => f.rival === 'vector').faltan === 1, JSON.stringify(falta));
check('con todo cumplido no falta nada', loQueFalta({ delta: 3, circuit: 2, vector: 1 }).length === 0);

// ── Victorias desde las estadísticas ───────────────────────────────────
const partidas = [
  { mode: 'solo', opponentId: 'delta', status: 'finished', result: 'human-win' },
  { mode: 'solo', opponentId: 'delta', status: 'finished', result: 'ai-win' },
  { mode: 'solo', opponentId: 'vector', status: 'finished', result: 'human-win' },
  { mode: 'solo', opponentId: 'circuit', status: 'abandoned', result: null },
  { mode: 'local', opponentId: null, status: 'finished', result: 'human-win' }
];
const v = victoriasPorRival(partidas);
check('cuenta solo las victorias del humano', v.delta === 1 && v.vector === 1);
check('las derrotas no cuentan', (v.circuit || 0) === 0);
check('las abandonadas no cuentan', !('circuit' in v) || v.circuit === 0);
check('las partidas locales no cuentan como rival', Object.keys(v).length === 2);

console.log('');
if (fallos > 0) { console.error(`${fallos} comprobación(es) fallaron`); process.exit(1); }
console.log('Todas las comprobaciones pasaron.');
