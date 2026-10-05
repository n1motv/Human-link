import { defineConfig, devices } from '@playwright/test';

/**
 * Tests visuels : captures de pages clés comparées à des images de référence (e2e/__screenshots__).
 * L'API est simulée (e2e/fixtures.ts) et l'heure figée : aucune base de données ni serveur, résultats déterministes.
 *
 *   npm run test:visual              compare ; un écart échoue et produit une image « diff »
 *   npm run test:visual:update       réécrit les références après un changement voulu
 *
 * Les rendus dépendent du système (polices, anticrénelage) : les références portent le nom de la plateforme
 * (…-win32.png, …-linux.png). Sous Windows avec Chrome installé : PW_CHANNEL=chrome. Les références Linux de la CI
 * se génèrent avec le workflow « Mettre à jour les captures visuelles » (voir docs/DEVELOPPEMENT.md).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.003, animations: 'disabled', caret: 'hide' } },
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1280, height: 800 }, locale: 'fr-FR', timezoneId: 'UTC' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, channel: process.env.PW_CHANNEL || undefined } }],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
