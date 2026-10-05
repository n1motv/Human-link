import { expect, test } from '@playwright/test';
import { ACCOUNTS, ADMIN_TOTP_SECRET, acceptFirst, enterCode, fillCredentials, login, nextMonthDays, sessionFor, submitLeave, totp } from './helpers';

// Parcours clés, du plus simple au plus complet. Ils s'enchaînent sur la même base (voir playwright.e2e.config.ts).

test('1. connexion : mauvais mot de passe refusé, bon mot de passe accueilli', async ({ page }) => {
  await fillCredentials(page, ACCOUNTS.employee, 'mauvais-mot-de-passe');
  await expect(page.getByRole('alert')).toContainText(/identifiants invalides/i);
  await expect(page).toHaveURL(/\/login/);

  await login(page, 'employee');
  await expect(page.getByRole('heading', { name: /Bonjour Sofia/ })).toBeVisible();
});

test('2. double authentification : un code périmé est refusé, le bon ouvre le tableau de bord administrateur', async ({ page }) => {
  await fillCredentials(page, ACCOUNTS.admin);
  await enterCode(page, totp(ADMIN_TOTP_SECRET, Date.now() - 10 * 60_000)); // code d'il y a 10 minutes
  await expect(page.getByRole('alert')).toContainText(/Code invalide ou expiré/);
  await expect(page).toHaveURL(/\/login/);

  await login(page, 'admin');
  await expect(page.getByRole('navigation').first()).toBeVisible();
});

test("3. congé : demandé par l'employée, accepté par le manager puis par l'administrateur", async ({ browser }) => {
  const [from, to] = nextMonthDays([0, 1]);
  const employee = await sessionFor(browser, 'employee');
  await submitLeave(employee, from!, to!);
  await expect(employee.getByText('En attente').first()).toBeVisible();

  await acceptFirst(await sessionFor(browser, 'manager'), '/manager/leaves', 'Sofia Lopez');
  await acceptFirst(await sessionFor(browser, 'admin'), '/admin/leaves', 'Sofia Lopez');

  await employee.goto('/me/leaves');
  await expect(employee.getByText('Accepté').first()).toBeVisible();
  await expect(employee.getByText('En attente')).toHaveCount(0);
});

test("4. congé refusé par le manager : le motif est exigé, puis visible par l'employée", async ({ browser }) => {
  const [from, to] = nextMonthDays([14, 15]);
  const employee = await sessionFor(browser, 'employee');
  await submitLeave(employee, from!, to!);

  const manager = await sessionFor(browser, 'manager');
  await manager.goto('/manager/leaves');
  await manager.getByRole('button', { name: 'Refuser' }).first().click();
  const dialog = manager.getByRole('dialog', { name: 'Refuser la demande' });
  await expect(dialog.getByRole('button', { name: 'Refuser' })).toBeDisabled(); // pas de refus sans motif
  await dialog.getByRole('textbox').fill('Période de clôture : merci de décaler.');
  await dialog.getByRole('button', { name: 'Refuser' }).click();
  await expect(manager.getByText('Décision enregistrée.')).toBeVisible();

  await employee.goto('/me/leaves');
  await expect(employee.getByText('Refusé').first()).toBeVisible();
  await expect(employee.getByText('Période de clôture : merci de décaler.')).toBeVisible();
});

test("5. droits : sans connexion on est renvoyé à la connexion, un employé n'accède ni aux pages ni à l'API d'administration", async ({ page }) => {
  await page.goto('/me');
  await expect(page).toHaveURL(/\/login/);

  await login(page, 'employee');
  await page.goto('/admin/employees');
  await expect(page).not.toHaveURL(/\/admin/); // renvoyé vers son espace
  expect((await page.request.get('/api/users')).status()).toBe(403);
  expect((await page.request.get('/api/rgpd/audit')).status()).toBe(403);
  expect((await page.request.get('/api/documents/user/000000000000000000000000')).status()).toBe(403);

  const csrf = (await page.context().cookies()).find((c) => c.name === 'hl_csrf')?.value ?? '';
  await page.request.post('/api/auth/logout', { headers: { 'X-CSRF-Token': csrf } });
  expect((await page.request.get('/api/leaves/mine')).status()).toBe(401);
});

test("6. administration : recherche d'un employé côté serveur, puis rattachement à un manager", async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/admin/employees');
  await expect(page.getByText('Haddad')).toBeVisible();
  await page.getByPlaceholder('Rechercher…').fill('Lopez');
  await expect(page.getByText('Haddad')).toHaveCount(0);
  await expect(page.getByText('Lopez').first()).toBeVisible();

  await page.goto('/admin/org');
  await page.getByRole('combobox', { name: 'Manager', exact: true }).click();
  await page.getByRole('option', { name: /Karim Bernard/ }).click();
  const supervised = page.getByRole('combobox', { name: /Personne supervisée/ });
  await supervised.click();
  await supervised.fill('Hadd'); // la liste est filtrée par le serveur au fil de la frappe
  await page.getByRole('option', { name: /Nadia Haddad/ }).click();
  await page.getByRole('button', { name: 'Assigner' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Nadia Haddad/)).toBeVisible(); // la confirmation nomme les deux personnes
  await dialog.getByRole('button', { name: 'Assigner' }).click();
  await expect(page.getByText(/Nadia Haddad/).first()).toBeVisible();
});
