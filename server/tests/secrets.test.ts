import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applyFileSecrets } from '../src/config/secrets.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hl-secrets-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const write = (name: string, content: string) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, content);
  return f;
};

describe('secrets lus depuis des fichiers (Docker secrets)', () => {
  it('remplace la variable par le contenu du fichier, sans le retour à la ligne final', () => {
    const env: NodeJS.ProcessEnv = { JWT_SECRET_FILE: write('jwt', 'a'.repeat(64) + '\n'), SMTP_PASS_FILE: write('smtp', 'p@ss mot de passe\r\n') };
    expect(applyFileSecrets(env).sort()).toEqual(['JWT_SECRET', 'SMTP_PASS']);
    expect(env.JWT_SECRET).toBe('a'.repeat(64));
    expect(env.SMTP_PASS).toBe('p@ss mot de passe');
  });

  it('le fichier l’emporte sur la variable d’environnement du même nom', () => {
    const env: NodeJS.ProcessEnv = { PSEUDONYM_KEY: 'ancienne-valeur', PSEUDONYM_KEY_FILE: write('pseudo', 'b'.repeat(64)) };
    applyFileSecrets(env);
    expect(env.PSEUDONYM_KEY).toBe('b'.repeat(64));
  });

  it('ignore les variables hors liste et celles sans _FILE', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV_FILE: write('x', 'secret'), JWT_SECRET: 'garde' };
    expect(applyFileSecrets(env)).toEqual([]);
    expect(env.NODE_ENV).toBeUndefined();
    expect(env.JWT_SECRET).toBe('garde');
  });

  it('échoue clairement si le fichier est absent ou vide', () => {
    expect(() => applyFileSecrets({ JWT_SECRET_FILE: path.join(dir, 'absent') })).toThrow(/JWT_SECRET_FILE.*impossible de lire/);
    expect(() => applyFileSecrets({ FILE_ENCRYPTION_KEY_FILE: write('vide', '\n') })).toThrow(/vide/);
  });
});
