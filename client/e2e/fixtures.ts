import type { Page } from '@playwright/test';

/** Logo de test : un SVG en ligne, pour vérifier aussi l'affichage du logo sans dépendre du serveur. */
const LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40"><rect width="40" height="40" rx="10" fill="#8b5cf6"/><text x="52" y="29" font-family="Arial" font-weight="700" font-size="26" fill="#8b5cf6">ACME</text></svg>',
  );

const CONFIG = {
  company: { name: 'Acme', supportEmail: 'rh@acme.test', dpoEmail: 'dpo@acme.test', legalName: 'Acme SAS', address: '1 rue du Test, 75000 Paris' },
  branding: { logoUrl: LOGO, logoOnDarkUrl: LOGO, showName: false, accent: '#8b5cf6', accent2: '#ec4899', defaultTheme: 'dark' },
  i18n: { defaultLanguage: 'fr', languages: ['fr', 'en'] },
  modules: { leaves: true, sickLeaves: true, bonuses: true, telework: true, meetings: true, vault: true, feedback: true, contact: true, chatbot: false, orgChart: true },
  hr: { minimumAge: 17, workingDays: [1, 2, 3, 4, 5] },
  security: { passwordMinLength: 12, require2faForRoles: ['admin'] },
  gdpr: { auditLogRetentionDays: 365, notificationRetentionDays: 90, contactRequestRetentionDays: 365, feedbackRetentionMonths: 24, departedEmployeeRetentionYears: 5 },
};

type Role = 'employe' | 'manager';

const user = (role: Role) => ({
  id: role === 'manager' ? 'u-manager' : 'u-employee',
  matricule: role === 'manager' ? '000102M' : '000104E',
  nom: role === 'manager' ? 'Bernard' : 'Lopez',
  prenom: role === 'manager' ? 'Karim' : 'Sofia',
  email: role === 'manager' ? 'karim@acme.test' : 'sofia@acme.test',
  role,
  status: 'active',
  isDirector: false,
  poste: role === 'manager' ? 'Responsable technique' : 'Développeuse',
  departement: 'Technique',
  soldeConge: 17,
  teleworkMax: 2,
  twoFactor: { enabled: false },
});

const brief = (id: string, prenom: string, nom: string) => ({ id, prenom, nom, departement: 'Technique' });
const leave = (id: string, who: ReturnType<typeof brief>, over: Record<string, unknown>) => ({
  id,
  userId: who.id,
  user: who,
  raison: 'annual',
  nombreJours: 3,
  statut: 'en attente',
  statutManager: 'en attente',
  statutAdmin: 'en attente',
  createdAt: '2026-10-01T09:00:00Z',
  ...over,
});

const LEAVES_MINE = [
  leave('m1', brief('u-employee', 'Sofia', 'Lopez'), {
    raison: 'travel',
    dateDebut: '2026-10-27',
    dateFin: '2026-10-30',
    nombreJours: 4,
    statut: 'accepte',
    statutManager: 'accepte',
    statutAdmin: 'accepte',
  }),
  leave('m2', brief('u-employee', 'Sofia', 'Lopez'), { dateDebut: '2026-11-16', dateFin: '2026-11-18' }),
];
const TEAM_PENDING = [
  leave('t1', brief('u1', 'Sofia', 'Lopez'), { raison: 'personal', description: 'Déménagement.', dateDebut: '2026-11-14', dateFin: '2026-11-15', nombreJours: 1 }),
  leave('t2', brief('u2', 'Nadia', 'Haddad'), { dateDebut: '2026-10-17', dateFin: '2026-10-21' }),
  leave('t3', brief('u3', 'Luca', 'Rossi'), { dateDebut: '2026-11-02', dateFin: '2026-11-06', nombreJours: 5 }),
];

/** Route (sans le préfixe /api) → réponse. Toute autre requête répond 404 : un appel imprévu se voit tout de suite. */
function routes(role: Role | null): Record<string, unknown> {
  const base: Record<string, unknown> = { '/config': CONFIG, '/auth/csrf': { ok: true } };
  if (!role) return base;
  const me = user(role);
  return {
    ...base,
    '/auth/me': { user: me, pending2fa: false },
    '/users/me/profile': { user: me },
    '/notifications/unread-count': { unread: 2 },
    '/notifications': { items: [], unread: 2 },
    '/leaves/mine': { items: LEAVES_MINE },
    '/telework/next-week': { days: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'], chosen: ['2026-10-12', '2026-10-15'], max: 2 },
    '/meetings/invitations': {
      items: [{ id: 'i1', status: 'en attente', dateTime: '2026-10-09T14:00:00Z', title: 'Revue de sprint', organizer: { nom: 'Bernard', prenom: 'Karim' } }],
    },
    '/leaves?statut=en%20attente': { items: TEAM_PENDING },
  };
}

/** Simule l'API (aucun serveur) et fige l'heure au lundi 5 octobre 2026, 10 h UTC. */
export async function setup(page: Page, opts: { role: Role | null; theme: 'dark' | 'light' }) {
  const table = routes(opts.role);
  await page.clock.setFixedTime(new Date('2026-10-05T10:00:00Z'));
  await page.addInitScript((theme: string) => {
    localStorage.setItem('hl_theme', theme);
    localStorage.setItem('hl_lang', 'fr');
  }, opts.theme);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    const body = table[path + url.search] ?? table[path];
    if (body === undefined) {
      const unauthenticated = !opts.role && path === '/auth/me';
      await route.fulfill({ status: unauthenticated ? 401 : 404, json: { error: { code: unauthenticated ? 'UNAUTHENTICATED' : 'NOT_FOUND', message: path } } });
      return;
    }
    await route.fulfill({ json: body, headers: { 'set-cookie': 'hl_csrf=test; Path=/' } });
  });
}

/** Attend que la page soit stable : polices chargées, requêtes terminées, animations d'entrée finies. */
export async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}
