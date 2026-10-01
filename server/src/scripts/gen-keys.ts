import crypto from 'node:crypto';

// Affiche 4 clés prêtes à coller dans .env. Ne rien écrire sur disque : les secrets ne transitent pas par des fichiers générés.
for (const name of ['JWT_SECRET', 'FIELD_ENCRYPTION_KEY', 'FILE_ENCRYPTION_KEY', 'PSEUDONYM_KEY']) {
  console.log(`${name}=${crypto.randomBytes(32).toString('hex')}`);
}
console.log('\nConservez FIELD_ENCRYPTION_KEY et FILE_ENCRYPTION_KEY dans un coffre : les perdre rend les données chiffrées illisibles.');
