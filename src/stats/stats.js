// src/stats/stats.js
//
// Servicio de estadísticas: lo único que el juego llama. Por debajo usa el
// repositorio, que hoy es IndexedDB y mañana podría ser otro sin que el
// motor se entere.
//
// Nada de nombres de personas: para estudiar las partidas basta con
// "human" y "ai", y la identidad no aporta nada.

import { guardarPartida, obtenerPartida, listarPartidas, borrarTodo } from './repository.js?v=2.81';
import { STATS_SCHEMA_VERSION } from './repository.js?v=2.81';
import { analizarTimeline } from './aggregates.js?v=2.81';

export function nuevoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Respaldo para navegadores sin randomUUID: no necesita ser criptográfico,
  // solo distinguir partidas dentro de un mismo dispositivo.
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// La sesión dura lo que la pestaña: sirve para "partidas por sesión".
let sessionId = null;
export function idSesion() {
  if (!sessionId) sessionId = nuevoId();
  return sessionId;
}

let partidaActual = null;
let inicioSegmento = null;   // cuándo empezó el tramo activo en curso
let guardadoPendiente = false;

// ── Tiempo activo ──────────────────────────────────────────────────────
// finishedAt - startedAt NO vale: si cierro la app cinco horas y vuelvo,
// esas horas no las he jugado. Se acumulan solo los tramos en los que la
// partida está en marcha Y el documento visible.
function abrirSegmento() {
  if (partidaActual && inicioSegmento === null) inicioSegmento = Date.now();
}

function cerrarSegmento() {
  if (partidaActual && inicioSegmento !== null) {
    partidaActual.activeDurationMs += Date.now() - inicioSegmento;
    inicioSegmento = null;
  }
}

export function alCambiarVisibilidad(visible) {
  if (!partidaActual) return;
  if (visible) abrirSegmento();
  else { cerrarSegmento(); persistir(); }
}

function persistir() {
  if (!partidaActual) return Promise.resolve(false);
  partidaActual.lastPlayedAt = Date.now();
  return guardarPartida({ ...partidaActual });
}

// Guardado espaciado: durante la partida se llama a menudo, y no hace
// falta escribir en disco en cada línea trazada.
function persistirDiferido() {
  if (guardadoPendiente) return;
  guardadoPendiente = true;
  setTimeout(() => { guardadoPendiente = false; persistir(); }, 1500);
}

// ── Ciclo de vida de la partida ────────────────────────────────────────
// Solo se crea el registro cuando la partida EXISTE de verdad: tablero
// generado, jugadores creados y estado 'playing'. Pulsar jugar y que falle
// la generación no debe dejar una partida fantasma en las estadísticas.
export function iniciarPartida(datos) {
  cerrarSegmento();
  partidaActual = {
    statsSchemaVersion: STATS_SCHEMA_VERSION,
    gameId: nuevoId(),
    sessionId: idSesion(),
    startedAt: Date.now(),
    lastPlayedAt: Date.now(),
    finishedAt: null,
    activeDurationMs: 0,
    mode: datos.mode,
    playerCount: datos.playerCount,
    opponentId: datos.opponentId || null,
    circleCount: datos.circleCount,
    aiVersion: datos.aiVersion,
    appVersion: datos.appVersion,
    rulesVersion: datos.rulesVersion,
    boardGeneratorVersion: datos.boardGeneratorVersion ?? null,
    boardQualityScore: datos.boardQualityScore ?? null,
    boardMeanDegree: datos.boardMeanDegree ?? null,
    boardP90Degree: datos.boardP90Degree ?? null,
    status: 'active',
    startReason: datos.startReason || 'new',
    rematchOfGameId: datos.rematchOfGameId || null,
    resumedCount: 0,
    result: null,
    humanScore: 0, aiScore: 0, scoreDifference: 0,
    acceptedMoves: 0, turns: 0, diceRolls: 0,
    humanTriangles: 0, aiTriangles: 0,
    undoCount: 0,
    invalidMoveCount: 0, invalidReasons: {},
    leadChanges: 0, humanMaxLead: 0, aiMaxLead: 0,
    scoreAt25: null, scoreAt50: null, scoreAt75: null,
    humanWasAhead: false, aiComeback: false,
    aiDecisionCount: 0, aiDecisionTotalMs: 0, aiDecisionMaxMs: 0,
    scoreTimeline: []
  };
  abrirSegmento();
  persistir();
  return partidaActual.gameId;
}

