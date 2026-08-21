// src/game/board.js
//
// Generación del tablero: dónde van los círculos y qué distancia máxima
// de adyacencia produce un grafo "jugable" (ni demasiado disperso ni
// demasiado denso). Mismo enfoque que geometry.js/rules.js: script normal
// puro: todo lo que necesita llega por parámetro.
//
// generateCircles() (la función que de verdad se llama al empezar una
// partida) se queda en index.html a propósito — muestra un alert() y
// toca clases del DOM si la generación falla del todo, así que es más
// "UI" que "motor". Lo de aquí es lo que ella usa por debajo.
//
// Requiere que geometry.js (dist, segmentPassesOverCircle) esté cargado
// antes.

// buildCandidateGraph() DEVUELVE los vecinos en vez de escribir variables
// globales: quien lo llama decide dónde guardarlos.

import { DIST_EPS, dist, segmentPassesOverCircle } from './geometry.js?v=3.03';
import { evaluateBoardQuality, BOARD_QUALITY_TARGET } from './board-quality.js?v=3.03';
import { rngNextFrom } from './random.js?v=3.03';

export function generateCirclePositions(cfg, minDist) {
  const { count, width, height, circleRadius } = cfg;
  const padding = circleRadius + 20;
  const placed = [];
  let attempts = 0;
  while (placed.length < count && attempts < 5000) {
    attempts++;
    const x = padding + rngNextFrom('board') * (width - padding * 2);
    const y = padding + rngNextFrom('board') * (height - padding * 2);
    let valid = true;
    for (const c of placed) {
      if (dist(x, y, c.x, c.y) < minDist) { valid = false; break; }
    }
    if (valid) placed.push({ x, y });
  }
  return placed;
}

export function buildCandidateGraph(pairs, circleCount) {
  const neighbors = Array.from({ length: circleCount }, () => []);
  for (const { i, j } of pairs) {
    neighbors[i].push(j);
    neighbors[j].push(i);
  }
  return neighbors;
}

// Intenta generar un tablero completo (los N_CIRCLES pedidos, colocados)
// con una separación mínima dada. Se queda con el primero que alcance el
// objetivo "bonito" (grado medio 8-11); si ninguno lo alcanza pero sí hay
// alguno conectado con el mínimo aceptable, ese sirve de red de
// seguridad. Nunca devuelve un tablero con menos círculos de los pedidos.
// Genera VARIOS tableros candidatos, los puntúa y se queda con el mejor,
// en vez de aceptar el primero que cumpla el grado del grafo. Ese era el
// problema de fondo del generador anterior: la métrica de grado no dice
// nada sobre cómo están repartidos los círculos por la pantalla, así que
// un tablero con racimos y zonas muertas la cumplía igual que uno bien
// distribuido, y salía el primero que tocara.
//
// El número de intentos es fijo: nada de "seguir buscando hasta que pasen
// N milisegundos", que haría que dos dispositivos generaran tableros
// distintos con la misma semilla.
export function attemptBoardGeneration(cfg, minDist, maxAttempts) {
  let best = null;
  let intentos = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    intentos++;
    const positions = generateCirclePositions(cfg, minDist);
    if (positions.length !== cfg.count) continue; // no cupieron todos: descartar, no aceptar de menos

    const adjacency = chooseAdjacency(positions, cfg.circleRadius);
    if (!adjacency) continue;

    const quality = evaluateBoardQuality(positions, adjacency, {
      width: cfg.width, height: cfg.height,
      padding: cfg.circleRadius + 20,
      minDistRelaxation: cfg.minDistRelaxation || 0
    });

    if (!best || quality.score > best.quality.score) {
      best = { positions, adjacency, quality, intentos };
    }
    // Única salida temprana: un tablero ya excelente. No merece la pena
    // seguir buscando, y sigue siendo determinista (depende del tablero,
    // no del reloj).
    if (quality.score >= BOARD_QUALITY_TARGET.excelente) break;
  }

  if (best) best.intentos = intentos;
  return best; // null si ni uno solo salió completo+conectado+grado mínimo
}

// Objetivos de calibración del grado del grafo de adyacencia — nombrados,
// no embebidos en la función, para poder ajustarlos (o probar NORMAL/
// DENSE/SPARSE) sin tocar el algoritmo.
export const ADJACENCY_TARGET = {
  minDegree: 3,
  p10Degree: 5,
  meanMin: 8,
  meanMax: 11
};

