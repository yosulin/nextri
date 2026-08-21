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
export function mulberry32(seed) {
  let s = seed >>> 0;
  const fn = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Todo el estado del generador cabe en este entero: exponerlo permite
  // guardar y restaurar la posición exacta sin recorrer la secuencia.
  fn.getState = () => s;
  fn.setState = (v) => { s = v >>> 0; };
  return fn;
}

// Flujos SEPARADOS a partir de una semilla maestra. Con un solo flujo
// compartido, cada decisión de Circuit consumía números de la misma
// secuencia que luego determinaba los dados: cambiar de dificultad movía
// indirectamente las tiradas futuras, porque la IA gasta una cantidad
// distinta de números. Con flujos independientes, Circuit puede consumir
// los que quiera sin tocar el dado, y se pueden comparar Fácil/Medio/
// Difícil bajo exactamente las mismas tiradas.
export const RNG_STREAMS = ['board', 'dice', 'ai'];
// Desplazamientos fijos y distintos por flujo, para que de una sola
// semilla maestra salgan tres secuencias que no se solapan.
export const STREAM_OFFSET = { board: 0x9E3779B9, dice: 0x85EBCA6B, ai: 0xC2B2AE35 };

let rngSeed = 0;
let rngCalls = 0;      // total consumido (informativo)
let streams = {};      // nombre -> { fn, calls }

// Arranca (o rearranca) la secuencia. Si no se da semilla, se saca una al
// azar de verdad: cada partida nueva es distinta, pero UNA VEZ elegida
// queda registrada y esa partida es reproducible.
export function seedRng(seed) {
  rngSeed = (seed === undefined || seed === null)
    ? Math.floor(Math.random() * 0xFFFFFFFF)
    : (seed >>> 0);
  rngCalls = 0;
  streams = {};
  for (const nombre of RNG_STREAMS) {
    streams[nombre] = { fn: mulberry32((rngSeed + STREAM_OFFSET[nombre]) >>> 0), calls: 0 };
  }
  return rngSeed;
}

export function rngNextFrom(stream) {
  // Defensa: si se llama antes de sembrar (seedRng nunca se ejecutó en
  // esta instancia del módulo — puede pasar con una mezcla de versiones
  // en caché, donde conviven dos copias del módulo cargadas por rutas
  // distintas) streams.board también sería undefined, y el respaldo no
  // respaldaba nada: reventaba con "Cannot read properties of undefined
  // (reading 'calls')" en vez de dar una pista de qué ha pasado.
  if (streams.board === undefined) seedRng();
  const s = streams[stream] || streams.board;
  s.calls++;
  rngCalls++;
  return s.fn();
}

export function rngIntFrom(stream, maxExclusive) {
  return Math.floor(rngNextFrom(stream) * maxExclusive);
}

// Compatibilidad: quien no diga flujo, usa el del tablero.
export function rngNext() { return rngNextFrom('board'); }
export function rngInt(maxExclusive) { return rngIntFrom('board', maxExclusive); }

export function getRngSeed() { return rngSeed; }
export function getRngCalls() { return rngCalls; }

// Estado completo y serializable de los tres flujos.
export function getRngState() {
  const out = { seed: rngSeed, streams: {} };
  for (const nombre of RNG_STREAMS) {
    out.streams[nombre] = { state: streams[nombre].fn.getState(), calls: streams[nombre].calls };
  }
  return out;
}

export function restoreRngState(snapshot) {
  seedRng(snapshot.seed);
  for (const nombre of RNG_STREAMS) {
    const s = snapshot.streams && snapshot.streams[nombre];
    if (!s) continue;
    streams[nombre].fn.setState(s.state);
    streams[nombre].calls = s.calls;
  }
  rngCalls = RNG_STREAMS.reduce((t, n) => t + streams[n].calls, 0);
}

// Restaura la secuencia en un punto exacto: misma semilla y mismo número
// de consumos. Sin esto, una partida guardada a media tirada continuaría
// con números distintos a los que le habrían tocado — el tablero se
// restaura tal cual, pero las tiradas FUTURAS divergirían de la partida
// original, y el replay dejaría de cuadrar.
// Restauración O(1): mulberry32 guarda TODO su estado en un entero, así
// que basta con recuperarlo. Antes esto avanzaba la secuencia en bucle
// hasta `calls`, lo que además de innecesario permitía que un contador
// corrupto (o malicioso, cuando esto venga por red) congelara la app con
// un bucle de miles de millones de vueltas al reanudar.

