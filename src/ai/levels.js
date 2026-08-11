// src/ai/levels.js
//
// Configuración de dificultad de Circuit. Deliberadamente separada del
// algoritmo (ai.js): hay UN solo chooseAIMove(), y Fácil/Medio/Difícil
// son distintos valores de estos parámetros, no tres motores distintos.
//
// La dificultad se consigue con "racionalidad limitada" (cuánto del
// tablero analiza, con qué frecuencia detecta y elige bien), NO haciendo
// trampas: Circuit nunca se salta checkMoveValidity(), nunca conoce nada
// que una persona no pudiera calcular mirando el tablero, y nunca mira la
// diferencia de puntuación para jugar mejor o peor (nada de
// rubber-banding) — el nivel se mantiene igual gane o pierda.

export const AI_LEVELS = {
  easy: {
    scoringAwareness: 0.65,   // prob. de "ver" que hay jugada(s) puntuable(s)
    bestScoringChance: 0.35,  // entre las vistas, prob. de coger la de más triángulos
    scoringPower: 1.2,        // ponderación por triángulos si no coge la mejor
    buildingAwareness: 0.40,  // prob. de aprovechar una construcción propia
    safetyAwareness: 0.45,    // prob. de evitar dejar un cierre servido
    candidateLimit: 20        // cuántos movimientos legales analiza como mucho
  },
  medium: {
    scoringAwareness: 0.88,
    bestScoringChance: 0.60,
    scoringPower: 1.6,
    buildingAwareness: 0.70,
    safetyAwareness: 0.75,
    candidateLimit: 45
  },
  hard: {
    scoringAwareness: 0.98,
    bestScoringChance: 0.88,
    scoringPower: 2.2,
    buildingAwareness: 0.90,
    safetyAwareness: 0.92,
    candidateLimit: 9999 // prácticamente todos
  }
};

// Los tres rivales. No son "niveles de dificultad" sino personalidades:
// un mismo chooseAIMove() con parámetros distintos. Presentarlos como
// rivales con nombre hace la elección más concreta que Fácil/Medio/Difícil.
// Cada rival lleva su propio avatar dibujado con el lenguaje de la marca
// (nodos y conexiones), y un color que lo distingue de un vistazo: Delta
// disperso y suelto, Circuit ordenado en triángulo, Vector con todo
// conectado a un núcleo. Son SVG en línea para que escalen limpio y
// cambien de color solo con CSS.
export const RIVALES = {
  delta: {
    nivel: 'easy', nombre: 'Delta', apodo: 'Espontáneo', color: '#6bcb77',
    descripcion: 'Juega por instinto y se despista. Buen rival para empezar.',
    avatar: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <line x1="16" y1="20" x2="44" y2="16" stroke="currentColor" stroke-width="3" opacity=".45"/>
      <line x1="16" y1="20" x2="22" y2="46" stroke="currentColor" stroke-width="3" opacity=".45"/>
      <line x1="44" y1="16" x2="50" y2="42" stroke="currentColor" stroke-width="3" opacity=".25"/>
      <circle cx="16" cy="20" r="7" fill="currentColor"/>
      <circle cx="44" cy="16" r="5" fill="currentColor" opacity=".7"/>
      <circle cx="22" cy="46" r="5" fill="currentColor" opacity=".55"/>
      <circle cx="50" cy="42" r="4" fill="currentColor" opacity=".35"/>
    </svg>`
  },
  circuit: {
    nivel: 'medium', nombre: 'Circuit', apodo: 'Estratega', color: '#2f7ef0',
    descripcion: 'Busca oportunidades y sabe defenderse.', recomendado: true,
    avatar: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <polygon points="32,14 50,46 14,46" fill="currentColor" opacity=".16"/>
      <polygon points="32,14 50,46 14,46" fill="none" stroke="currentColor" stroke-width="3"/>
      <circle cx="32" cy="14" r="6" fill="currentColor"/>
      <circle cx="50" cy="46" r="6" fill="currentColor"/>
      <circle cx="14" cy="46" r="6" fill="currentColor"/>
    </svg>`
  },
  vector: {
    nivel: 'hard', nombre: 'Vector', apodo: 'Analista', color: '#ff8c32',
    descripcion: 'Ve casi todo el tablero y castiga cualquier descuido.',
    avatar: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <g stroke="currentColor" stroke-width="2.5" opacity=".5">
        <line x1="32" y1="32" x2="32" y2="12"/><line x1="32" y1="32" x2="50" y2="22"/>
        <line x1="32" y1="32" x2="50" y2="44"/><line x1="32" y1="32" x2="32" y2="52"/>
        <line x1="32" y1="32" x2="14" y2="44"/><line x1="32" y1="32" x2="14" y2="22"/>
      </g>
      <circle cx="32" cy="12" r="4" fill="currentColor"/><circle cx="50" cy="22" r="4" fill="currentColor"/>
      <circle cx="50" cy="44" r="4" fill="currentColor"/><circle cx="32" cy="52" r="4" fill="currentColor"/>
      <circle cx="14" cy="44" r="4" fill="currentColor"/><circle cx="14" cy="22" r="4" fill="currentColor"/>
      <circle cx="32" cy="32" r="8" fill="currentColor"/>
    </svg>`
  }
};

export let rivalElegido = 'circuit';
export function setRival(id) {
  if (RIVALES[id]) { rivalElegido = id; aiDifficulty = RIVALES[id].nivel; }
  return rivalElegido;
}
export function getRival() { return RIVALES[rivalElegido]; }

export let aiDifficulty = 'medium';

// Un módulo ES no permite que quien importa asigne a la variable
// importada, así que el cambio se hace aquí dentro.
export function setDifficulty(nivel) {
  if (AI_LEVELS[nivel]) aiDifficulty = nivel;
  return aiDifficulty;
}
export function getDifficulty() { return aiDifficulty; }
