import 'dotenv/config';
import { z } from 'zod';

/**
 * Variables d'environnement (secrets + infrastructure).
 * Tout ce qui change d'un client à l'autre mais qui n'est PAS secret
 * (nom, logo, couleurs, modules, règles RH) se trouve dans client.config.json.
 */
const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

const key32 = (name: string) =>
  z
    .string({ error: `${name} manquante (voir .env.example, npm run gen:keys)` })
    .regex(/^[0-9a-fA-F]{64}$/, `${name} doit être une clé de 32 octets en hexadécimal (64 caractères)`);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/humanlink'),
  /** URL publique du front, utilisée pour CORS et les liens dans les e-mails. */
  APP_URL: z.string().url().default('http://localhost:5173'),
  /**
   * Dossier du client : `client.config.json` (identité, modules, règles RH, RGPD) et `branding/` (logos).
   * Un dossier par client dans /clients ; aucun code à modifier pour en créer un nouveau.
   */
  CLIENT_DIR: z.string().default('../clients/example'),
  /** Si le front est servi par le serveur Node (build de production), on le sert ici. */
  SERVE_CLIENT: bool.default(false),
  CLIENT_DIST: z.string().default('../client/dist'),

  /** Nombre de reverse proxies devant Node (Nginx, Caddy, load balancer...). 0 = aucun. Nécessaire pour la vraie IP cliente (limitation de débit, audit). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /** Cookies « Secure » (HTTPS uniquement). Actif par défaut en production ; ne désactiver qu'en intranet HTTP. */
  COOKIE_SECURE: bool.optional(),

  // --- Secrets cryptographiques (générer avec `npm run gen:keys`) ---
  JWT_SECRET: key32('JWT_SECRET'),
  /** Chiffrement AES-256-GCM des champs sensibles en base (salaire, n° de sécu, ...). */
  FIELD_ENCRYPTION_KEY: key32('FIELD_ENCRYPTION_KEY'),
  /** Chiffrement AES-256-GCM des fichiers stockés sur disque. */
  FILE_ENCRYPTION_KEY: key32('FILE_ENCRYPTION_KEY'),
  /** Sel de pseudonymisation (feedback anonyme, hash d'IP dans les logs d'audit). */
  PSEUDONYM_KEY: key32('PSEUDONYM_KEY'),

  // --- Stockage local ---
  STORAGE_DIR: z.string().default('./storage'),

  // --- E-mail (SMTP) ---
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Human Link <no-reply@localhost>'),

  // --- Compte administrateur initial (npm run seed) ---
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),

  // --- Assistant RH (optionnel, API compatible OpenAI /v1/completions : LM Studio, Ollama, vLLM...) ---
  LLM_API_URL: z.string().url().optional(),
  LLM_MODEL: z.string().optional(),

  LOG_LEVEL: z.string().default('info'),
});

// Une variable vide (ex. `SMTP_HOST=`) équivaut à une variable absente.
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
const parsed = schema.safeParse(raw);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  // eslint-disable-next-line no-console
  console.error(`\nConfiguration invalide :\n${lines.join('\n')}\n`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const cookieSecure = env.COOKIE_SECURE ?? isProd;
