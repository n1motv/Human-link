import crypto from 'node:crypto';
import net from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { clientConfig } from '../src/config/client.js';
import { assertClean } from '../src/utils/antivirus.js';
import { throttleDelayMs } from '../src/utils/loginThrottle.js';
import { maskIp, parseUserAgent } from '../src/utils/userAgent.js';
import { PASSWORD, client, connect, makeUser, outbox, resetDb, with2fa } from './helpers.js';

beforeAll(connect);
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await resetDb();
  with2fa([]);
});

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0';

async function loginWith(email: string, ua: string, password = PASSWORD) {
  const c = await client();
  const res = await c.post('/api/auth/login').set('User-Agent', ua).send({ email, password });
  return { c, res };
}

describe('freinage progressif de la connexion', () => {
  it('double le délai après les tentatives gratuites, avec un plafond', () => {
    const free = clientConfig.security.loginFreeAttempts;
    expect(throttleDelayMs(free)).toBe(0);
    expect(throttleDelayMs(free + 1)).toBe(clientConfig.security.loginBaseDelaySeconds * 1000);
    expect(throttleDelayMs(free + 2)).toBe(clientConfig.security.loginBaseDelaySeconds * 2000);
    expect(throttleDelayMs(free + 50)).toBe(clientConfig.security.loginMaxDelayMinutes * 60_000);
  });

  it('refuse (429 + Retry-After) après 5 échecs pour un même compte et une même adresse, sans toucher aux autres comptes', async () => {
    const c = await client();
    const bad = () => c.post('/api/auth/login').send({ email: 'inconnu@test.local', password: 'mauvais-mot-de-passe' });
    for (let i = 0; i < 6; i++) expect((await bad()).status).toBe(401); // 5 gratuits, le 6e déclenche le délai
    const blocked = await bad();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('LOGIN_THROTTLED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);

    const other = await makeUser('employe');
    expect((await c.post('/api/auth/login').send({ email: other.email, password: PASSWORD })).status).toBe(200);
  });

  it('le renouvellement de session n’est pas freiné par les échecs de connexion', async () => {
    const u = await makeUser('employe');
    const { c } = await loginWith(u.email, CHROME_WIN);
    const anon = await client();
    for (let i = 0; i < 8; i++) await anon.post('/api/auth/login').send({ email: 'x@test.local', password: 'mauvais-mot-de-passe' });
    expect((await c.post('/api/auth/refresh')).status).toBe(200);
  });
});

describe('appareils connectés', () => {
  it('liste les sessions, marque la courante et permet d’en fermer une à distance', async () => {
    const u = await makeUser('employe');
    const { c: laptop } = await loginWith(u.email, CHROME_WIN);
    const { c: linux } = await loginWith(u.email, FIREFOX_LINUX);

    const list = await laptop.get('/api/auth/sessions');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    const current = list.body.items.find((s: { current: boolean }) => s.current);
    expect(current).toMatchObject({ browser: 'Chrome', os: 'Windows', device: 'desktop' });
    const other = list.body.items.find((s: { current: boolean }) => !s.current);
    expect(other).toMatchObject({ browser: 'Firefox', os: 'Linux' });
    expect(JSON.stringify(list.body)).not.toMatch(/tokenHash|ipHash/);

    expect((await laptop.delete(`/api/auth/sessions/${other.id}`)).status).toBe(200);
    expect((await linux.post('/api/auth/refresh')).status).toBe(401); // l'autre appareil ne peut plus se renouveler
    expect((await laptop.get('/api/auth/sessions')).body.items).toHaveLength(1);
  });

  it('refuse de fermer la session d’une autre personne', async () => {
    const a = await makeUser('employe');
    const b = await makeUser('employe');
    const { c: ca } = await loginWith(a.email, CHROME_WIN);
    const { c: cb } = await loginWith(b.email, CHROME_WIN);
    const bSession = (await cb.get('/api/auth/sessions')).body.items[0];
    expect((await ca.delete(`/api/auth/sessions/${bSession.id}`)).status).toBe(404);
    expect((await cb.get('/api/auth/sessions')).body.items).toHaveLength(1);
  });

  it('« déconnecter les autres appareils » garde la session courante', async () => {
    const u = await makeUser('employe');
    const { c: one } = await loginWith(u.email, CHROME_WIN);
    await loginWith(u.email, FIREFOX_LINUX);
    await loginWith(u.email, FIREFOX_LINUX);
    const res = await one.delete('/api/auth/sessions');
    expect(res.status).toBe(200);
    expect(res.body.closed).toBe(2);
    expect((await one.get('/api/auth/sessions')).body.items).toHaveLength(1);
  });

  it('lit le User-Agent et masque l’adresse IP', () => {
    expect(parseUserAgent(CHROME_WIN)).toEqual({ browser: 'Chrome', os: 'Windows', device: 'desktop' });
    expect(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1')).toEqual({
      browser: 'Safari',
      os: 'iOS',
      device: 'mobile',
    });
    expect(maskIp('203.0.113.42')).toBe('203.0.•.•');
    expect(maskIp('::ffff:198.51.100.7')).toBe('198.51.•.•');
  });
});

