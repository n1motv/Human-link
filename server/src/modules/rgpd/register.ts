import { clientConfig } from '../../config/client.js';

/**
 * Registre des activités de traitement (art. 30 RGPD), prêt à montrer. Il décrit ce que FAIT l'application ; les durées de conservation
 * sont celles qui sont réellement appliquées par les tâches de purge (jobs/scheduler.ts), lues dans la configuration du client :
 * le registre ne peut donc pas dire autre chose que le comportement.
 * Les mentions propres au client (finalités complémentaires, sous-traitants d'hébergement) restent à compléter par son DPO.
 */
export interface Treatment {
  id: string;
  name: string;
  purpose: string;
  legalBasis: string;
  dataCategories: string[];
  /** Données de santé ou autres catégories particulières (art. 9). */
  sensitive: boolean;
  recipients: string[];
  retention: string;
  security: string[];
}

const years = (n: number) => `${n} an${n > 1 ? 's' : ''}`;

export function buildRegister() {
  const g = clientConfig.gdpr;
  const c = clientConfig.company;
  const afterDeparture = `Pendant la relation de travail, puis ${years(g.departedEmployeeRetentionYears)} après l'archivage du compte ; le compte est alors anonymisé automatiquement.`;

  const treatments: Treatment[] = [
    {
      id: 'personnel',
      name: 'Gestion administrative du personnel',
      purpose: 'Tenir la fiche de chaque salarié : identité, coordonnées, poste, service, contrat, rémunération.',
      legalBasis: 'Exécution du contrat de travail ; obligations légales de l’employeur.',
      dataCategories: ['Identité', 'Coordonnées', 'Date de naissance', 'Numéro de sécurité sociale', 'Poste, service, type de contrat, date d’embauche', 'Salaire'],
      sensitive: false,
      recipients: ['Administration RH', 'Le salarié concerné', 'Le manager, pour son équipe (sans salaire, numéro de sécurité sociale ni adresse)'],
      retention: afterDeparture,
      security: ['Salaire, numéro de sécurité sociale, adresse et téléphone chiffrés en base (AES-256-GCM)', 'Accès par rôle, chaque consultation d’une fiche tracée'],
    },
    {
      id: 'conges',
      name: 'Congés, télétravail et calendrier',
      purpose: 'Instruire les demandes de congé (validation du manager puis des RH), tenir les soldes, planifier le télétravail et le calendrier d’équipe.',
      legalBasis: 'Exécution du contrat de travail ; obligations légales en matière de congés.',
      dataCategories: ['Dates et motif des congés', 'Soldes', 'Jours de télétravail', 'Réunions (titre, date, invités)'],
      sensitive: false,
      recipients: ['Administration RH', 'Le manager, pour son équipe', 'Le salarié concerné'],
      retention: afterDeparture,
      security: ['Décision, solde et notifications validés ensemble (transaction)', 'Droits vérifiés à chaque requête'],
    },
    {
      id: 'sante',
      name: 'Arrêts maladie',
      purpose: 'Enregistrer les arrêts maladie déclarés par les salariés et leurs justificatifs.',
      legalBasis: 'Obligations légales en droit du travail et de la sécurité sociale ; exécution du contrat de travail.',
      dataCategories: ['Dates d’arrêt', 'Type (justifié ou non)', 'Justificatif (donnée de santé)', 'Description libre'],
      sensitive: true,
      recipients: ['Administration RH uniquement (jamais le manager)', 'Le salarié concerné'],
      retention: `${afterDeparture} À l’anonymisation, justificatifs et descriptions sont effacés ; seules les dates restent, pour les statistiques.`,
      security: ['Justificatifs chiffrés sur disque, contrôle du type réel du fichier, antivirus en option', 'Accès tracé dans le journal d’audit'],
    },
    {
      id: 'primes',
      name: 'Primes',
      purpose: 'Instruire les demandes de prime proposées par les managers.',
      legalBasis: 'Exécution du contrat de travail.',
      dataCategories: ['Bénéficiaire', 'Montant', 'Motif', 'Décision'],
      sensitive: false,
      recipients: ['Administration RH', 'Le manager demandeur', 'Le salarié concerné'],
      retention: afterDeparture,
      security: ['Un manager ne peut proposer une prime que pour son équipe'],
    },
    {
      id: 'coffre',
      name: 'Coffre-fort de documents',
      purpose: 'Remettre aux salariés leurs bulletins de paie, contrats et autres documents.',
      legalBasis: 'Obligations légales de conservation et de remise des bulletins de paie ; exécution du contrat de travail.',
      dataCategories: ['Bulletins de paie', 'Contrats', 'Autres documents déposés par les RH'],
      sensitive: false,
      recipients: ['Administration RH (dépôt)', 'Le salarié concerné (lecture)'],
      retention: afterDeparture,
      security: ['Fichiers chiffrés sur disque sous un nom aléatoire', 'Aucun accès direct : chaque lecture passe par l’API, droits vérifiés et téléchargement tracé'],
    },
    {
      id: 'securite',
      name: 'Comptes, connexions et sécurité',
      purpose: 'Authentifier les utilisateurs, protéger les comptes (double authentification, alertes de nouvel appareil) et lister les appareils connectés.',
      legalBasis: 'Intérêt légitime (sécurité du système d’information) ; obligation de sécurité (art. 32 RGPD).',
      dataCategories: ['Adresse e-mail', 'Mot de passe (haché Argon2id)', 'Empreinte navigateur et système des appareils (jamais l’adresse IP complète)', 'Jetons de session'],
      sensitive: false,
      recipients: ['Le salarié concerné (liste de ses appareils)', 'Administration (réinitialisation de la double authentification)'],
      retention: 'Sessions : 7 jours après la dernière activité. Compte : voir « Gestion administrative du personnel ».',
      security: [
        'Cookies httpOnly, SameSite=Strict',
        'Freinage des tentatives, verrouillage temporaire',
        'Mots de passe comparés aux fuites connues par k-anonymat (aucune donnée personnelle envoyée)',
      ],
    },
    {
      id: 'audit',
      name: 'Journal d’audit',
      purpose: 'Savoir qui a consulté ou modifié quelles données, et quand.',
      legalBasis: 'Intérêt légitime ; obligation de sécurité et de responsabilité (art. 5-2 et 32 RGPD).',
      dataCategories: ['Auteur de l’action (e-mail)', 'Action, personne ou objet concerné', 'Date', 'Empreinte de l’adresse IP et du navigateur'],
      sensitive: false,
      recipients: ['Administration RH'],
      retention: `${g.auditLogRetentionDays} jours, puis suppression automatique.`,
      security: ['Journal en lecture seule pour l’administration', 'Adresse IP conservée sous forme d’empreinte'],
    },
    {
      id: 'notifications',
      name: 'Notifications internes et e-mails de service',
      purpose: 'Informer les personnes des décisions et événements qui les concernent.',
      legalBasis: 'Exécution du contrat de travail ; intérêt légitime.',
      dataCategories: ['Message de notification', 'Adresse e-mail (envoi)'],
      sensitive: false,
      recipients: ['La personne concernée', 'Prestataire d’envoi d’e-mails du client (SMTP)'],
      retention: `Notifications : ${g.notificationRetentionDays} jours. E-mails non délivrés : repris pendant 6 reprises espacées, puis conservés sans leur contenu jusqu’à décision de l’administrateur ; e-mails envoyés : 7 jours, sans contenu.`,
      security: ['Contenu des e-mails en attente chiffré, effacé dès l’envoi'],
    },
    {
      id: 'contact',
      name: 'Demandes de contact',
      purpose: 'Répondre aux messages envoyés par les salariés ou visiteurs via le formulaire de contact.',
      legalBasis: 'Intérêt légitime ; mesures précontractuelles ou exécution du contrat selon la demande.',
      dataCategories: ['Nom, prénom, e-mail, téléphone (facultatifs)', 'Sujet et message'],
      sensitive: false,
      recipients: ['Administration RH'],
      retention: `${g.contactRequestRetentionDays} jours, puis suppression automatique.`,
      security: ['Formulaire limité en débit, piège contre les robots'],
    },
    {
      id: 'feedback',
      name: 'Avis anonymes',
      purpose: 'Mesurer chaque mois le climat de travail par des notes et des suggestions.',
      legalBasis: 'Intérêt légitime ; participation volontaire.',
      dataCategories: ['Notes de 1 à 5', 'Suggestion libre (non rattachée à une personne)'],
      sensitive: false,
      recipients: ['Administration RH, en résultats agrégés'],
      retention: `${g.feedbackRetentionMonths} mois, puis suppression automatique.`,
      security: ['Aucun lien entre l’avis et son auteur', 'Sous 3 réponses, les suggestions libres ne sont pas affichées (ré-identification)'],
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    controller: { name: c.legalName || c.name, address: c.address, dpoEmail: c.dpoEmail, supportEmail: c.supportEmail },
    retention: {
      departedEmployeeYears: g.departedEmployeeRetentionYears,
      auditLogDays: g.auditLogRetentionDays,
      notificationDays: g.notificationRetentionDays,
      contactRequestDays: g.contactRequestRetentionDays,
      feedbackMonths: g.feedbackRetentionMonths,
    },
    treatments,
    processors: [
      { name: 'Hébergeur du serveur du client', role: 'Héberge l’application, la base de données et les fichiers (à compléter par le client).' },
      { name: 'Prestataire d’envoi d’e-mails (SMTP)', role: 'Achemine les e-mails de service (activation, notifications) ; configuré par le client.' },
    ],
    transfers:
      'L’application n’envoie aucune donnée personnelle hors du serveur du client. Seule exception technique : la vérification des mots de passe contre les fuites connues (Have I Been Pwned) n’envoie qu’un préfixe de 5 caractères d’une empreinte, sans lien avec une personne ; désactivable (HIBP_ENABLED=false).',
    rights:
      'Les salariés exercent leurs droits d’accès et de portabilité depuis leur espace (« Mes données »). L’administration RH peut exporter un dossier complet pour une demande reçue par courrier (page Conformité). Effacement : archivage puis anonymisation.',
  };
}
