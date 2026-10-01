import multer from 'multer';
import { MAX_FILE_BYTES } from '../utils/storage.js';

/** Fichiers gardés en mémoire (10 Mo max, un seul fichier) : validés puis chiffrés avant toute écriture disque. */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 20, parts: 25 },
});
