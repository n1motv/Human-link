import fs from 'node:fs';
import { env } from './env.js';

/**
 * Identifiant de la version déployée : empreinte des sources, calculée à la construction de l'image Docker (voir Dockerfile)
 * et partagée avec le front compilé. « dev » hors Docker : le client et le serveur y portent alors la même valeur.
 */
function readBuildId(): string {
  if (env.BUILD_ID) return env.BUILD_ID;
  try {
    return fs.readFileSync(env.BUILD_ID_FILE ?? '/app/build-id', 'utf8').trim() || 'dev';
  } catch {
    return 'dev';
  }
}

export const BUILD_ID = readBuildId();
