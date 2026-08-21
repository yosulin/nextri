// src/progression/player-model.js
//
// Modelo vivo del jugador para Phantom. Vive en META, no en el historial de
// estadísticas: borrar estadísticas no debe borrar lo aprendido por Phantom.
// Más adelante este mismo objeto podrá sincronizarse con Supabase.

export const PLAYER_MODEL_SCHEMA_VERSION = 1;
export const PHANTOM_UNLOCK_MIN_GAMES = 50;
const META_KEY = 'player-model-v1';
const TRAITS = ['attack', 'vision', 'construction', 'defense', 'risk'];

const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));
const lerp = (a,b,t) => a + (b-a)*clamp01(t);

export function createEmptyPlayerModel() {
  return {
    schemaVersion: PLAYER_MODEL_SCHEMA_VERSION,
    gamesAnalyzed: 0,
    decisionsAnalyzed: 0,
    updatedAt: null,
    countedGameIds: [],
    traits: Object.fromEntries(TRAITS.map(k => [k, { sum: 0, samples: 0, value: 0.5 }]))
  };
}

export function normalizePlayerModel(raw) {
  const base = createEmptyPlayerModel();
  if (!raw || raw.schemaVersion !== PLAYER_MODEL_SCHEMA_VERSION) return base;
  base.gamesAnalyzed = Math.max(0, Number(raw.gamesAnalyzed) || 0);
  base.decisionsAnalyzed = Math.max(0, Number(raw.decisionsAnalyzed) || 0);
  base.updatedAt = raw.updatedAt || null;
  base.countedGameIds = Array.isArray(raw.countedGameIds) ? raw.countedGameIds.slice(-100) : [];
  for (const k of TRAITS) {
    const r = raw.traits && raw.traits[k];
    if (!r) continue;
    const samples = Math.max(0, Number(r.samples) || 0);
    const sum = Math.max(0, Number(r.sum) || 0);
    base.traits[k] = { samples, sum, value: samples ? clamp01(sum / samples) : 0.5 };
  }
  return base;
}

export function phantomUnlocked(model) {
  return normalizePlayerModel(model).gamesAnalyzed >= PHANTOM_UNLOCK_MIN_GAMES;
}

// 0..1 orientativo para UI. El desbloqueo depende solo de las 50 partidas;
// después la confianza sigue creciendo mientras Phantom observa decisiones.
export function playerModelConfidence(model) {
  const m = normalizePlayerModel(model);
  const gameConfidence = Math.min(1, m.gamesAnalyzed / PHANTOM_UNLOCK_MIN_GAMES);
  const decisionConfidence = Math.min(1, m.decisionsAnalyzed / 600);
  return clamp01(gameConfidence * 0.7 + decisionConfidence * 0.3);
}

export function playerRadar(model) {
  const m = normalizePlayerModel(model);
  return {
    ataque: m.traits.attack.value,
    vision: m.traits.vision.value,
    construccion: m.traits.construction.value,
    defensa: m.traits.defense.value,
    riesgo: m.traits.risk.value
  };
}

// Convierte lo aprendido a los parámetros que ya consume chooseAIMove().
// Phantom no tiene una personalidad fija: este perfil cambia con el jugador.
export function phantomAIProfile(model) {
  const m = normalizePlayerModel(model);
  const t = Object.fromEntries(TRAITS.map(k => [k, m.traits[k].value]));
  return {
    id: 'phantom',
    source: 'player-model',
    legacyLevel: 'hard',
    scoringAwareness: lerp(0.48, 0.995, t.attack),
    bestScoringChance: lerp(0.28, 0.96, t.vision),
    scoringPower: lerp(1.05, 2.60, t.attack * 0.35 + t.vision * 0.65),
    buildingAwareness: lerp(0.25, 0.98, t.construction),
    safetyAwareness: lerp(0.25, 0.99, t.defense),
    candidateLimit: Math.max(18, Math.round(lerp(18, 220, t.vision)))
  };
}

export function createPlayerModelService({ readMeta, writeMeta }) {
  // Las decisiones pueden llegar con pocos ms de diferencia (un dado permite
  // varias líneas). Serializar el read-modify-write evita que dos updates
  // paralelos lean el mismo modelo y uno pise al otro.
  let queue = Promise.resolve();
  const enqueue = fn => { queue = queue.then(fn, fn); return queue; };

  async function loadNow() {
    return normalizePlayerModel(await readMeta(META_KEY));
  }
  async function load() {
    await queue;
    return loadNow();
  }
  async function saveNow(model) {
    const m = normalizePlayerModel(model);
    m.updatedAt = new Date().toISOString();
    await writeMeta(META_KEY, m);
    return m;
  }
  function save(model) { return enqueue(() => saveNow(model)); }

  function recordDecision(observation) {
    return enqueue(async () => {
      if (!observation) return loadNow();
      const m = await loadNow();
      let contributed = false;
      for (const k of TRAITS) {
        const v = observation[k];
        if (v === null || v === undefined || !Number.isFinite(Number(v))) continue;
        m.traits[k].sum += clamp01(v);
        m.traits[k].samples += 1;
        m.traits[k].value = m.traits[k].sum / m.traits[k].samples;
        contributed = true;
      }
      if (contributed) m.decisionsAnalyzed += 1;
      return saveNow(m);
    });
  }

  function recordCompletedGame(gameId = null) {
    return enqueue(async () => {
      const m = await loadNow();
      if (gameId && m.countedGameIds.includes(gameId)) return m;
      m.gamesAnalyzed += 1;
      if (gameId) m.countedGameIds = [...m.countedGameIds, gameId].slice(-100);
      return saveNow(m);
    });
  }
  return { load, save, recordDecision, recordCompletedGame };
}
