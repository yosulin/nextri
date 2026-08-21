// src/ai/capacity.js
//
// Capacidad y personalidad son dimensiones separadas. En v3.10 el ajuste
// adaptativo queda preparado pero NEUTRO: sin telemetría fiable, los Core
// juegan exactamente con su calibración base. Cuando se active, el cambio
// será lento e histórico, nunca rubber-band por marcador de una partida.

const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));

export const CORE_CAPACITY_OFFSETS = {
  delta: -0.14,
  circuit: 0,
  vector: 0.14
};

export function resolveCapacityAdjustedProfile(baseProfile, opponentId, playerSkill = null) {
  if (!baseProfile) return null;
  // Null significa "aún no calibrado": preservar exactamente IA2 base.
  if (playerSkill === null || playerSkill === undefined || !(opponentId in CORE_CAPACITY_OFFSETS)) {
    return { ...baseProfile, capacitySource: 'baseline' };
  }

  const target = clamp01(clamp01(playerSkill) + CORE_CAPACITY_OFFSETS[opponentId]);
  // 0.5 es el punto neutro. Los márgenes son deliberadamente pequeños:
  // la personalidad debe seguir dominando y el ajuste no puede convertir
  // Delta en Vector ni al revés.
  const d = target - 0.5;
  const adjust = (v, span) => clamp01(v + d * span);
  const candidateBase = Math.min(baseProfile.candidateLimit, 240);
  const candidateLimit = baseProfile.candidateLimit >= 9999
    ? (target > 0.82 ? 9999 : Math.max(120, Math.round(120 + target * 160)))
    : Math.max(12, Math.round(candidateBase * (1 + d * 0.8)));

  return {
    ...baseProfile,
    scoringAwareness: adjust(baseProfile.scoringAwareness, 0.18),
    bestScoringChance: adjust(baseProfile.bestScoringChance, 0.22),
    buildingAwareness: adjust(baseProfile.buildingAwareness, 0.14),
    safetyAwareness: adjust(baseProfile.safetyAwareness, 0.14),
    candidateLimit,
    capacityTarget: target,
    capacitySource: 'player-skill'
  };
}
