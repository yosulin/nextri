// src/progression/guest-progress.js
//
// Progreso semanal del Invitado separado de las estadísticas.
// El servicio no sabe si la persistencia es IndexedDB, Supabase o memoria:
// recibe readMeta/writeMeta por inyección para que la capa de producto no
// dependa del repositorio de estadísticas.
//
// Esta propuesta NO cambia todavía la fórmula 3/2/1. Su objetivo es separar
// correctamente el ciclo de vida del progreso y permitir cambiar la mecánica
// después sin perder arquitectura.

export const GUEST_PROGRESS_SCHEMA_VERSION = 1;

export const DEFAULT_GUEST_REQUIREMENTS = Object.freeze({
  delta: 3,
  circuit: 2,
  vector: 1
});

export function isoWeekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);

  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);

  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function emptyGuestProgress({ date = new Date(), guestId = null } = {}) {
  return {
    schemaVersion: GUEST_PROGRESS_SCHEMA_VERSION,
    eventId: isoWeekId(date),
    guestId,
    wins: {
      delta: 0,
      circuit: 0,
      vector: 0
    },
    unlocked: false,
    unlockedAt: null,
    updatedAt: null
  };
}

export function normalizeGuestProgress(value, context = {}) {
  const expectedEventId = isoWeekId(context.date || new Date());
  const expectedGuestId = context.guestId ?? null;

  if (!value || typeof value !== 'object' ||
      value.schemaVersion !== GUEST_PROGRESS_SCHEMA_VERSION ||
      value.eventId !== expectedEventId ||
      value.guestId !== expectedGuestId) {
    return emptyGuestProgress(context);
  }

  const wins = {};
  for (const rival of Object.keys(DEFAULT_GUEST_REQUIREMENTS)) {
    const n = Number(value.wins?.[rival]);
    wins[rival] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  return {
    schemaVersion: GUEST_PROGRESS_SCHEMA_VERSION,
    eventId: expectedEventId,
    guestId: expectedGuestId,
    wins,
    unlocked: Boolean(value.unlocked),
    unlockedAt: value.unlockedAt || null,
    updatedAt: value.updatedAt || null
  };
}

export function guestProgressRatio(progress, requirements = DEFAULT_GUEST_REQUIREMENTS) {
  const parts = Object.entries(requirements).map(([rival, required]) => {
    if (!Number.isFinite(required) || required <= 0) return 1;
    return Math.min(1, (progress?.wins?.[rival] || 0) / required);
  });

  if (!parts.length) return 1;
  return parts.reduce((sum, value) => sum + value, 0) / parts.length;
}

export function isGuestUnlocked(progress, requirements = DEFAULT_GUEST_REQUIREMENTS) {
  return Object.entries(requirements).every(
    ([rival, required]) => (progress?.wins?.[rival] || 0) >= required
  );
}

export function guestMissingRequirements(progress, requirements = DEFAULT_GUEST_REQUIREMENTS) {
  return Object.entries(requirements)
    .map(([rival, required]) => ({
      rival,
      missing: Math.max(0, required - (progress?.wins?.[rival] || 0))
    }))
    .filter(item => item.missing > 0);
}

export function applyGuestWin(progress, opponentId, {
  now = new Date(),
  requirements = DEFAULT_GUEST_REQUIREMENTS
} = {}) {
  const next = normalizeGuestProgress(progress, {
    date: now,
    guestId: progress?.guestId ?? null
  });

  if (!(opponentId in requirements)) return next;

  next.wins = {
    ...next.wins,
    [opponentId]: (next.wins[opponentId] || 0) + 1
  };
  next.updatedAt = now.toISOString();

  if (!next.unlocked && isGuestUnlocked(next, requirements)) {
    next.unlocked = true;
    next.unlockedAt = next.updatedAt;
  }

  return next;
}

export function createGuestProgressService({
  readMeta,
  writeMeta,
  metaKey = 'guest-progress-v1',
  requirements = DEFAULT_GUEST_REQUIREMENTS
}) {
  if (typeof readMeta !== 'function' || typeof writeMeta !== 'function') {
    throw new TypeError('readMeta y writeMeta son obligatorios');
  }

  async function load({ date = new Date(), guestId = null } = {}) {
    const stored = await readMeta(metaKey);
    return normalizeGuestProgress(stored, { date, guestId });
  }

  async function save(progress) {
    await writeMeta(metaKey, progress);
    return progress;
  }

  async function recordWin(opponentId, { date = new Date(), guestId = null } = {}) {
    const current = await load({ date, guestId });
    const next = applyGuestWin(current, opponentId, { now: date, requirements });
    await save(next);
    return next;
  }

  return {
    load,
    save,
    recordWin,
    requirements
  };
}
