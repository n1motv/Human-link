import net from 'node:net';
import { env } from '../config/env.js';
import { HttpError, badRequest } from './errors.js';
import { logger } from './logger.js';

const CHUNK = 64 * 1024;
const TIMEOUT_MS = 20_000;

export type ScanResult = { status: 'clean' } | { status: 'infected'; signature: string } | { status: 'skipped' };

/**
 * Envoie le contenu à un démon ClamAV (protocole INSTREAM, port 3310) et lit son verdict.
 * Sans CLAMAV_HOST, l'analyse est désactivée (`skipped`).
 */
export function scanBuffer(data: Buffer, host = env.CLAMAV_HOST, port = env.CLAMAV_PORT): Promise<ScanResult> {
  if (!host) return Promise.resolve({ status: 'skipped' });
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let reply = '';
    socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('Délai dépassé')));
    socket.on('error', reject);
    socket.on('data', (d) => (reply += d.toString('utf8')));
    socket.on('close', () => {
      const text = reply.replace(/\0/g, '').trim();
      if (/\bOK$/.test(text)) return resolve({ status: 'clean' });
      const found = /: (.+) FOUND$/.exec(text);
      if (found) return resolve({ status: 'infected', signature: found[1]! });
      reject(new Error(`Réponse ClamAV inattendue : ${text || '(vide)'}`));
    });
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let i = 0; i < data.length; i += CHUNK) {
        const part = data.subarray(i, i + CHUNK);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length);
        socket.write(len);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4)); // fin du flux
    });
  });
}

/**
 * Analyse un fichier avant stockage. Infecté : refusé (400). Antivirus injoignable : refusé (503) seulement si
 * CLAMAV_REQUIRED=true, sinon accepté avec un avertissement dans les journaux.
 */
export async function assertClean(data: Buffer, name = 'fichier'): Promise<void> {
  if (!env.CLAMAV_HOST) return;
  try {
    const r = await scanBuffer(data);
    if (r.status === 'infected') {
      logger.warn({ signature: r.signature, name }, 'Fichier refusé par l\'antivirus');
      throw badRequest('Fichier refusé : un contenu malveillant a été détecté.', 'INFECTED_FILE');
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    logger.error({ err: String(err) }, 'Antivirus injoignable');
    if (env.CLAMAV_REQUIRED) throw new HttpError(503, "L'analyse antivirus est momentanément indisponible. Réessayez plus tard.", 'SCAN_UNAVAILABLE');
  }
}
