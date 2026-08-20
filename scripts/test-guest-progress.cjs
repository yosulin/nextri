#!/usr/bin/env node
// scripts/test-guest-progress.cjs
//
// Test autocontenido del módulo propuesto de progreso semanal.
// Sigue el patrón actual del repo: transforma el módulo ES para ejecutarlo
// con Node sin introducir tooling nuevo.

const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = readFileSync(
  path.join(root, 'src/progression/guest-progress.js'),
  'utf8'
);

const cleaned = source
  .replace(/(^|\n)export /g, '$1')
  .replace(/(^|\n)const /g, '$1var ');

eval(cleaned);

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`OK: ${label}`);
  else {
    failures++;
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const weekA = new Date('2026-08-19T12:00:00Z');
const weekA2 = new Date('2026-08-20T12:00:00Z');
const weekB = new Date('2026-08-24T12:00:00Z');

check('misma semana => mismo eventId', isoWeekId(weekA) === isoWeekId(weekA2));
check('semana distinta => eventId distinto', isoWeekId(weekA) !== isoWeekId(weekB));

let p = emptyGuestProgress({ date: weekA, guestId: 'atlas' });
check('empieza bloqueado', !p.unlocked);
check('empieza a cero', guestProgressRatio(p) === 0);

p = applyGuestWin(p, 'delta', { now: weekA });
check('registra victoria Delta', p.wins.delta === 1);
check('todavía bloqueado', !p.unlocked);

p = applyGuestWin(p, 'delta', { now: weekA });
p = applyGuestWin(p, 'delta', { now: weekA });
p = applyGuestWin(p, 'circuit', { now: weekA });
p = applyGuestWin(p, 'circuit', { now: weekA });
check('falta Vector', !p.unlocked && guestMissingRequirements(p).length === 1);

p = applyGuestWin(p, 'vector', { now: weekA });
check('cumpliendo 3/2/1 desbloquea', p.unlocked);
check('guarda unlockedAt', typeof p.unlockedAt === 'string');

const nextWeek = normalizeGuestProgress(p, { date: weekB, guestId: 'atlas' });
check('semana nueva reinicia progreso', guestProgressRatio(nextWeek) === 0 && !nextWeek.unlocked);

const otherGuest = normalizeGuestProgress(p, { date: weekA, guestId: 'vampir' });
check('cambio de guest reinicia progreso', guestProgressRatio(otherGuest) === 0);

const ignored = applyGuestWin(
  emptyGuestProgress({ date: weekA, guestId: 'atlas' }),
  'vampir',
  { now: weekA }
);
check('victoria contra invitado no cuenta para desbloqueo', guestProgressRatio(ignored) === 0);

(async () => {
  const memory = new Map();
  const service = createGuestProgressService({
    readMeta: async key => memory.get(key) ?? null,
    writeMeta: async (key, value) => memory.set(key, value)
  });

  await service.recordWin('delta', { date: weekA, guestId: 'atlas' });
  const stored = await service.load({ date: weekA, guestId: 'atlas' });
  check('servicio persiste vía adaptador inyectado', stored.wins.delta === 1);

  // LO QUE MÁS IMPORTA de esta separación: borrar estadísticas NO debe
  // tocar el progreso. Antes el desbloqueo se calculaba sumando victorias
  // del historial, así que vaciarlo volvía a bloquear al invitado.
  {
    const meta = new Map();
    const games = ['partida1', 'partida2'];   // el otro almacén
    const servicio = createGuestProgressService({
      readMeta: async k => meta.get(k),
      writeMeta: async (k, v) => { meta.set(k, v); }
    });
    await servicio.recordWin('delta', { guestId: 'atlas' });
    await servicio.recordWin('circuit', { guestId: 'atlas' });
    games.length = 0;                          // equivale a borrarTodo()
    const tras = await servicio.load({ guestId: 'atlas' });
    check('borrar estadísticas NO borra el progreso semanal',
      tras.wins.delta === 1 && tras.wins.circuit === 1,
      JSON.stringify(tras.wins));
  }

  if (failures) {
    console.error(`\n${failures} comprobación(es) fallaron`);
    process.exit(1);
  }
  console.log('\nTodas las comprobaciones pasaron.');
})();
