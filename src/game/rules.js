// src/game/rules.js
//
// Reglas de legalidad del juego — qué conexiones son válidas, qué
// triángulos se forman, si una jugada dejaría algo atrapado. Igual que
// geometry.js, esto sale del monolito como script normal (scope global),
// no como módulo ES de verdad todavía.
//
// A diferencia de geometry.js, estas funciones SÍ leen estado del juego
// (circles/edges/triangles/MAX_DIST_SQ/DIST_EPS/CIRCLE_R) — pero lo siguen
// haciendo como variables globales, exactamente igual que cuando vivían
// dentro de index.html. Pasarlas a recibir el estado por parámetro
// (el diseño applyAction(state, action) de la hoja de ruta) es un cambio
// más profundo, para cuando se aborde el estado serializable — mezclarlo
// aquí habría sido dos refactors arriesgados a la vez en vez de uno.
//
// Requiere que geometry.js (segmentsIntersect, pointInTriangle) esté
// cargado antes.

import { DIST_EPS, distSq, segmentsIntersect, pointInTriangle } from './geometry.js?v=2.84';

export const MOVE_REASON_TEXT = {
  'edge-exists': 'Esas dos ya están conectadas',
  'too-far': 'Demasiado lejos para conectar',
  'over-circle': 'La línea pasaría sobre otro círculo',
  'crosses-edge': 'Cruza otra línea ya trazada',
  'crosses-triangle': 'Atraviesa un triángulo cerrado',
  'traps-circle': 'Dejaría un círculo atrapado dentro'
};

export function edgeKey(i, j) {
  return `${Math.min(i, j)}-${Math.max(i, j)}`;
}

export function edgeExists(st, i, j) {
  return st.edges.has(`${Math.min(i,j)}-${Math.max(i,j)}`);
}

export function connectionCount(st, idx) {
  let count = 0;
  st.edges.forEach(key => {
    const [i, j] = key.split('-').map(Number);
    if (i === idx || j === idx) count++;
  });
  return count;
}

export function areAdjacent(st, i, j) {
  return distSq(st.circles[i].x, st.circles[i].y, st.circles[j].x, st.circles[j].y) <= st.maxDistSq + DIST_EPS;
}

// ¿El segmento a-b cruza alguna arista existente o atraviesa algún triángulo cerrado?
export function lineIntersectsAny(st, idxA, idxB, withReason) {
  const ax = st.circles[idxA].x, ay = st.circles[idxA].y;
  const bx = st.circles[idxB].x, by = st.circles[idxB].y;

  // 0. La línea no puede pasar POR ENCIMA de otro círculo (no extremo).
  //    Usamos el radio visual como umbral — si el centro del círculo
  //    queda más cerca que st.circleRadius del segmento Y el punto de proyección
  //    está estrictamente entre los dos extremos, lo bloqueamos.
  for (let k = 0; k < st.circles.length; k++) {
    if (k === idxA || k === idxB) continue;
    const ck = st.circles[k];
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx*dx + dy*dy;
    if (lenSq === 0) continue;
    const t = Math.max(0, Math.min(1, ((ck.x-ax)*dx + (ck.y-ay)*dy) / lenSq));
    // Solo bloqueamos si la proyección cae ENTRE los extremos (t en 0.05..0.95)
    if (t > 0.05 && t < 0.95) {
      const distSqVal = Math.pow(ck.x - (ax + t*dx), 2) + Math.pow(ck.y - (ay + t*dy), 2);
      if (distSqVal < (st.circleRadius * st.circleRadius)) return withReason ? 'over-circle' : true;
    }
  }

  // 1. La línea no puede cruzar aristas existentes que no compartan extremo.
  for (const key of st.edges) {
    const [i, j] = key.split('-').map(Number);
    if (i === idxA || i === idxB || j === idxA || j === idxB) continue;
    const cx = st.circles[i].x, cy = st.circles[i].y;
    const dx = st.circles[j].x, dy = st.circles[j].y;
    if (segmentsIntersect(ax,ay,bx,by, cx,cy,dx,dy)) return withReason ? 'crosses-edge' : true;
  }

  // 2. La línea no puede atravesar el INTERIOR de un triángulo cerrado.
  for (const t of st.triangles) {
    const va = t.a, vb = t.b, vc = t.c;
    const tax = st.circles[va].x, tay = st.circles[va].y;
    const tbx = st.circles[vb].x, tby = st.circles[vb].y;
    const tcx = st.circles[vc].x, tcy = st.circles[vc].y;

    // Si idxA o idxB son vértice de este triángulo, la línea sale desde dentro:
    // solo bloqueamos si cruza un lado que NO comparte ese vértice.
    const aInTri = (idxA === va || idxA === vb || idxA === vc);
    const bInTri = (idxB === va || idxB === vb || idxB === vc);

    const sides = [
      [va, vb, tax, tay, tbx, tby],
      [vb, vc, tbx, tby, tcx, tcy],
      [va, vc, tax, tay, tcx, tcy]
    ];

    for (const [si, sj, sx1, sy1, sx2, sy2] of sides) {
      // Ignorar lados que comparten vértice con los extremos de la nueva arista
      if (si === idxA || si === idxB || sj === idxA || sj === idxB) continue;
      if (segmentsIntersect(ax, ay, bx, by, sx1, sy1, sx2, sy2)) return withReason ? 'crosses-triangle' : true;
    }

    // El punto medio no puede estar dentro del triángulo,
    // SALVO que alguno de los extremos sea vértice de este triángulo
    // (en ese caso la línea sale legítimamente hacia fuera)
    if (!aInTri && !bInTri) {
      const mid_x = (ax + bx) / 2, mid_y = (ay + by) / 2;
      if (pointInTriangle(mid_x, mid_y, tax, tay, tbx, tby, tcx, tcy)) return withReason ? 'crosses-triangle' : true;
    }
  }

  return withReason ? null : false;
}