describe('alerte de nouvel appareil', () => {
  it('ne prévient pas à la première connexion ni depuis un appareil déjà connu, mais prévient depuis un nouveau', async () => {
    const u = await makeUser('employe');
    await loginWith(u.email, CHROME_WIN);
    expect(outbox.filter((m) => m.subject.includes('Nouvelle connexion'))).toHaveLength(0);
    await loginWith(u.email, CHROME_WIN);
    expect(outbox.filter((m) => m.subject.includes('Nouvelle connexion'))).toHaveLength(0);

    await loginWith(u.email, FIREFOX_LINUX);
    const alert = outbox.filter((m) => m.subject.includes('Nouvelle connexion') && m.to === u.email);
    expect(alert).toHaveLength(1);
    expect(alert[0]!.text).toMatch(/Firefox/);
    expect(alert[0]!.text).toMatch(/Linux/);
    expect(alert[0]!.text).toMatch(/\/not-me\?token=/);
    // l'adresse complète n'est jamais envoyée
    expect(alert[0]!.text).not.toMatch(/127\.0\.0\.1/);

    await loginWith(u.email, FIREFOX_LINUX); // désormais connu
    expect(outbox.filter((m) => m.subject.includes('Nouvelle connexion'))).toHaveLength(1);
  });

  it('« ce n’était pas moi » ferme toutes les sessions et envoie un lien de nouveau mot de passe', async () => {
    const u = await makeUser('employe');
    const { c: mine } = await loginWith(u.email, CHROME_WIN);
    const { c: intruder } = await loginWith(u.email, FIREFOX_LINUX);
    const token = /token=([\w.-]+)/.exec(outbox.find((m) => m.subject.includes('Nouvelle connexion'))!.text)![1]!;

    const anon = await client();
    expect((await anon.post('/api/auth/not-me').send({ token: 'x'.repeat(40) })).status).toBe(400);
    expect((await anon.post('/api/auth/not-me').send({ token })).status).toBe(200);

    expect((await intruder.get('/api/leaves/mine')).status).toBe(401); // jetons d'accès invalidés tout de suite
    expect((await mine.get('/api/leaves/mine')).status).toBe(401);
    const reset = outbox.find((m) => m.to === u.email && m.subject.includes('Sécurisez'));
    expect(reset?.text).toMatch(/reset-password\?token=/);
  });
});

describe('mots de passe divulgués (k-anonymat)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    env.HIBP_ENABLED = undefined;
    vi.restoreAllMocks();
  });

  const sha1 = (p: string) => crypto.createHash('sha1').update(p).digest('hex').toUpperCase();

  async function resetWith(password: string) {
    const u = await makeUser('employe');
    const anon = await client();
    await anon.post('/api/auth/forgot-password').send({ email: u.email });
    const token = /token=([\w-]+)/.exec(outbox.find((m) => m.to === u.email)!.text)![1];
    return anon.post('/api/auth/reset-password').send({ token, password });
  }

  it('refuse un mot de passe présent dans une fuite, sans jamais envoyer plus de 5 caractères de son empreinte', async () => {
    const pwd = 'Nouveau-Mot-De-Passe-77';
    env.HIBP_ENABLED = true;
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(`0000000000000000000000000000000000A:3\r\n${sha1(pwd).slice(5)}:48213\r\n`);
    }) as typeof fetch;
    const res = await resetWith(pwd);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PASSWORD_PWNED');
    expect(calls[0]).toBe(`https://api.pwnedpasswords.com/range/${sha1(pwd).slice(0, 5)}`);
    expect(calls[0]).not.toContain(pwd);
  });

  it('accepte un mot de passe absent des fuites, et laisse passer si le service est en panne', async () => {
    const pwd = 'Nouveau-Mot-De-Passe-77';
    env.HIBP_ENABLED = true;
    globalThis.fetch = vi.fn(async () => new Response('0000000000000000000000000000000000A:3\r\n')) as typeof fetch;
    expect((await resetWith(pwd)).status).toBe(200);

    globalThis.fetch = vi.fn(async () => {
      throw new Error('réseau coupé');
    }) as typeof fetch;
    expect((await resetWith('Encore-Un-Autre-Mdp-55')).status).toBe(200);
  });

  it('peut être désactivé par client', async () => {
    env.HIBP_ENABLED = true;
    clientConfig.security.checkPwnedPasswords = false;
    globalThis.fetch = vi.fn(async () => new Response('')) as typeof fetch;
    expect((await resetWith('Nouveau-Mot-De-Passe-77')).status).toBe(200);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    clientConfig.security.checkPwnedPasswords = true;
  });
});

