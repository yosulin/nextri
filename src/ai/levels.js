// src/ai/levels.js
//
// IA 2.0: identidad, personalidad y capacidad son conceptos separados.
// Un bot describe CÓMO tiende a jugar; el ruleset describe QUÉ reglas existen.
// Phantom es especial: su perfil se deriva del modelo vivo del jugador.

export const AI_VERSION = 2;

export const AI_PROFILES = {
  delta: {
    id: 'delta', profileType: 'static', legacyLevel: 'easy',
    scoringAwareness: 0.72, bestScoringChance: 0.38, scoringPower: 1.25,
    buildingAwareness: 0.42, safetyAwareness: 0.42, candidateLimit: 24
  },
  circuit: {
    id: 'circuit', profileType: 'static', legacyLevel: 'medium',
    scoringAwareness: 0.91, bestScoringChance: 0.68, scoringPower: 1.75,
    buildingAwareness: 0.78, safetyAwareness: 0.80, candidateLimit: 58
  },
  vector: {
    id: 'vector', profileType: 'static', legacyLevel: 'hard',
    scoringAwareness: 0.99, bestScoringChance: 0.93, scoringPower: 2.45,
    buildingAwareness: 0.93, safetyAwareness: 0.95, candidateLimit: 9999
  },
  lumina: {
    id: 'lumina', profileType: 'static', legacyLevel: 'medium',
    scoringAwareness: 0.87, bestScoringChance: 0.61, scoringPower: 1.60,
    buildingAwareness: 0.96, safetyAwareness: 0.71, candidateLimit: 68
  }
};

export const AI_LEVELS = {
  easy: AI_PROFILES.delta,
  medium: AI_PROFILES.circuit,
  hard: AI_PROFILES.vector
};

export const RIVALES = {
  delta: {
    kind: 'core', profileType: 'static', profileId: 'delta', nivel: 'easy',
    nombre: 'Delta', apodo: 'Espontáneo', color: '#6bcb77',
    descripcion: 'Juega por instinto, explora y acepta más riesgo. Buen rival para empezar.',
    retrato: 'rivales/delta.png', adaptiveCapacity: true
  },
  circuit: {
    kind: 'core', profileType: 'static', profileId: 'circuit', nivel: 'medium',
    nombre: 'Circuit', apodo: 'Estratega', color: '#2f7ef0',
    descripcion: 'Equilibra ataque, construcción y defensa.', recomendado: true,
    retrato: 'rivales/circuit.png', adaptiveCapacity: true
  },
  vector: {
    kind: 'core', profileType: 'static', profileId: 'vector', nivel: 'hard',
    nombre: 'Vector', apodo: 'Analista', color: '#a855f7',
    descripcion: 'Ve casi todo el tablero y castiga cualquier descuido.',
    retrato: 'rivales/vector.png', adaptiveCapacity: true
  },
  phantom: {
    kind: 'personal', profileType: 'derived', profileId: 'phantom', nivel: 'hard',
    nombre: 'Phantom', apodo: 'Tu reflejo', color: '#8b93d6',
    descripcion: 'Observa cómo juegas y aprende a tomar decisiones como tú.',
    retrato: 'rivales/phantom.png', unlock: { type: 'player-model', minGames: 50 }
  },
  lumina: {
    kind: 'special', profileType: 'static', profileId: 'lumina', nivel: 'medium',
    nombre: 'Lumina', apodo: 'Intuitiva', color: '#ec4899',
    descripcion: 'Construye conexiones y prepara jugadas con paciencia.',
    retrato: 'rivales/lumina.png', adaptiveCapacity: false
  }
};

export let rivalElegido = 'circuit';
export let aiDifficulty = 'medium';
export let aiProfileId = 'circuit';

export function setAIProfile(id) {
  // Phantom es un perfil derivado y se resuelve en tiempo de ejecución.
  if (id !== 'phantom' && !AI_PROFILES[id]) return aiProfileId;
  aiProfileId = id;
  aiDifficulty = id === 'phantom' ? 'hard' : AI_PROFILES[id].legacyLevel;
  return aiProfileId;
}
export function getAIProfileId() { return aiProfileId; }
export function getAIProfile(id = aiProfileId) {
  // Nunca fingir un Phantom estático. Si aún no se ha resuelto su modelo,
  // el caller debe bloquearlo; Circuit es solo fallback defensivo de API.
  return AI_PROFILES[id] || AI_PROFILES.circuit;
}
export function setRival(id) {
  if (RIVALES[id]) { rivalElegido = id; setAIProfile(RIVALES[id].profileId); }
  return rivalElegido;
}
export function getRival() {
  const r = RIVALES[rivalElegido];
  return { id: rivalElegido, kind: r.kind || 'core', aiProfileId: r.profileId, ...r };
}
export function setDifficulty(nivel) {
  const perfil = AI_LEVELS[nivel];
  if (perfil) setAIProfile(perfil.id);
  return aiDifficulty;
}
export function getDifficulty() { return aiDifficulty; }
