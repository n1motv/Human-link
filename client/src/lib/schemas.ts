import { z } from 'zod';
import { createSchemas } from '@shared';

/** Schémas du contrat serveur / client, fabriqués avec la copie de zod du client (formulaires, vérification des réponses). */
export const schemas = createSchemas(z);
