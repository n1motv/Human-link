import pino from 'pino';
import { env, isProd, isTest } from '../config/env.js';

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  // Aucune donnée personnelle ni secret dans les logs.
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["x-csrf-token"]',
      '*.password',
      '*.newPassword',
      '*.currentPassword',
      '*.token',
      '*.code',
    ],
    censor: '[masqué]',
  },
  ...(isProd || isTest ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
});
