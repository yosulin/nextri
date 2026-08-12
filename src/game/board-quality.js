// src/game/board-quality.js
//
// Evaluación de la CALIDAD de un tablero. Todo aquí es puro: recibe
// posiciones y adyacencia, devuelve números. No genera nada, no decide
// nada, no toca el estado del juego.
//
// El generador anterior aceptaba el primer tablero que cumpliera el grado
// del grafo, sin mirar nunca CÓMO estaban repartidos los círculos por la
// pantalla. De ahí salían racimos, zonas vacías y "manchas" que cumplían
// la métrica pero se veían mal.
//
// TODO se mide en proporciones respecto al espacio ideal entre círculos y
// a las dimensiones del tablero, nunca en píxeles: así el criterio vale
// igual en un móvil pequeño que en una tableta.

export const BOARD_GENERATOR_VERSION = 2;

// Umbrales y pesos en un solo sitio, para poder calibrarlos sin perseguir
// números mágicos repartidos por varias funciones.
export const BOARD_QUALITY_TARGET = {
  // Rejilla virtual SOLO para evaluar. No se coloca un círculo por celda:
  // eso haría tableros cuadriculados, que es justo lo que no queremos.
  gridCols: 4,
  gridRows: 5,

  // Distancia al vecino más cercano, en proporción al espacio ideal.
  nearestMinRatio: 0.55,   // por debajo: círculos casi pegados
  nearestMaxRatio: 1.85,   // por encima: círculo aislado del resto

  // Grado del grafo: por encima de esto empieza a haber un "hub"
  hubDegreeSoft: 14,       // penalización progresiva desde aquí
  hubDegreeHard: 20,       // a partir de aquí la penalización es fuerte

  // Longitud de conexiones: cuánto puede estirarse el 10% más largo
  // respecto a la mediana antes de parecer una anomalía.
  edgeRatioSoft: 1.9,
  edgeRatioHard: 3.2,

  // Ángulos pequeños entre conexiones de un mismo nodo (triángulos
  // agudos). Se penaliza suave: no queremos eliminarlos, solo evitar que
  // dominen el tablero.
  acuteAngleDeg: 18,

  // Pesos de cada componente sobre 100.
  pesos: {
    distribucionEspacial: 26,
    distanciasVecino: 22,
    distribucionGrado: 22,
    cobertura: 16,
    longitudAristas: 14
  },
  // Penalizaciones máximas que se pueden restar.
  penalizacionMax: {
    racimos: 14,
    vacios: 14,
    hubs: 12,
    angulosAgudos: 6,
    relajacion: 10   // haber tenido que separar menos los círculos
  },

  // Umbrales de lectura del resultado.
  pobre: 50,
  aceptable: 70,
  bueno: 85,
  excelente: 88   // por encima, no merece la pena seguir buscando
};

function percentil(ordenados, p) {
  if (ordenados.length === 0) return 0;
  const i = Math.min(ordenados.length - 1, Math.max(0, Math.floor(ordenados.length * p)));
  return ordenados[i];
}

function resumen(valores) {
  const v = [...valores].sort((a, b) => a - b);
  const suma = v.reduce((s, x) => s + x, 0);
  return {
    min: v[0] ?? 0,
    p10: percentil(v, 0.10),
    median: percentil(v, 0.50),
    mean: v.length ? suma / v.length : 0,
    p90: percentil(v, 0.90),
    max: v[v.length - 1] ?? 0
  };
}

// Cuánto cae una medida fuera de un rango sano, de 0 (dentro) a 1 (muy fuera).
function desviacion(valor, minOk, maxOk, margen) {
  if (valor >= minOk && valor <= maxOk) return 0;
  const fuera = valor < minOk ? minOk - valor : valor - maxOk;
  return Math.min(1, fuera / margen);
}