// Elige MAX_DIST según el grado del grafo de adyacencia resultante, no un
// multiplicador sobre un único dato — es la tercera vez que recalibramos
// este número (media teórica → peor vecino × margen → esto) porque las
// anteriores optimizaban una propiedad demasiado débil: "que nadie quede
// aislado" no es lo mismo que "que la mayoría tenga varias opciones entre
// las que elegir". Se procesan las parejas en orden creciente de
// distancia con Union-Find (la conectividad sale gratis del mismo barrido,
// sin comprobarla aparte) y se para en el primer radio que cumpla
// ADJACENCY_TARGET. Devuelve null si ni siquiera el peor de los
// respaldos resulta razonable — generateCircles() decide entonces si
// regenerar el tablero entero con otras posiciones.
export function chooseAdjacency(circleList, circleRadius) {
  const n = circleList.length;
  if (n < 2) return null;

  const allPairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = circleList[j].x - circleList[i].x;
      const dy = circleList[j].y - circleList[i].y;
      allPairs.push({ i, j, distSq: dx * dx + dy * dy });
    }
  }
  allPairs.sort((a, b) => a.distSq - b.distSq);

  // Filtrar las que nunca serían trazables de verdad — no cuentan para el grado
  const pairs = allPairs.filter(p => !segmentPassesOverCircle(circleList, p.i, p.j, circleRadius));
  if (pairs.length === 0) return null;

  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  let components = n;
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    parent[ra] = rb;
    components--;
  }

  const degree = new Array(n).fill(0);
  let denseFallback = null;
  let connectedFallback = null;

  function metricsAt(cutIndex) {
    const sorted = [...degree].sort((x, y) => x - y);
    return {
      minDegree: sorted[0],
      p10Degree: sorted[Math.floor(n * 0.10)],
      medianDegree: sorted[Math.floor(n * 0.5)],
      meanDegree: degree.reduce((s, d) => s + d, 0) / n,
      p90Degree: sorted[Math.min(n - 1, Math.ceil(n * 0.90))],
      candidateEdges: cutIndex + 1,
      connectedComponents: components
    };
  }

  for (let idx = 0; idx < pairs.length; idx++) {
    const p = pairs[idx];
    degree[p.i]++;
    degree[p.j]++;
    union(p.i, p.j);

    if (components !== 1) continue;

    const m = metricsAt(idx);
    if (m.minDegree < ADJACENCY_TARGET.minDegree) continue;

    // Sin margen ×1.001: antes checkMoveValidity() (que compara contra
    // MAX_DIST directamente) podía aceptar una pareja que quedaba FUERA
    // de candidatePairs (cortado por índice, no por esa misma distancia
    // inflada) — una pequeña ventana donde "es adyacente" y "está en la
    // lista de candidatos" no coincidían del todo. Ahora maxDistanceSq ES
    // la distancia real de la pareja límite, y finalizeAdjacency() filtra
    // por esa distancia exacta (con tolerancia de coma flotante), no por
    // posición en el array — así incluye también cualquier empate exacto.
    if (connectedFallback === null) connectedFallback = { maxDistanceSq: p.distSq, metrics: m };

    if (m.p10Degree >= ADJACENCY_TARGET.p10Degree && m.meanDegree >= ADJACENCY_TARGET.meanMin) {
      if (m.meanDegree <= ADJACENCY_TARGET.meanMax) {
        return finalizeAdjacency(pairs, p.distSq, m);
      }
      if (denseFallback === null) denseFallback = { maxDistanceSq: p.distSq, metrics: m };
    }
  }

  const chosen = denseFallback ?? connectedFallback;
  if (!chosen) return null; // ni conectado con el minimo se consiguio: tablero para regenerar
  return finalizeAdjacency(pairs, chosen.maxDistanceSq, chosen.metrics);
}

export function finalizeAdjacency(pairs, maxDistanceSq, metrics) {
  // Nombre local distinto del global candidatePairs — antes se llamaba
  // igual (candidatePairs) y lo TAPABA dentro de esta función; inofensivo
  // porque nunca se leía el global aquí dentro, pero confuso de más.
  const filteredPairs = pairs.filter(p => p.distSq <= maxDistanceSq + DIST_EPS);
  return {
    maxDistance: Math.sqrt(maxDistanceSq),
    maxDistanceSq,
    pairs: filteredPairs,
    metrics: { ...metrics, candidateEdges: filteredPairs.length }
  };
}
