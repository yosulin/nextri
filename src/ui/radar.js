// src/ui/radar.js
//
// Gráfico de telaraña del perfil de un rival.
//
// LO IMPORTANTE: los ejes NO son decorativos. Cada uno se calcula a partir
// de los parámetros reales con los que juega la IA, así que si un día se
// recalibra un rival, su radar cambia solo. Un radar que dijera "Defensa
// 8/10" de un bot que no defiende sería mentirle al jugador, y además se
// desincronizaría en cuanto se tocara la calibración.
//
// SVG a mano, sin librerías de gráficas: son cinco puntos y un polígono.

// Etiquetas visibles según lo acordado con Josu, sin tocar las CLAVES ni
// los valores que calcula perfilDesdeNivel(): solo cambia el texto. Ojo,
// esto NO es una traducción de nombre 1:1 — dos ejes cambian de qué se
// nombra a sí mismo por conveniencia visual, así que si algún día se
// recalibra qué mide cada clave, hay que revisar si la etiqueta sigue
// siendo honesta:
//   vision       -> "Estrategia" (cuánto tablero analiza)
//   construccion -> "Adaptación" (si aprovecha lo que ya ha construido)
export const EJES_RADAR = [
  { clave: 'ataque',       etiqueta: 'Ataque' },
  { clave: 'vision',       etiqueta: 'Estrategia' },
  { clave: 'defensa',      etiqueta: 'Defensa' },
  { clave: 'construccion', etiqueta: 'Adaptación' },
  { clave: 'ambicion',     etiqueta: 'Imprevisibilidad' }
];

// Traduce los parámetros de juego a valores de 0 a 1 por eje.
export function perfilDesdeNivel(nivel) {
  if (!nivel) return null;
  return {
    // Con qué frecuencia detecta que hay un punto disponible ahora
    ataque: nivel.scoringAwareness,
    // Cuánto tablero llega a mirar. Es un recuento, no una probabilidad,
    // así que se normaliza contra un límite alto; se satura en 1 para que
    // "lo mira todo" no se dispare fuera de la escala.
    vision: Math.min(1, Math.log10(Math.min(nivel.candidateLimit, 200)) / Math.log10(200)),
    // Si prepara jugadas para aprovecharlas él mismo
    construccion: nivel.buildingAwareness,
    // Si evita dejar cierres servidos al rival
    defensa: nivel.safetyAwareness,
    // Si va a por la jugada de más triángulos o se conforma con cualquiera
    ambicion: nivel.bestScoringChance
  };
}

// Devuelve el SVG del radar. `valores` son 0..1 por cada eje.
export function svgRadar(valores, color, tamaño = 120) {
  const c = tamaño / 2;
  const r = tamaño * 0.36;
  const n = EJES_RADAR.length;
  // Se empieza arriba (-90°) para que el primer eje quede vertical.
  const angulo = (i) => (Math.PI * 2 * i / n) - Math.PI / 2;
  const punto = (i, radio) => [
    (c + Math.cos(angulo(i)) * radio).toFixed(1),
    (c + Math.sin(angulo(i)) * radio).toFixed(1)
  ];

  // Telaraña de fondo: tres anillos de referencia
  let rejilla = '';
  for (const frac of [0.4, 0.7, 1]) {
    const pts = EJES_RADAR.map((_, i) => punto(i, r * frac).join(',')).join(' ');
    rejilla += `<polygon points="${pts}" fill="none" stroke="currentColor" stroke-width="1" opacity="${frac === 1 ? 0.28 : 0.14}"/>`;
  }
  // Radios
  for (let i = 0; i < n; i++) {
    const [x, y] = punto(i, r);
    rejilla += `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" stroke="currentColor" stroke-width="1" opacity="0.14"/>`;
  }

  // Polígono del perfil
  const pts = EJES_RADAR.map((eje, i) => {
    const v = Math.max(0.04, Math.min(1, valores[eje.clave] ?? 0));
    return punto(i, r * v).join(',');
  }).join(' ');

  const vertices = EJES_RADAR.map((eje, i) => {
    const v = Math.max(0.04, Math.min(1, valores[eje.clave] ?? 0));
    const [x, y] = punto(i, r * v);
    return `<circle cx="${x}" cy="${y}" r="2.4" fill="${color}"/>`;
  }).join('');

  return `<svg viewBox="0 0 ${tamaño} ${tamaño}" width="${tamaño}" height="${tamaño}" role="img" aria-hidden="true">
    <g color="var(--muted)">${rejilla}</g>
    <polygon points="${pts}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${vertices}
  </svg>`;
}

// Lista de ejes con su valor, para acompañar al gráfico con texto: el
// radar solo se lee de un vistazo, y quien quiera el detalle lo tiene.
export function listaEjes(valores) {
  return EJES_RADAR.map(eje => ({
    etiqueta: eje.etiqueta,
    valor: Math.round((valores[eje.clave] ?? 0) * 100)
  }));
}
