import request from 'supertest';
import { generate } from 'otplib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { clientConfig } from '../src/config/client.js';
import { PASSWORD, app, client, connect, loginAs, makeUser, outbox, resetDb, session, with2fa } from './helpers.js';

beforeAll(connect);
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await resetDb();
  with2fa([]);
});

describe('connexion', () => {
  it('connecte un utilisateur valide et pose des cookies httpOnly', async () => {
    const u = await makeUser('employe');
    const c = await client();
    const res = await c.post('/api/auth/login').send({ email: u.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(u.email);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    for (const name of ['hl_at', 'hl_rt']) {
      const cookie = cookies.find((x) => x.startsWith(`${name}=`))!;
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
    }
    // aucun secret dans la réponse
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenVersion|resetTokenHash/);
  });

  it('renvoie le même message pour un mauvais mot de passe et un e-mail inconnu', async () => {
    const u = await makeUser('employe');
    const c = await client();
    const a = await c.post('/api/auth/login').send({ email: u.email, password: 'mauvais-mot-de-passe' });
    const b = await c.post('/api/auth/login').send({ email: 'inconnu@test.local', password: 'mauvais-mot-de-passe' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('verrouille le compte après trop de tentatives, même avec le bon mot de passe ensuite', async () => {
    const u = await makeUser('employe');
    const c = await client();
    for (let i = 0; i < clientConfig.security.maxLoginAttempts; i++) {
      await c.post('/api/auth/login').send({ email: u.email, password: 'faux-faux-faux' });
    }
    const res = await c.post('/api/auth/login').send({ email: u.email, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(outbox.some((m) => m.to === u.email && /verrouillé/i.test(m.subject))).toBe(true);
  });

  it("refuse une injection NoSQL dans l'e-mail ou le mot de passe", async () => {
    const u = await makeUser('employe');
    const c = await client();
    const a = await c.post('/api/auth/login').send({ email: { $ne: null }, password: PASSWORD });
    const b = await c.post('/api/auth/login').send({ email: u.email, password: { $ne: null } });
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
  });

  it('refuse un compte archivé ou non activé', async () => {
    const archived = await makeUser('employe', { status: 'archived' });
    const invited = await makeUser('employe', { status: 'invited' });
    expect((await loginAs(archived.email)).res.status).toBe(401);
    expect((await loginAs(invited.email)).res.status).toBe(401);
  });
});

describe('CSRF et session', () => {
  it('refuse une écriture sans jeton CSRF', async () => {
    const { c } = await session('employe');
    // Session valide (cookies envoyés par l'agent) mais aucun en-tête X-CSRF-Token.
    const res = await c.raw.post('/api/auth/logout').send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF');
  });

  it('exige une session pour les routes protégées', async () => {
    const res = await request(app).get('/api/leaves/mine');
    expect(res.status).toBe(401);
  });

  it('tourne le jeton de rafraîchissement et détecte sa réutilisation', async () => {
    const u = await makeUser('employe');
    const c = await client();
    const login = await c.post('/api/auth/login').send({ email: u.email, password: PASSWORD });
    const oldRefresh = ((login.headers['set-cookie'] as unknown as string[]).find((x) => x.startsWith('hl_rt=')) ?? '').split(';')[0]!;

    const r1 = await c.post('/api/auth/refresh').send({});
    expect(r1.status).toBe(200);

    // On rejoue l'ancien jeton après le délai de tolérance : la famille entière est révoquée.
    const { RefreshToken } = await import('../src/models/RefreshToken.js');
    await RefreshToken.updateMany({}, { usedAt: new Date(Date.now() - 60_000) });
    const replay = await request(app).post('/api/auth/refresh').set('X-CSRF-Token', 'x').set('Cookie', `${oldRefresh}; hl_csrf=x`).send({});
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('TOKEN_REUSED');
    // Le jeton légitime issu de la rotation est lui aussi révoqué.
    const after = await c.post('/api/auth/refresh').send({});
    expect(after.status).toBe(401);
  });

  it('invalide la session après déconnexion', async () => {
    const { c } = await session('employe');
    expect((await c.get('/api/leaves/mine')).status).toBe(200);
    await c.post('/api/auth/logout').send({});
    expect((await c.get('/api/leaves/mine')).status).toBe(401);
  });

  it("révoque immédiatement l'accès d'un compte archivé", async () => {
    const { c, user } = await session('employe');
    await User.updateOne({ _id: user._id }, { status: 'archived' });
    expect((await c.get('/api/leaves/mine')).status).toBe(401);
  });
});

describe('activation et mot de passe oublié', () => {
  it('active un compte invité via le lien reçu par e-mail, sans jamais envoyer de mot de passe', async () => {
    const { c: admin } = await session('admin');
    const res = await admin.post('/api/users').send({ nom: 'Dupont', prenom: 'Jean', email: 'jean@test.local', role: 'employe', salaire: 3000, numeroSecu: '1850175123456' });
    expect(res.status).toBe(201);
    const mail = outbox.find((m) => m.to === 'jean@test.local')!;
    expect(mail.text).not.toMatch(/mot de passe temporaire/i);
    const token = /token=([\w-]+)/.exec(mail.text)![1];

    const anon = await client();
    expect((await anon.post('/api/auth/activate').send({ token, password: 'court' })).status).toBe(400);
    expect((await anon.post('/api/auth/activate').send({ token, password: 'Un-Bon-Mot-De-Passe-42' })).status).toBe(200);
    expect((await anon.post('/api/auth/activate').send({ token, password: 'Un-Bon-Mot-De-Passe-42' })).status).toBe(400); // usage unique
    expect((await loginAs('jean@test.local', 'Un-Bon-Mot-De-Passe-42')).res.status).toBe(200);
  });

  it("répond identiquement que l'e-mail existe ou non, et réinitialise via le lien", async () => {
    const u = await makeUser('employe');
    const c = await client();
    const known = await c.post('/api/auth/forgot-password').send({ email: u.email });
    const unknown = await c.post('/api/auth/forgot-password').send({ email: 'personne@test.local' });
    expect(known.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(outbox.filter((m) => m.to === 'personne@test.local')).toHaveLength(0);

    const token = /token=([\w-]+)/.exec(outbox.find((m) => m.to === u.email)!.text)![1];
    expect((await c.post('/api/auth/reset-password').send({ token, password: 'Nouveau-Mot-De-Passe-77' })).status).toBe(200);
    expect((await loginAs(u.email, PASSWORD)).res.status).toBe(401);
    expect((await loginAs(u.email, 'Nouveau-Mot-De-Passe-77')).res.status).toBe(200);
  });

  it('un changement de mot de passe déconnecte les autres sessions', async () => {
    const u = await makeUser('employe');
    const { c: first } = await loginAs(u.email);
    const { c: second } = await loginAs(u.email);
    const res = await second.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'Encore-Un-Autre-Mdp-55' });
    expect(res.status).toBe(200);
    expect((await first.get('/api/leaves/mine')).status).toBe(401);
    expect((await second.get('/api/leaves/mine')).status).toBe(200);
  });
});

describe('double authentification', () => {
  it("impose la 2FA à l'admin, la configure puis la demande à la connexion", async () => {
    with2fa(['admin']);
    const admin = await makeUser('admin');
    const { c, res } = await loginAs(admin.email);
    expect(res.body.pending2fa).toBe(true);
    // Tant que la 2FA n'est pas activée, tout est bloqué sauf la configuration.
    expect((await c.get('/api/users')).status).toBe(403);

    const setup = await c.post('/api/auth/2fa/setup').send({});
    expect(setup.status).toBe(200);
    expect(setup.body.qrDataUrl).toMatch(/^data:image\/png/);
    const secret = setup.body.secret as string;
    expect((await c.post('/api/auth/2fa/enable').send({ code: '000000' })).status).toBe(400);
    const enable = await c.post('/api/auth/2fa/enable').send({ code: await generate({ secret }) });
    expect(enable.status).toBe(200);
    expect(enable.body.recoveryCodes).toHaveLength(8);
    expect((await c.get('/api/users')).status).toBe(200);

    // Nouvelle connexion : le mot de passe seul ne suffit plus.
    const c2 = await client();
    const step1 = await c2.post('/api/auth/login').send({ email: admin.email, password: PASSWORD });
    expect(step1.body.twoFactorRequired).toBe(true);
    expect(String(step1.headers['set-cookie'] ?? '')).not.toMatch(/hl_at=/);
    const bad = await c2.post('/api/auth/2fa/login').send({ challenge: step1.body.challenge, code: '123456' });
    expect(bad.status).toBe(401);
    const good = await c2.post('/api/auth/2fa/login').send({ challenge: step1.body.challenge, code: await generate({ secret }) });
    expect(good.status).toBe(200);
    expect((await c2.get('/api/users')).status).toBe(200);

    // Un code de secours fonctionne une seule fois.
    const recovery = enable.body.recoveryCodes[0] as string;
    const c3 = await client();
    const s3 = await c3.post('/api/auth/login').send({ email: admin.email, password: PASSWORD });
    expect((await c3.post('/api/auth/2fa/login').send({ challenge: s3.body.challenge, code: recovery })).status).toBe(200);
    const c4 = await client();
    const s4 = await c4.post('/api/auth/login').send({ email: admin.email, password: PASSWORD });
    expect((await c4.post('/api/auth/2fa/login').send({ challenge: s4.body.challenge, code: recovery })).status).toBe(401);
  });

  it('le secret TOTP est chiffré en base', async () => {
    with2fa([]);
    const { c, user } = await session('employe');
    const setup = await c.post('/api/auth/2fa/setup').send({});
    await c.post('/api/auth/2fa/enable').send({ code: await generate({ secret: setup.body.secret }) });
    const raw = await mongoose.connection.db!.collection('users').findOne({ _id: user._id });
    expect(raw!.twoFactor.secret).toMatch(/^enc:v2:/);
    expect(JSON.stringify(raw)).not.toContain(setup.body.secret);
  });
});