// Reanudar NO crea partida nueva: se recupera el mismo gameId y se cuenta
// como continuación. Cerrar la app a medias no es abandonar.
export async function reanudarPartida(gameId) {
  const guardada = await obtenerPartida(gameId);
  if (!guardada || guardada.status !== 'active') return false;
  partidaActual = guardada;
  partidaActual.resumedCount = (partidaActual.resumedCount || 0) + 1;
  abrirSegmento();
  persistir();
  return true;
}

export function partidaEnCurso() {
  return partidaActual ? partidaActual.gameId : null;
}

export function registrarTirada() {
  if (!partidaActual) return;
  partidaActual.diceRolls++;
  persistirDiferido();
}

export function registrarTurno() {
  if (!partidaActual) return;
  partidaActual.turns++;
  persistirDiferido();
}

// Un movimiento aceptado: se anota el marcador para poder estudiar cómo
// evolucionó la partida, no solo cómo acabó.
export function registrarMovimiento({ humanScore, aiScore, triangulosHumano, triangulosIA }) {
  if (!partidaActual) return;
  partidaActual.acceptedMoves++;
  partidaActual.humanScore = humanScore;
  partidaActual.aiScore = aiScore;
  partidaActual.humanTriangles = triangulosHumano;
  partidaActual.aiTriangles = triangulosIA;
  partidaActual.scoreTimeline.push({ move: partidaActual.acceptedMoves, human: humanScore, ai: aiScore });
  persistirDiferido();
}

export function registrarDeshacer() {
  if (!partidaActual) return;
  partidaActual.undoCount++;
  // Deshacer también retira el último punto de la evolución del marcador
  partidaActual.scoreTimeline.pop();
  partidaActual.acceptedMoves = Math.max(0, partidaActual.acceptedMoves - 1);
  persistirDiferido();
}

// Motivos de rechazo: se usan los MISMOS códigos que devuelve el motor, sin
// una segunda clasificación paralela que se desincronizaría.
export function registrarMovimientoInvalido(motivo) {
  if (!partidaActual) return;
  partidaActual.invalidMoveCount++;
  const clave = motivo || 'desconocido';
  partidaActual.invalidReasons[clave] = (partidaActual.invalidReasons[clave] || 0) + 1;
  persistirDiferido();
}

// Medir SOLO para informar. El tiempo nunca decide qué juega la IA: eso
// haría que dos dispositivos eligieran movimientos distintos.
export function registrarDecisionIA(ms) {
  if (!partidaActual) return;
  partidaActual.aiDecisionCount++;
  partidaActual.aiDecisionTotalMs += ms;
  if (ms > partidaActual.aiDecisionMaxMs) partidaActual.aiDecisionMaxMs = ms;
}

export function terminarPartida({ humanScore, aiScore, result }) {
  if (!partidaActual) return null;
  cerrarSegmento();
  const analisis = analizarTimeline(partidaActual.scoreTimeline);
  Object.assign(partidaActual, analisis);
  partidaActual.humanScore = humanScore;
  partidaActual.aiScore = aiScore;
  partidaActual.scoreDifference = humanScore - aiScore;
  partidaActual.result = result;
  partidaActual.status = 'finished';
  partidaActual.finishedAt = Date.now();
  partidaActual.aiComeback = result === 'ai-win' &&
    !!analisis.scoreAt50 && analisis.scoreAt50.human > analisis.scoreAt50.ai;
  const id = partidaActual.gameId;
  persistir();
  partidaActual = null;
  return id;
}

// Abandono SOLO cuando se descarta la partida a propósito (cambiar
// ajustes, empezar otra encima). Cerrar la app y volver más tarde no es
// abandonar, y contarlo así inflaría la métrica sin motivo.
export function abandonarPartida() {
  if (!partidaActual) return null;
  cerrarSegmento();
  partidaActual.status = 'abandoned';
  partidaActual.finishedAt = Date.now();
  const id = partidaActual.gameId;
  persistir();
  partidaActual = null;
  return id;
}

export function olvidarPartidaEnCurso() {
  cerrarSegmento();
  partidaActual = null;
}

export async function todasLasPartidas() { return listarPartidas(); }

export async function borrarEstadisticas() {
  partidaActual = null;
  inicioSegmento = null;
  return borrarTodo();
}

// Exportación para poder analizar las partidas fuera. Sin nombres.
export async function exportarEstadisticas(meta) {
  const games = await listarPartidas();
  return {
    metadata: {
      exportedAt: new Date().toISOString(),
      statsSchemaVersion: STATS_SCHEMA_VERSION,
      appVersion: meta?.appVersion || null,
      totalGames: games.length
    },
    games
  };
}
