import { describe, expect, it } from 'vitest';
import { testConfig, testUser } from '../test/utils';
import { schemas } from './schemas';

describe('données de test du client et contrat partagé (Q-12)', () => {
  it('la configuration et l’utilisateur de test respectent les schémas du serveur', () => {
    expect(schemas.publicConfig.safeParse(testConfig).success).toBe(true);
    expect(schemas.user.safeParse(testUser).success).toBe(true);
  });

  it('un champ qui change de type est repéré', () => {
    expect(schemas.user.safeParse({ ...testUser, soldeConge: '17' }).success).toBe(false);
    expect(schemas.user.safeParse({ ...testUser, role: 'chef' }).success).toBe(false);
  });
});
