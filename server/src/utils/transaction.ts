import mongoose, { type ClientSession } from 'mongoose';
import { logger } from './logger.js';

let supported: boolean | undefined;

/** MongoDB ne fait de transactions que sur un jeu de réplicas (même d'un seul nœud) : le serveur le détecte une fois. */
export async function supportsTransactions(): Promise<boolean> {
  if (supported === undefined) {
    try {
      const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
      supported = typeof hello.setName === 'string';
    } catch {
      supported = false;
    }
    if (!supported) logger.warn('MongoDB sans jeu de réplicas : les opérations multi-documents ne sont pas transactionnelles (voir docs/DEPLOIEMENT.md).');
  }
  return supported;
}

/** Pour les tests : oublier le résultat de la détection. */
export const resetTransactionSupport = () => {
  supported = undefined;
};

/**
 * Exécute `fn` dans une transaction : toutes ses écritures (passer `session` à chacune) sont validées ensemble, ou aucune ne l'est.
 * Une décision de congé met à jour la demande, le solde et le télétravail, et crée les notifications : si une étape échoue, rien ne reste à moitié fait.
 *
 * La fonction peut être rejouée par le pilote en cas de conflit passager : elle ne doit pas avoir d'effet hors de la base
 * (e-mails, fichiers) ; ceux-ci se font après le retour, une fois la transaction validée.
 * Sur une base sans jeu de réplicas (installation existante), `fn` s'exécute sans transaction et `session` vaut `undefined` :
 * le code doit alors compenser lui-même, comme avant.
 */
export async function withTransaction<T>(fn: (session: ClientSession | undefined) => Promise<T>): Promise<T> {
  if (!(await supportsTransactions())) return fn(undefined);
  const session = await mongoose.startSession();
  try {
    return (await session.withTransaction(() => fn(session), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } })) as T;
  } finally {
    await session.endSession();
  }
}
