import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fingerprint, scrubPath, scrubStack, scrubText } from '../src/utils/monitoring.js';
import { client, connect } from './helpers.js';

beforeAll(connect);
afterAll(() => mongoose.disconnect());

describe('suivi des erreurs : aucune donnée personnelle dans les rapports (T-03)', () => {
  it('retire e-mails, identifiants, jetons et longs nombres', () => {
    const text = scrubText('Échec pour sofia.lopez@acme.test (id 6650f1a2b3c4d5e6f7a8b9c0) jeton abcdefghijklmnopqrstuvwxyz0123456789 tel 0612345678');
    expect(text).not.toMatch(/sofia|acme|6650f1a2|abcdefghij|0612345678/);
    expect(text).toContain('[email]');
    expect(text).toContain(':id');
  });

  it('ne garde que le chemin des adresses, sans paramètres ni identifiants', () => {
    expect(scrubPath('https://rh.acme.test/admin/employees/6650f1a2b3c4d5e6f7a8b9c0/edit?token=secret#x')).toBe('/admin/employees/:id/edit');
    expect(scrubPath('/documents/42?name=Sofia')).toBe('/documents/:id');
  });

  it('nettoie la pile : paramètres d’adresse retirés, longueur bornée', () => {
    const stack = ['Error: boom', ...Array.from({ length: 30 }, (_, i) => `    at f${i} (https://rh.test/assets/app.js?email=a@b.fr:1:${i})`)].join('\n');
    const out = scrubStack(stack);
    expect(out.split('\n')).toHaveLength(12);
    expect(out).not.toContain('email=');
    expect(out).not.toContain('a@b.fr');
  });

  it('donne la même empreinte à la même erreur, une autre à une erreur différente', () => {
    const a = { source: 'browser' as const, kind: 'window', message: 'x is undefined', stack: 'Error\n    at f (app.js:1:1)' };
    expect(fingerprint(a)).toBe(fingerprint({ ...a }));
    expect(fingerprint(a)).not.toBe(fingerprint({ ...a, message: 'y is undefined' }));
  });
});

describe('POST /api/client-errors', () => {
  it('accepte un rapport sans session ni jeton CSRF', async () => {
    const c = await client();
    const res = await c.raw.post('/api/client-errors').send({ kind: 'render', message: 'Cannot read properties of undefined', route: '/me?x=1', release: '3.0.0' });
    expect(res.status).toBe(204);
  });

  it('refuse un type inconnu, un message trop long ou un corps absent', async () => {
    const c = await client();
    expect((await c.raw.post('/api/client-errors').send({ kind: 'autre', message: 'x' })).status).toBe(400);
    expect((await c.raw.post('/api/client-errors').send({ kind: 'window', message: 'x'.repeat(2001) })).status).toBe(400);
    expect((await c.raw.post('/api/client-errors').send({})).status).toBe(400);
  });
});
