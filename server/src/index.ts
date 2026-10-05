import mongoose from 'mongoose';
import { createApp } from './app.js';
import { env, isProd } from './config/env.js';
import { startJobs } from './jobs/scheduler.js';
import { logger } from './utils/logger.js';
import { reportError, scrubStack, scrubText } from './utils/monitoring.js';

async function main() {
  mongoose.set('strictQuery', true);
  // Anti-injection NoSQL : toute entrée passe par un schéma zod qui n'accepte que des types primitifs
  // (un objet {$ne: ...} à la place d'une chaîne est rejeté en 400). Voir tests/auth.test.ts.
  await mongoose.connect(env.MONGODB_URI, { autoIndex: !isProd || process.env.AUTO_INDEX === 'true' });
  logger.info('MongoDB connecté');
  if (isProd) await Promise.all(mongoose.modelNames().map((m) => mongoose.model(m).syncIndexes()));

  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info(`API Human Link sur http://localhost:${env.PORT}`));
  startJobs();

  const stop = async () => {
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

// Erreurs hors requête (tâche planifiée, promesse oubliée) : sans ceci, elles ne laisseraient aucune trace exploitable.
process.on('unhandledRejection', (reason) => {
  const err = reason as Error;
  logger.error({ err }, 'Promesse rejetée non gérée');
  reportError({ source: 'server', kind: 'unhandledRejection', message: scrubText(err?.message ?? reason), stack: scrubStack(err?.stack) });
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Exception non interceptée');
  reportError({ source: 'server', kind: 'uncaughtException', message: scrubText(err.message), stack: scrubStack(err.stack) });
  setTimeout(() => process.exit(1), 1000).unref(); // laisse partir l'alerte ; Docker relance le conteneur (restart: unless-stopped)
});

main().catch((err) => {
  logger.fatal({ err }, 'Démarrage impossible');
  process.exit(1);
});
