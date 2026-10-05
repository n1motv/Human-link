// Jeu de données de démonstration complet : équipes, demandes dans tous les états, réunions, télétravail,
// feedback, contacts, notifications et documents. Toutes les dates sont relatives à aujourd'hui.
// Lancé par `npm run seed:demo` ; `--reset-demo` efface d'abord les données des comptes @demo.local.
import { Types } from 'mongoose';
import { clientConfig } from '../config/client.js';
import { BonusRequest } from '../models/BonusRequest.js';
import { ContactRequest } from '../models/ContactRequest.js';
import { Feedback, FEEDBACK_CRITERIA } from '../models/Feedback.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { Meeting } from '../models/Meeting.js';
import { Notification } from '../models/Notification.js';
import { SickLeave } from '../models/SickLeave.js';
import { StoredFile } from '../models/StoredFile.js';
import { Supervision } from '../models/Supervision.js';
import { Telework } from '../models/Telework.js';
import { User, type UserAttrs, type UserDoc } from '../models/User.js';
import { addDays, countWorkingDays, currentMonth, nextMonday, today } from '../utils/dates.js';
import { pseudonymize } from '../utils/crypto.js';
import { hashPassword } from '../utils/password.js';
import { writeEncrypted } from '../utils/storage.js';

type Statut = 'en attente' | 'accepte' | 'refuse';

