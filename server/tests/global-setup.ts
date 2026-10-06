import { MongoMemoryReplSet } from 'mongodb-memory-server';

let mongod: MongoMemoryReplSet;

// Jeu de réplicas d'un seul nœud : comme en production (docker-compose), il autorise les transactions (T-11).
export async function setup() {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.TEST_MONGODB_URI = mongod.getUri('humanlink_test');
}

export async function teardown() {
  await mongod?.stop();
}
