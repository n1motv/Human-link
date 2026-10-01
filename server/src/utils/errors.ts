import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';
import mongoose from 'mongoose';
import multer from 'multer';
import { logger } from './logger.js';
import { isProd } from '../config/env.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, code?: string) => new HttpError(400, m, code);
export const unauthorized = (m = 'Authentification requise', code = 'UNAUTHENTICATED') => new HttpError(401, m, code);
export const forbidden = (m = 'Accès refusé', code = 'FORBIDDEN') => new HttpError(403, m, code);
export const notFound = (m = 'Ressource introuvable') => new HttpError(404, m, 'NOT_FOUND');
export const conflict = (m: string, code?: string) => new HttpError(409, m, code);

/** Valide une entrée avec zod ; les champs inconnus sont supprimés (protège des injections d'opérateurs Mongo). */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route introuvable' } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code ?? 'ERROR', message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION',
        message: 'Données invalides',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (10 Mo maximum)' : 'Fichier invalide';
    res.status(400).json({ error: { code: 'UPLOAD', message } });
    return;
  }
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: { code: 'BAD_ID', message: 'Identifiant invalide' } });
    return;
  }
  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ error: { code: 'VALIDATION', message: 'Données invalides' } });
    return;
  }
  if (typeof err === 'object' && err && (err as { code?: number }).code === 11000) {
    res.status(409).json({ error: { code: 'DUPLICATE', message: 'Cet enregistrement existe déjà' } });
    return;
  }
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_JSON', message: 'JSON invalide' } });
    return;
  }
  logger.error({ err, path: req.path }, 'Erreur non gérée');
  res.status(500).json({
    error: { code: 'INTERNAL', message: isProd ? 'Erreur interne du serveur' : String((err as Error)?.message ?? err) },
  });
};
