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

// Los archivos de src/ son módulos ES (import/export), que vm.Script no
// acepta; se validan con SourceTextModule si está disponible y, si no,
// comprobando que al menos parseen tras quitar import/export.
function comprobarJs(rel) {
  const código = readFileSync(path.join(raiz, rel), 'utf-8');
  const esModulo = /^\s*(import |export )/m.test(código);
  try {
    if (esModulo) {
      // Quitar import/export deja código que vm.Script sí puede parsear:
      // detecta cualquier error de sintaxis del cuerpo real.
      const cuerpo = código
        .replace(/^import[^;]+;$/gm, '')
        .replace(/(^|\n)export /g, '$1');
      new vm.Script(cuerpo, { filename: rel });
    } else {
      new vm.Script(código, { filename: rel });
    }
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
const bloques = [...html.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)];
if (bloques.length === 0) {
  console.error('ERR index.html: no se encontró ningún bloque <script> incrustado');
  fallos++;
}
bloques.forEach((m, i) => {
  try {
    const cuerpo = m[1].replace(/^import[^;]+;$/gm, '').replace(/(^|\n)export /g, '$1');
    new vm.Script(cuerpo, { filename: `index.html <script>[${i}]` });
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
// Ahora los módulos se cargan con import dentro del <script type="module">,
// no con <script src>. Se leen de ahí.
const src = [...html.matchAll(/from '\.\/(src\/[^']+)'/g)].map(m => m[1]);
const sw = readFileSync(path.join(raiz, 'sw.js'), 'utf-8');
// La marca ?v= de cada módulo debe coincidir con APP_VERSION. Si se queda
// atrás, el navegador puede servir un index.html nuevo junto a módulos
// viejos de caché — y con las firmas cambiadas eso rompe el juego con una
// excepción dentro de draw() que deja el tablero en blanco. Ya pasó.
const versiónApp = (html.match(/const APP_VERSION = 'v([^']+)'/) || [])[1];
for (const url of src) {
  const marca = (url.match(/\?v=(.+)$/) || [])[1];
  if (!marca) {
    console.error(`ERR ${url} se carga sin marca ?v= (riesgo de mezclar versiones en caché)`);
    fallos++;
  } else if (marca !== versiónApp) {
    console.error(`ERR ${url} tiene ?v=${marca} pero APP_VERSION es v${versiónApp}`);
    fallos++;
  }
}

for (const rel of src.map(u => u.split('?')[0])) {
  try { statSync(path.join(raiz, rel)); }
  catch { console.error(`ERR index.html carga ${rel}, que no existe`); fallos++; continue; }
  if (!sw.includes(rel)) {
    console.error(`ERR ${rel} se carga en index.html pero no está en el precaché de sw.js`);
    fallos++;
  } else {
    console.log(`OK  ${rel} cargado y en el precaché`);
  }
}

// Un <script type="module"> se ejecuta SIEMPRE en diferido: para cuando
// corre, DOMContentLoaded ya saltó y escucharlo ahí no hace nada. La app
// arrancaría a medias, sin error de sintaxis ni excepción que lo delate.
// Ya pasó al convertir a módulos en la v2.55.
const modulos = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
for (const m of modulos) {
  const sinComentarios = m[1].replace(/\/\/.*/g, '');
  if (/addEventListener\(\s*['"]DOMContentLoaded['"]/.test(sinComentarios)) {
    const tieneRespaldo = /document\.readyState/.test(sinComentarios);
    if (!tieneRespaldo) {
      console.error('ERR un <script type="module"> escucha DOMContentLoaded sin comprobar document.readyState: nunca se ejecutará');
      fallos++;
    } else {
      console.log('OK  inicio del módulo protegido con document.readyState');
    }
  }
}

// Ningún atributo on* incrustado en el HTML. Con el script principal como
// módulo ES, esas funciones NO están en window, así que un onclick/oninput
// residual simplemente no hace nada — sin error ni aviso. Pasó con el
// deslizador y la casilla al convertir a módulos.
const soloHtml = html.replace(/<script[\s\S]*?<\/script>/g, '');
const inline = [...soloHtml.matchAll(/\son([a-z]+)\s*=\s*"/gi)];
if (inline.length) {
  for (const m of inline) {
    console.error(`ERR atributo on${m[1]}= incrustado en el HTML: no funciona con <script type="module">`);
    fallos++;
  }
} else {
  console.log('OK  sin manejadores on* incrustados en el HTML');
}

// Los selectores por id de la prueba de humo deben existir en index.html.
// Al cambiar la estructura se quedan apuntando a elementos que ya no
// están, y eso NO se detecta hasta que Playwright agota su espera en CI:
// varios minutos por cada uno, y de uno en uno. Aquí sale en un segundo.
try {
  const prueba = readFileSync(path.join(raiz, 'scripts/smoke.spec.mjs'), 'utf-8');
  const ids = new Set([...prueba.matchAll(/locator\('#([A-Za-z][\w-]*)/g)].map(m => m[1]));
  // Algunos ids se generan al vuelo con plantillas (nameInput0, card1...),
  // así que se acepta también la forma con interpolación: id="nameInput${i}".
  const huerfanos = [...ids].filter(id => {
    if (html.includes(`id="${id}"`) || html.includes(`getElementById('${id}')`)) return false;
    const raiz = id.replace(/\d+$/, '');
    return raiz === id || !html.includes(`id="${raiz}$\{`);
  });
  if (huerfanos.length) {
    console.error(`ERR la prueba de humo busca ids que no existen: ${huerfanos.join(', ')}`);
    fallos++;
  } else {
    console.log(`OK  los ${ids.size} ids de la prueba de humo existen`);
  }

  // Lo mismo con las clases: '.marca-texto' se quedó huérfana al comprimir
  // la cabecera en la v2.93 y este chequeo, que solo miraba ids, no lo vio.
  const clases = new Set([...prueba.matchAll(/locator\('\.([A-Za-z][\w-]*)/g)].map(m => m[1]));
  const clasesHuerfanas = [...clases].filter(c => !html.includes(`class="${c}`) && !html.includes(` ${c}"`) && !html.includes(` ${c} `));
  if (clasesHuerfanas.length) {
    console.error(`ERR la prueba de humo busca clases que no existen: ${clasesHuerfanas.join(', ')}`);
    fallos++;
  } else {
    console.log(`OK  las ${clases.size} clases de la prueba de humo existen`);
  }
} catch { /* sin prueba de humo, nada que comprobar */ }

// Cada data-accion del HTML debe tener manejador, y cada manejador debe
// usarse. Sin esto, un botón puede quedarse mudo sin que nada avise: no
// es un error de sintaxis, simplemente no pasa nada al pulsarlo.
const accionesHtml = new Set([...html.matchAll(/data-accion="([^"]+)"/g)].map(m => m[1]));
const iniAcc = html.indexOf('const ACCIONES = {');
if (iniAcc === -1) {
  console.error('ERR no se encontró el mapa ACCIONES'); fallos++;
} else {
  const bloque = html.slice(iniAcc, html.indexOf('};', iniAcc));
  const manejadores = new Set([...bloque.matchAll(/^\s*'?([a-zA-Z-]+)'?:/gm)].map(m => m[1]));
  manejadores.add('cerrar-fondo'); // se conecta aparte
  for (const a of accionesHtml) {
    if (!manejadores.has(a)) { console.error(`ERR data-accion="${a}" no tiene manejador`); fallos++; }
  }
  for (const h of manejadores) {
    if (!accionesHtml.has(h)) { console.error(`ERR el manejador "${h}" no lo usa ningún elemento`); fallos++; }
  }
  if (fallos === 0) console.log(`OK  ${accionesHtml.size} acciones de interfaz conectadas`);
}

// Los botones de cerrar necesitan saber qué cerrar.
for (const m of html.matchAll(/<[^>]*data-accion="cerrar"[^>]*>/g)) {
  if (!m[0].includes('data-objetivo')) {
    console.error('ERR un data-accion="cerrar" no indica data-objetivo'); fallos++;
  }
}

// Nada de rutas absolutas atadas a una ruta de publicación concreta. Con
// '/nextri/...' la app solo funciona ahí: renombrar el repositorio, usar
// un dominio propio o levantar una copia en otro subdirectorio la rompe.
// Todo debe ser relativo al propio archivo.
{
  const swSrc = readFileSync(path.join(raiz, 'sw.js'), 'utf-8').replace(/\/\/.*/g, '');
  const absolutasSw = [...swSrc.matchAll(/['"]\/[a-z][^'"]*['"]/gi)].map(m => m[0]);
  if (absolutasSw.length) {
    console.error(`ERR sw.js usa rutas absolutas: ${absolutasSw.join(', ')} — deben ser relativas ('./...')`);
    fallos++;
  } else {
    console.log('OK  sw.js usa rutas relativas');
  }

  const man = JSON.parse(readFileSync(path.join(raiz, 'manifest.json'), 'utf-8'));
  const rutasMan = [man.start_url, man.scope, ...(man.icons || []).map(i => i.src)].filter(Boolean);
  const absolutasMan = rutasMan.filter(r => r.startsWith('/'));
  if (absolutasMan.length) {
    console.error(`ERR manifest.json usa rutas absolutas: ${absolutasMan.join(', ')}`);
    fallos++;
  } else {
    console.log('OK  manifest.json usa rutas relativas');
  }
}

// La versión de index.html y la caché de sw.js tienen que ir a la par: si
// se desincronizan, el navegador sirve una versión vieja desde caché.
const versión = html.match(/const APP_VERSION = '([^']+)'/);
const caché = sw.match(/const CACHE = 'nextri-([^']+)'/);
if (versión && caché) {
  if (versión[1] === caché[1]) console.log(`OK  versión ${versión[1]} coincide en index.html y sw.js`);
  else { console.error(`ERR APP_VERSION=${versión[1]} pero CACHE=${caché[1]}`); fallos++; }
} else {
  console.error('ERR no se pudo leer APP_VERSION o CACHE'); fallos++;
}

console.log('');
if (fallos > 0) { console.error(`${fallos} problema(s) encontrados`); process.exit(1); }
console.log('Sintaxis y coherencia correctas.');
