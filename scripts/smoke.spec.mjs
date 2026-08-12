// scripts/smoke.spec.mjs
// Prueba de humo en un navegador DE VERDAD. Todo lo demás corre en Node,
// que no carga index.html ni tiene DOM — y por ese hueco se colaron tres
// fallos seguidos que solo aparecían al abrir el juego:
//   v2.55  DIST_EPS no definido (constante fuera del alcance del módulo)
//   v2.57  la inicialización nunca corría (los módulos ES van en diferido)
//   v2.57b dos copias del mismo módulo por ?v= descoordinada
// Ninguno era error de sintaxis. Todos habrían muerto aquí.
import { test, expect } from '@playwright/test';

// Cualquier excepción de la página hace fallar la prueba: es exactamente
// la clase de fallo que buscamos.
// Avisos del navegador que NO son fallos de la aplicación: Chromium
// bloquea navigator.vibrate() si no considera que ha habido un gesto real
// del usuario, y un clic sintético no siempre cuenta. En un móvil de
// verdad funciona.
const RUIDO_DEL_NAVEGADOR = [/navigator\.vibrate/i];

function vigilarErrores(page) {
  const errores = [];
  const anotar = (t) => { if (!RUIDO_DEL_NAVEGADOR.some(r => r.test(t))) errores.push(t); };
  page.on('pageerror', e => anotar(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') anotar(`console: ${m.text()}`); });
  return errores;
}

test('la aplicación arranca y se puede jugar', async ({ page }) => {
  const errores = vigilarErrores(page);
  await page.goto('/index.html');

  // 1. Arranca y la inicialización ha corrido de verdad (esto es lo que
  //    fallaba en v2.57: la página se veía bien pero no respondía).
  await expect(page.locator('#versionTag')).not.toBeEmpty();
  await expect(page.locator('#nameInput0')).toHaveCount(1); // la inicialización corrió
  // Los avatares se pintan desde levels.js al arrancar: si no aparecen,
  // algo falló en esa parte sin lanzar excepción.
  await expect(page.locator('[data-rival="circuit"] .rival-avatar img')).toHaveCount(1);
  await expect(page.locator('#rivalDesc')).toContainText('Circuit');
  // Modo Local para probar el flujo de varios jugadores
  await page.locator('[data-accion="modo"][data-modo="local"]').click();
  await expect(page.locator('#localPlayersSection')).toBeVisible();

  // 2. Controles que antes eran atributos on* incrustados
  const slider = page.locator('#circleSlider');
  await slider.evaluate(el => { el.value = '50'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('#sliderVal')).toHaveText('50');

  // La casilla está oculta a propósito (accesible pero no visible), así
  // que se activa como lo haría una persona: pulsando su interruptor.
  await page.locator('#randomToggleInput').check({ force: true });
  await expect(page.locator('#randomToggleInput')).toBeChecked();

  // 3. Empezar partida
  await page.locator('#setupPanel [data-accion="empezar"]').click();
  await expect(page.locator('#gameUI')).toHaveClass(/is-active/);

  // El tablero debe tener círculos pintados: si draw() revienta a medias,
  // el lienzo queda en blanco (el síntoma de v2.55).
  const hayCirculos = await page.evaluate(() => {
    const c = document.getElementById('gameCanvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
    return false;
  });
  expect(hayCirculos, 'el tablero debe tener algo dibujado').toBe(true);

  // 4. Tirar el dado y comprobar que el turno avanza
  // El dado pulsa con una animación infinita mientras espera la tirada, y
  // Playwright no considera "estable" un elemento en movimiento: se pulsa
  // con force, que es lo que hace una persona igualmente.
  await page.locator('#dice').click({ force: true });
  await expect(page.locator('#linesLeftLabel')).toContainText(/línea/, { timeout: 5000 });

  // 5. Nuevo juego deja el tablero jugable otra vez
  page.on('dialog', d => d.accept());
  await page.locator('[data-accion="nuevo"]').click();
  await expect(page.locator('#gameUI')).toHaveClass(/is-active/);

  expect(errores, 'la página no debe lanzar ninguna excepción').toEqual([]);
});

test('el modo Solo contra la máquina arranca sin errores', async ({ page }) => {
  const errores = vigilarErrores(page);
  await page.goto('/index.html');

  await page.locator('[data-accion="modo"][data-modo="solo"]').click();
  await expect(page.locator('#soloModeInfo')).toBeVisible();
  await page.locator('[data-accion="rival"][data-rival="vector"]').click();
  await expect(page.locator('#startBtn')).toContainText('Vector');
  await page.locator('#setupPanel [data-accion="empezar"]').click();
  await expect(page.locator('#gameUI')).toHaveClass(/is-active/);

  // Dejar que la máquina juegue su turno entero sin reventar
  await page.locator('#dice').click({ force: true });
  await page.waitForTimeout(6000);

  expect(errores, 'la página no debe lanzar ninguna excepción').toEqual([]);
});

test('cambiar el tema no rompe nada', async ({ page }) => {
  const errores = vigilarErrores(page);
  await page.goto('/index.html');
  await page.locator('[data-accion="tema"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/);
  expect(errores).toEqual([]);
});
