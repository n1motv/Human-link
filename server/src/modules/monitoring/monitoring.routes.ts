import { Router } from 'express';
import { z } from 'zod';
import { reportError, scrubPath, scrubStack, scrubText } from '../../utils/monitoring.js';
import { parse } from '../../utils/errors.js';
import { errorReportLimiter } from '../../middleware/rateLimit.js';

export const monitoringRouter = Router();

/** Corps d'un rapport d'erreur du navigateur (exporté pour la documentation de l'API). */
export const errorReportBody = z.object({
  kind: z.enum(['render', 'window', 'promise']),
  message: z.string().max(2000),
  stack: z.string().max(8000).optional(),
  route: z.string().max(500).optional(),
  component: z.string().max(4000).optional(),
  release: z.string().max(40).optional(),
});

/**
 * Reçoit les erreurs du navigateur. Public (la page de connexion peut elle-même planter), donc limité en débit, en taille,
 * et sans effet autre qu'une ligne de journal. Aucun cookie, compte ni adresse IP n'est joint au rapport.
 */
monitoringRouter.post('/', errorReportLimiter, (req, res) => {
  const body = parse(errorReportBody, req.body);
  reportError({
    source: 'browser',
    kind: body.kind,
    message: scrubText(body.message),
    stack: body.stack ? scrubStack(body.stack) : undefined,
    route: body.route ? scrubPath(body.route) : undefined,
    component: body.component ? scrubStack(body.component) : undefined,
    release: body.release ? scrubText(body.release, 40) : undefined,
  });
  res.status(204).end();
});
