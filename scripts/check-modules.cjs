#!/usr/bin/env node
// scripts/check-modules.cjs
// Comprueba que cada módulo de src/ puede resolver TODO lo que usa: o lo
// define, o lo importa. Es el fallo que se coló en la v2.55: DIST_EPS
// vivía en index.html, los módulos lo usaban, y al pasar a módulos ES
// dejaron de verlo. Node no lo detecta al comprobar sintaxis (es un error
// de EJECUCIÓN, no de sintaxis) y solo aparecía al abrir el juego.
//
//   node scripts/check-modules.cjs
const { readFileSync, readdirSync, statSync } = require('node:fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
let fallos = 0;

function listar(dirRel) {
  const abs = path.join(raiz, dirRel);
  const salida = [];
  for (const nombre of readdirSync(abs)) {
    const rel = path.join(dirRel, nombre);
    if (statSync(path.join(raiz, rel)).isDirectory()) salida.push(...listar(rel));
    else if (nombre.endsWith('.js')) salida.push(rel);
  }
  return salida;
}

// Quita comentarios y textos entre comillas: dentro de una cadena,
// 'ROLL_DICE' no es una referencia a nada.
function limpiar(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    // En las plantillas se conserva lo que hay dentro de ${...}: ahí van
    // referencias reales. Tirar la plantilla entera ocultaba usos como
    // `● ${PRODUCTO}` — que es justo lo que se escapó en la v2.60.
    .replace(/`(?:[^`\\]|\\.)*`/g, (lit) => {
      const partes = [...lit.matchAll(/\$\{([^}]*)\}/g)].map(m => m[1]);
      return partes.length ? ' ' + partes.join(' ') + ' ' : '``';
    });
}

// Segunda opinión antes de acusar: buscar la declaración en el fuente SIN
// limpiar. La limpieza de comillas puede desincronizarse con literales
// complicados y tragarse una declaración real — pasó con PLAYER_COLORS.
// Así solo se reporta lo que de verdad no está declarado en ningún sitio.
function declaradoDeVerdad(nombre, fuenteOriginal) {
  return new RegExp(`(?:const|let|var|function)\\s+${nombre}\\b`).test(fuenteOriginal);
}

const NATIVOS = new Set(['Math','Number','String','Array','Object','JSON','Set','Map','Boolean',
  'Date','globalThis','window','localStorage','console','Infinity','NaN','undefined',
  'Error','performance','isNaN','parseInt','parseFloat','Symbol','Promise','RegExp']);

console.log('Comprobando que cada módulo resuelve sus referencias...\n');

for (const rel of listar('src')) {
  const src = readFileSync(path.join(raiz, rel), 'utf-8');
  const código = limpiar(src);

  const disponibles = new Set(NATIVOS);
  for (const m of código.matchAll(/(?:export\s+)?(?:function|const|let|var)\s+(\w+)/g)) disponibles.add(m[1]);
  for (const m of código.matchAll(/import\s*\{([^}]+)\}/g)) {
    for (const n of m[1].split(',')) if (n.trim()) disponibles.add(n.trim().split(/\s+as\s+/).pop());
  }
  // parámetros, desestructuraciones y variables de bucle
  for (const m of código.matchAll(/function\s+\w*\s*\(([^)]*)\)/g)) for (const n of m[1].match(/\w+/g) || []) disponibles.add(n);
  for (const m of código.matchAll(/\(([^)]*)\)\s*=>/g)) for (const n of m[1].match(/\w+/g) || []) disponibles.add(n);
  for (const m of código.matchAll(/(?:const|let|var)\s*\{([^}]*)\}/g)) for (const n of m[1].match(/\w+/g) || []) disponibles.add(n);
  for (const m of código.matchAll(/\.forEach\(\s*\(?\s*(\w+)/g)) disponibles.add(m[1]);
  for (const m of código.matchAll(/for\s*\(\s*(?:const|let|var)\s*\{?([^;)]*)/g)) for (const n of m[1].match(/\w+/g) || []) disponibles.add(n);
  for (const m of código.matchAll(/catch\s*\(\s*(\w+)/g)) disponibles.add(m[1]);

  // Solo se revisan identificadores en MAYÚSCULAS (constantes): son los que
  // de verdad se comparten entre archivos y los que se escapan al mover
  // código. Las funciones ya las cubre la lista de imports/exports.
  const usadas = new Set();
  for (const m of código.matchAll(/(?<![.\w])([A-Z_][A-Z0-9_]{2,})(?![\w])/g)) usadas.add(m[1]);

  const faltan = [...usadas].filter(n => !disponibles.has(n) && !declaradoDeVerdad(n, src)).sort();
  if (faltan.length) {
    console.error(`ERR ${rel}: usa sin definir ni importar -> ${faltan.join(', ')}`);
    fallos++;
  } else {
    console.log(`OK  ${rel}`);
  }
}

// El script principal de index.html también es un módulo con su propio
// ámbito, y hasta ahora no se revisaba: una constante usada pero nunca
// declarada ahí (PRODUCTO en la v2.60) pasaba desapercibida hasta abrir
// el navegador.
{
  const htmlSrc = readFileSync(path.join(raiz, 'index.html'), 'utf-8');
  const m = htmlSrc.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (m) {
    const código = limpiar(m[1]);
    const disponibles = new Set(NATIVOS);
    for (const d of código.matchAll(/(?:export\s+)?(?:function|const|let|var)\s+(\w+)/g)) disponibles.add(d[1]);
    for (const d of código.matchAll(/import\s*\{([^}]+)\}/g)) {
      for (const n of d[1].split(',')) if (n.trim()) disponibles.add(n.trim().split(/\s+as\s+/).pop());
    }
    for (const d of código.matchAll(/function\s+\w*\s*\(([^)]*)\)/g)) for (const n of d[1].match(/\w+/g) || []) disponibles.add(n);
    for (const d of código.matchAll(/\(([^)]*)\)\s*=>/g)) for (const n of d[1].match(/\w+/g) || []) disponibles.add(n);
    for (const d of código.matchAll(/(?:const|let|var)\s*\{([^}]*)\}/g)) for (const n of d[1].match(/\w+/g) || []) disponibles.add(n);
    for (const d of código.matchAll(/catch\s*\(\s*(\w+)/g)) disponibles.add(d[1]);
    for (const d of código.matchAll(/for\s*\(\s*(?:const|let|var)\s*\{?([^;)]*)/g)) for (const n of d[1].match(/\w+/g) || []) disponibles.add(n);

    const usadas = new Set();
    for (const d of código.matchAll(/(?<![.\w])([A-Z_][A-Z0-9_]{2,})(?![\w])/g)) usadas.add(d[1]);
    const faltan = [...usadas].filter(n => !disponibles.has(n) && !declaradoDeVerdad(n, m[1])).sort();
    if (faltan.length) {
      console.error(`ERR index.html <script type="module">: usa sin definir ni importar -> ${faltan.join(', ')}`);
      fallos++;
    } else {
      console.log('OK  index.html <script type="module">');
    }
  }
}

// TODOS los import (los de index.html y los de unos módulos a otros)
// deben apuntar a la MISMA URL para cada archivo, versión incluida. Si
// difieren, el navegador carga DOS COPIAS del mismo módulo, cada una con
// su propio estado: index.html siembra el generador de una y el resto usa
// la otra, sin sembrar. Eso fue el fallo de la v2.57 ("Cannot read
// properties of undefined (reading 'calls')"). Ojo: una ruta relativa NO
// hereda la cadena ?v= del módulo que la importa, así que hay que ponerla
// explícitamente en cada import.
const indexHtml = readFileSync(path.join(raiz, 'index.html'), 'utf-8');
const versiónApp = (indexHtml.match(/const APP_VERSION = 'v([^']+)'/) || [])[1];
const fuentes = [['index.html', indexHtml], ...listar('src').map(r => [r, readFileSync(path.join(raiz, r), 'utf-8')])];
let importsMal = 0;
for (const [rel, src] of fuentes) {
  for (const m of src.matchAll(/from '([^']+\.js)([^']*)'/g)) {
    const marca = (m[2].match(/\?v=(.+)/) || [])[1];
    if (marca !== versiónApp) {
      console.error(`ERR ${rel}: importa ${m[1]} con ?v=${marca || '(ninguna)'}, pero APP_VERSION es v${versiónApp}`);
      importsMal++; fallos++;
    }
  }
}
if (importsMal === 0) console.log(`OK  todos los import apuntan a v${versiónApp} (una sola copia de cada módulo)`);

console.log('');
if (fallos > 0) { console.error(`${fallos} módulo(s) con referencias sin resolver`); process.exit(1); }
console.log('Todos los módulos resuelven sus referencias.');
