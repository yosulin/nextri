// src/ai/profile-resolver.js
//
// Único punto de resolución del perfil efectivo de una partida.
// Identidad del bot + personalidad base + capacidad (si procede) son
// independientes del ruleset. Phantom deriva su perfil del jugador.

import { AI_PROFILES, RIVALES } from './levels.js?v=3.11';
import { resolveCapacityAdjustedProfile } from './capacity.js?v=3.11';
import { phantomAIProfile } from '../progression/player-model.js?v=3.11';

export function resolveAIProfile({ opponentId, profileId, playerModel = null, playerSkill = null } = {}) {
  if (opponentId === 'phantom' || profileId === 'phantom') return phantomAIProfile(playerModel);
  const bot = RIVALES[opponentId] || null;
  const base = AI_PROFILES[profileId] || (bot && AI_PROFILES[bot.profileId]) || AI_PROFILES.circuit;
  if (bot && bot.adaptiveCapacity) return resolveCapacityAdjustedProfile(base, opponentId, playerSkill);
  return { ...base, capacitySource: 'fixed' };
}
