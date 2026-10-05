import { expect, test } from '@playwright/test';
import { settle, setup } from './fixtures';

/** Trois pages clés, chacune en thème sombre et clair : connexion, accueil employé, demandes de congés d'un manager. */
const PAGES = [
  { name: 'connexion', path: '/login', role: null, ready: 'Bon retour parmi nous' },
  { name: 'accueil-employe', path: '/me', role: 'employe', ready: 'Bonjour Sofia' },
  { name: 'demandes-manager', path: '/manager/leaves', role: 'manager', ready: "Congés de l'équipe" },
] as const;

for (const theme of ['dark', 'light'] as const) {
  for (const p of PAGES) {
    test(`${p.name} (${theme})`, async ({ page }) => {
      await setup(page, { role: p.role, theme });
      await page.goto(p.path);
      await expect(page.getByRole('heading', { name: new RegExp(p.ready) }).first()).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`${p.name}-${theme}.png`);
    });
  }
}
