// src/stats/repository.js
//
// Guardado de estadísticas en IndexedDB. Todo se queda en el dispositivo:
// sin peticiones de red, sin analítica de terceros, sin nombres de
// personas.
//
// La forma del repositorio (guardar / actualizar / listar / borrar) es a
// propósito la mínima que necesita el servicio, de modo que más adelante
// se pueda escribir un SupabaseStatsRepository con la misma forma y
// cambiarlo sin tocar el motor ni la interfaz.
//
// Sin librerías externas: IndexedDB con promesas envueltas a mano.

export const STATS_DB = 'nextri-stats';
export const STATS_SCHEMA_VERSION = 1;
const STORE_PARTIDAS = 'games';
const STORE_META = 'meta';

let dbPromesa = null;

function abrir() {
  if (dbPromesa) return dbPromesa;
  dbPromesa = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('sin IndexedDB')); return; }
    const req = indexedDB.open(STATS_DB, STATS_SCHEMA_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PARTIDAS)) {
        const store = db.createObjectStore(STORE_PARTIDAS, { keyPath: 'gameId' });
        // Índices por lo que de verdad se consulta al agregar.
        store.createIndex('startedAt', 'startedAt');
        store.createIndex('status', 'status');
        store.createIndex('opponentId', 'opponentId');
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'clave' });
      }
      void ev;
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromesa;
}

function transaccion(store, modo, fn) {
  return abrir().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, modo);
    const os = tx.objectStore(store);
    let resultado;
    try { resultado = fn(os); } catch (e) { reject(e); return; }
    tx.oncomplete = () => resolve(resultado && resultado.result !== undefined ? resultado.result : resultado);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

// Todas las operaciones devuelven un valor razonable si IndexedDB no está
// disponible (modo privado, permisos): que no haya estadísticas es un
// fastidio menor; que la app no arranque por eso sería mucho peor.
export async function guardarPartida(registro) {
  try { await transaccion(STORE_PARTIDAS, 'readwrite', os => os.put(registro)); return true; }
  catch { return false; }
}

export async function obtenerPartida(gameId) {
  try { return await transaccion(STORE_PARTIDAS, 'readonly', os => os.get(gameId)); }
  catch { return null; }
}

export async function listarPartidas() {
  try {
    const todas = await transaccion(STORE_PARTIDAS, 'readonly', os => os.getAll());
    return Array.isArray(todas) ? todas : [];
  } catch { return []; }
}

export async function borrarTodo() {
  try { await transaccion(STORE_PARTIDAS, 'readwrite', os => os.clear()); return true; }
  catch { return false; }
}

export async function guardarMeta(clave, valor) {
  try { await transaccion(STORE_META, 'readwrite', os => os.put({ clave, valor })); return true; }
  catch { return false; }
}

export async function leerMeta(clave) {
  try {
    const fila = await transaccion(STORE_META, 'readonly', os => os.get(clave));
    return fila ? fila.valor : null;
  } catch { return null; }
}
