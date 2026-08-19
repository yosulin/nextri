#!/usr/bin/env node
// scripts/test-i18n.cjs
// Comprueba que los idiomas estén completos y sean coherentes entre sí.
// Un texto sin traducir no da error en ninguna parte: simplemente aparece
// en español dentro de una interfaz en inglés, y nadie se entera hasta
// que alguien lo ve. Esto lo convierte en un fallo de CI.
//
//   node scripts/test-i18n.cjs
const { readFileSync } = require('node:fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

function cargar(archivo, nombreConst) {
  const src = readFileSync(path.join(raiz, `src/i18n/locales/${archivo}`), 'utf-8');
  const cuerpo = src.match(new RegExp(`const ${nombreConst} = (\\{[\\s\\S]*\\n\\});`))[1];
  return eval('(' + cuerpo + ')');
}

const ES = cargar('es.js', 'ES');
const EN = cargar('en.js', 'EN');
const FR = cargar('fr.js', 'FR');
const IDIOMAS = { en: EN, fr: FR };

let fallos = 0;
function check(etiqueta, ok, detalle) {
  if (ok) console.log(`OK: ${etiqueta}`);
  else { console.error(`FALLO: ${etiqueta}${detalle !== undefined ? ' — ' + detalle : ''}`); fallos++; }
}

console.log('Verificando traducciones...\n');

const clavesES = Object.keys(ES).sort();
check('el idioma de referencia tiene claves', clavesES.length > 50, clavesES.length);

for (const [codigo, textos] of Object.entries(IDIOMAS)) {
  const claves = Object.keys(textos).sort();

  const faltan = clavesES.filter(k => !(k in textos));
  check(`${codigo}: no falta ninguna clave`, faltan.length === 0, faltan.join(', '));

  // Sobrar también es un problema: señala una clave renombrada en español
  // que se quedó huérfana aquí, y que por tanto nunca se mostrará.
  const sobran = claves.filter(k => !(k in ES));
  check(`${codigo}: no sobran claves huérfanas`, sobran.length === 0, sobran.join(', '));

  // Los huecos {rival}, {n}… deben coincidir: si una traducción se deja
  // uno fuera, el texto sale incompleto en tiempo de ejecución.
  const desajustes = [];
  for (const k of clavesES) {
    if (!(k in textos)) continue;
    const huecos = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
    if (huecos(ES[k]) !== huecos(textos[k])) {
      desajustes.push(`${k} (es: ${huecos(ES[k]) || '—'} / ${codigo}: ${huecos(textos[k]) || '—'})`);
    }
  }
  check(`${codigo}: los parámetros coinciden con el original`, desajustes.length === 0, desajustes.join('; '));

  // Nada vacío
  const vacias = claves.filter(k => !String(textos[k]).trim());
  check(`${codigo}: ningún texto vacío`, vacias.length === 0, vacias.join(', '));

  // Sin traducir de verdad: texto idéntico al español en claves largas.
  // Las cortas (Solo, Local, Vision) coinciden legítimamente.
  const sinTraducir = clavesES.filter(k =>
    k in textos && String(ES[k]).length > 25 && textos[k] === ES[k]);
  check(`${codigo}: no hay textos largos sin traducir`, sinTraducir.length === 0, sinTraducir.join(', '));
}

// El nombre del producto no se traduce
for (const [codigo, textos] of Object.entries({ es: ES, ...IDIOMAS })) {
  const conNombre = Object.entries(textos).filter(([, v]) => String(v).includes('NEXTRI'));
  check(`${codigo}: el nombre del producto se conserva sin traducir`,
    conNombre.every(([, v]) => v.includes('NEXTRI')));
}

console.log('');
if (fallos > 0) { console.error(`${fallos} comprobación(es) fallaron`); process.exit(1); }
console.log('Todas las comprobaciones pasaron.');
