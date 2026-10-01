export type Role = 'admin' | 'manager' | 'employe';
export type Decision = 'en attente' | 'accepte' | 'refuse';

export interface PublicConfig {
  company: { name: string; supportEmail: string; dpoEmail: string; legalName: string; address: string };
  branding: { logoUrl: string; logoOnDarkUrl: string; showName: boolean; accent: string; accent2: string; defaultTheme: 'dark' | 'light' };
  i18n: { defaultLanguage: string; languages: string[] };
  modules: {
    leaves: boolean;
    sickLeaves: boolean;
    bonuses: boolean;
    telework: boolean;
    meetings: boolean;
    vault: boolean;
    feedback: boolean;
    contact: boolean;
    chatbot: boolean;
    orgChart: boolean;
  };
  hr: { minimumAge: number; workingDays: number[] };
  security: { passwordMinLength: number; require2faForRoles: Role[] };
  gdpr: {
    auditLogRetentionDays: number;
    notificationRetentionDays: number;
    contactRequestRetentionDays: number;
    feedbackRetentionMonths: number;
    departedEmployeeRetentionYears: number;
  };
}

export interface User {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  email: string;
  role: Role;
  status: 'invited' | 'active' | 'archived' | 'anonymized';
  isDirector: boolean;
  poste?: string;
  departement?: string;
  sexe?: 'Homme' | 'Femme';
  dateNaissance?: string;
  nationalite?: string;
  pays?: string;
  ville?: string;
  codePostal?: string;
  adresse?: string;
  telephone?: string;
  numeroSecu?: string;
  salaire?: number;
  dateEmbauche?: string;
  typeContrat?: 'CDI' | 'CDD' | 'Alternance' | 'Stage' | 'Freelance';
  soldeConge: number;
  teleworkMax: number;
  photoFileId?: string;
  twoFactor?: { enabled: boolean };
}

export interface Brief {
  id: string;
  nom: string;
  prenom: string;
  email?: string;
  departement?: string;
  poste?: string;
  photoFileId?: string;
}

export interface Leave {
  id: string;
  userId: string;
  user?: Brief | null;
  raison: string;
  dateDebut: string;
  dateFin: string;
  nombreJours: number;
  description?: string;
  statut: Decision;
  statutManager: Decision;
  statutAdmin: Decision;
  motifRefus?: string;
  attachmentFileId?: string;
  createdAt: string;
}

export interface Sick {
  id: string;
  userId: string;
  user?: Brief | null;
  typeMaladie: 'justifie' | 'non justifie';
  dateDebut: string;
  dateFin: string;
  description?: string;
  statut: Decision;
  motifRefus?: string;
  attachmentFileId?: string;
  createdAt: string;
}

export interface Bonus {
  id: string;
  employe?: Brief | null;
  manager?: Brief | null;
  montant: number;
  motif: string;
  statut: Decision;
  motifRefus?: string;
  createdAt: string;
}

export interface Notif {
  id: string;
  type: string;
  key?: string;
  params?: Record<string, string | number>;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface VaultFile {
  id: string;
  category: 'bulletin' | 'contrat' | 'autre';
  label: string;
  month?: number;
  year?: number;
  size: number;
  createdAt: string;
}

export interface CalendarEvent {
  kind: 'leave' | 'sick' | 'telework' | 'meeting';
  title: string;
  start: string;
  end: string;
  time?: string;
}
