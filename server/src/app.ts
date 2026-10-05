import path from 'node:path';
import { existsSync } from 'node:fs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, isProd } from './config/env.js';
import { publicConfig, clientConfig } from './config/client.js';
import { csrfProtection } from './middleware/csrf.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './utils/errors.js';
import { logger } from './utils/logger.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { bonusesRouter } from './modules/bonuses/bonuses.routes.js';
import { calendarRouter } from './modules/calendar/calendar.routes.js';
import { chatbotRouter } from './modules/chatbot/chatbot.routes.js';
import { contactRouter } from './modules/contact/contact.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { documentsRouter } from './modules/documents/documents.routes.js';
import { feedbackRouter } from './modules/feedback/feedback.routes.js';
import { monitoringRouter } from './modules/monitoring/monitoring.routes.js';
import { leavesRouter } from './modules/leaves/leaves.routes.js';
import { meetingsRouter } from './modules/meetings/meetings.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { orgRouter } from './modules/org/org.routes.js';
import { rgpdRouter } from './modules/rgpd/rgpd.routes.js';
import { sickRouter } from './modules/sick/sick.routes.js';
import { teleworkRouter } from './modules/telework/telework.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Fait confiance à X-Forwarded-For uniquement si on est réellement derrière un proxy (sinon l'IP serait falsifiable).
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          // Polices hébergées localement (@fontsource) : aucune requête vers un tiers, donc aucune IP transmise à Google.
          'style-src': ["'self'", "'unsafe-inline'"],
          'font-src': ["'self'", 'data:'],
          'img-src': ["'self'", 'data:', 'blob:'], // data: pour le QR code 2FA
          'connect-src': ["'self'"],
          'frame-ancestors': ["'none'"],
          'form-action': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'upgrade-insecure-requests': isProd ? [] : null,
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginEmbedderPolicy: false,
      hsts: isProd ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.use(cors({ origin: env.APP_URL, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Logo et visuels du client (<CLIENT_DIR>/branding) : remplaçables sans recompiler le front.
  app.use('/branding', express.static(path.resolve(env.CLIENT_DIR, 'branding'), { maxAge: '1h', index: false }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(publicConfig());
  });

  // Avant la protection CSRF : un rapport d'erreur doit pouvoir partir même si la session ou le jeton sont absents.
  app.use('/api/client-errors', monitoringRouter);

  app.use('/api', apiLimiter, csrfProtection);

  const mod = clientConfig.modules;
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/org', orgRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/rgpd', rgpdRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/calendar', calendarRouter);
  // Modules activables par client (client.config.json → modules) : une route désactivée n'existe tout simplement pas.
  if (mod.leaves) app.use('/api/leaves', leavesRouter);
  if (mod.sickLeaves) app.use('/api/sick-leaves', sickRouter);
  if (mod.bonuses) app.use('/api/bonuses', bonusesRouter);
  if (mod.telework) app.use('/api/telework', teleworkRouter);
  if (mod.meetings) app.use('/api/meetings', meetingsRouter);
  if (mod.vault) app.use('/api/documents', documentsRouter);
  if (mod.feedback) app.use('/api/feedback', feedbackRouter);
  if (mod.contact) app.use('/api/contact', contactRouter);
  if (mod.chatbot) app.use('/api/chatbot', chatbotRouter);

  app.use('/api', notFoundHandler);

  // Production simple : Node sert aussi le front compilé (sinon laisser Nginx/Caddy s'en charger).
  if (env.SERVE_CLIENT) {
    const dist = path.resolve(env.CLIENT_DIST);
    if (existsSync(dist)) {
      app.use(express.static(dist, { index: false, maxAge: '1h', setHeaders: (res, p) => p.endsWith('index.html') && res.setHeader('Cache-Control', 'no-cache') }));
      app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
    } else {
      logger.warn(`SERVE_CLIENT activé mais ${dist} est introuvable (npm run build dans client/).`);
    }
  }

  app.use(errorHandler);
  return app;
}
