// Rechiffre toutes les données (champs sensibles et fichiers) avec la clé COURANTE.
// Procédure complète : docs/SECURITE-RGPD.md (« Rotation des clés »).
//   npm run rotate-keys -- --dry-run     compte ce qui reste à rechiffrer, sans rien écrire
//   npm run rotate-keys                  rechiffre (reprise possible : seules les valeurs anciennes sont traitées)
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import '../models/User.js';
import '../models/ContactRequest.js';
import { StoredFile } from '../models/StoredFile.js';
import { bufferNeedsRotation, decryptBuffer, decryptField, encryptBuffer, encryptField, fieldNeedsRotation } from '../utils/crypto.js';
import { encryptedNumber, encryptedString } from '../models/plugins.js';
import { readRaw, replaceRaw } from '../utils/storage.js';

const dry = process.argv.includes('--dry-run');
await mongoose.connect(env.MONGODB_URI);

type Raw = Record<string, unknown>;
const getPath = (o: Raw, p: string): unknown => p.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Raw)[k] : undefined), o);

let fields = 0;
let fieldErrors = 0;
for (const name of mongoose.modelNames()) {
  const model = mongoose.model(name);
  const paths: string[] = [];
  model.schema.eachPath((p, type) => {
    const set = (type.options as { set?: unknown }).set;
    if (set === encryptedString.set || set === encryptedNumber.set) paths.push(p);
  });
  if (!paths.length) continue;
  // Accès brut à la collection : on manipule le texte chiffré tel quel, sans getters ni setters.
  for await (const doc of model.collection.find({ $or: paths.map((p) => ({ [p]: { $type: 'string' } })) })) {
    const $set: Raw = {};
    for (const p of paths) {
      const v = getPath(doc as Raw, p);
      if (!fieldNeedsRotation(v)) continue;
      try {
        $set[p] = encryptField(decryptField(v as string));
      } catch (e) {
        fieldErrors++;
        console.error(`✗ ${name}.${p} (${String(doc._id)}) : ${(e as Error).message}`);
      }
    }
    if (Object.keys($set).length) {
      fields += Object.keys($set).length;
      if (!dry) await model.collection.updateOne({ _id: doc._id }, { $set });
    }
  }
}

let files = 0;
let fileErrors = 0;
for await (const f of StoredFile.find().select('+storageKey').cursor()) {
  try {
    const raw = await readRaw(f.storageKey);
    if (!bufferNeedsRotation(raw)) continue;
    files++;
    if (!dry) await replaceRaw(f.storageKey, encryptBuffer(decryptBuffer(raw)));
  } catch (e) {
    fileErrors++;
    console.error(`✗ fichier ${f.storageKey} : ${(e as Error).message}`);
  }
}

console.log(`${dry ? '[simulation] ' : ''}Champs ${dry ? 'à rechiffrer' : 'rechiffrés'} : ${fields} · Fichiers : ${files}`);
if (fieldErrors || fileErrors) console.error(`${fieldErrors + fileErrors} élément(s) n'ont pas pu être déchiffrés : leur clé est-elle bien dans *_ENCRYPTION_KEYS_OLD ?`);
await mongoose.disconnect();
process.exit(fieldErrors || fileErrors ? 1 : 0);
