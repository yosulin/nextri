#!/usr/bin/env node
// scripts/check-syntax.cjs
// Comprueba la sintaxis de todo el proyecto: los módulos de src/, sw.js,
// los propios scripts de prueba, y —lo que más se escapa— los bloques
// <script> y <style> incrustados en index.html, que ninguna herramienta
// mira por su cuenta.
//
//   node scripts/check-syntax.cjs
const { readFileSync, readdirSync, statSync } = require('node:fs');
const path = require('path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
let fallos = 0;

function comprobarJs(rel) {
  const código = readFileSync(path.join(raiz, rel), 'utf-8');
  try {
    new vm.Script(código, { filename: rel });
    console.log(`OK  ${rel}`);
  } catch (e) {
    console.error(`ERR ${rel}: ${e.message}`);
    fallos++;
  }
}

function listarJs(dirRel) {
  const abs = path.join(raiz, dirRel);
  let entradas;
  try { entradas = readdirSync(abs); } catch { return []; }
  const salida = [];
  for (const nombre of entradas) {
    const rel = path.join(dirRel, nombre);
    if (statSync(path.join(raiz, rel)).isDirectory()) salida.push(...listarJs(rel));
    else if (nombre.endsWith('.js') || nombre.endsWith('.cjs')) salida.push(rel);
  }
  return salida;
}

console.log('Comprobando sintaxis del proyecto...\n');

for (const rel of [...listarJs('src'), ...listarJs('scripts'), 'sw.js']) {
  comprobarJs(rel);
}

// index.html: bloques <script> sin src y llaves del <style>
const html = readFileSync(path.join(raiz, 'index.html'), 'utf-8');
const bloques = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (bloques.length === 0) {
  console.error('ERR index.html: no se encontró ningún bloque <script> incrustado');
  fallos++;
}
bloques.forEach((m, i) => {
  try {
    new vm.Script(m[1], { filename: `index.html <script>[${i}]` });
    console.log(`OK  index.html <script>[${i}]`);
  } catch (e) {
    console.error(`ERR index.html <script>[${i}]: ${e.message}`);
    fallos++;
  }
});

const estilo = html.match(/<style>([\s\S]*?)<\/style>/);
if (estilo) {
  const abre = (estilo[1].match(/\{/g) || []).length;
  const cierra = (estilo[1].match(/\}/g) || []).length;
  if (abre === cierra) console.log(`OK  index.html <style> (${abre} bloques equilibrados)`);
  else { console.error(`ERR index.html <style>: ${abre} '{' frente a ${cierra} '}'`); fallos++; }
}

// Cada fichero cargado con <script src> debe existir y estar en el
// precaché del service worker — si no, la app se rompe al abrirla sin
// conexión, y eso no lo detecta ninguna comprobación de sintaxis.
const src = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const sw = readFileSync(path.join(raiz, 'sw.js'), 'utf-8');
for (const rel of src) {
  try { statSync(path.join(raiz, rel)); }
  catch { console.error(`ERR index.html carga ${rel}, que no existe`); fallos++; continue; }
  if (!sw.includes(rel)) {
    console.error(`ERR ${rel} se carga en index.html pero no está en el precaché de sw.js`);
    fallos++;
  } else {
    console.log(`OK  ${rel} cargado y en el precaché`);
  }
}

// La versión de index.html y la caché de sw.js tienen que ir a la par: si
// se desincronizan, el navegador sirve una versión vieja desde caché.
const versión = html.match(/const APP_VERSION = '([^']+)'/);
const caché = sw.match(/const CACHE = 'juego-circulos-([^']+)'/);
if (versión && caché) {
  if (versión[1] === caché[1]) console.log(`OK  versión ${versión[1]} coincide en index.html y sw.js`);
  else { console.error(`ERR APP_VERSION=${versión[1]} pero CACHE=${caché[1]}`); fallos++; }
} else {
  console.error('ERR no se pudo leer APP_VERSION o CACHE'); fallos++;
}

console.log('');
if (fallos > 0) { console.error(`${fallos} problema(s) encontrados`); process.exit(1); }
console.log('Sintaxis y coherencia correctas.');
