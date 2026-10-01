// Base MongoDB locale de développement, sans installation ni Docker.
// Les données sont conservées dans server/.devdb entre deux lancements.
import fs from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';

fs.mkdirSync('.devdb', { recursive: true });
const mongod = await MongoMemoryServer.create({
  instance: { port: 27017, dbPath: '.devdb', storageEngine: 'wiredTiger' },
});
console.log(`MongoDB de développement prêt : ${mongod.getUri()}humanlink`);
console.log('Laissez cette fenêtre ouverte. Ctrl+C pour arrêter.');
process.on('SIGINT', async () => {
  await mongod.stop();
  process.exit(0);
});
