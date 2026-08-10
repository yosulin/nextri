// src/platform/storage.js
//
// Guardado y recuperación de la partida en curso, encima de la capa
// serializable verificada de src/game/state.js.
//
// Todo va envuelto en try/catch a propósito: localStorage puede fallar
// por cuota llena, o directamente lanzar al leerlo en modo privado de
// algunos navegadores. Que no se pueda guardar es un fastidio menor; que
// la app no arranque por eso sería mucho peor. Ante cualquier duda:
// devolver null / no hacer nada, nunca propagar el error.

const SAVE_KEY = 'juego-circulos:partida';

function saveGame() {
  // Solo tiene sentido guardar una partida en curso. Una terminada o el
  // menú no deben dejar nada que luego ofrezca "continuar".
  if (gameStatus !== 'playing') return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializeGameState()));
    return true;
  } catch (e) {
    return false; // cuota, modo privado, etc. — no es motivo para romper la partida
  }
}

function loadSavedGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    // Migrar primero (un guardado de un formato anterior puede ser
    // recuperable), y validar DESPUÉS: si la migración no lo deja en un
    // estado válido, se descarta en vez de restaurarse a medias.
    const migrado = migrateGameSnapshot(JSON.parse(raw));
    return migrado && isValidGameSnapshot(migrado) ? migrado : null;
  } catch (e) {
    return null;
  }
}

function clearSavedGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    /* si no se puede borrar, tampoco hay nada que hacer al respecto */
  }
}

function hasSavedGame() {
  return loadSavedGame() !== null;
}
