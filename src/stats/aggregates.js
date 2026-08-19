// src/stats/aggregates.js
//
// Agregaciones PURAS: reciben la lista de partidas y devuelven números.
// No tocan el DOM, ni IndexedDB, ni el reloj. La pantalla de estadísticas
// solo representa lo que sale de aquí — así los porcentajes se pueden
// probar de verdad en vez de quedar enterrados en el HTML.

export const RIVALES_ORDEN = ['delta', 'circuit', 'vector'];

export function mediana(valores) {
  const v = valores.filter(x => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function media(valores) {
  const v = valores.filter(x => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

// Porcentaje seguro: sin partidas devuelve null, no 0. Un 0% y un "no hay
// datos" son cosas distintas y la pantalla los muestra distinto.
export function porcentaje(parte, total) {
  return total > 0 ? (parte / total) * 100 : null;
}

export function formatearDuracion(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const seg = Math.round(ms / 1000);
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Cambios de líder y evolución del marcador ──────────────────────────
// Un empate por medio NO corta la racha: pasar de human>ai a empate y de
// ahí a ai>human cuenta como UN cambio de líder, no dos ni ninguno. Se
// recuerda quién iba último por delante y solo se cuenta cuando cambia.
export function analizarTimeline(timeline) {
  const vacio = { leadChanges: 0, humanMaxLead: 0, aiMaxLead: 0, humanWasAhead: false,
                  scoreAt25: null, scoreAt50: null, scoreAt75: null };
  if (!Array.isArray(timeline) || timeline.length === 0) return vacio;

  let leadChanges = 0, humanMaxLead = 0, aiMaxLead = 0, humanWasAhead = false;
  let ultimoLider = null; // 'human' | 'ai' | null (nadie por delante todavía)

  for (const p of timeline) {
    const dif = p.human - p.ai;
    if (dif > humanMaxLead) humanMaxLead = dif;
    if (-dif > aiMaxLead) aiMaxLead = -dif;
    if (dif > 0) humanWasAhead = true;

    const lider = dif > 0 ? 'human' : dif < 0 ? 'ai' : null;
    if (lider && lider !== ultimoLider) {
      if (ultimoLider !== null) leadChanges++;
      ultimoLider = lider;
    }
  }

  const en = (frac) => {
    const i = Math.min(timeline.length - 1, Math.max(0, Math.round(timeline.length * frac) - 1));
    const p = timeline[i];
    return { human: p.human, ai: p.ai };
  };
  return { leadChanges, humanMaxLead, aiMaxLead, humanWasAhead,
           scoreAt25: en(0.25), scoreAt50: en(0.50), scoreAt75: en(0.75) };
}

// Remontada: la IA gana habiendo ido por detrás a mitad de partida.
export function esRemontadaIA(partida) {
  if (partida.result !== 'ai-win') return false;
  const mitad = partida.scoreAt50;
  return !!mitad && mitad.human > mitad.ai;
}

// ── Resumen general ────────────────────────────────────────────────────
export function aggregateStats(partidas) {
  const iniciadas = partidas.length;
  const terminadas = partidas.filter(p => p.status === 'finished');
  const abandonadas = partidas.filter(p => p.status === 'abandoned');
  const continuadas = partidas.filter(p => (p.resumedCount || 0) > 0);
  const revanchas = partidas.filter(p => p.startReason === 'rematch');
  const sesiones = new Set(partidas.map(p => p.sessionId).filter(Boolean));

  return {
    iniciadas,
    terminadas: terminadas.length,
    abandonadas: abandonadas.length,
    porcentajeAbandono: porcentaje(abandonadas.length, iniciadas),
    continuadas: continuadas.length,
    tiempoTotalMs: partidas.reduce((s, p) => s + (p.activeDurationMs || 0), 0),
    duracionMedianaMs: mediana(terminadas.map(p => p.activeDurationMs)),
    partidasPorSesion: sesiones.size ? iniciadas / sesiones.size : null,
    porcentajeRevancha: porcentaje(revanchas.length, terminadas.length),
    movimientos: partidas.reduce((s, p) => s + (p.acceptedMoves || 0), 0),
    deshacer: partidas.reduce((s, p) => s + (p.undoCount || 0), 0),
    invalidos: partidas.reduce((s, p) => s + (p.invalidMoveCount || 0), 0),
    motivosInvalidos: partidas.reduce((acc, p) => {
      for (const [k, v] of Object.entries(p.invalidReasons || {})) acc[k] = (acc[k] || 0) + v;
      return acc;
    }, {})
  };
}

// ── Por rival ──────────────────────────────────────────────────────────
export function statsByOpponent(partidas) {
  const solo = partidas.filter(p => p.mode === 'solo' && p.opponentId);
  const salida = {};

  for (const rival of RIVALES_ORDEN) {
    const suyas = solo.filter(p => p.opponentId === rival);
    const acabadas = suyas.filter(p => p.status === 'finished');
    const victoriasHumano = acabadas.filter(p => p.result === 'human-win');
    const derrotas = acabadas.filter(p => p.result === 'ai-win');
    const empates = acabadas.filter(p => p.result === 'draw');
    const remontadas = acabadas.filter(esRemontadaIA);

    // Revancha tras derrota: de las partidas perdidas, ¿cuántas tuvieron
    // una revancha después? Se mira por rematchOfGameId, no por cercanía
    // en el tiempo, que sería una suposición.
    const idsConRevancha = new Set(partidas.map(p => p.rematchOfGameId).filter(Boolean));
    const derrotasConRevancha = derrotas.filter(p => idsConRevancha.has(p.gameId));
    const remontadasConRevancha = remontadas.filter(p => idsConRevancha.has(p.gameId));

    // Derrotas ajustadas, por margen. Se derivan de scoreDifference en vez
    // de guardarse como categoría aparte.
    const margen = (p) => Math.abs(p.scoreDifference ?? 0);
    salida[rival] = {
      partidas: suyas.length,
      porcentajeSeleccion: porcentaje(suyas.length, solo.length),
      terminadas: acabadas.length,
      victorias: victoriasHumano.length,
      derrotas: derrotas.length,
      empates: empates.length,
      porcentajeVictoriaHumana: porcentaje(victoriasHumano.length, acabadas.length),
      duracionMedianaMs: mediana(acabadas.map(p => p.activeDurationMs)),
      margenFinalMediano: mediana(acabadas.map(p => Math.abs(p.scoreDifference ?? 0))),
      revanchaTrasDerrota: porcentaje(derrotasConRevancha.length, derrotas.length),
      remontadas: remontadas.length,
      porcentajeRemontadas: porcentaje(remontadas.length, acabadas.length),
      revanchaTrasRemontada: porcentaje(remontadasConRevancha.length, remontadas.length),
      derrotasPor1: derrotas.filter(p => margen(p) === 1).length,
      derrotasPor2: derrotas.filter(p => margen(p) === 2).length,
      derrotasPor3a5: derrotas.filter(p => margen(p) >= 3 && margen(p) <= 5).length,
      derrotasPorMasDe5: derrotas.filter(p => margen(p) > 5).length
    };
  }
  return salida;
}

// ── Por tamaño de tablero ──────────────────────────────────────────────
export function statsByCircleCount(partidas) {
  const grupos = new Map();
  for (const p of partidas) {
    const n = p.circleCount;
    if (!Number.isFinite(n)) continue;
    if (!grupos.has(n)) grupos.set(n, []);
    grupos.get(n).push(p);
  }
  return [...grupos.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([circleCount, suyas]) => {
      const acabadas = suyas.filter(p => p.status === 'finished');
      const abandonadas = suyas.filter(p => p.status === 'abandoned');
      const revanchas = suyas.filter(p => p.startReason === 'rematch');
      return {
        circleCount,
        partidas: suyas.length,
        duracionMedianaMs: mediana(acabadas.map(p => p.activeDurationMs)),
        porcentajeAbandono: porcentaje(abandonadas.length, suyas.length),
        porcentajeVictoriaHumana: porcentaje(
          acabadas.filter(p => p.result === 'human-win').length, acabadas.length),
        porcentajeRevancha: porcentaje(revanchas.length, suyas.length)
      };
    });
}

// ── Últimas partidas ───────────────────────────────────────────────────
export function ultimasPartidas(partidas, limite = 15) {
  return [...partidas]
    .filter(p => p.status === 'finished')
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))
    .slice(0, limite)
    .map(p => ({
      rival: p.opponentId || (p.mode === 'local' ? `${p.playerCount} jugadores` : '—'),
      circleCount: p.circleCount,
      humanScore: p.humanScore,
      aiScore: p.aiScore,
      result: p.result,
      duracionMs: p.activeDurationMs
    }));
}

// Victorias del humano contra cada rival. Lo usa el desbloqueo del
// invitado semanal: sale de las partidas ya guardadas, sin llevar una
// cuenta aparte que pudiera desincronizarse del historial real.
export function victoriasPorRival(partidas) {
  const salida = {};
  for (const p of partidas) {
    if (p.mode !== 'solo' || !p.opponentId) continue;
    if (p.status !== 'finished' || p.result !== 'human-win') continue;
    salida[p.opponentId] = (salida[p.opponentId] || 0) + 1;
  }
  return salida;
}
