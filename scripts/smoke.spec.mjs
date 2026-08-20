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
  // La versión ya no está en la cabecera (v2.68), solo en el panel de
  // información: se comprueba ahí, que sigue siendo señal de que la
  // inicialización llegó a ejecutarse.
  await expect(page.locator('#infoVersion')).not.toBeEmpty();
  await expect(page.locator('.marca-texto')).toHaveText('NEXTRI');
  await expect(page.locator('#nameInput0')).toHaveCount(1); // la inicialización corrió
  // Los avatares se pintan desde levels.js al arrancar: si no aparecen,
  // algo falló en esa parte sin lanzar excepción.
  // Carrusel de fichas: una por rival del catálogo, con la central marcada.
  await expect(page.locator('#fichasRival .ficha-rival')).toHaveCount(4);
  await expect(page.locator('.ficha-rival.centrada')).toHaveCount(1);
  // No basta con que HAYA una centrada: tiene que ser Circuit. Es la
  // comprobación que habría cazado el fallo de orden de inicialización de
  // la v3.01 (Delta aparecía grande y con opacidad completa mientras el
  // carrusel pequeño marcaba a Circuit, porque construirTarjetasRival()
  // centraba el carrusel ANTES de que elegirRival('circuit') fijara el
  // rival por defecto).
  await expect(page.locator('.ficha-rival.centrada')).toHaveAttribute('data-rival', 'circuit');
  await expect(page.locator('#startBtn')).toContainText('Circuit');
  // Cuarta tarjeta: el invitado semanal, bloqueado hasta ganar a los tres
  await expect(page.locator('#fichasRival .ficha-rival')).toHaveCount(4);
  await expect(page.locator('.ficha-rival[data-rival="invitado"]')).toHaveClass(/bloqueada/);
  // El nombre vive dentro de la tarjeta generada, no en un id propio:
  // las tarjetas ya no se escriben a mano en el HTML.
  await expect(page.locator('.ficha-rival[data-rival="invitado"] h2')).toHaveText('???');
  // La descripción vive ahora dentro de la ficha centrada del carrusel.
  await expect(page.locator('.ficha-rival.centrada h2')).toHaveText('Circuit');
  // Modo Local para probar el flujo de varios jugadores
  await page.locator('[data-accion="modo"][data-modo="local"]').click();
  await expect(page.locator('#localPlayersSection')).toBeVisible();

  // 2. Controles que antes eran atributos on* incrustados
  // Las opciones de partida viven ahora dentro de Ajustes (v2.97).
  await page.locator('.cabecera [data-accion="abrir-ajustes"]').click();
  await expect(page.locator('#ajustesOverlay')).toHaveClass(/show/);
  const slider = page.locator('#circleSlider');
  await slider.evaluate(el => { el.value = '50'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('#sliderVal')).toHaveText('50');

  // La casilla vive DENTRO del mismo panel de ajustes (v2.97), así que se
  // marca antes de cerrarlo, no después. Está oculta a propósito
  // (accesible pero no visible), así que se activa como lo haría una
  // persona: pulsando su interruptor.
  await page.locator('#randomToggleInput').check({ force: true });
  await expect(page.locator('#randomToggleInput')).toBeChecked();

  await page.locator('[data-accion="cerrar"][data-objetivo="ajustesOverlay"]').first().click();

  // 3. Empezar partida
  await page.locator('#startBtn').click();
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
  // "Nuevo juego" ya no es un confirm de sí/no: ofrece las dos salidas.
  await page.locator('[data-accion="nuevo"]').click();
  await expect(page.locator('#salirOverlay')).toHaveClass(/show/);
  await page.locator('[data-accion="otra-igual"]').click();
  await expect(page.locator('#gameUI')).toHaveClass(/is-active/);

  // Y la salida que faltaba: volver al menú a cambiar de rival o tablero.
  await page.locator('[data-accion="nuevo"]').click();
  await page.locator('[data-accion="menu"]').first().click();
  await expect(page.locator('#gameUI')).not.toHaveClass(/is-active/);
  await expect(page.locator('.marca-texto')).toBeVisible();

  expect(errores, 'la página no debe lanzar ninguna excepción').toEqual([]);
});

test('el modo Solo contra la máquina arranca sin errores', async ({ page }) => {
  const errores = vigilarErrores(page);
  await page.goto('/index.html');

  await page.locator('[data-accion="modo"][data-modo="solo"]').click();
  await expect(page.locator('#soloModeInfo')).toBeVisible();
  await page.locator('.ficha-rival[data-rival="vector"]').click();
  await expect(page.locator('#startBtn')).toContainText('Vector');
  await page.locator('#startBtn').click();
  await expect(page.locator('#gameUI')).toHaveClass(/is-active/);

  // Dejar que la máquina juegue su turno entero sin reventar
  await page.locator('#dice').click({ force: true });
  await page.waitForTimeout(6000);

  expect(errores, 'la página no debe lanzar ninguna excepción').toEqual([]);
});

