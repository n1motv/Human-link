export type Lang = 'fr' | 'en' | 'es' | 'it' | 'ar';
export const LANGS: Lang[] = ['fr', 'en', 'es', 'it', 'ar'];

export const INTENTS = [
  'matricule',
  'name',
  'age',
  'birthdate',
  'poste',
  'departement',
  'salaire',
  'social_security',
  'telephone',
  'adresse',
  'date_embauche',
  'type_contrat',
  'solde',
  'conge',
  'arret',
  'teletravail',
  'prime',
  'notification',
  'manager',
] as const;
export type Intent = (typeof INTENTS)[number];

/** Intents dont la réponse contient une donnée sensible : jamais transmis à un LLM externe, toujours résolus localement. */
export const SENSITIVE: Intent[] = ['salaire', 'social_security', 'telephone', 'adresse'];

/**
 * Mots-clés par intention et par langue (sans accents, minuscules). L'ordre de INTENTS fait office de priorité.
 * Ajouter une langue ou un synonyme = ajouter une entrée ici, rien d'autre.
 */
export const KEYWORDS: Record<Intent, Record<Lang, string[]>> = {
  matricule: {
    fr: ['matricule', 'identifiant'],
    en: ['employee id', 'matricule', 'my id', 'identifier'],
    es: ['matricula', 'identificador', 'mi id'],
    it: ['matricola', 'identificativo', 'il mio id'],
    ar: ['رقم الموظف', 'معرف', 'الرقم الوظيفي'],
  },
  name: {
    fr: ['mon nom', 'prenom', "m'appelle", 'je m appelle', 'comment je'],
    en: ['my name', 'first name', 'last name', 'who am i'],
    es: ['mi nombre', 'me llamo', 'apellido'],
    it: ['il mio nome', 'mi chiamo', 'cognome'],
    ar: ['اسمي', 'ما اسمي', 'الاسم'],
  },
  age: {
    fr: ['mon age', 'quel age', 'quel age ai-je', 'ans ai-je'],
    en: ['my age', 'how old'],
    es: ['mi edad', 'cuantos anos'],
    it: ['la mia eta', 'quanti anni'],
    ar: ['عمري', 'كم عمري'],
  },
  birthdate: { fr: ['naissance', 'anniversaire'], en: ['birth', 'birthday'], es: ['nacimiento', 'cumpleanos'], it: ['nascita', 'compleanno'], ar: ['ميلاد', 'تاريخ الولادة'] },
  poste: {
    fr: ['poste', 'fonction', 'mon role', 'mon job'],
    en: ['job title', 'position', 'my job', 'my role'],
    es: ['puesto', 'cargo', 'mi trabajo'],
    it: ['posizione', 'mansione', 'il mio lavoro', 'ruolo'],
    ar: ['وظيفتي', 'منصبي'],
  },
  departement: { fr: ['departement', 'service', 'pole'], en: ['department', 'team name'], es: ['departamento'], it: ['dipartimento', 'reparto'], ar: ['قسمي', 'القسم'] },
  salaire: {
    fr: ['salaire', 'remuneration', 'paie', 'brut'],
    en: ['salary', 'pay', 'wage', 'compensation'],
    es: ['salario', 'sueldo', 'remuneracion'],
    it: ['stipendio', 'salario', 'retribuzione'],
    ar: ['راتبي', 'الراتب', 'أجري'],
  },
  social_security: {
    fr: ['securite sociale', 'numero secu', 'nss'],
    en: ['social security', 'ssn'],
    es: ['seguridad social', 'numero de seguridad'],
    it: ['previdenza', 'sicurezza sociale', 'codice fiscale'],
    ar: ['الضمان الاجتماعي'],
  },
  telephone: {
    fr: ['telephone', 'portable', 'mobile', 'numero de tel'],
    en: ['phone', 'mobile number', 'telephone'],
    es: ['telefono', 'movil'],
    it: ['telefono', 'cellulare'],
    ar: ['هاتفي', 'رقم الهاتف'],
  },
  adresse: { fr: ['adresse', 'domicile'], en: ['address', 'home'], es: ['direccion', 'domicilio'], it: ['indirizzo', 'domicilio'], ar: ['عنواني', 'العنوان'] },
  date_embauche: {
    fr: ['embauche', 'recrute', 'arrive'],
    en: ['hire date', 'hired', 'start date', 'joined'],
    es: ['contratacion', 'contratado', 'fecha de alta'],
    it: ['assunzione', 'assunto'],
    ar: ['تعييني', 'تاريخ التعيين'],
  },
  type_contrat: { fr: ['contrat', 'cdi', 'cdd'], en: ['contract'], es: ['contrato'], it: ['contratto'], ar: ['عقدي', 'نوع العقد'] },
  solde: {
    fr: ['solde', 'combien de jours', 'jours restants', 'jours de conge'],
    en: ['balance', 'days left', 'remaining days', 'how many days'],
    es: ['saldo', 'dias restantes', 'cuantos dias'],
    it: ['saldo', 'giorni rimasti', 'quanti giorni'],
    ar: ['رصيد', 'الأيام المتبقية'],
  },
  conge: {
    fr: ['conge', 'vacances'],
    en: ['leave', 'vacation', 'holiday', 'time off'],
    es: ['vacaciones', 'permiso', 'licencia'],
    it: ['ferie', 'permesso', 'congedo', 'vacanza'],
    ar: ['إجازة', 'اجازة', 'عطلة'],
  },
  arret: { fr: ['arret', 'maladie'], en: ['sick', 'sickness', 'medical leave'], es: ['baja', 'enfermedad'], it: ['malattia', 'certificato medico'], ar: ['مرض', 'إجازة مرضية'] },
  teletravail: {
    fr: ['teletravail', 'travail a distance', 'remote'],
    en: ['telework', 'remote', 'work from home', 'wfh'],
    es: ['teletrabajo', 'trabajo remoto'],
    it: ['telelavoro', 'smart working', 'lavoro da remoto'],
    ar: ['العمل عن بعد'],
  },
  prime: { fr: ['prime', 'bonus', 'gratification'], en: ['bonus'], es: ['prima', 'bono'], it: ['premio', 'bonus'], ar: ['علاوة', 'مكافأة'] },
  notification: {
    fr: ['notification', 'notif', 'non lues'],
    en: ['notification', 'unread'],
    es: ['notificacion', 'no leidas'],
    it: ['notifica', 'non lette'],
    ar: ['إشعار', 'اشعارات'],
  },
  manager: {
    fr: ['manager', 'responsable', 'superieur', 'chef', 'boss'],
    en: ['manager', 'supervisor', 'boss'],
    es: ['jefe', 'supervisor', 'gerente'],
    it: ['responsabile', 'capo', 'supervisore'],
    ar: ['مديري', 'المدير', 'رئيسي'],
  },
};

export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").trim();
}

/** Langue la plus probable d'après les mots-clés reconnus ; à égalité on garde la langue de l'interface. */
export function detectLang(question: string, uiLang: Lang): Lang {
  const q = ` ${normalize(question)} `;
  if (/[؀-ۿ]/.test(q)) return 'ar';
  let best: Lang = uiLang;
  let bestScore = 0;
  for (const lang of LANGS) {
    let score = 0;
    for (const intent of INTENTS) for (const kw of KEYWORDS[intent][lang]) if (q.includes(kw)) score++;
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  return best;
}

export function detectIntent(question: string): Intent | null {
  const q = ` ${normalize(question)} `;
  for (const intent of INTENTS) {
    for (const lang of LANGS) {
      if (KEYWORDS[intent][lang].some((kw) => q.includes(kw))) return intent;
    }
  }
  return null;
}
