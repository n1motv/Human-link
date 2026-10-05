/**
 * Contrat de données partagé entre le serveur et le client : listes de valeurs, schémas zod des corps de requête
 * et des réponses de l'API, et les types TypeScript qui en découlent.
 *
 * Les schémas sont fabriqués avec l'instance de zod de celui qui les importe (`createSchemas(z)`) : serveur et client
 * ont chacun leur copie de zod, et deux copies ne se reconnaissent pas entre elles (instanceof, types). Ce paquet n'importe donc
 * zod que pour ses types, et ne contient aucun code propre à Node ou au navigateur.
 *
 * Les réponses sont décrites avec les champs sur lesquels le client s'appuie ; les champs en plus sont tolérés.
 * Le serveur vérifie ces schémas contre ses vraies réponses (server/tests/contract.test.ts) : une divergence fait échouer les tests.
 */
import type * as zod from 'zod';

export type Zod = typeof zod.z;

export const ROLES = ['admin', 'manager', 'employe'] as const;
export const CONTRACTS = ['CDI', 'CDD', 'Alternance', 'Stage', 'Freelance'] as const;
export const USER_STATUSES = ['invited', 'active', 'archived', 'anonymized'] as const;
export const DECISIONS = ['en attente', 'accepte', 'refuse'] as const;
export const SICK_TYPES = ['justifie', 'non justifie'] as const;
export const VAULT_CATEGORIES = ['bulletin', 'contrat', 'autre'] as const;
export const EVENT_KINDS = ['leave', 'sick', 'telework', 'meeting'] as const;