test('cambiar el tema no rompe nada', async ({ page }) => {
  const errores = vigilarErrores(page);
  await page.goto('/index.html');
  // El tema vive ahora dentro del panel de ajustes, con las dos opciones
  // a la vista en vez de un botón que alterna.
  await page.locator('.cabecera [data-accion="abrir-ajustes"]').click();
  await expect(page.locator('#ajustesOverlay')).toHaveClass(/show/);
  await page.locator('#selectorTema [data-tema="light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('#selectorTema [data-tema="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(errores).toEqual([]);
});

// Lo que de verdad importa en pantallas pequeñas no es que quepa TODO sin
// desplazarse — perseguir eso llevaba a encoger el texto hasta dejarlo
// ilegible — sino que el botón de jugar esté SIEMPRE visible y que nada se
// salga por los lados. El contenido puede desplazarse en vertical.
const PANTALLAS = [
  { nombre: 'móvil pequeño', width: 360, height: 640 },
  { nombre: 'móvil normal',  width: 390, height: 844 },
  { nombre: 'móvil grande',  width: 430, height: 932 }
];

for (const p of PANTALLAS) {
  test(`el menú se usa bien en ${p.nombre} (${p.width}×${p.height})`, async ({ page }) => {
    await page.setViewportSize({ width: p.width, height: p.height });
    await page.goto('/index.html');
    await expect(page.locator('.marca-texto')).toHaveText('NEXTRI');

    // El botón principal, visible sin tocar nada
    const jugar = page.locator('#startBtn');
    await expect(jugar).toBeInViewport();

    // Y utilizable de verdad: dentro de la pantalla y con altura de sobra
    // para el dedo (mínimo recomendado en móvil: 44px).
    const caja = await jugar.boundingBox();
    expect(caja.y + caja.height, 'el botón no debe quedar cortado por abajo')
      .toBeLessThanOrEqual(p.height + 1);
    expect(caja.height, 'el botón debe ser cómodo de pulsar').toBeGreaterThanOrEqual(44);

    // Nada se sale por los lados
    const ancho = await page.evaluate(() => ({
      total: document.documentElement.scrollWidth, visible: window.innerWidth
    }));
    expect(ancho.total, 'no debe haber desplazamiento horizontal')
      .toBeLessThanOrEqual(ancho.visible + 4);

    // Si el contenido CABE, no debe haber desplazamiento vertical. Esto
    // pilla el caso de v2.82: un relleno fijo o 100vh (que en móvil mide
    // más que la pantalla visible) generaban scroll aunque sobrara sitio.
    const v = await page.evaluate(() => ({
      contenido: document.body.getBoundingClientRect().height,
      documento: document.documentElement.scrollHeight,
      visible: window.innerHeight
    }));
    if (v.contenido <= v.visible) {
      expect(v.documento, `hay ${v.documento - v.visible}px de scroll aunque el contenido cabe`)
        .toBeLessThanOrEqual(v.visible + 4);
    }

    // El texto debe ser legible: nada por debajo de 11px
    const demasiadoPequeño = await page.evaluate(() => {
      const sel = ['.ficha-rival h2', '.fr-apodo', '.fr-desc', '.setup-label', '#startBtn'];
      return sel.flatMap(s => [...document.querySelectorAll(s)])
        .filter(el => el.offsetParent !== null)
        .map(el => ({ sel: el.className || el.id, px: parseFloat(getComputedStyle(el).fontSize) }))
        .filter(x => x.px < 11);
    });
    expect(demasiadoPequeño, 'ningún texto por debajo de 11px').toEqual([]);
  });
}

// Ciclo completo de estadísticas en un navegador real: jugar, comprobar
// que queda registro, RECARGAR y comprobar que sigue ahí (IndexedDB), y
// que la pantalla se abre desde el engranaje.
test('las estadísticas se registran y sobreviven a recargar', async ({ page }) => {
  const errores = vigilarErrores(page);
  await page.goto('/index.html');

  // Partida contra Circuit
  await page.locator('#startBtn').click();
  await expect(page.locator('#gameUI')).toHaveClass(/is-active/);
  await page.locator('#dice').click({ force: true });
  await page.waitForTimeout(1500);

  // Debe existir un registro con estado 'active' (jugando, no abandonada)
  const trasJugar = await page.evaluate(async () => {
    const abrir = () => new Promise((res, rej) => {
      const r = indexedDB.open('nextri-stats');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const db = await abrir();
    return new Promise(res => {
      const req = db.transaction('games', 'readonly').objectStore('games').getAll();
      req.onsuccess = () => res(req.result.map(g => ({ status: g.status, mode: g.mode,
        opponentId: g.opponentId, aiVersion: g.aiVersion, tieneNombre: JSON.stringify(g).includes('Jugador 1') })));
    });
  });
  expect(trasJugar.length, 'debe haberse registrado la partida').toBeGreaterThan(0);
  expect(trasJugar[0].status).toBe('active');
  expect(trasJugar[0].mode).toBe('solo');
  expect(trasJugar[0].opponentId).toBe('circuit');
  expect(trasJugar[0].aiVersion, 'la partida se etiqueta con la versión de IA').toBe(1);
  expect(trasJugar[0].tieneNombre, 'las estadísticas NO deben guardar nombres').toBe(false);

  // Recargar: IndexedDB debe conservarlo
  await page.reload();
  await expect(page.locator('.marca-texto')).toBeVisible();
  const trasRecargar = await page.evaluate(async () => {
    const abrir = () => new Promise((res, rej) => {
      const r = indexedDB.open('nextri-stats');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const db = await abrir();
    return new Promise(res => {
      const req = db.transaction('games', 'readonly').objectStore('games').getAll();
      req.onsuccess = () => res(req.result.length);
    });
  });
  expect(trasRecargar, 'la estadística debe sobrevivir a recargar').toBeGreaterThan(0);

  // Y la pantalla se abre desde el engranaje
  await page.locator('.cabecera [data-accion="abrir-ajustes"]').click();
  await expect(page.locator('#ajustesOverlay')).toHaveClass(/show/);
  await page.locator('[data-accion="abrir-stats"]').click();
  await expect(page.locator('#statsOverlay')).toHaveClass(/show/);
  await expect(page.locator('#statsContenido')).toContainText('Resumen');

  expect(errores).toEqual([]);
});