export function evaluateBoardQuality(positions, adjacency, cfg) {
  const n = positions.length;
  const anchoUtil = cfg.width - cfg.padding * 2;
  const altoUtil = cfg.height - cfg.padding * 2;
  const areaUtil = anchoUtil * altoUtil;
  // Referencia de todo: cuánto DEBERÍA separarse un círculo de otro si
  // estuvieran repartidos de forma uniforme por el área útil.
  const idealSpacing = Math.sqrt(areaUtil / Math.max(1, n));

  // ── Distancia al vecino más cercano ──────────────────────────────────
  const nearestDist = positions.map((a, i) => {
    let mejor = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = positions[j].x - a.x, dy = positions[j].y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < mejor) mejor = d2;
    }
    return Math.sqrt(mejor);
  });
  const nearest = resumen(nearestDist);
  const nearestRatios = nearestDist.map(d => d / idealSpacing);
  // Se penaliza sobre todo a los que se salen del rango, no la media:
  // un tablero con casi todo bien y tres racimos es peor que uno regular.
  const fueraDeRango = nearestRatios.map(r =>
    desviacion(r, BOARD_QUALITY_TARGET.nearestMinRatio, BOARD_QUALITY_TARGET.nearestMaxRatio, 0.9));
  const penalNearest = fueraDeRango.reduce((s, x) => s + x, 0) / n;

  // ── Distribución espacial en rejilla virtual ─────────────────────────
  const { gridCols, gridRows } = BOARD_QUALITY_TARGET;
  const celdas = new Array(gridCols * gridRows).fill(0);
  for (const p of positions) {
    const cx = Math.min(gridCols - 1, Math.max(0, Math.floor((p.x - cfg.padding) / anchoUtil * gridCols)));
    const cy = Math.min(gridRows - 1, Math.max(0, Math.floor((p.y - cfg.padding) / altoUtil * gridRows)));
    celdas[cy * gridCols + cx]++;
  }
  const esperadoPorCelda = n / celdas.length;
  const emptyCells = celdas.filter(c => c === 0).length;
  const maxCellOccupancy = Math.max(...celdas);
  const varianza = celdas.reduce((s, c) => s + (c - esperadoPorCelda) ** 2, 0) / celdas.length;
  // Coeficiente de variación: independiente del número de círculos.
  const occupancyVariation = esperadoPorCelda > 0 ? Math.sqrt(varianza) / esperadoPorCelda : 0;

  // Huecos: celdas vacías, y peor todavía si están pegadas entre sí (una
  // zona muerta grande se nota mucho más que varias celdas sueltas).
  let vaciasContiguas = 0;
  for (let y = 0; y < gridRows; y++) {
    for (let x = 0; x < gridCols; x++) {
      if (celdas[y * gridCols + x] !== 0) continue;
      const derecha = x + 1 < gridCols && celdas[y * gridCols + x + 1] === 0;
      const abajo = y + 1 < gridRows && celdas[(y + 1) * gridCols + x] === 0;
      if (derecha) vaciasContiguas++;
      if (abajo) vaciasContiguas++;
    }
  }
  const penalVacios = Math.min(1, (emptyCells / celdas.length) * 1.8 + vaciasContiguas * 0.10);
  const penalRacimos = Math.min(1, Math.max(0, (maxCellOccupancy / esperadoPorCelda - 2.0) / 2.5));
  const puntosDistribucion = Math.max(0, 1 - Math.min(1, occupancyVariation / 1.1));

  // ── Cobertura del lienzo ─────────────────────────────────────────────
  const xs = positions.map(p => p.x), ys = positions.map(p => p.y);
  const coverageX = (Math.max(...xs) - Math.min(...xs)) / anchoUtil;
  const coverageY = (Math.max(...ys) - Math.min(...ys)) / altoUtil;
  // No se exige llegar al borde: con cubrir ~90% del área útil basta.
  const cobertura = Math.min(1, (Math.min(coverageX, 0.92) / 0.92) * (Math.min(coverageY, 0.92) / 0.92));

  // ── Grado del grafo ──────────────────────────────────────────────────
  const grados = new Array(n).fill(0);
  for (const par of adjacency.pairs) { grados[par.i]++; grados[par.j]++; }
  const degree = resumen(grados);
  const dentroDeObjetivo = 1 - Math.min(1,
    (desviacion(degree.mean, 8, 11, 4) + desviacion(degree.p10, 5, 99, 3)) / 2);
  const { hubDegreeSoft, hubDegreeHard } = BOARD_QUALITY_TARGET;
  // Penalización PROGRESIVA por hubs, no rechazo por un solo nodo alto.
  const penalHubs = Math.min(1, Math.max(0, (degree.max - hubDegreeSoft) / (hubDegreeHard - hubDegreeSoft)));

  // ── Longitud de las conexiones ───────────────────────────────────────
  const longitudes = adjacency.pairs.map(p => Math.sqrt(p.distSq));
  const edgesRes = resumen(longitudes);
  const p90MedianRatio = edgesRes.median > 0 ? edgesRes.p90 / edgesRes.median : 1;
  const penalAristas = Math.min(1, Math.max(0,
    (p90MedianRatio - BOARD_QUALITY_TARGET.edgeRatioSoft) /
    (BOARD_QUALITY_TARGET.edgeRatioHard - BOARD_QUALITY_TARGET.edgeRatioSoft)));

  // ── Ángulos agudos ───────────────────────────────────────────────────
  // Aproximación por nodo (no se enumeran todos los triángulos, que sería
  // caro): cuántos pares de conexiones salen del mismo círculo casi en la
  // misma dirección. Peso bajo a propósito.
  const vecinos = Array.from({ length: n }, () => []);
  for (const par of adjacency.pairs) { vecinos[par.i].push(par.j); vecinos[par.j].push(par.i); }
  let paresAgudos = 0, paresTotales = 0;
  const limite = Math.cos(BOARD_QUALITY_TARGET.acuteAngleDeg * Math.PI / 180);
  for (let i = 0; i < n; i++) {
    const vs = vecinos[i];
    if (vs.length < 2) continue;
    const dirs = vs.map(j => {
      const dx = positions[j].x - positions[i].x, dy = positions[j].y - positions[i].y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    });
    for (let a = 0; a < dirs.length; a++) {
      for (let b = a + 1; b < dirs.length; b++) {
        paresTotales++;
        if (dirs[a].x * dirs[b].x + dirs[a].y * dirs[b].y > limite) paresAgudos++;
      }
    }
  }
  const penalAgudos = paresTotales > 0 ? Math.min(1, (paresAgudos / paresTotales) / 0.25) : 0;

  // ── Puntuación final ─────────────────────────────────────────────────
  const P = BOARD_QUALITY_TARGET.pesos, M = BOARD_QUALITY_TARGET.penalizacionMax;
  const relajacion = cfg.minDistRelaxation ?? 0; // 0 = sin relajar

  let score =
      puntosDistribucion * P.distribucionEspacial
    + (1 - penalNearest) * P.distanciasVecino
    + dentroDeObjetivo * P.distribucionGrado
    + cobertura * P.cobertura
    + (1 - penalAristas) * P.longitudAristas
    - penalRacimos * M.racimos
    - penalVacios * M.vacios
    - penalHubs * M.hubs
    - penalAgudos * M.angulosAgudos
    - Math.min(1, relajacion / 0.12) * M.relajacion;

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    generatorVersion: BOARD_GENERATOR_VERSION,
    idealSpacing,
    nearest,
    degree,
    spatial: {
      coverageX, coverageY,
      occupancyVariation, maxCellOccupancy, emptyCells,
      vaciasContiguas
    },
    edges: { medianLength: edgesRes.median, p90Length: edgesRes.p90, p90MedianRatio },
    geometry: { acuteAnglePenalty: penalAgudos, hubPenalty: penalHubs },
    penalties: {
      clusters: penalRacimos, voids: penalVacios, hubs: penalHubs,
      acuteAngles: penalAgudos, nearest: penalNearest,
      edges: penalAristas, relaxation: relajacion
    }
  };
}
