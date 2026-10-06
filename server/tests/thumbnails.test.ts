import fs from 'node:fs';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StoredFile } from '../src/models/StoredFile.js';
import { User } from '../src/models/User.js';
import { client, connect, resetDb, session, with2fa } from './helpers.js';

beforeAll(connect);
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await resetDb();
  with2fa([]);
  fs.rmSync(process.env.STORAGE_DIR!, { recursive: true, force: true });
});

const photo = (w = 1200, h = 800, color = '#cc3355') =>
  sharp({ create: { width: w, height: h, channels: 3, background: color } })
    .png()
    .toBuffer();
const filesOnDisk = () =>
  fs.existsSync(process.env.STORAGE_DIR!) ? (fs.readdirSync(process.env.STORAGE_DIR!, { recursive: true }) as string[]).filter((f) => f.endsWith('.bin')) : [];
const bin = (res: { body: unknown }) => res.body as Buffer;

describe('miniatures des photos de profil (P-12)', () => {
  it('sert une miniature carrée en WebP, bien plus légère que l’original, et l’original sans paramètre', async () => {
    const emp = await session('employe');
    const original = await photo();
    expect((await emp.c.post('/api/users/me/photo').attach('photo', original, 'moi.png')).status).toBe(200);
    const id = String(emp.user._id);
    const binary = (url: string) =>
      emp.c.raw
        .get(url)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });

    const sm = await binary(`/api/users/${id}/photo?size=sm`);
    expect(sm.status).toBe(200);
    expect(sm.headers['content-type']).toBe('image/webp');
    const meta = await sharp(bin(sm)).metadata();
    expect([meta.width, meta.height]).toEqual([96, 96]);

    const md = await binary(`/api/users/${id}/photo?size=md`);
    expect((await sharp(bin(md)).metadata()).width).toBe(256);

    const full = await binary(`/api/users/${id}/photo`);
    expect(full.headers['content-type']).toBe('image/png');
    expect((await sharp(bin(full)).metadata()).width).toBe(1200);
    expect(bin(sm).length).toBeLessThan(bin(full).length / 5);
  });

  it('génère la miniature une seule fois puis la réutilise', async () => {
    const emp = await session('employe');
    await emp.c.post('/api/users/me/photo').attach('photo', await photo(), 'moi.png');
    for (let i = 0; i < 3; i++) expect((await emp.c.get(`/api/users/${emp.user._id}/photo?size=sm`)).status).toBe(200);
    expect(await StoredFile.countDocuments({ ownerId: emp.user._id, label: 'Miniature 96' })).toBe(1);
    expect(filesOnDisk()).toHaveLength(2); // l'original et sa miniature, chiffrés
  });

  it('retire les miniatures de l’ancienne photo quand on en envoie une nouvelle', async () => {
    const emp = await session('employe');
    await emp.c.post('/api/users/me/photo').attach('photo', await photo(), 'a.png');
    await emp.c.get(`/api/users/${emp.user._id}/photo?size=sm`);
    expect(filesOnDisk()).toHaveLength(2);
    await emp.c.post('/api/users/me/photo').attach('photo', await photo(800, 800, '#3355cc'), 'b.png');
    expect(filesOnDisk()).toHaveLength(1); // seule la nouvelle photo reste, sans miniature périmée
    const user = await User.findById(emp.user._id);
    expect(user?.photoThumbs?.sm).toBeUndefined();
    const res = await emp.c.raw
      .get(`/api/users/${emp.user._id}/photo?size=sm`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    const { data } = await sharp(res.body as Buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[2]! > data[0]!).toBe(true); // bleu dominant : c'est bien la nouvelle photo
  });

  it('exige une connexion, refuse une taille inconnue et répond 404 sans photo', async () => {
    const emp = await session('employe');
    expect((await (await client()).get(`/api/users/${emp.user._id}/photo?size=sm`)).status).toBe(401);
    expect((await emp.c.get(`/api/users/${emp.user._id}/photo?size=sm`)).status).toBe(404);
    await emp.c.post('/api/users/me/photo').attach('photo', await photo(), 'moi.png');
    expect((await emp.c.get(`/api/users/${emp.user._id}/photo?size=gigantesque`)).status).toBe(400);
  });

  it('l’anonymisation efface aussi les miniatures', async () => {
    const adm = await session('admin');
    const emp = await session('employe');
    await emp.c.post('/api/users/me/photo').attach('photo', await photo(), 'moi.png');
    await emp.c.get(`/api/users/${emp.user._id}/photo?size=md`);
    expect(filesOnDisk().length).toBe(2);
    await adm.c.delete(`/api/users/${emp.user._id}`);
    expect((await adm.c.post(`/api/users/${emp.user._id}/anonymize`)).status).toBe(200);
    expect(filesOnDisk()).toHaveLength(0);
    expect((await User.findById(emp.user._id))?.photoThumbs).toBeUndefined();
  });
});
