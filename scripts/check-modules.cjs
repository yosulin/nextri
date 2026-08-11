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
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
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

  const faltan = [...usadas].filter(n => !disponibles.has(n)).sort();
  if (faltan.length) {
    console.error(`ERR ${rel}: usa sin definir ni importar -> ${faltan.join(', ')}`);
    fallos++;
  } else {
    console.log(`OK  ${rel}`);
  }
}

console.log('');
if (fallos > 0) { console.error(`${fallos} módulo(s) con referencias sin resolver`); process.exit(1); }
console.log('Todos los módulos resuelven sus referencias.');
