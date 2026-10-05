import { z, type ZodType } from 'zod';
import type { Mount } from '../routes.js';
import { API_MOUNTS, PUBLIC_MOUNTS } from '../routes.js';
import { ANNOTATIONS } from './annotations.js';

/** Ce qu'on lit dans un routeur Express 5 : les couches, les routes, leurs méthodes et leurs gestionnaires. */
interface Handler {
  requiresAuth?: boolean;
  allowedRoles?: string[];
}
interface Layer {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: Handler }[] };
  handle: Handler;
}

const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete'];

const toOpenApiPath = (p: string) => p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
const join = (prefix: string, path: string) => (path === '/' ? prefix : prefix + path);

function jsonSchema(schema: ZodType, io: 'input' | 'output'): Record<string, unknown> {
  const { $schema: _omit, ...rest } = z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as Record<string, unknown>;
  return rest;
}

interface Operation {
  method: string;
  path: string;
  auth: boolean;
  roles?: string[];
  tag: string;
}

/** Toutes les opérations réellement déclarées dans les routeurs, dans l'ordre alphabétique des chemins. */
export function listOperations(mounts: Mount[] = [...PUBLIC_MOUNTS, ...API_MOUNTS]): Operation[] {
  const ops: Operation[] = [
    { method: 'get', path: '/api/health', auth: false, tag: 'service' },
    { method: 'get', path: '/api/config', auth: false, tag: 'service' },
  ];
  for (const m of mounts) {
    let authBelow = false; // un `router.use(requireAuth())` protège toutes les routes déclarées après lui
    for (const layer of (m.router as unknown as { stack: Layer[] }).stack) {
      if (!layer.route) {
        if (layer.handle.requiresAuth) authBelow = true;
        continue;
      }
      const handlers = layer.route.stack.map((s) => s.handle);
      const roles = handlers.find((h) => h.allowedRoles)?.allowedRoles;
      const auth = authBelow || handlers.some((h) => h.requiresAuth);
      for (const method of METHOD_ORDER.filter((x) => layer.route!.methods[x])) {
        ops.push({ method, path: toOpenApiPath(join(m.prefix, layer.route.path)), auth, roles, tag: m.prefix.replace('/api/', '') });
      }
    }
  }
  return ops.sort((a, b) => a.path.localeCompare(b.path) || METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method));
}

export function buildOpenApi() {
  const operations = listOperations();
  const known = new Set(operations.map((o) => `${o.method.toUpperCase()} ${o.path}`));
  const stale = Object.keys(ANNOTATIONS).filter((k) => !known.has(k));
  if (stale.length) throw new Error(`Annotations OpenAPI sans route correspondante : ${stale.join(', ')}`);

  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of operations) {
    const key = `${op.method.toUpperCase()} ${op.path}`;
    const a = ANNOTATIONS[key];
    const params: unknown[] = [...op.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
    if (a?.query) {
      const query = jsonSchema(a.query, 'input');
      const props = (query.properties ?? {}) as Record<string, unknown>;
      const required = new Set((query.required ?? []) as string[]);
      for (const [name, schema] of Object.entries(props)) params.push({ name, in: 'query', required: required.has(name), schema });
    }
    const notes = [a?.description, op.roles ? `Rôles autorisés : ${op.roles.join(', ')}.` : undefined, op.auth ? 'Authentification requise (cookie de session).' : 'Public.']
      .filter(Boolean)
      .join(' ');
    const responses: Record<string, unknown> = {
      [String(a?.status ?? 200)]: a?.response
        ? { description: 'Succès', content: { 'application/json': { schema: jsonSchema(a.response, 'output') } } }
        : { description: 'Succès' },
      default: { description: 'Erreur', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    };
    if (op.auth) responses['401'] = { description: 'Non authentifié ou session expirée' };
    if (op.roles) responses['403'] = { description: 'Rôle insuffisant' };

    (paths[op.path] ??= {})[op.method] = {
      tags: [op.tag],
      operationId: `${op.method}_${op.path
        .replace(/^\/api\//, '')
        .replace(/[{}]/g, '')
        .replace(/\W+/g, '_')}`,
      summary: a?.summary ?? `${op.method.toUpperCase()} ${op.path}`,
      description: notes,
      ...(params.length ? { parameters: params } : {}),
      ...(a?.body ? { requestBody: { required: true, content: { [a.multipart ? 'multipart/form-data' : 'application/json']: { schema: jsonSchema(a.body, 'input') } } } } : {}),
      responses,
      ...(op.auth ? { security: [{ cookieAuth: [] }] } : {}),
      'x-documented': !!a,
      ...(op.roles ? { 'x-roles': op.roles } : {}),
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'API Human Link',
      version: '3.0.0',
      description:
        'Généré depuis les routeurs Express et les schémas zod partagés (shared/src/index.ts). ' +
        'Authentification par cookie httpOnly (`hl_at`). Les écritures (POST, PUT, PATCH, DELETE) exigent aussi l’en-tête `X-CSRF-Token` ' +
        'recopiant le cookie `hl_csrf` (obtenu par GET /api/auth/csrf). Les dates sont au format AAAA-MM-JJ.',
    },
    servers: [{ url: '/' }],
    paths,
    components: {
      securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'hl_at' } },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} }, required: ['code', 'message'] },
          },
          required: ['error'],
        },
      },
    },
  };
}
