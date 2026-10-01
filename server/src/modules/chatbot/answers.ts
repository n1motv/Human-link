import type { Lang } from './intents.js';

interface Answers {
  unknown(): string;
  matricule(v: string): string;
  name(prenom: string, nom: string): string;
  age(n: number): string;
  birthdate(d: string): string;
  poste(v: string): string;
  departement(v: string): string;
  salaire(n: number): string;
  secu(v: string): string;
  telephone(v: string): string;
  adresse(v: string): string;
  embauche(d: string): string;
  contrat(v: string): string;
  solde(n: number): string;
  conges(l: { from: string; to: string; statut: string; raison: string }[]): string;
  noLeave(): string;
  arrets(l: { from: string; to: string; statut: string }[]): string;
  noSick(): string;
  telework(d: string[]): string;
  noTelework(): string;
  primes(l: { montant: number; statut: string }[]): string;
  noBonus(): string;
  notifs(m: string[]): string;
  noNotifs(): string;
  manager(n: string): string;
  noManager(): string;
}

const STATUT: Record<Lang, Record<string, string>> = {
  fr: { 'en attente': 'en attente', accepte: 'accepté', refuse: 'refusé' },
  en: { 'en attente': 'pending', accepte: 'approved', refuse: 'rejected' },
  es: { 'en attente': 'pendiente', accepte: 'aprobado', refuse: 'rechazado' },
  it: { 'en attente': 'in attesa', accepte: 'approvato', refuse: 'rifiutato' },
  ar: { 'en attente': 'قيد الانتظار', accepte: 'مقبول', refuse: 'مرفوض' },
};
const st = (lang: Lang, s: string) => STATUT[lang][s] ?? s;

const list = (items: string[]) => items.map((i) => `• ${i}`).join('\n');

