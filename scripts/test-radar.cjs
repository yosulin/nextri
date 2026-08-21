#!/usr/bin/env node
// scripts/test-radar.cjs
// El radar promete al jugador cómo juega cada rival. Estas pruebas evitan
// que esa promesa se desincronice de la IA real: si mañana se recalibra un
// nivel y el radar deja de reflejarlo, esto falla.
//
//   node scripts/test-radar.cjs
const { readFileSync } = require('node:fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

const radarSrc = readFileSync(path.join(raiz, 'src/ui/radar.js'), 'utf-8');
const levelsSrc = readFileSync(path.join(raiz, 'src/ai/levels.js'), 'utf-8');
// eval con const no expone nada al ámbito exterior: se pasan a var.
const limpiar = (s) => s.replace(/^import[^;]+;$/gm, '')
  .replace(/(^|\n)export /g, '$1')
  .replace(/(^|\n)const /g, '$1var ');
eval(limpiar(radarSrc));
const AI_LEVELS = eval('(' + levelsSrc.match(/const AI_LEVELS = (\{[\s\S]*?\n\});/)[1] + ')');
const RIVALES = eval('(' + levelsSrc.match(/const RIVALES = (\{[\s\S]*?\n\});/)[1] + ')');

let fallos = 0;
function check(etiqueta, ok, detalle) {
  if (ok) console.log(`OK: ${etiqueta}`);
  else { console.error(`FALLO: ${etiqueta}${detalle !== undefined ? ' — ' + detalle : ''}`); fallos++; }
}

console.log('Verificando el radar de perfiles...\n');

const perfiles = {};
for (const [id, r] of Object.entries(RIVALES)) perfiles[id] = perfilDesdeNivel(AI_LEVELS[r.nivel]);

// Todos los ejes existen y están dentro de escala
for (const [id, p] of Object.entries(perfiles)) {
  const dentro = EJES_RADAR.every(e => typeof p[e.clave] === 'number' && p[e.clave] >= 0 && p[e.clave] <= 1);
  check(`${id}: todos los ejes entre 0 y 1`, dentro, JSON.stringify(p));
}

// LO IMPORTANTE: el radar debe reflejar la realidad. Vector juega mejor
// que Circuit y Circuit mejor que Delta, así que sus ejes deben ordenarse
// igual. Si alguien recalibra la IA y no toca el radar, esto falla.
for (const eje of ['ataque', 'construccion', 'defensa', 'ambicion']) {
  check(`${eje}: Delta < Circuit < Vector`,
    perfiles.delta[eje] < perfiles.circuit[eje] && perfiles.circuit[eje] < perfiles.vector[eje],
    `${perfiles.delta[eje]} / ${perfiles.circuit[eje]} / ${perfiles.vector[eje]}`);
}
check('visión: Delta < Circuit < Vector',
  perfiles.delta.vision < perfiles.circuit.vision && perfiles.circuit.vision < perfiles.vector.vision,
  `${perfiles.delta.vision.toFixed(2)} / ${perfiles.circuit.vision.toFixed(2)} / ${perfiles.vector.vision.toFixed(2)}`);

// La visión sale de un recuento, no de una probabilidad: comprobar que se
// satura en vez de dispararse fuera de escala con candidateLimit=9999.
check('visión saturada en 1 con "lo mira todo"', perfiles.vector.vision <= 1);

// Los ejes deben venir de los parámetros REALES, no de constantes sueltas
check('el ataque coincide con scoringAwareness',
  perfiles.circuit.ataque === AI_LEVELS.medium.scoringAwareness);
check('la defensa coincide con safetyAwareness',
  perfiles.circuit.defensa === AI_LEVELS.medium.safetyAwareness);
check('la construcción coincide con buildingAwareness',
  perfiles.circuit.construccion === AI_LEVELS.medium.buildingAwareness);

// El SVG se genera y es válido a simple vista
const svg = svgRadar(perfiles.circuit, '#2f7ef0', 104);
check('genera un SVG', svg.startsWith('<svg') && svg.includes('</svg>'));
check('el polígono tiene un punto por eje',
  (svg.match(/<polygon[^>]*fill="#2f7ef0"/) || []).length === 1 &&
  svg.split('<circle').length - 1 === EJES_RADAR.length);
check('usa el color del rival', svg.includes('#2f7ef0'));

// Un perfil a cero no debe romper el dibujo
const cero = Object.fromEntries(EJES_RADAR.map(e => [e.clave, 0]));
const svgCero = svgRadar(cero, '#000', 100);
check('un perfil a cero no rompe el SVG', svgCero.includes('<polygon') && !svgCero.includes('NaN'));

// El radar debe dibujar el NOMBRE de cada eje, no solo la telaraña muda.
// Se le olvidó al generador original: svgRadar() dibujaba el polígono y
// los anillos, pero nunca el texto — así que el gráfico se veía sin decir
// qué era cada pico, hasta que se detectó a simple vista en la app.
check('el radar dibuja el texto de los cinco ejes',
  EJES_RADAR.every(e => svg.includes(`>${e.etiqueta}<`)),
  EJES_RADAR.map(e => e.etiqueta).filter(t => !svg.includes(`>${t}<`)).join(', '));

// La lista de ejes en texto acompaña al gráfico
const lista = listaEjes(perfiles.vector);
check('la lista tiene una entrada por eje', lista.length === EJES_RADAR.length);
check('los valores van en porcentaje entero',
  lista.every(e => Number.isInteger(e.valor) && e.valor >= 0 && e.valor <= 100),
  JSON.stringify(lista));

console.log('');
if (fallos > 0) { console.error(`${fallos} comprobación(es) fallaron`); process.exit(1); }
console.log('Todas las comprobaciones pasaron.');
