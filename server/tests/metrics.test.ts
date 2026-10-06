import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BUILD_ID } from '../src/config/version.js';
import { schemas } from '../src/shared.js';
import { client, connect, makeUser, session, resetDb, with2fa } from './helpers.js';

beforeAll(async () => {
  await connect();
  with2fa([]);
});
afterAll(() => mongoose.disconnect());

const TOKEN = { Authorization: 'Bearer jeton-de-test-des-metriques' };

describe('métriques Prometheus (T-14)', () => {
  it('exige le jeton : refus sans jeton ou avec un mauvais jeton', async () => {
    const c = await client();
    expect((await c.get('/metrics')).status).toBe(401);
    expect((await c.get('/metrics').set({ Authorization: 'Bearer mauvais-jeton-quelconque' })).status).toBe(401);
    expect((await c.get('/metrics').set(TOKEN)).status).toBe(200);
  });

  it('compte les requêtes par route modèle, sans identifiant ni donnée personnelle', async () => {
    await resetDb();
    const adm = await session('admin');
    const other = await makeUser('employe', { nom: 'Confidentiel', email: 'secret.personne@test.local' });
    await adm.c.get(`/api/users/${other._id}`);
    await (await client()).get('/api/inexistant-12345');
    const res = await (await client()).get('/metrics').set(TOKEN);
    const text = res.text;
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(text).toMatch(/humanlink_http_requests_total\{method="GET",route="\/api\/users\/:id",status="200"\} \d+/);
    expect(text).toMatch(/route="non_routee",status="404"/); // les URL inconnues sont regroupées
    expect(text).not.toContain(String(other._id));
    expect(text).not.toMatch(/Confidentiel|secret\.personne|inexistant-12345/);
    expect(text).toContain('humanlink_http_request_duration_seconds_bucket');
    expect(text).toContain(`humanlink_build_info{version="${BUILD_ID}"} 1`);
    expect(text).toMatch(/humanlink_mongo_connections \d+/);
    expect(text).toMatch(/humanlink_mongo_data_size_bytes \d+/);
  });

  it('compte les connexions réussies et échouées', async () => {
    await resetDb();
    const user = await makeUser('employe');
    const c = await client();
    await c.post('/api/auth/login').send({ email: user.email, password: 'mauvais-mot-de-passe-12' });
    const metrics = async () => (await (await client()).get('/metrics').set(TOKEN)).text;
    expect(await metrics()).toMatch(/humanlink_logins_total\{result="failure"\} [1-9]/);
    await session('employe');
    expect(await metrics()).toMatch(/humanlink_logins_total\{result="success"\} [1-9]/);
  });
});

describe('santé et version (T-16)', () => {
  it('annonce la version déployée et l’état de maintenance, jamais en cache', async () => {
    const res = await (await client()).get('/api/health');
    expect(schemas.health.safeParse(res.body).success).toBe(true);
    expect(res.body).toEqual({ ok: true, version: BUILD_ID, maintenance: false });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['permissions-policy']).toContain('camera=()'); // caméra, micro, position : interdits au navigateur
  });
});
