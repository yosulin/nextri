// src/game/geometry.js
//
// Geometría pura — ninguna de estas funciones lee ni escribe estado del
// juego (circles/edges/triangles/etc. como variables globales); todo lo
// que necesitan les llega por parámetro. Por eso son las primeras en
// salir del index.html monolítico: se pueden mover, probar y reutilizar
// sin arrastrar nada más.
//
// De momento se carga como script normal (scope global, como todo lo
// demás), NO como módulo ES con import/export — el HTML tiene muchos
// onclick="..." inline que solo funcionan si esas funciones viven en el
// scope global; pasar a módulos de verdad es un paso aparte y deliberado
// (cambiar los onclick por addEventListener primero), no algo a mezclar
// con esta extracción.

// Producto vectorial 2D
export function cross2d(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

// ¿El punto (px,py) está en el segmento (ax,ay)-(bx,by)? (asumiendo colineal)
export function onSegment(ax, ay, bx, by, px, py) {
  return Math.min(ax,bx) - 1e-9 <= px && px <= Math.max(ax,bx) + 1e-9 &&
         Math.min(ay,by) - 1e-9 <= py && py <= Math.max(ay,by) + 1e-9;
}

// ¿Se cruzan los segmentos p1-p2 y p3-p4? (ignorando extremos compartidos)
export function segmentsIntersect(x1,y1,x2,y2, x3,y3,x4,y4) {
  const dx1 = x2-x1, dy1 = y2-y1;
  const dx2 = x4-x3, dy2 = y4-y3;
  const denom = cross2d(dx1, dy1, dx2, dy2);
  const eps = 1e-9;

  if (Math.abs(denom) < eps) {
    // Paralelas / colineales: no las consideramos cruce válido
    return false;
  }

  const t = cross2d(x3-x1, y3-y1, dx2, dy2) / denom;
  const u = cross2d(x3-x1, y3-y1, dx1, dy1) / denom;

  // Cruce real solo si t y u están estrictamente en (0,1) — excluimos extremos compartidos
  const margin = 1e-6;
  return t > margin && t < 1-margin && u > margin && u < 1-margin;
}

// Distancia de punto (px,py) al segmento (ax,ay)-(bx,by).
// (No se usa todavía en ningún sitio del juego — se conserva tal cual
// estaba en el monolito, sin decidir por mi cuenta si eliminarla.)
export function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx*dx + dy*dy;
  if (lenSq === 0) return Math.hypot(px-ax, py-ay);
  let t = ((px-ax)*dx + (py-ay)*dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t*dx), py - (ay + t*dy));
}

// ¿El punto (px,py) está dentro del triángulo (ax,ay)-(bx,by)-(cx,cy)?
// Inclusivo del borde — un punto exactamente en un lado cuenta como dentro.
export function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = cross2d(px-ax, py-ay, bx-ax, by-ay);
  const d2 = cross2d(px-bx, py-by, cx-bx, cy-by);
  const d3 = cross2d(px-cx, py-cy, ax-cx, ay-cy);
  const hasNeg = (d1 < -1e-9) || (d2 < -1e-9) || (d3 < -1e-9);
  const hasPos = (d1 >  1e-9) || (d2 >  1e-9) || (d3 >  1e-9);
  return !(hasNeg && hasPos);
}

// Tolerancia para comparaciones de distancia en coma flotante. Vive aquí
// porque es una constante geométrica y la usan varios módulos; antes
// estaba en index.html, invisible para ellos una vez son módulos ES.
export const DIST_EPS = 1e-6;

export function dist(x1,y1,x2,y2) {
  return Math.sqrt((x2-x1)**2 + (y2-y1)**2);
}

export function distSq(x1,y1,x2,y2) {
  return (x2-x1)**2 + (y2-y1)**2;
}

// ¿El segmento idxA-idxB (índices dentro de circleList) pasa por ENCIMA de
// otro círculo de la lista? circleList se recibe por parámetro a
// propósito — la usan tanto el juego real (con el array `circles` global)
// como las simulaciones en Node (con tableros de prueba independientes),
// y no debe depender de cuál de los dos la está llamando.
export function segmentPassesOverCircle(circleList, idxA, idxB, radius) {
  const a = circleList[idxA], b = circleList[idxB];
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return true;

  for (let k = 0; k < circleList.length; k++) {
    if (k === idxA || k === idxB) continue;
    const c = circleList[k];
    const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / lenSq));
    if (t <= 0.05 || t >= 0.95) continue;
    const px = a.x + t * dx, py = a.y + t * dy;
    const ddx = c.x - px, ddy = c.y - py;
    if (ddx * ddx + ddy * ddy < radius * radius) return true;
  }
  return false;
}
