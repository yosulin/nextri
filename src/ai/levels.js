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
// Cada rival tiene retrato propio (rivales/<id>.png, recortados de la
// hoja de marca con fondo transparente para que funcionen igual en tema
// claro y oscuro) y un color que lo acompaña en bordes y distintivos.
// Versión del comportamiento de la IA, independiente de la versión de la
// app. Cada partida guarda la suya, para poder comparar estadísticamente
// "Circuit v1" contra "Circuit v2" aunque NEXTRI haya cambiado por medio
// por motivos que no tienen nada que ver con cómo juega.
export const AI_VERSION = 1;

export const RIVALES = {
  delta: {
    nivel: 'easy', nombre: 'Delta', apodo: 'Espontáneo', color: '#6bcb77',
    descripcion: 'Juega por instinto y se despista. Buen rival para empezar.',
    retrato: 'rivales/delta.png'
  },
  circuit: {
    nivel: 'medium', nombre: 'Circuit', apodo: 'Estratega', color: '#2f7ef0',
    descripcion: 'Busca oportunidades y sabe defenderse.', recomendado: true,
    retrato: 'rivales/circuit.png'
  },
  vector: {
    nivel: 'hard', nombre: 'Vector', apodo: 'Analista', color: '#a855f7',
    descripcion: 'Ve casi todo el tablero y castiga cualquier descuido.',
    retrato: 'rivales/vector.png'
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
