// src/game/random.js
//
// Generador de números aleatorios determinista para el MOTOR: misma
// semilla + mismas acciones = misma partida (mismo tablero, mismo orden de
// jugadores, mismas tiradas, mismas decisiones de Circuit).
//
// Los detalles puramente visuales (el confeti) siguen usando Math.random()
// a propósito: no afectan a las reglas, y hacerlos deterministas solo
// gastaría números de la secuencia sin ganar nada.
//
// mulberry32: pequeño, rápido y de calidad de sobra para un juego. Lo
// importante aquí no es la calidad estadística sino la reproducibilidad.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rngSeed = 0;
let rngCalls = 0;      // cuántos números se han consumido desde el inicio
let rngFn = mulberry32(0);

// Arranca (o rearranca) la secuencia. Si no se da semilla, se saca una al
// azar de verdad: cada partida nueva es distinta, pero UNA VEZ elegida
// queda registrada y esa partida es reproducible.
function seedRng(seed) {
  rngSeed = (seed === undefined || seed === null)
    ? Math.floor(Math.random() * 0xFFFFFFFF)
    : (seed >>> 0);
  rngCalls = 0;
  rngFn = mulberry32(rngSeed);
  return rngSeed;
}

function rngNext() {
  rngCalls++;
  return rngFn();
}

function rngInt(maxExclusive) {
  return Math.floor(rngNext() * maxExclusive);
}

function getRngSeed() { return rngSeed; }
function getRngCalls() { return rngCalls; }

// Restaura la secuencia en un punto exacto: misma semilla y mismo número
// de consumos. Sin esto, una partida guardada a media tirada continuaría
// con números distintos a los que le habrían tocado — el tablero se
// restaura tal cual, pero las tiradas FUTURAS divergirían de la partida
// original, y el replay dejaría de cuadrar.
function restoreRng(seed, calls) {
  rngSeed = seed >>> 0;
  rngFn = mulberry32(rngSeed);
  for (let i = 0; i < calls; i++) rngFn();
  rngCalls = calls;
}
