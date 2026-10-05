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

/** Nœud de l'organigramme : une personne et ses subordonnés directs. */
export interface OrgNode {
  id: string;
  name: string;
  poste?: string;
  role: string;
  children: OrgNode[];
}

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
  /** Décision sur une demande (congé, arrêt, prime) : un refus doit être motivé. */
  const decisionBody = z.object({ decision: z.enum(['accepte', 'refuse']), motifRefus: z.string().trim().min(1).max(1000).optional() });

  /** Filtre des listes de demandes par statut. */
  const decisionFilterQuery = z.object({ statut: decision.optional() });
  /** Période demandée aux calendriers : deux dates AAAA-MM-JJ. */
  const dateRangeQuery = z.object({ from: dateOnly, to: dateOnly });

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

  // --- Organisation ---
  const orgNode: zod.ZodType<OrgNode> = z.lazy(() => z.object({ id: z.string(), name: z.string(), poste: z.string().optional(), role: z.string(), children: z.array(orgNode) }));
  const orgTree = z.object({
    tree: orgNode.nullable(),
    unassigned: z.array(z.object({ id: z.string(), name: z.string(), poste: z.string().optional() })),
    otherRoots: z.array(orgNode),
  });
  const supervisions = z.object({
    assignments: z.array(z.object({ manager: brief, supervise: brief })),
    director: brief.nullable(),
  });
  const teamMember = z.object({
    id: z.string(),
    matricule: z.string(),
    nom: z.string(),
    prenom: z.string(),
    email: z.string(),
    poste: z.string().optional(),
    departement: z.string().optional(),
    role: role,
    photoFileId: z.string().nullable(),
    teleworkMax: z.number(),
    hasPendingLeave: z.boolean(),
  });

  // --- Tableau de bord, calendriers, télétravail ---
  const adminDashboard = z.object({
    totalEmployees: z.number(),
    totalDepartments: z.number(),
    acceptedLeaves: z.number(),
    averageSalary: z.number(),
    leavesByMonth: z.array(z.number()).length(12),
    byDepartment: z.array(z.object({ name: z.string(), count: z.number() })),
    today: z.object({ onSite: z.number(), remote: z.number(), absent: z.number() }),
    pending: z.object({ leaves: z.number(), sick: z.number(), bonuses: z.number() }),
    viewer: z.string(),
  });
  const person = z.object({ userId: z.string(), nom: z.string(), prenom: z.string(), email: z.string() });
  const leaveCalendarItem = person.extend({ start: dateOnly, end: dateOnly, raison: z.string() });
  const teleworkCalendarItem = person.extend({ date: dateOnly });
  const teleworkWeek = z.object({ days: z.array(dateOnly), chosen: z.array(dateOnly), max: z.number(), isDirector: z.boolean() });

  // --- Réunions ---
  const meetingStatus = z.enum(['Accepted', 'Rejected']);
  const meetingOrganized = z.object({
    id: z.string(),
    title: z.string(),
    dateTime: z.string(),
    status: z.string(),
    invited: z.number(),
    accepted: z.number(),
    rejected: z.number(),
  });
  const meetingInvitation = z.object({
    id: z.string(),
    title: z.string(),
    dateTime: z.string(),
    organizer: brief.nullable(),
    status: z.string(),
  });

  // --- Avis anonymes, contact, journal d'audit, sessions ---
  const feedbackStatus = z.object({ month: z.string(), alreadySubmitted: z.boolean(), criteria: z.array(z.string()) });
  const feedbackResults = z.object({
    month: z.string(),
    total: z.number(),
    averages: z.record(z.string(), z.number()),
    suggestions: z.array(z.string()),
    suggestionsHidden: z.boolean(),
  });
  const contactRequest = z.object({
    id: z.string(),
    userId: z.string().optional(),
    nom: z.string().optional(),
    prenom: z.string().optional(),
    email: z.string(),
    telephone: z.string().optional(),
    sujet: z.string(),
    message: z.string(),
    createdAt: z.string(),
  });
  const auditEntry = z.object({
    id: z.string(),
    actorId: z.string().optional(),
    actorEmail: z.string().optional(),
    action: z.string(),
    targetType: z.string().optional(),
    targetId: z.string().optional(),
    at: z.string(),
  });
  const sessionInfo = z.object({
    id: z.string(),
    browser: z.string(),
    os: z.string(),
    device: z.enum(['desktop', 'mobile', 'tablet']),
    ipMasked: z.string().optional(),
    createdAt: z.string(),
    lastActiveAt: z.string(),
    current: z.boolean(),
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
    decisionBody,
    decisionFilterQuery,
    dateRangeQuery,
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
    orgTree,
    supervisions,
    teamMember,
    adminDashboard,
    leaveCalendarItem,
    teleworkCalendarItem,
    teleworkWeek,
    meetingStatus,
    meetingOrganized,
    meetingInvitation,
    feedbackStatus,
    feedbackResults,
    contactRequest,
    auditEntry,
    sessionInfo,
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
export type OrgTree = zod.infer<Schemas['orgTree']>;
export type Supervisions = zod.infer<Schemas['supervisions']>;
export type AdminDashboard = zod.infer<Schemas['adminDashboard']>;
