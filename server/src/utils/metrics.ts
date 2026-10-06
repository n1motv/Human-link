import crypto from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { BUILD_ID } from '../config/version.js';
import { env } from '../config/env.js';
import { supportsTransactions } from './transaction.js';

/**
 * Métriques d'exploitation au format Prometheus (T-14) : débit, temps de réponse, erreurs, connexions, base de données.
 * Aucune donnée personnelle : les routes sont des modèles (/api/users/:id), jamais des adresses réelles ; aucun nom, e-mail ni IP.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'humanlink_' }); // mémoire, CPU, boucle d'événements, GC

export const httpRequests = new Counter({
  name: 'humanlink_http_requests_total',
  help: 'Requêtes HTTP traitées, par méthode, route (modèle) et code de réponse.',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpDuration = new Histogram({
  name: 'humanlink_http_request_duration_seconds',
  help: 'Durée de traitement des requêtes HTTP.',
  labelNames: ['method', 'route'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const loginsTotal = new Counter({
  name: 'humanlink_logins_total',
  help: 'Tentatives de connexion, par résultat (success, failure).',
  labelNames: ['result'] as const,
  registers: [registry],
});

new Gauge({
  name: 'humanlink_build_info',
  help: 'Version déployée (identifiant de build) : toujours 1.',
  labelNames: ['version'] as const,
  registers: [registry],
}).set({ version: BUILD_ID }, 1);

new Gauge({
  name: 'humanlink_mongo_connections',
  help: 'Connexions actuellement ouvertes sur MongoDB.',
  registers: [registry],
  async collect() {
    try {
      const status = await mongoose.connection.db?.admin().serverStatus();
      if (status?.connections) this.set(status.connections.current);
    } catch {
      /* droits insuffisants ou base injoignable : la valeur reste celle du dernier relevé */
    }
  },
});

new Gauge({
  name: 'humanlink_mongo_transactions_supported',
  help: '1 si MongoDB est un jeu de réplicas (transactions actives), 0 sinon : les décisions multi-documents ne sont alors pas atomiques.',
  registers: [registry],
  async collect() {
    this.set((await supportsTransactions()) ? 1 : 0);
  },
});

new Gauge({
  name: 'humanlink_mongo_data_size_bytes',
  help: 'Taille des données de la base de l’instance (hors index).',
  registers: [registry],
  async collect() {
    try {
      const stats = await mongoose.connection.db?.stats();
      if (stats) this.set(stats.dataSize);
    } catch {
      /* idem */
    }
  },
});

new Gauge({
  name: 'humanlink_mongo_index_size_bytes',
  help: 'Taille des index de la base de l’instance.',
  registers: [registry],
  async collect() {
    try {
      const stats = await mongoose.connection.db?.stats();
      if (stats) this.set(stats.indexSize);
    } catch {
      /* idem */
    }
  },
});

/** Route sous forme de modèle : « /api/users/:id ». Les URL sans route correspondante (404, robots) sont regroupées pour ne pas multiplier les séries. */
function routeLabel(req: Request): string {
  return req.route?.path ? `${req.baseUrl}${req.route.path === '/' ? '' : req.route.path}` : 'non_routee';
}

export const metricsMiddleware: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const route = routeLabel(req);
    httpRequests.inc({ method: req.method, route, status: String(res.statusCode) });
    httpDuration.observe({ method: req.method, route }, Number(process.hrtime.bigint() - start) / 1e9);
  });
  next();
};

/** GET /metrics : désactivé tant que METRICS_TOKEN n'est pas défini, sinon jeton « Bearer » exigé (comparaison à temps constant). */
export const metricsHandler: RequestHandler = async (req, res) => {
  const expected = env.METRICS_TOKEN;
  if (!expected) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route introuvable' } });
    return;
  }
  const given = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    res
      .status(401)
      .set('WWW-Authenticate', 'Bearer')
      .json({ error: { code: 'UNAUTHENTICATED', message: 'Jeton de métriques requis' } });
    return;
  }
  res
    .set('Content-Type', registry.contentType)
    .set('Cache-Control', 'no-store')
    .send(await registry.metrics());
};
