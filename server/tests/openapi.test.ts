import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { docsRouter } from '../src/openapi/docs.routes.js';
import { buildOpenApi, listOperations } from '../src/openapi/spec.js';
import { API_MOUNTS, PUBLIC_MOUNTS } from '../src/routes.js';

type Op = {
  responses: Record<string, unknown>;
  security?: unknown[];
  'x-roles'?: string[];
  parameters?: { in: string; name: string }[];
  requestBody?: { content: Record<string, { schema: { properties?: Record<string, unknown> } }> };
};
const spec = buildOpenApi();
const ops = Object.entries(spec.paths).flatMap(([p, m]) => Object.entries(m as Record<string, Op>).map(([method, op]) => ({ key: `${method.toUpperCase()} ${p}`, op })));

describe('documentation de l’API générée (Q-13)', () => {
  it('décrit toutes les routes déclarées, avec méthode, authentification et rôles lus dans le code', () => {
    expect(ops.length).toBe(listOperations().length);
    expect(ops.length).toBeGreaterThan(80);
    const find = (k: string) => ops.find((o) => o.key === k)?.op;

    expect(find('POST /api/auth/login')?.security).toBeUndefined(); // public
    expect(find('GET /api/auth/me')?.security).toBeDefined();
    expect(find('GET /api/leaves/mine')?.security).toBeDefined(); // protégée par router.use(requireAuth())
    expect(find('GET /api/rgpd/audit')?.['x-roles']).toEqual(['admin']);
    expect(find('POST /api/leaves/{id}/decision')?.['x-roles']).toEqual(['admin', 'manager']);
    expect(find('DELETE /api/users/{id}')?.responses['403']).toBeDefined();
    expect(find('GET /api/users/{id}/photo')?.parameters?.[0]).toMatchObject({ in: 'path', name: 'id' });
  });

  it('reprend les schémas partagés pour les corps et les paramètres', () => {
    const login = ops.find((o) => o.key === 'POST /api/auth/login')!.op;
    expect(Object.keys(login.requestBody!.content['application/json']!.schema.properties!)).toEqual(['email', 'password']);
    const users = ops.find((o) => o.key === 'GET /api/users')!.op;
    expect(users.parameters!.map((p) => p.name)).toEqual(expect.arrayContaining(['q', 'role', 'notRole', 'unsupervised', 'status', 'page', 'limit']));
  });

  it('toute route est décrite : une nouvelle route doit recevoir son annotation (src/openapi/annotations.ts)', () => {
    const missing = Object.entries(spec.paths).flatMap(([p, m]) =>
      Object.entries(m as Record<string, { 'x-documented'?: boolean }>)
        .filter(([, op]) => !op['x-documented'])
        .map(([method]) => `${method.toUpperCase()} ${p}`),
    );
    expect(missing).toEqual([]);
  });

  it('chaque opération prévoit une réponse d’erreur', () => {
    for (const { key, op } of ops) expect(op.responses.default, key).toBeDefined();
  });

  it('aucun routeur n’est oublié : un fichier *.routes.ts = un montage', () => {
    const dir = path.resolve(__dirname, '../src/modules');
    const files = fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.routes.ts'));
    expect(PUBLIC_MOUNTS.length + API_MOUNTS.length).toBe(files.length);
  });

  it('docs/openapi.json est à jour (régénérer avec « npm run gen:openapi » dans server/)', () => {
    const committed = fs.readFileSync(path.resolve(__dirname, '../../docs/openapi.json'), 'utf8');
    expect(JSON.parse(committed)).toEqual(JSON.parse(JSON.stringify(spec)));
  });
});

describe('page de documentation de développement', () => {
  const app = express().use('/api', docsRouter);

  it('sert la spécification, la page et son script', async () => {
    const json = await request(app).get('/api/openapi.json');
    expect(json.status).toBe(200);
    expect(json.body.openapi).toBe('3.1.0');
    const page = await request(app).get('/api/docs');
    expect(page.text).toContain('API Human Link');
    expect(page.text).not.toMatch(/<script>[^<]/); // aucun script en ligne : la CSP de l'application ne l'autoriserait pas
    expect((await request(app).get('/api/docs/viewer.js')).status).toBe(200);
  });
});