/** PDF d'une page, valide, avec un titre : suffisant pour tester le coffre-fort. */
function tinyPdf(title: string): Buffer {
  const text = title.replace(/[()\\]/g, ' ');
  const stream = `BT /F1 20 Tf 60 760 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

export async function seedDemo(password: string, reset: boolean) {
  const T = today();
  const d = (n: number) => addDays(T, n);
  const days = (a: string, b: string) => countWorkingDays(a, b, clientConfig.hr.workingDays);
  const ago = (n: number) => new Date(Date.now() - n * 86_400_000);
  const passwordHash = await hashPassword(password);

  if (reset) {
    const old = await User.find({ email: /@demo\.local$/ }, '_id');
    const ids = old.map((u) => u._id);
    const files = await StoredFile.find({ ownerId: { $in: ids } }).select('+storageKey');
    await Promise.all([
      LeaveRequest.deleteMany({ userId: { $in: ids } }),
      SickLeave.deleteMany({ userId: { $in: ids } }),
      BonusRequest.deleteMany({ $or: [{ employeId: { $in: ids } }, { managerId: { $in: ids } }] }),
      Meeting.deleteMany({ createdBy: { $in: ids } }),
      Telework.deleteMany({ userId: { $in: ids } }),
      Notification.deleteMany({ userId: { $in: ids } }),
      ContactRequest.deleteMany({ email: /@demo\.local$/ }),
      StoredFile.deleteMany({ ownerId: { $in: ids } }),
      Supervision.deleteMany({ superviseId: { $in: ids } }),
      User.deleteMany({ _id: { $in: ids } }),
    ]);
    void files;
  }

  const common = { pays: 'France', nationalite: 'Française', typeContrat: 'CDI' as const, teleworkMax: 2, soldeConge: 25 };
  let n = 100;
  const person = async (data: Partial<UserAttrs>): Promise<UserDoc> => {
    const email = data.email!;
    const found = await User.findOne({ email });
    if (found) {
      // Le mot de passe affiché à la fin du seed doit toujours être valide.
      if (found.status !== 'invited') await User.updateOne({ _id: found._id }, { passwordHash, passwordChangedAt: new Date() });
      return found;
    }
    // Matricule libre : une base qui contient déjà d'anciens comptes de démonstration ne doit pas provoquer de doublon.
    let matricule = '';
    do {
      n += 1;
      matricule = `DEMO${String(n).padStart(4, '0')}`;
    } while (await User.exists({ matricule }));
    const invited = data.status === 'invited';
    return User.create({
      ...common,
      matricule,
      ville: 'Paris',
      codePostal: '75011',
      dateEmbauche: '2022-03-01',
      ...data,
      passwordHash: invited ? undefined : passwordHash,
      passwordChangedAt: invited ? undefined : new Date(),
      dernierMoisMaj: currentMonth(),
      status: data.status ?? 'active',
    });
  };

  // ---------- Équipes ----------
  const claire = await person({
    nom: 'Martin',
    prenom: 'Claire',
    email: 'claire.martin@demo.local',
    role: 'manager',
    isDirector: true,
    poste: 'Directrice générale',
    departement: 'Direction',
    sexe: 'Femme',
    dateNaissance: '1980-04-12',
    salaire: 7200,
  });
  const karim = await person({
    nom: 'Bernard',
    prenom: 'Karim',
    email: 'karim.bernard@demo.local',
    role: 'manager',
    poste: 'Responsable technique',
    departement: 'Technique',
    sexe: 'Homme',
    dateNaissance: '1985-09-23',
    salaire: 5200,
  });
  const julie = await person({
    nom: 'Petit',
    prenom: 'Julie',
    email: 'julie.petit@demo.local',
    role: 'manager',
    poste: 'Responsable marketing',
    departement: 'Marketing',
    sexe: 'Femme',
    dateNaissance: '1987-02-08',
    salaire: 4900,
  });
  const sofia = await person({
    nom: 'Lopez',
    prenom: 'Sofia',
    email: 'sofia.lopez@demo.local',
    role: 'employe',
    poste: 'Développeuse',
    departement: 'Technique',
    sexe: 'Femme',
    dateNaissance: '1993-01-30',
    salaire: 3800,
  });
  const luca = await person({
    nom: 'Rossi',
    prenom: 'Luca',
    email: 'luca.rossi@demo.local',
    role: 'employe',
    poste: 'Designer',
    departement: 'Technique',
    sexe: 'Homme',
    dateNaissance: '1995-06-18',
    salaire: 3400,
  });
  const nadia = await person({
    nom: 'Haddad',
    prenom: 'Nadia',
    email: 'nadia.haddad@demo.local',
    role: 'employe',
    poste: 'Ingénieure QA',
    departement: 'Technique',
    sexe: 'Femme',
    dateNaissance: '1991-11-05',
    salaire: 3600,
    dateEmbauche: '2023-09-04',
  });
  const thomas = await person({
    nom: 'Dubois',
    prenom: 'Thomas',
    email: 'thomas.dubois@demo.local',
    role: 'employe',
    poste: 'Chargé de communication',
    departement: 'Marketing',
    sexe: 'Homme',
    dateNaissance: '1990-07-21',
    salaire: 3300,
  });
  const emma = await person({
    nom: 'Roux',
    prenom: 'Emma',
    email: 'emma.roux@demo.local',
    role: 'employe',
    poste: 'Community manager',
    departement: 'Marketing',
    sexe: 'Femme',
    dateNaissance: '1998-03-14',
    salaire: 2900,
    typeContrat: 'CDD',
    dateEmbauche: '2025-01-13',
  });
  await person({
    nom: 'Lambert',
    prenom: 'Hugo',
    email: 'hugo.lambert@demo.local',
    role: 'employe',
    poste: 'Développeur',
    departement: 'Technique',
    sexe: 'Homme',
    dateNaissance: '1996-12-02',
    salaire: 3500,
    status: 'invited',
    dateEmbauche: d(7),
  });
  await person({
    nom: 'Garnier',
    prenom: 'Paul',
    email: 'paul.garnier@demo.local',
    role: 'employe',
    poste: 'Comptable',
    departement: 'Finance',
    sexe: 'Homme',
    dateNaissance: '1984-05-27',
    salaire: 3700,
    status: 'archived',
    dateEmbauche: '2019-06-03',
  });

  for (const [m, s] of [
    [claire, karim],
    [claire, julie],
    [karim, sofia],
    [karim, luca],
    [karim, nadia],
    [julie, thomas],
    [julie, emma],
  ] as const) {
    await Supervision.updateOne({ superviseId: s._id }, { managerId: m._id, superviseId: s._id }, { upsert: true });
  }
  const adminUser = await User.findOne({ role: 'admin' }, '_id');

  if (!reset && (await LeaveRequest.exists({ userId: sofia._id }))) {
    console.log('\nLes données de démonstration existent déjà (mot de passe des comptes mis à jour). Utilisez --reset-demo pour les recréer.\n');
    return;
  }

  // ---------- Congés : tous les états ----------
  type L = { u: UserDoc; a: number; b: number; raison: string; manager: Statut; admin: Statut; motif?: string; description?: string; created: number };
  const leaves: L[] = [
    // Acceptés (passés et à venir)
    { u: sofia, a: -48, b: -44, raison: 'annual', manager: 'accepte', admin: 'accepte', created: 70, description: 'Semaine au ski.' },
    { u: sofia, a: 22, b: 26, raison: 'travel', manager: 'accepte', admin: 'accepte', created: 14, description: 'Voyage au Portugal.' },
    { u: luca, a: -20, b: -19, raison: 'family', manager: 'accepte', admin: 'accepte', created: 30, description: "Mariage d'un cousin." },
    { u: thomas, a: 9, b: 13, raison: 'annual', manager: 'accepte', admin: 'accepte', created: 20 },
    { u: karim, a: 35, b: 41, raison: 'travel', manager: 'accepte', admin: 'accepte', created: 18 },
    // En attente du manager
    { u: sofia, a: 40, b: 41, raison: 'personal', manager: 'en attente', admin: 'en attente', created: 1, description: 'Déménagement.' },
    { u: nadia, a: 12, b: 16, raison: 'annual', manager: 'en attente', admin: 'en attente', created: 2 },
    { u: emma, a: 6, b: 6, raison: 'personal', manager: 'en attente', admin: 'en attente', created: 0, description: 'Rendez-vous administratif.' },
    // Validés par le manager, en attente de l'administrateur
    { u: luca, a: 28, b: 32, raison: 'annual', manager: 'accepte', admin: 'en attente', created: 4 },
    { u: thomas, a: 50, b: 54, raison: 'family', manager: 'accepte', admin: 'en attente', created: 3, description: 'Naissance attendue.' },
    { u: julie, a: 18, b: 19, raison: 'religious', manager: 'accepte', admin: 'en attente', created: 2 },
    // Refusés
    { u: luca, a: -8, b: -6, raison: 'annual', manager: 'refuse', admin: 'en attente', created: 12, motif: 'Livraison du projet prévue cette semaine-là, merci de décaler.' },
    { u: emma, a: 15, b: 20, raison: 'travel', manager: 'accepte', admin: 'refuse', created: 9, motif: "Quota d'absences atteint sur la période (trois personnes déjà absentes)." },
    { u: nadia, a: -30, b: -29, raison: 'other', manager: 'refuse', admin: 'en attente', created: 40, motif: 'Justificatif manquant.' },
  ];
  for (const l of leaves) {
    const a = d(l.a);
    const b = d(l.b);
    const statut: Statut = l.manager === 'refuse' || l.admin === 'refuse' ? 'refuse' : l.manager === 'accepte' && l.admin === 'accepte' ? 'accepte' : 'en attente';
    await LeaveRequest.create({
      userId: l.u._id,
      raison: l.raison,
      dateDebut: a,
      dateFin: b,
      nombreJours: Math.max(days(a, b), 1),
      description: l.description,
      statut,
      statutManager: l.manager,
      statutAdmin: l.admin,
      motifRefus: l.motif,
      createdAt: ago(l.created),
    });
  }

  // ---------- Arrêts maladie ----------
  const sick = [
    { u: sofia, a: -26, b: -24, type: 'justifie' as const, statut: 'accepte' as Statut, created: 25, description: 'Grippe.' },
    { u: nadia, a: -1, b: 2, type: 'justifie' as const, statut: 'en attente' as Statut, created: 1, description: 'Lombalgie, certificat joint.' },
    { u: luca, a: -14, b: -14, type: 'non justifie' as const, statut: 'refuse' as Statut, created: 13, motif: 'Aucun justificatif fourni dans les 48 heures.' },
    { u: thomas, a: -40, b: -37, type: 'justifie' as const, statut: 'accepte' as Statut, created: 38, description: 'Angine.' },
    { u: emma, a: 0, b: 0, type: 'non justifie' as const, statut: 'en attente' as Statut, created: 0 },
  ];
  for (const s of sick) {
    await SickLeave.create({
      userId: s.u._id,
      typeMaladie: s.type,
      dateDebut: d(s.a),
      dateFin: d(s.b),
      description: s.description,
      statut: s.statut,
      motifRefus: s.motif,
      createdAt: ago(s.created),
    });
  }

  // ---------- Primes ----------
  const bonuses = [
    { m: karim, e: sofia, montant: 500, motif: 'Livraison du module de paie en avance.', statut: 'accepte' as Statut, created: 35 },
    { m: karim, e: luca, montant: 300, motif: "Refonte de l'identité visuelle du produit.", statut: 'en attente' as Statut, created: 3 },
    { m: karim, e: nadia, montant: 400, motif: 'Mise en place de la campagne de tests automatisés.', statut: 'en attente' as Statut, created: 1 },
    {
      m: julie,
      e: emma,
      montant: 250,
      motif: 'Croissance des abonnés sur le trimestre.',
      statut: 'refuse' as Statut,
      created: 20,
      motif2: 'Budget primes du trimestre déjà consommé.',
    },
    { m: julie, e: thomas, montant: 600, motif: 'Organisation du salon annuel.', statut: 'accepte' as Statut, created: 55 },
  ];
  for (const b of bonuses) {
    await BonusRequest.create({ managerId: b.m._id, employeId: b.e._id, montant: b.montant, motif: b.motif, statut: b.statut, motifRefus: b.motif2, createdAt: ago(b.created) });
  }

  // ---------- Réunions ----------
  const at = (offset: number, h: number) => new Date(`${d(offset)}T${String(h).padStart(2, '0')}:00:00Z`);
  const meetings = [
    {
      by: karim,
      title: "Point d'équipe technique",
      when: at(-6, 9),
      inv: [
        [sofia, 'Accepted'],
        [luca, 'Accepted'],
        [nadia, 'Rejected'],
      ],
    },
    {
      by: karim,
      title: 'Revue de sprint',
      when: at(2, 14),
      inv: [
        [sofia, 'Accepted'],
        [luca, 'en attente'],
        [nadia, 'en attente'],
      ],
    },
    {
      by: karim,
      title: 'Rétrospective trimestrielle',
      when: at(9, 10),
      inv: [
        [sofia, 'en attente'],
        [luca, 'en attente'],
        [nadia, 'Accepted'],
      ],
    },
    {
      by: julie,
      title: "Lancement de la campagne d'automne",
      when: at(3, 11),
      inv: [
        [thomas, 'Accepted'],
        [emma, 'en attente'],
      ],
    },
    {
      by: claire,
      title: 'Comité de direction',
      when: at(5, 16),
      inv: [
        [karim, 'Accepted'],
        [julie, 'en attente'],
      ],
    },
    {
      by: julie,
      title: 'Atelier réseaux sociaux (annulé)',
      when: at(1, 15),
      inv: [
        [thomas, 'Rejected'],
        [emma, 'Accepted'],
      ],
      cancelled: true,
    },
  ] as const;
  for (const m of meetings) {
    await Meeting.create({
      title: m.title,
      dateTime: m.when,
      createdBy: m.by._id,
      status: 'cancelled' in m && m.cancelled ? 'Cancelled' : 'Scheduled',
      invitees: m.inv.map(([u, status]) => ({ userId: u._id, status })),
    });
  }

  // ---------- Télétravail : cette semaine et la prochaine ----------
  const mondayNext = nextMonday();
  const mondayThis = addDays(mondayNext, -7);
  const plan: [UserDoc, number[]][] = [
    [sofia, [0, 3]],
    [luca, [1, 4]],
    [nadia, [2, 3]],
    [thomas, [0, 2]],
    [emma, [4]],
    [karim, [1]],
  ];
  for (const [u, offs] of plan) {
    for (const o of offs) {
      for (const base of [mondayThis, mondayNext]) {
        await Telework.updateOne({ userId: u._id, date: addDays(base, o) }, { userId: u._id, date: addDays(base, o) }, { upsert: true });
      }
    }
  }

  // ---------- Feedback anonyme : deux mois précédents ----------
  const monthsBack = (k: number) => {
    const x = new Date();
    x.setUTCDate(1);
    x.setUTCMonth(x.getUTCMonth() - k);
    return x.toISOString().slice(0, 7);
  };
  const voters = [sofia, luca, nadia, thomas, emma, karim];
  for (const [k, scoreBase] of [
    [1, 4],
    [2, 3],
  ] as const) {
    const month = monthsBack(k);
    for (const [i, u] of voters.entries()) {
      const ratings = Object.fromEntries(FEEDBACK_CRITERIA.map((c, j) => [c, Math.min(5, Math.max(1, scoreBase + ((i + j) % 3) - 1))]));
      const suggestion =
        i === 0 ? 'Plus de créneaux de télétravail le vendredi.' : i === 2 ? "Un budget formation clair en début d'année." : i === 4 ? 'Des réunions plus courtes.' : '';
      await Feedback.updateOne(
        { month, participant: pseudonymize(`${u._id}:${month}`) },
        { month, participant: pseudonymize(`${u._id}:${month}`), ratings, suggestion },
        { upsert: true },
      );
    }
  }

  // ---------- Demandes de contact ----------
  await ContactRequest.deleteMany({ email: /@demo\.local$/ });
  await ContactRequest.create([
    {
      userId: sofia._id,
      nom: 'Lopez',
      prenom: 'Sofia',
      email: 'sofia.lopez@demo.local',
      sujet: 'Attestation de travail',
      message: "Bonjour, pourriez-vous m'envoyer une attestation de travail pour ma banque ? Merci.",
      createdAt: ago(2),
    },
    {
      userId: luca._id,
      nom: 'Rossi',
      prenom: 'Luca',
      email: 'luca.rossi@demo.local',
      sujet: 'Question sur mon solde de congés',
      message: "Mon solde me semble inférieur à ce que j'attendais après mon congé de mars. Pouvez-vous vérifier ?",
      createdAt: ago(5),
    },
    {
      userId: emma._id,
      nom: 'Roux',
      prenom: 'Emma',
      email: 'emma.roux@demo.local',
      sujet: 'Renouvellement de mon CDD',
      message: 'Bonjour, quand aurai-je une réponse concernant le renouvellement de mon contrat ?',
      createdAt: ago(1),
    },
  ]);

  // ---------- Documents du coffre-fort (bulletins et contrats) ----------
  const now = new Date();
  for (const u of [sofia, luca, nadia, thomas, emma]) {
    for (let k = 1; k <= 3; k++) {
      const x = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
      const label = `Bulletin de paie ${x.toISOString().slice(0, 7)}`;
      const pdf = tinyPdf(`${label} - ${u.prenom} ${u.nom}`);
      await StoredFile.create({
        ownerId: u._id,
        category: 'bulletin',
        label,
        month: x.getUTCMonth() + 1,
        year: x.getUTCFullYear(),
        originalName: `${label}.pdf`,
        mime: 'application/pdf',
        size: pdf.length,
        storageKey: await writeEncrypted(pdf),
        uploadedBy: adminUser?._id,
      });
    }
    const contract = tinyPdf(`Contrat de travail - ${u.prenom} ${u.nom}`);
    await StoredFile.create({
      ownerId: u._id,
      category: 'contrat',
      label: 'Contrat de travail',
      originalName: 'contrat.pdf',
      mime: 'application/pdf',
      size: contract.length,
      storageKey: await writeEncrypted(contract),
      uploadedBy: adminUser?._id,
    });
  }

  // ---------- Notifications ----------
  const nt = (to: UserDoc, key: string, params: Record<string, string | number>, message: string, read: boolean, created: number, type = 'Info') =>
    Notification.create({ userId: to._id, type, key, params, message, isRead: read, createdAt: ago(created) });
  await Promise.all([
    nt(sofia, 'leave.accepted', { from: d(22), to: d(26) }, `Votre demande de congé du ${d(22)} au ${d(26)} a été acceptée.`, false, 12, 'Congé'),
    nt(
      sofia,
      'bonus.submitted_employee',
      { manager: 'Karim Bernard', montant: 500 },
      'Votre manager Karim Bernard a soumis une demande de prime de 500 € en votre faveur.',
      true,
      35,
      'Prime',
    ),
    nt(
      sofia,
      'meeting.invited',
      { manager: 'Karim Bernard', title: 'Revue de sprint', when: d(2) },
      `Karim Bernard vous invite à la réunion « Revue de sprint » le ${d(2)}.`,
      false,
      1,
      'Réunion',
    ),
    nt(
      luca,
      'leave.refused_manager',
      { motif: 'Livraison du projet prévue cette semaine-là, merci de décaler.' },
      'Votre demande de congé a été refusée par votre manager : Livraison du projet prévue cette semaine-là, merci de décaler.',
      false,
      11,
      'Congé',
    ),
    nt(
      luca,
      'sick.refused',
      { motif: 'Aucun justificatif fourni dans les 48 heures.' },
      'Votre arrêt maladie a été refusé : Aucun justificatif fourni dans les 48 heures.',
      true,
      12,
      'Arrêt',
    ),
    nt(
      emma,
      'leave.refused_admin',
      { motif: "Quota d'absences atteint sur la période (trois personnes déjà absentes)." },
      "Votre demande de congé a été refusée par l'administration : quota d'absences atteint.",
      false,
      8,
      'Congé',
    ),
    nt(
      emma,
      'bonus.refused',
      { employee: 'Emma Roux', motif: 'Budget primes du trimestre déjà consommé.' },
      'La demande de prime pour Emma Roux a été refusée : Budget primes du trimestre déjà consommé.',
      false,
      19,
      'Prime',
    ),
    nt(karim, 'leave.submitted', { name: 'Sofia Lopez', from: d(40), to: d(41) }, `Sofia Lopez a déposé une demande de congé du ${d(40)} au ${d(41)}.`, false, 1, 'Congé'),
    nt(karim, 'leave.submitted', { name: 'Nadia Haddad', from: d(12), to: d(16) }, `Nadia Haddad a déposé une demande de congé du ${d(12)} au ${d(16)}.`, false, 2, 'Congé'),
    nt(julie, 'leave.submitted', { name: 'Emma Roux', from: d(6), to: d(6) }, `Emma Roux a déposé une demande de congé du ${d(6)} au ${d(6)}.`, false, 0, 'Congé'),
    nt(nadia, 'telework.reminder', {}, 'Pensez à choisir vos jours de télétravail pour la semaine prochaine.', true, 3, 'Télétravail'),
    nt(thomas, 'feedback.reminder', {}, 'Nouveau mois : donnez votre avis anonyme sur votre environnement de travail.', false, 2, 'Feedback'),
    ...(adminUser
      ? [
          Notification.create({
            userId: adminUser._id,
            type: 'Congé',
            key: 'leave.manager_accepted',
            params: { name: 'Luca Rossi' },
            message: 'La demande de congé de Luca Rossi a été acceptée par son manager et requiert votre approbation.',
            isRead: false,
            createdAt: ago(4),
          }),
          Notification.create({
            userId: adminUser._id,
            type: 'Arrêt',
            key: 'sick.submitted',
            params: { name: 'Nadia Haddad', from: d(-1), to: d(2) },
            message: `Nadia Haddad a déposé un arrêt maladie du ${d(-1)} au ${d(2)}.`,
            isRead: false,
            createdAt: ago(1),
          }),
          Notification.create({
            userId: adminUser._id,
            type: 'Prime',
            key: 'bonus.submitted_admin',
            params: { manager: 'Karim Bernard', montant: 400, employee: 'Nadia Haddad' },
            message: 'Karim Bernard a soumis une demande de prime de 400 € pour Nadia Haddad.',
            isRead: false,
            createdAt: ago(1),
          }),
          Notification.create({
            userId: adminUser._id,
            type: 'Contact',
            key: 'contact.new',
            params: { sujet: 'Renouvellement de mon CDD' },
            message: 'Nouvelle demande de contact : Renouvellement de mon CDD.',
            isRead: true,
            createdAt: ago(1),
          }),
        ]
      : []),
  ]);

  // ---------- Soldes de congés cohérents avec les demandes acceptées ----------
  for (const u of [sofia, luca, nadia, thomas, emma, karim, julie]) {
    const used = await LeaveRequest.aggregate<{ t: number }>([{ $match: { userId: u._id, statut: 'accepte' } }, { $group: { _id: null, t: { $sum: '$nombreJours' } } }]);
    await User.updateOne({ _id: u._id }, { soldeConge: Math.max(0, 25 - (used[0]?.t ?? 0)) });
  }

  void Types;
  console.log(
    `\nDonnées de démonstration créées :\n` +
      `  10 comptes (dont 1 invité et 1 archivé), 7 liens manager → équipe\n` +
      `  ${leaves.length} congés (acceptés, en attente du manager, en attente de l'admin, refusés)\n` +
      `  ${sick.length} arrêts maladie, ${bonuses.length} primes (acceptées, en attente, refusée)\n` +
      `  ${meetings.length} réunions (passée, à venir, annulée), télétravail sur 2 semaines, feedback sur 2 mois\n` +
      `  3 demandes de contact, 20 documents (bulletins et contrats), notifications lues et non lues\n`,
  );
}
