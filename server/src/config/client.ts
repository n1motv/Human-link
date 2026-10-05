import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { env } from './env.js';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const schema = z.object({
  company: z.object({
    name: z.string(),
    legalName: z.string(),
    supportEmail: z.string().email(),
    dpoEmail: z.string().email(),
    address: z.string(),
  }),
  branding: z.object({
    /** Logo pour fond clair. */
    logoUrl: z.string(),
    /** Logo pour fond sombre (thème sombre) : généralement la version blanche. */
    logoOnDarkUrl: z.string(),
    /** Afficher le nom de l'entreprise à côté du logo (inutile si le logo contient déjà le nom). */
    showName: z.boolean().default(false),
    accent: hex,
    accent2: hex,
    defaultTheme: z.enum(['dark', 'light']),
  }),
  i18n: z.object({ defaultLanguage: z.string(), languages: z.array(z.string()).min(1) }),
  modules: z.object({
    leaves: z.boolean(),
    sickLeaves: z.boolean(),
    bonuses: z.boolean(),
    telework: z.boolean(),
    meetings: z.boolean(),
    vault: z.boolean(),
    feedback: z.boolean(),
    contact: z.boolean(),
    chatbot: z.boolean(),
    orgChart: z.boolean(),
  }),
  hr: z.object({
    monthlyLeaveAccrual: z.number().min(0),
    workingDays: z.array(z.number().int().min(0).max(6)),
    minimumAge: z.number().int().min(14),
    defaultTeleworkMaxDays: z.number().int().min(0).max(5),
    leaveAttachmentRequiredForReasons: z.array(z.string()),
  }),
  security: z.object({
    passwordMinLength: z.number().int().min(10),
    maxLoginAttempts: z.number().int().min(3),
    lockMinutes: z.number().int().min(1),
    accessTokenMinutes: z.number().int().min(1).max(60),
    refreshTokenDays: z.number().int().min(1).max(30),
    inviteTokenHours: z.number().int().min(1),
    resetTokenMinutes: z.number().int().min(5),
    require2faForRoles: z.array(z.enum(['admin', 'manager', 'employe'])),
    /** Tentatives de connexion échouées tolérées par compte et par adresse IP avant d'imposer un délai. */
    loginFreeAttempts: z.number().int().min(1).max(10).default(5),
    /** Délai imposé après la dernière tentative gratuite ; il double à chaque nouvel échec. */
    loginBaseDelaySeconds: z.number().int().min(1).default(15),
    loginMaxDelayMinutes: z.number().int().min(1).default(15),
    /** Refuser les mots de passe présents dans des fuites publiques (envoie 5 caractères d'une empreinte, jamais le mot de passe). */
    checkPwnedPasswords: z.boolean().default(true),
  }),
  gdpr: z.object({
    auditLogRetentionDays: z.number().int().min(30),
    notificationRetentionDays: z.number().int().min(1),
    contactRequestRetentionDays: z.number().int().min(1),
    feedbackRetentionMonths: z.number().int().min(1),
    departedEmployeeRetentionYears: z.number().int().min(0),
  }),
  notifications: z.object({
    maxPerUser: z.number().int().min(5),
    teleworkReminderCron: z.string(),
    feedbackReminderCron: z.string(),
    monthlyAccrualCron: z.string(),
  }),
});

export type ClientConfig = z.infer<typeof schema>;

function load(): ClientConfig {
  const file = path.resolve(env.CLIENT_DIR, 'client.config.json');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const res = schema.safeParse(raw);
  if (!res.success) {
    const lines = res.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    // eslint-disable-next-line no-console
    console.error(`\nclient.config.json invalide (${file}) :\n${lines.join('\n')}\n`);
    process.exit(1);
  }
  return res.data;
}

export const clientConfig = load();

/** Sous-ensemble exposé au navigateur : jamais de secret, jamais de règles de sécurité sensibles. */
export function publicConfig() {
  const c = clientConfig;
  return {
    company: { name: c.company.name, supportEmail: c.company.supportEmail, dpoEmail: c.company.dpoEmail, legalName: c.company.legalName, address: c.company.address },
    branding: c.branding,
    i18n: c.i18n,
    modules: c.modules,
    hr: { minimumAge: c.hr.minimumAge, workingDays: c.hr.workingDays },
    security: { passwordMinLength: c.security.passwordMinLength, require2faForRoles: c.security.require2faForRoles },
    gdpr: c.gdpr,
  };
}
