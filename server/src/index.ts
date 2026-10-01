import mongoose from 'mongoose';
import { createApp } from './app.js';
import { env, isProd } from './config/env.js';
import { startJobs } from './jobs/scheduler.js';
import { logger } from './utils/logger.js';

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

main().catch((err) => {
  logger.fatal({ err }, 'Démarrage impossible');
  process.exit(1);
});
