import { defineConfig, devices } from '@playwright/test';

/**
 * Parcours de bout en bout (e2e/flows) : un vrai navigateur, la vraie application (front compilé + API) et une base MongoDB jetable.
 * Rien n'est simulé, contrairement aux tests visuels (playwright.config.ts). Lancer : npm run test:e2e
 * (sous Windows avec Chrome installé : PW_CHANNEL=chrome npm run test:e2e).
 */
export default defineConfig({
  testDir: 'e2e/flows',
  // Les parcours partagent une même base et s'enchaînent : un seul à la fois, dans l'ordre des fichiers.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4100',
    locale: 'fr-FR',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined } }],
  webServer: {
    // Compile le front, puis lance le serveur de test (base en mémoire, quatre comptes).
    command: 'npm run build && npm --prefix ../server run e2e:server',
    url: 'http://localhost:4100/api/health',
    reuseExistingServer: false, // une base neuve à chaque lancement : les parcours supposent un état de départ connu
    timeout: 240_000,
  },
});
