import path from 'node:path';
import { existsSync } from 'node:fs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, isProd, isTest } from './config/env.js';
import { BUILD_ID } from './config/version.js';
import { metricsHandler, metricsMiddleware } from './utils/metrics.js';
import { publicConfig, clientConfig } from './config/client.js';
import { csrfProtection } from './middleware/csrf.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { docsRouter } from './openapi/docs.routes.js';
import { API_MOUNTS, PUBLIC_MOUNTS } from './routes.js';
import { errorHandler, notFoundHandler } from './utils/errors.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Fait confiance à X-Forwarded-For uniquement si on est réellement derrière un proxy (sinon l'IP serait falsifiable).
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(metricsMiddleware);
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

  // Santé : sert aussi à repérer qu'un onglet ouvert tourne sur une ancienne version (version) ou que le service est en maintenance.
  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, version: BUILD_ID, maintenance: env.MAINTENANCE });
  });
  app.get('/metrics', metricsHandler);
  app.get('/api/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(publicConfig());
  });

  // Maintenance : tout le reste de l'API répond 503 ; le client affiche alors sa page de maintenance.
  if (env.MAINTENANCE) {
    app.use('/api', (_req, res) => {
      res.setHeader('Retry-After', '120');
      res.status(503).json({ error: { code: 'MAINTENANCE', message: 'Service en maintenance, merci de réessayer dans quelques minutes' } });
    });
  }

  // Documentation de l'API (OpenAPI + page de lecture) : développement uniquement, jamais en production.
  if (!isProd && !isTest) app.use('/api', docsRouter);

  // Avant la protection CSRF : un rapport d'erreur doit pouvoir partir même si la session ou le jeton sont absents.
  for (const m of PUBLIC_MOUNTS) app.use(m.prefix, m.router);

  app.use('/api', apiLimiter, csrfProtection);

  // Modules activables par client (client.config.json → modules) : une route désactivée n'existe tout simplement pas.
  for (const m of API_MOUNTS) if (!m.module || clientConfig.modules[m.module]) app.use(m.prefix, m.router);

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