export const T: Record<Lang, Answers> = {
  fr: {
    unknown: () => "Désolé, je n'ai pas accès à cette information. Essayez par exemple : « Quel est mon solde de congés ? »",
    matricule: (v) => `Votre matricule est ${v}.`,
    name: (p, n) => `Vous vous appelez ${p} ${n}.`,
    age: (n) => `Vous avez ${n} ans.`,
    birthdate: (d) => `Vous êtes né(e) le ${d}.`,
    poste: (v) => `Votre poste : ${v}.`,
    departement: (v) => `Votre département : ${v}.`,
    salaire: (n) => `Votre salaire est de ${n} € brut mensuel.`,
    secu: (v) => `Votre numéro de sécurité sociale : ${v}.`,
    telephone: (v) => `Votre numéro de téléphone : ${v}.`,
    adresse: (v) => `Votre adresse : ${v}.`,
    embauche: (d) => `Vous avez été embauché(e) le ${d}.`,
    contrat: (v) => `Votre contrat est un ${v}.`,
    solde: (n) => `Il vous reste ${n} jour(s) de congé.`,
    conges: (l) => `Vos congés :\n${list(l.map((c) => `du ${c.from} au ${c.to} (${c.raison}) — ${st('fr', c.statut)}`))}`,
    noLeave: () => "Vous n'avez déposé aucun congé.",
    arrets: (l) => `Vos arrêts maladie :\n${list(l.map((a) => `du ${a.from} au ${a.to} — ${st('fr', a.statut)}`))}`,
    noSick: () => "Vous n'avez aucun arrêt maladie.",
    telework: (d) => `Vos prochains jours de télétravail : ${d.join(', ')}.`,
    noTelework: () => 'Aucun jour de télétravail à venir.',
    primes: (l) => `Vos primes :\n${list(l.map((p) => `${p.montant} € — ${st('fr', p.statut)}`))}`,
    noBonus: () => 'Aucune prime enregistrée.',
    notifs: (m) => `Notifications non lues :\n${list(m)}`,
    noNotifs: () => 'Aucune notification non lue.',
    manager: (n) => `Votre manager est ${n}.`,
    noManager: () => 'Aucun manager ne vous est assigné.',
  },
  en: {
    unknown: () => "Sorry, I don't have access to that information. Try for example: \"What is my leave balance?\"",
    matricule: (v) => `Your employee ID is ${v}.`,
    name: (p, n) => `Your name is ${p} ${n}.`,
    age: (n) => `You are ${n} years old.`,
    birthdate: (d) => `You were born on ${d}.`,
    poste: (v) => `Your job title: ${v}.`,
    departement: (v) => `Your department: ${v}.`,
    salaire: (n) => `Your salary is €${n} gross per month.`,
    secu: (v) => `Your social security number: ${v}.`,
    telephone: (v) => `Your phone number: ${v}.`,
    adresse: (v) => `Your address: ${v}.`,
    embauche: (d) => `You were hired on ${d}.`,
    contrat: (v) => `Your contract type is ${v}.`,
    solde: (n) => `You have ${n} day(s) of leave left.`,
    conges: (l) => `Your leave requests:\n${list(l.map((c) => `${c.from} to ${c.to} (${c.raison}) — ${st('en', c.statut)}`))}`,
    noLeave: () => "You haven't submitted any leave request.",
    arrets: (l) => `Your sick leaves:\n${list(l.map((a) => `${a.from} to ${a.to} — ${st('en', a.statut)}`))}`,
    noSick: () => 'You have no sick leave.',
    telework: (d) => `Your upcoming telework days: ${d.join(', ')}.`,
    noTelework: () => 'No upcoming telework day.',
    primes: (l) => `Your bonuses:\n${list(l.map((p) => `€${p.montant} — ${st('en', p.statut)}`))}`,
    noBonus: () => 'No bonus on record.',
    notifs: (m) => `Unread notifications:\n${list(m)}`,
    noNotifs: () => 'No unread notification.',
    manager: (n) => `Your manager is ${n}.`,
    noManager: () => 'No manager is assigned to you.',
  },
  es: {
    unknown: () => 'Lo siento, no tengo acceso a esa información. Prueba por ejemplo: «¿Cuál es mi saldo de vacaciones?»',
    matricule: (v) => `Tu matrícula es ${v}.`,
    name: (p, n) => `Te llamas ${p} ${n}.`,
    age: (n) => `Tienes ${n} años.`,
    birthdate: (d) => `Naciste el ${d}.`,
    poste: (v) => `Tu puesto: ${v}.`,
    departement: (v) => `Tu departamento: ${v}.`,
    salaire: (n) => `Tu salario es de ${n} € brutos al mes.`,
    secu: (v) => `Tu número de seguridad social: ${v}.`,
    telephone: (v) => `Tu teléfono: ${v}.`,
    adresse: (v) => `Tu dirección: ${v}.`,
    embauche: (d) => `Fuiste contratado/a el ${d}.`,
    contrat: (v) => `Tu contrato es ${v}.`,
    solde: (n) => `Te quedan ${n} día(s) de vacaciones.`,
    conges: (l) => `Tus vacaciones:\n${list(l.map((c) => `del ${c.from} al ${c.to} (${c.raison}) — ${st('es', c.statut)}`))}`,
    noLeave: () => 'No has solicitado ninguna ausencia.',
    arrets: (l) => `Tus bajas por enfermedad:\n${list(l.map((a) => `del ${a.from} al ${a.to} — ${st('es', a.statut)}`))}`,
    noSick: () => 'No tienes ninguna baja por enfermedad.',
    telework: (d) => `Tus próximos días de teletrabajo: ${d.join(', ')}.`,
    noTelework: () => 'No hay días de teletrabajo próximos.',
    primes: (l) => `Tus primas:\n${list(l.map((p) => `${p.montant} € — ${st('es', p.statut)}`))}`,
    noBonus: () => 'Ninguna prima registrada.',
    notifs: (m) => `Notificaciones sin leer:\n${list(m)}`,
    noNotifs: () => 'No hay notificaciones sin leer.',
    manager: (n) => `Tu responsable es ${n}.`,
    noManager: () => 'No tienes responsable asignado.',
  },
  it: {
    unknown: () => 'Spiacente, non ho accesso a questa informazione. Prova ad esempio: «Qual è il mio saldo ferie?»',
    matricule: (v) => `La tua matricola è ${v}.`,
    name: (p, n) => `Ti chiami ${p} ${n}.`,
    age: (n) => `Hai ${n} anni.`,
    birthdate: (d) => `Sei nato/a il ${d}.`,
    poste: (v) => `La tua posizione: ${v}.`,
    departement: (v) => `Il tuo reparto: ${v}.`,
    salaire: (n) => `Il tuo stipendio è di ${n} € lordi al mese.`,
    secu: (v) => `Il tuo numero di previdenza sociale: ${v}.`,
    telephone: (v) => `Il tuo telefono: ${v}.`,
    adresse: (v) => `Il tuo indirizzo: ${v}.`,
    embauche: (d) => `Sei stato/a assunto/a il ${d}.`,
    contrat: (v) => `Il tuo contratto è ${v}.`,
    solde: (n) => `Ti restano ${n} giorno/i di ferie.`,
    conges: (l) => `Le tue ferie:\n${list(l.map((c) => `dal ${c.from} al ${c.to} (${c.raison}) — ${st('it', c.statut)}`))}`,
    noLeave: () => 'Non hai richiesto nessun congedo.',
    arrets: (l) => `Le tue malattie:\n${list(l.map((a) => `dal ${a.from} al ${a.to} — ${st('it', a.statut)}`))}`,
    noSick: () => 'Non hai nessuna malattia registrata.',
    telework: (d) => `I tuoi prossimi giorni di smart working: ${d.join(', ')}.`,
    noTelework: () => 'Nessun giorno di smart working in programma.',
    primes: (l) => `I tuoi premi:\n${list(l.map((p) => `${p.montant} € — ${st('it', p.statut)}`))}`,
    noBonus: () => 'Nessun premio registrato.',
    notifs: (m) => `Notifiche non lette:\n${list(m)}`,
    noNotifs: () => 'Nessuna notifica non letta.',
    manager: (n) => `Il tuo responsabile è ${n}.`,
    noManager: () => 'Nessun responsabile assegnato.',
  },
  ar: {
    unknown: () => 'عذرًا، لا أملك صلاحية الوصول إلى هذه المعلومة. جرّب مثلًا: «ما هو رصيد إجازاتي؟»',
    matricule: (v) => `رقمك الوظيفي هو ${v}.`,
    name: (p, n) => `اسمك ${p} ${n}.`,
    age: (n) => `عمرك ${n} سنة.`,
    birthdate: (d) => `تاريخ ميلادك ${d}.`,
    poste: (v) => `منصبك: ${v}.`,
    departement: (v) => `قسمك: ${v}.`,
    salaire: (n) => `راتبك ${n} € إجمالي شهريًا.`,
    secu: (v) => `رقم الضمان الاجتماعي: ${v}.`,
    telephone: (v) => `رقم هاتفك: ${v}.`,
    adresse: (v) => `عنوانك: ${v}.`,
    embauche: (d) => `تم تعيينك بتاريخ ${d}.`,
    contrat: (v) => `نوع عقدك: ${v}.`,
    solde: (n) => `تبقّى لك ${n} يوم إجازة.`,
    conges: (l) => `إجازاتك:\n${list(l.map((c) => `من ${c.from} إلى ${c.to} (${c.raison}) — ${st('ar', c.statut)}`))}`,
    noLeave: () => 'لم تقدّم أي طلب إجازة.',
    arrets: (l) => `إجازاتك المرضية:\n${list(l.map((a) => `من ${a.from} إلى ${a.to} — ${st('ar', a.statut)}`))}`,
    noSick: () => 'ليس لديك أي إجازة مرضية.',
    telework: (d) => `أيام العمل عن بعد القادمة: ${d.join('، ')}.`,
    noTelework: () => 'لا توجد أيام عمل عن بعد قادمة.',
    primes: (l) => `مكافآتك:\n${list(l.map((p) => `${p.montant} € — ${st('ar', p.statut)}`))}`,
    noBonus: () => 'لا توجد مكافآت مسجلة.',
    notifs: (m) => `إشعارات غير مقروءة:\n${list(m)}`,
    noNotifs: () => 'لا توجد إشعارات غير مقروءة.',
    manager: (n) => `مديرك هو ${n}.`,
    noManager: () => 'لا يوجد مدير مُعيَّن لك.',
  },
};
