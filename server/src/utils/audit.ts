import type { Request } from 'express';
import { AuditLog } from '../models/AuditLog.js';
import { pseudonymize } from './crypto.js';
import { logger } from './logger.js';

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

interface AuditInput {
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  actorId?: string;
  actorEmail?: string;
}

/**
 * Journalise un accès ou une modification de donnée personnelle (RGPD, art. 5.2 « responsabilité »).
 * L'adresse IP n'est conservée que sous forme de pseudonyme HMAC.
 */
export async function audit(req: Request | undefined, input: AuditInput): Promise<void> {
  try {
    await AuditLog.create({
      actorId: input.actorId ?? req?.auth?.userId,
      actorEmail: input.actorEmail ?? req?.auth?.email,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      meta: input.meta,
      ipHash: req ? pseudonymize(clientIp(req)) : undefined,
      userAgent: req?.get('user-agent')?.slice(0, 300),
    });
  } catch (err) {
    logger.error({ err }, "Échec d'écriture du journal d'audit");
  }
}
