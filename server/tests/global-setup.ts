import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;

export async function setup() {
  mongod = await MongoMemoryServer.create();
  process.env.TEST_MONGODB_URI = mongod.getUri('humanlink_test');
}

export async function teardown() {
  await mongod?.stop();
}
