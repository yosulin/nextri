// src/ai/decision-analysis.js
//
// Extrae señales de una decisión HUMANA antes de aplicarla. No guarda datos
// ni conoce a Phantom; únicamente describe la decisión con métricas 0..1.
// El análisis es determinista y siempre valida jugadas con las reglas reales.

import { checkMoveValidity, findNewTriangles } from '../game/rules.js?v=3.17';
import { createsScoringReply } from './ai.js?v=3.17';

export function analyzeHumanDecision(st, from, to) {
  const chosenValidity = checkMoveValidity(st, from, to);
  if (!chosenValidity.valid) return null;

  let legalMoves = 0;
  let bestGain = 0;
  let scoringMoves = 0;
  for (const pair of st.candidatePairs || []) {
    if (!checkMoveValidity(st, pair.i, pair.j).valid) continue;
    legalMoves++;
    const gain = findNewTriangles(st, pair.i, pair.j).length;
    if (gain > 0) scoringMoves++;
    if (gain > bestGain) bestGain = gain;
  }

  const chosenGain = findNewTriangles(st, from, to).length;
  const replyCreated = chosenGain === 0 ? createsScoringReply(st, from, to) : false;
  const finalLine = st.linesLeft <= 1;
  const canFollowUp = st.linesLeft > 1;

  return {
    legalMoves,
    candidatePairs: (st.candidatePairs || []).length,
    chosenGain,
    bestGain,
    scoringAvailable: bestGain > 0,
    scoringMoves,
    replyCreated,
    finalLine,
    canFollowUp,
    // Señales opcionales: null = esa decisión no aportaba información fiable
    // sobre ese eje y no debe mover el promedio.
    attack: bestGain > 0 ? (chosenGain > 0 ? 1 : 0) : null,
    vision: bestGain > 0 ? Math.min(1, chosenGain / bestGain) : null,
    construction: canFollowUp && chosenGain === 0 ? (replyCreated ? 1 : 0) : null,
    defense: finalLine && chosenGain === 0 ? (replyCreated ? 0 : 1) : null,
    risk: finalLine && chosenGain === 0 ? (replyCreated ? 1 : 0) : null
  };
}
