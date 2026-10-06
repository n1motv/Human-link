import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { inject } from 'vitest';

// Variables d'environnement posées AVANT l'import de l'application (env.ts les valide au chargement).
const hex = () => crypto.randomBytes(32).toString('hex');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = hex();
process.env.FIELD_ENCRYPTION_KEY = hex();
process.env.FILE_ENCRYPTION_KEY = hex();
process.env.PSEUDONYM_KEY = hex();
process.env.STORAGE_DIR = path.join(os.tmpdir(), `humanlink-test-${process.pid}`);
process.env.APP_URL = 'http://localhost:5173';
process.env.METRICS_TOKEN = 'jeton-de-test-des-metriques';
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/humanlink_test';
void inject;
