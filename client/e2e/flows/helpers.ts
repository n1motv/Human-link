import crypto from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';

export const PASSWORD = 'E2e-Passw0rd-2026!';
/** Même secret que server/src/scripts/e2e-server.ts : on calcule ici les codes que l'application d'authentification afficherait. */
export const ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
export const ACCOUNTS = { admin: 'admin@e2e.test', manager: 'manager@e2e.test', employee: 'employe@e2e.test' } as const;
export type Who = keyof typeof ACCOUNTS;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Code TOTP à 6 chiffres (RFC 6238 : HMAC-SHA1, pas de 30 s). */
export function totp(secret: string, at = Date.now()): string {
  let bits = '';
  for (const c of secret.replace(/=+$/, '')) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = crypto.createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, '0');
}

export async function fillCredentials(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel(/Adresse e-mail/).fill(email);
  await page.getByLabel(/^Mot de passe/).fill(password);
  await page.getByRole('button', { name: /Se connecter/ }).click();
}

export async function enterCode(page: Page, code: string) {
  await expect(page.getByText('Vérification en deux étapes')).toBeVisible();
  await page.getByRole('textbox').first().click();
  await page.keyboard.type(code);
}

/** Connexion complète : jusqu'à l'espace du rôle (2FA comprise pour l'administrateur). */
export async function login(page: Page, who: Who) {
  await fillCredentials(page, ACCOUNTS[who]);
  if (who === 'admin') await enterCode(page, totp(ADMIN_TOTP_SECRET));
  await expect(page).toHaveURL(who === 'admin' ? /\/admin$/ : who === 'manager' ? /\/manager$/ : /\/me$/);
}

/** Ouvre une session neuve (contexte de navigateur séparé) pour une personne : plusieurs rôles peuvent agir dans le même test. */
export async function sessionFor(browser: import('@playwright/test').Browser, who: Who): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await login(page, who);
  return page;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Premier lundi du mois suivant, plus des décalages en jours : des dates toujours futures et ouvrées, quel que soit le jour du test. */
export function nextMonthDays(offsets: number[]): string[] {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const monday = new Date(first.getTime() + ((8 - first.getUTCDay()) % 7) * 86_400_000);
  return offsets.map((o) => iso(new Date(monday.getTime() + o * 86_400_000)));
}

/** Ouvre le premier sélecteur de date encore vide, avance jusqu'au mois voulu et choisit le jour. */
async function pickDay(page: Page, form: Locator, day: string) {
  await form
    .getByRole('button', { name: /Choisir une date/ })
    .first()
    .click();
  const target = page.locator(`[data-iso="${day}"]`);
  for (let i = 0; i < 3 && !(await target.count()); i++) await page.getByRole('button', { name: 'Suivant' }).click();
  await target.click();
}

/** Dépose une demande de congé depuis « Mes congés » (formulaire réel, sélecteur de dates compris). */
export async function submitLeave(page: Page, from: string, to: string) {
  await page.goto('/me/leaves');
  await page.getByRole('button', { name: /Nouvelle demande/ }).click();
  const form = page.getByRole('dialog', { name: /Nouvelle demande/ });
  await pickDay(page, form, from);
  await pickDay(page, form, to);
  await form.getByRole('button', { name: /Envoyer la demande/ }).click();
  await expect(page.getByText('Demande envoyée.')).toBeVisible();
}

/** Accepte la première demande de la liste (manager ou admin) en passant par la fenêtre de confirmation. */
export async function acceptFirst(page: Page, path: string, person: string) {
  await page.goto(path);
  await expect(page.getByText(person).first()).toBeVisible();
  await page.getByRole('button', { name: 'Accepter' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Accepter la demande ?' });
  await expect(dialog.getByText(new RegExp(`La demande de ${person} sera acceptée`))).toBeVisible();
  await dialog.getByRole('button', { name: 'Accepter' }).click();
  await expect(page.getByText('Décision enregistrée.')).toBeVisible();
}