export function findNewTriangles(st, a, b) {
  const found = [];
  for (let c = 0; c < st.circles.length; c++) {
    if (c === a || c === b) continue;
    // Las TRES aristas deben existir como st.edges y además ser adyacentes
    if (!edgeExists(st, a, c) || !edgeExists(st, b, c)) continue;
    if (!areAdjacent(st, a, c) || !areAdjacent(st, b, c)) continue;
    // No duplicar triángulos ya registrados
    const key3 = [a, b, c].sort((x,y)=>x-y).join('-');
    const already = st.triangles.some(t => [t.a,t.b,t.c].sort((x,y)=>x-y).join('-') === key3);
    if (already) continue;
    found.push({a, b, c});
  }
  return found;
}

export function triangleTraps(st, a, b, c) {
  const ca = st.circles[a], cb = st.circles[b], cc = st.circles[c];
  for (let i = 0; i < st.circles.length; i++) {
    if (i === a || i === b || i === c) continue;
    if (pointInTriangle(st.circles[i].x, st.circles[i].y, ca.x, ca.y, cb.x, cb.y, cc.x, cc.y)) {
      return true;
    }
  }
  return false;
}

// Devuelve {valid:true} o {valid:false, reason, message} — usado tanto al
// soltar una conexión como en vivo durante el arrastre, para explicar POR
// QUÉ algo no es válido en vez de simplemente no hacer nada.
export function checkMoveValidity(st, fromIdx, toIdx) {
  const a = Math.min(fromIdx, toIdx);
  const b = Math.max(fromIdx, toIdx);
  const key = `${a}-${b}`;

  if (st.edges.has(key)) return { valid: false, reason: 'edge-exists', message: MOVE_REASON_TEXT['edge-exists'] };
  if (distSq(st.circles[a].x, st.circles[a].y, st.circles[b].x, st.circles[b].y) > st.maxDistSq + DIST_EPS) {
    return { valid: false, reason: 'too-far', message: MOVE_REASON_TEXT['too-far'] };
  }
  const blockedBy = lineIntersectsAny(st, a, b, true);
  if (blockedBy) return { valid: false, reason: blockedBy, message: MOVE_REASON_TEXT[blockedBy] };

  // Si esta línea cerraría uno o más triángulos, ninguno de ellos puede
  // dejar otro círculo atrapado dentro — quedaría inalcanzable para
  // siempre, porque la regla de arriba ya impide entrar en un triángulo
  // cerrado. Sin esta comprobación se podía sellar un círculo sin darse
  // cuenta.
  for (const tri of findNewTriangles(st, a, b)) {
    if (triangleTraps(st, tri.a, tri.b, tri.c)) {
      return { valid: false, reason: 'traps-circle', message: MOVE_REASON_TEXT['traps-circle'] };
    }
  }

  return { valid: true };
}
