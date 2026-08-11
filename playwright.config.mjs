// Configuración de la prueba de humo en navegador.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scripts',
  testMatch: '**/*.spec.mjs',
  timeout: 45000,
  fullyParallel: false,
  // El informe 'github' publica cada fallo como anotación del check, que
  // SÍ se puede leer por API aunque los registros del trabajo no sean
  // accesibles. Sin esto, un fallo en CI llega sin ninguna pista.
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    // El juego está bloqueado en vertical: probarlo con proporciones de
    // móvil, que es donde se usa de verdad.
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    baseURL: 'http://127.0.0.1:4173'
  },
  // Servidor estático sobre los archivos reales del repo.
  webServer: {
    command: 'npx --yes http-server . -p 4173 -c-1 --silent',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: true,
    timeout: 60000
  }
});