describe('antivirus ClamAV', () => {
  let server: net.Server;
  let port = 0;

  beforeAll(async () => {
    // Faux démon clamd : lit le flux INSTREAM puis répond comme le vrai (EICAR = infecté).
    server = net.createServer((socket) => {
      const chunks: Buffer[] = [];
      socket.on('data', (d) => {
        chunks.push(d as Buffer);
        const all = Buffer.concat(chunks);
        if (all.subarray(-4).equals(Buffer.alloc(4))) {
          socket.end(all.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE') ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as net.AddressInfo).port;
  });
  afterAll(() => server.close());
  afterEach(() => {
    env.CLAMAV_HOST = undefined;
    env.CLAMAV_REQUIRED = false;
  });

  it('accepte un fichier sain, refuse un fichier infecté et ne fait rien sans ClamAV', async () => {
    await assertClean(Buffer.from('bonjour')); // sans CLAMAV_HOST : ignoré
    env.CLAMAV_HOST = '127.0.0.1';
    env.CLAMAV_PORT = port;
    await expect(assertClean(Buffer.from('contrat de travail'))).resolves.toBeUndefined();
    const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
    await expect(assertClean(eicar, 'virus.pdf')).rejects.toMatchObject({ status: 400, code: 'INFECTED_FILE' });
  });

  it('antivirus injoignable : accepte par défaut, refuse (503) si CLAMAV_REQUIRED', async () => {
    env.CLAMAV_HOST = '127.0.0.1';
    env.CLAMAV_PORT = 1; // personne n'écoute
    await expect(assertClean(Buffer.from('ok'))).resolves.toBeUndefined();
    env.CLAMAV_REQUIRED = true;
    await expect(assertClean(Buffer.from('ok'))).rejects.toMatchObject({ status: 503, code: 'SCAN_UNAVAILABLE' });
  });
});

describe('rotation des clés de chiffrement', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
  });

  const hex = () => crypto.randomBytes(32).toString('hex');
  async function loadCrypto(fieldKey: string, fieldOld: string | undefined, fileKey: string, fileOld?: string) {
    process.env.FIELD_ENCRYPTION_KEY = fieldKey;
    process.env.FILE_ENCRYPTION_KEY = fileKey;
    if (fieldOld) process.env.FIELD_ENCRYPTION_KEYS_OLD = fieldOld;
    else delete process.env.FIELD_ENCRYPTION_KEYS_OLD;
    if (fileOld) process.env.FILE_ENCRYPTION_KEYS_OLD = fileOld;
    else delete process.env.FILE_ENCRYPTION_KEYS_OLD;
    vi.resetModules();
    return import('../src/utils/crypto.js');
  }

  it('chaque valeur chiffrée porte l’identifiant de sa clé, et l’ancienne clé reste lisible pendant la rotation', async () => {
    const [k1, k2, f1, f2] = [hex(), hex(), hex(), hex()];
    const before = await loadCrypto(k1, undefined, f1);
    const secret = before.encryptField('1850175123456');
    const file = before.encryptBuffer(Buffer.from('%PDF-1.4 contenu'));
    expect(secret).toMatch(/^enc:v2:[0-9a-f]{8}:/);
    expect(before.fieldNeedsRotation(secret)).toBe(false);

    // Nouvelle clé courante, ancienne conservée en lecture : aucun arrêt, tout reste lisible.
    const during = await loadCrypto(k2, k1, f2, f1);
    expect(during.decryptField(secret)).toBe('1850175123456');
    expect(during.decryptBuffer(file).toString()).toBe('%PDF-1.4 contenu');
    expect(during.fieldNeedsRotation(secret)).toBe(true);
    expect(during.bufferNeedsRotation(file)).toBe(true);

    // Rechiffrement : la valeur passe sous la clé courante.
    const rotated = during.encryptField(during.decryptField(secret));
    const rotatedFile = during.encryptBuffer(during.decryptBuffer(file));
    expect(during.fieldNeedsRotation(rotated)).toBe(false);
    expect(during.bufferNeedsRotation(rotatedFile)).toBe(false);

    // Ancienne clé retirée : les données rechiffrées restent lisibles, les autres non.
    const after = await loadCrypto(k2, undefined, f2);
    expect(after.decryptField(rotated)).toBe('1850175123456');
    expect(after.decryptBuffer(rotatedFile).toString()).toBe('%PDF-1.4 contenu');
    expect(() => after.decryptField(secret)).toThrow(/inconnue/);
    expect(() => after.decryptBuffer(file)).toThrow();
  });

  it('relit les valeurs de l’ancien format (sans identifiant de clé)', async () => {
    const k1 = hex();
    const f1 = hex();
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(k1, 'hex'), iv);
    const enc = Buffer.concat([c.update('ancien', 'utf8'), c.final()]);
    const v1 = 'enc:v1:' + [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
    const lib = await loadCrypto(k1, undefined, f1);
    expect(lib.decryptField(v1)).toBe('ancien');
    expect(lib.fieldNeedsRotation(v1)).toBe(true);

    const fiv = crypto.randomBytes(12);
    const fc = crypto.createCipheriv('aes-256-gcm', Buffer.from(f1, 'hex'), fiv);
    const fenc = Buffer.concat([fc.update(Buffer.from('fichier')), fc.final()]);
    const legacyFile = Buffer.concat([fiv, fc.getAuthTag(), fenc]);
    expect(lib.decryptBuffer(legacyFile).toString()).toBe('fichier');
    expect(lib.bufferNeedsRotation(legacyFile)).toBe(true);
  });
});
