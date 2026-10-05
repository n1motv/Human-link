import fs from 'node:fs';

/**
 * Secrets lus depuis des fichiers (Docker secrets, Kubernetes, Vault Agent…) : pour chaque variable de cette liste,
 * `<NOM>_FILE=/chemin/du/fichier` remplace `<NOM>`. Le secret n'apparaît alors ni dans l'environnement du conteneur
 * (`docker inspect`, `/proc/<pid>/environ`) ni dans le `.env`. Si les deux sont définis, le fichier l'emporte.
 */
export const FILE_SECRET_NAMES = [
  'JWT_SECRET',
  'FIELD_ENCRYPTION_KEY',
  'FILE_ENCRYPTION_KEY',
  'PSEUDONYM_KEY',
  'FIELD_ENCRYPTION_KEYS_OLD',
  'FILE_ENCRYPTION_KEYS_OLD',
  'SMTP_PASS',
  'ADMIN_PASSWORD',
  'MONGODB_URI',
] as const;

/** Charge les `<NOM>_FILE` dans `source` (process.env par défaut). Renvoie les noms chargés ; lève une erreur claire si un fichier est illisible. */
export function applyFileSecrets(source: NodeJS.ProcessEnv = process.env): string[] {
  const loaded: string[] = [];
  for (const name of FILE_SECRET_NAMES) {
    const path = source[`${name}_FILE`];
    if (!path) continue;
    let content: string;
    try {
      content = fs.readFileSync(path, 'utf8');
    } catch (err) {
      throw new Error(`${name}_FILE : impossible de lire « ${path} » (${(err as NodeJS.ErrnoException).code ?? 'erreur'})`);
    }
    // Les fichiers de secrets se terminent souvent par un retour à la ligne : il ne fait pas partie de la valeur.
    const value = content.replace(/\r?\n$/, '').trim();
    if (!value) throw new Error(`${name}_FILE : le fichier « ${path} » est vide`);
    source[name] = value;
    loaded.push(name);
  }
  return loaded;
}
