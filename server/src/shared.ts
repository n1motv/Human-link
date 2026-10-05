import { z } from 'zod';
import { createSchemas } from './_shared/index.js';

// Contrat serveur / client (shared/src/index.ts), fabriqué avec la copie de zod du serveur.
export * from './_shared/index.js';
export const schemas = createSchemas(z);