export function createSchemas(z: Zod) {
  const role = z.enum(ROLES);
  const decision = z.enum(DECISIONS);
  /** Les dates métier sont des chaînes AAAA-MM-JJ : pas de fuseau horaire, comparables lexicographiquement. */
  const dateOnly = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
    .refine((s) => {
      const d = new Date(`${s}T00:00:00.000Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, 'Date invalide');
  const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identifiant invalide');
  const email = z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim());

  // --- Corps de requête ---
  const loginBody = z.object({ email, password: z.string().min(1).max(200) });
  const twoFactorBody = z.object({ challenge: z.string().max(2000), code: z.string().min(6).max(20) });
  const leaveCreateBody = z.object({
    raison: z.string().trim().min(1).max(120),
    dateDebut: dateOnly,
    dateFin: dateOnly,
    description: z.string().trim().max(2000).optional(),
  });
  const leaveDecisionBody = z.object({ decision: z.enum(['accepte', 'refuse']), motifRefus: z.string().trim().min(1).max(1000).optional() });

  // --- Réponses ---
  const brief = z.object({
    id: z.string(),
    nom: z.string(),
    prenom: z.string(),
    email: z.string().optional(),
    departement: z.string().optional(),
    poste: z.string().optional(),
    photoFileId: z.string().optional(),
  });

  const user = z.object({
    id: z.string(),
    matricule: z.string(),
    nom: z.string(),
    prenom: z.string(),
    email: z.string(),
    role,
    status: z.enum(USER_STATUSES),
    isDirector: z.boolean(),
    poste: z.string().optional(),
    departement: z.string().optional(),
    sexe: z.enum(['Homme', 'Femme']).optional(),
    dateNaissance: z.string().optional(),
    nationalite: z.string().optional(),
    pays: z.string().optional(),
    ville: z.string().optional(),
    codePostal: z.string().optional(),
    adresse: z.string().optional(),
    telephone: z.string().optional(),
    numeroSecu: z.string().optional(),
    salaire: z.number().optional(),
    dateEmbauche: z.string().optional(),
    typeContrat: z.enum(CONTRACTS).optional(),
    soldeConge: z.number(),
    teleworkMax: z.number(),
    photoFileId: z.string().optional(),
    twoFactor: z.object({ enabled: z.boolean() }).optional(),
  });

  /** Ligne de la liste des employés : une vue réduite de la fiche (sans coordonnées, salaire ni soldes). */
  const userRow = user.pick({
    id: true,
    matricule: true,
    nom: true,
    prenom: true,
    email: true,
    role: true,
    poste: true,
    departement: true,
    status: true,
    isDirector: true,
    typeContrat: true,
    dateEmbauche: true,
    photoFileId: true,
    twoFactor: true,
  });

  const leave = z.object({
    id: z.string(),
    userId: z.string(),
    user: brief.nullish(),
    raison: z.string(),
    dateDebut: dateOnly,
    dateFin: dateOnly,
    nombreJours: z.number(),
    description: z.string().optional(),
    statut: decision,
    statutManager: decision,
    statutAdmin: decision,
    motifRefus: z.string().optional(),
    attachmentFileId: z.string().optional(),
    createdAt: z.string(),
  });

  const sick = z.object({
    id: z.string(),
    userId: z.string(),
    user: brief.nullish(),
    typeMaladie: z.enum(SICK_TYPES),
    dateDebut: dateOnly,
    dateFin: dateOnly,
    description: z.string().optional(),
    statut: decision,
    motifRefus: z.string().optional(),
    attachmentFileId: z.string().optional(),
    createdAt: z.string(),
  });

  const bonus = z.object({
    id: z.string(),
    employe: brief.nullish(),
    manager: brief.nullish(),
    montant: z.number(),
    motif: z.string(),
    statut: decision,
    motifRefus: z.string().optional(),
    createdAt: z.string(),
  });

  const notif = z.object({
    id: z.string(),
    type: z.string(),
    key: z.string().optional(),
    params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    message: z.string(),
    isRead: z.boolean(),
    createdAt: z.string(),
  });

  const vaultFile = z.object({
    id: z.string(),
    category: z.enum(VAULT_CATEGORIES),
    label: z.string(),
    month: z.number().optional(),
    year: z.number().optional(),
    size: z.number(),
    createdAt: z.string(),
  });

  const calendarEvent = z.object({
    kind: z.enum(EVENT_KINDS),
    title: z.string(),
    start: z.string(),
    end: z.string(),
    time: z.string().optional(),
  });

  const publicConfig = z.object({
    company: z.object({ name: z.string(), supportEmail: z.string(), dpoEmail: z.string(), legalName: z.string(), address: z.string() }),
    branding: z.object({
      logoUrl: z.string(),
      logoOnDarkUrl: z.string(),
      showName: z.boolean(),
      accent: z.string(),
      accent2: z.string(),
      defaultTheme: z.enum(['dark', 'light']),
    }),
    i18n: z.object({ defaultLanguage: z.string(), languages: z.array(z.string()) }),
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
    hr: z.object({ minimumAge: z.number(), workingDays: z.array(z.number()) }),
    security: z.object({ passwordMinLength: z.number(), require2faForRoles: z.array(role) }),
    gdpr: z.object({
      auditLogRetentionDays: z.number(),
      notificationRetentionDays: z.number(),
      contactRequestRetentionDays: z.number(),
      feedbackRetentionMonths: z.number(),
      departedEmployeeRetentionYears: z.number(),
    }),
  });

  /** Enveloppes de liste : `{ items }`, avec le total quand la liste est paginée. */
  const list = <T extends zod.ZodType>(item: T) => z.object({ items: z.array(item) });
  const page = <T extends zod.ZodType>(item: T) => z.object({ items: z.array(item), total: z.number(), page: z.number() });

  return {
    role,
    decision,
    dateOnly,
    objectId,
    email,
    loginBody,
    twoFactorBody,
    leaveCreateBody,
    leaveDecisionBody,
    brief,
    user,
    userRow,
    leave,
    sick,
    bonus,
    notif,
    vaultFile,
    calendarEvent,
    publicConfig,
    list,
    page,
  };
}

export type Schemas = ReturnType<typeof createSchemas>;
export type Role = (typeof ROLES)[number];
export type Decision = (typeof DECISIONS)[number];
export type User = zod.infer<Schemas['user']>;
export type UserRow = zod.infer<Schemas['userRow']>;
export type Brief = zod.infer<Schemas['brief']>;
export type Leave = zod.infer<Schemas['leave']>;
export type Sick = zod.infer<Schemas['sick']>;
export type Bonus = zod.infer<Schemas['bonus']>;
export type Notif = zod.infer<Schemas['notif']>;
export type VaultFile = zod.infer<Schemas['vaultFile']>;
export type CalendarEvent = zod.infer<Schemas['calendarEvent']>;
export type PublicConfig = zod.infer<Schemas['publicConfig']>;
