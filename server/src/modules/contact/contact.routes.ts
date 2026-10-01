import { Router } from 'express';
import { z } from 'zod';
import { ContactRequest } from '../../models/ContactRequest.js';
import { User } from '../../models/User.js';
import { ACCESS_COOKIE, requireAuth, requireRole } from '../../middleware/auth.js';
import { publicFormLimiter } from '../../middleware/rateLimit.js';
import { audit } from '../../utils/audit.js';
import { badRequest, notFound, parse } from '../../utils/errors.js';
import { notifyAdmins } from '../../utils/notify.js';
import { verifyAccessToken } from '../../utils/tokens.js';

export const contactRouter = Router();

const schema = z.object({
  nom: z.string().trim().max(80).optional(),
  prenom: z.string().trim().max(80).optional(),
  email: z.email().max(254).optional(),
  telephone: z.string().trim().max(30).optional(),
  sujet: z.string().trim().min(1).max(160),
  message: z.string().trim().min(5).max(4000),
  /** Champ piège : invisible pour les humains, rempli par les robots. */
  website: z.string().max(200).optional(),
});

/** Formulaire ouvert aux visiteurs comme aux employés connectés (identité alors reprise du compte). */
contactRouter.post('/', publicFormLimiter, async (req, res) => {
  const body = parse(schema, req.body);
  if (body.website) {
    res.status(201).json({ ok: true }); // robot : on fait semblant d'accepter
    return;
  }
  let user = null;
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  const claims = token ? await verifyAccessToken(token) : null;
  if (claims) user = await User.findById(claims.sub);

  const email = user?.email ?? body.email;
  if (!email) throw badRequest('Une adresse e-mail est requise', 'EMAIL_REQUIRED');
  const created = await ContactRequest.create({
    userId: user?._id,
    nom: user?.nom ?? body.nom,
    prenom: user?.prenom ?? body.prenom,
    email,
    telephone: user?.telephone ?? body.telephone,
    sujet: body.sujet,
    message: body.message,
  });
  await notifyAdmins('Contact', 'contact.new', { sujet: body.sujet });
  res.status(201).json({ ok: true, id: String(created._id) });
});

contactRouter.get('/', requireAuth(), requireRole('admin'), async (req, res) => {
  const items = await ContactRequest.find().sort({ createdAt: -1 }).limit(500);
  await audit(req, { action: 'contact.list', targetType: 'contact' });
  res.json({ items });
});

contactRouter.delete('/:id', requireAuth(), requireRole('admin'), async (req, res) => {
  const { id } = parse(z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }), req.params);
  const r = await ContactRequest.deleteOne({ _id: id });
  if (!r.deletedCount) throw notFound();
  await audit(req, { action: 'contact.delete', targetType: 'contact', targetId: id });
  res.json({ ok: true });
});
