import { Router } from 'express';
import { z } from 'zod';
import { BonusRequest } from '../../models/BonusRequest.js';
import { LeaveRequest } from '../../models/LeaveRequest.js';
import { Notification } from '../../models/Notification.js';
import { SickLeave } from '../../models/SickLeave.js';
import { Supervision } from '../../models/Supervision.js';
import { Telework } from '../../models/Telework.js';
import { User, type UserDoc } from '../../models/User.js';
import { env } from '../../config/env.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { chatLimiter } from '../../middleware/rateLimit.js';
import { ageOn, today } from '../../utils/dates.js';
import { notFound, parse } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { LANGS, SENSITIVE, detectIntent, detectLang, type Intent, type Lang } from './intents.js';
import { T } from './answers.js';

export const chatbotRouter = Router();
chatbotRouter.use(requireAuth(), requireRole('employe', 'manager'), chatLimiter);

type Ctx = Awaited<ReturnType<typeof loadContext>>;

/** Tout ce que l'assistant sait provient du compte de la personne connectée, jamais d'un autre. */
async function loadContext(user: UserDoc) {
  const id = user._id;
  const [leaves, sicks, telework, bonuses, unread, link] = await Promise.all([
    LeaveRequest.find({ userId: id }).sort({ dateDebut: -1 }).limit(20),
    SickLeave.find({ userId: id }).sort({ dateDebut: -1 }).limit(20),
    Telework.find({ userId: id, date: { $gte: today() } }).sort({ date: 1 }),
    BonusRequest.find({ employeId: id }).sort({ createdAt: -1 }).limit(10),
    Notification.find({ userId: id, isRead: false }).sort({ createdAt: -1 }).limit(10),
    Supervision.findOne({ superviseId: id }),
  ]);
  const manager = link ? await User.findById(link.managerId, 'nom prenom') : null;
  return { user, leaves, sicks, telework, bonuses, unread, manager };
}

function answerFor(intent: Intent, lang: Lang, c: Ctx): string {
  const t = T[lang];
  const u = c.user;
  switch (intent) {
    case 'matricule': return t.matricule(u.matricule);
    case 'name': return t.name(u.prenom, u.nom);
    case 'age': return u.dateNaissance ? t.age(ageOn(u.dateNaissance)) : t.unknown();
    case 'birthdate': return u.dateNaissance ? t.birthdate(u.dateNaissance) : t.unknown();
    case 'poste': return u.poste ? t.poste(u.poste) : t.unknown();
    case 'departement': return u.departement ? t.departement(u.departement) : t.unknown();
    case 'salaire': return typeof u.salaire === 'number' ? t.salaire(u.salaire) : t.unknown();
    case 'social_security': return u.numeroSecu ? t.secu(u.numeroSecu) : t.unknown();
    case 'telephone': return u.telephone ? t.telephone(u.telephone) : t.unknown();
    case 'adresse': return u.adresse ? t.adresse([u.adresse, u.codePostal, u.ville, u.pays].filter(Boolean).join(', ')) : t.unknown();
    case 'date_embauche': return u.dateEmbauche ? t.embauche(u.dateEmbauche) : t.unknown();
    case 'type_contrat': return u.typeContrat ? t.contrat(u.typeContrat) : t.unknown();
    case 'solde': return t.solde(u.soldeConge);
    case 'conge': return c.leaves.length ? t.conges(c.leaves.map((l) => ({ from: l.dateDebut, to: l.dateFin, statut: l.statut, raison: l.raison }))) : t.noLeave();
    case 'arret': return c.sicks.length ? t.arrets(c.sicks.map((s) => ({ from: s.dateDebut, to: s.dateFin, statut: s.statut }))) : t.noSick();
    case 'teletravail': return c.telework.length ? t.telework(c.telework.map((d) => d.date)) : t.noTelework();
    case 'prime': return c.bonuses.length ? t.primes(c.bonuses.map((b) => ({ montant: b.montant, statut: b.statut }))) : t.noBonus();
    case 'notification': return c.unread.length ? t.notifs(c.unread.map((n) => n.message)) : t.noNotifs();
    case 'manager': return c.manager ? t.manager(`${c.manager.prenom} ${c.manager.nom}`) : t.noManager();
  }
}

/** Contexte transmis à un LLM : volontairement dépourvu de salaire, n° de sécu, téléphone et adresse. */
function safeContext(c: Ctx): string {
  const u = c.user;
  return [
    `Nom: ${u.prenom} ${u.nom}`, `Matricule: ${u.matricule}`, `Poste: ${u.poste ?? '-'}`, `Département: ${u.departement ?? '-'}`,
    `Solde de congés: ${u.soldeConge} jours`, `Contrat: ${u.typeContrat ?? '-'}`, `Date d'embauche: ${u.dateEmbauche ?? '-'}`,
    `Congés: ${c.leaves.map((l) => `${l.dateDebut}→${l.dateFin} (${l.statut})`).join('; ') || 'aucun'}`,
    `Arrêts: ${c.sicks.map((s) => `${s.dateDebut}→${s.dateFin} (${s.statut})`).join('; ') || 'aucun'}`,
    `Télétravail à venir: ${c.telework.map((d) => d.date).join(', ') || 'aucun'}`,
  ].join('\n');
}

async function askLlm(question: string, c: Ctx): Promise<string | null> {
  if (!env.LLM_API_URL) return null;
  const prompt = `Tu es un assistant RH. Réponds brièvement, dans la langue de la question, uniquement à partir des informations ci-dessous. Si l'information est absente, dis que tu n'y as pas accès.\n\n${safeContext(c)}\n\nQuestion : ${question}\nRéponse :`;
  try {
    const r = await fetch(env.LLM_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.LLM_MODEL, prompt, max_tokens: 300, temperature: 0.2 }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { choices?: { text?: string }[] };
    return data.choices?.[0]?.text?.trim() || null;
  } catch (err) {
    logger.warn({ err }, 'LLM indisponible, repli sur les règles');
    return null;
  }
}

chatbotRouter.post('/', async (req, res) => {
  const body = parse(z.object({ question: z.string().trim().min(1).max(500), lang: z.enum(LANGS as [Lang, ...Lang[]]).default('fr') }), req.body);
  const user = await User.findById(authOf(req).userId);
  if (!user) throw notFound();
  const lang = detectLang(body.question, body.lang);
  const intent = detectIntent(body.question);
  const ctx = await loadContext(user);

  // 1) Intentions connues : réponse locale, déterministe et privée (les données sensibles ne sortent jamais du serveur).
  if (intent) {
    res.json({ answer: answerFor(intent, lang, ctx), intent, sensitive: SENSITIVE.includes(intent) });
    return;
  }
  // 2) Question libre : LLM optionnel avec un contexte sans donnée sensible.
  const llm = await askLlm(body.question, ctx);
  res.json({ answer: llm ?? T[lang].unknown(), intent: null, sensitive: false });
});
