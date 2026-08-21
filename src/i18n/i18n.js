// src/i18n/i18n.js
//
// Traducciones. Deliberadamente pequeño: `t()`, cambiar idioma y poco más.
//
// Las traducciones base son LOCALES, dentro del propio paquete: el juego
// tiene que funcionar sin conexión y sin esperar a ninguna petición. Más
// adelante se les podrán superponer textos remotos (para eventos o
// invitados nuevos), pero nunca a costa de que la app arranque en blanco
// si la red falla.
//
// Si falta una clave en el idioma elegido, se cae al español y, si
// tampoco está, se devuelve la propia clave: preferible ver "menu.jugar"
// y detectar el hueco que ver un texto vacío sin saber por qué.

import { ES } from './locales/es.js?v=3.07';
import { EN } from './locales/en.js?v=3.07';
import { FR } from './locales/fr.js?v=3.07';

export const IDIOMAS = {
  es: { nombre: 'Español', bandera: '🇪🇸', textos: ES },
  en: { nombre: 'English', bandera: '🇬🇧', textos: EN },
  fr: { nombre: 'Français', bandera: '🇫🇷', textos: FR }
};

const IDIOMA_POR_DEFECTO = 'es';
const CLAVE_IDIOMA = 'nextri-idioma';

let idiomaActual = IDIOMA_POR_DEFECTO;

// Idioma inicial: el guardado si existe; si no, el del navegador cuando
// lo tengamos traducido; si no, español.
export function idiomaInicial() {
  try {
    const guardado = localStorage.getItem(CLAVE_IDIOMA);
    if (guardado && IDIOMAS[guardado]) return guardado;
  } catch { /* sin almacenamiento disponible */ }
  const navegador = (typeof navigator !== 'undefined' && navigator.language || '').slice(0, 2).toLowerCase();
  return IDIOMAS[navegador] ? navegador : IDIOMA_POR_DEFECTO;
}

export function getLocale() { return idiomaActual; }

export function setLocale(codigo) {
  if (!IDIOMAS[codigo]) return idiomaActual;
  idiomaActual = codigo;
  try { localStorage.setItem(CLAVE_IDIOMA, codigo); } catch { /* ignorar */ }
  if (typeof document !== 'undefined') document.documentElement.lang = codigo;
  return idiomaActual;
}

// t('menu.jugarContra', { rival: 'Circuit' })
export function t(clave, params) {
  const textos = IDIOMAS[idiomaActual]?.textos || {};
  let texto = textos[clave];
  if (texto === undefined) texto = IDIOMAS[IDIOMA_POR_DEFECTO].textos[clave];
  if (texto === undefined) return clave;
  if (!params) return texto;
  return texto.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`));
}

// Aplica las traducciones al documento. Los elementos declaran su clave
// con data-i18n (contenido) o data-i18n-attr (atributos como aria-label o
// title), de modo que traducir la interfaz no obliga a tocar la lógica.
export function traducirDocumento(raiz = document) {
  raiz.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  raiz.querySelectorAll('[data-i18n-attr]').forEach(el => {
    // Formato: "aria-label:clave.uno,title:clave.dos"
    for (const par of el.dataset.i18nAttr.split(',')) {
      const [attr, clave] = par.split(':').map(x => x.trim());
      if (attr && clave) el.setAttribute(attr, t(clave));
    }
  });
}
