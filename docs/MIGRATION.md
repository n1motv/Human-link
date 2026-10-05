# Migrer les données de l'ancienne version (Flask + SQLite)

Le script `server/src/scripts/migrate-from-sqlite.ts` lit l'ancienne base (chiffrée Fernet ou non) et la charge dans MongoDB.

```bash
cd server
npm run migrate:sqlite -- --db <chemin>/rh_data.db.enc --key "<ancienne SECRET_KEY>" --dry-run   # simple lecture, rien n'est écrit
npm run migrate:sqlite -- --db <chemin>/rh_data.db.enc --key "<ancienne SECRET_KEY>"
```

Options : `--files <dossier>` importe les documents du coffre-fort depuis une copie locale du bucket S3
(`aws s3 sync s3://<bucket> ./s3-copy`, puis `--files ./s3-copy`) ; `--dry-run` n'écrit rien.

## Ce qui est migré

| Ancienne table | Nouvelle collection | Remarques |
|---|---|---|
| `utilisateurs` | `users` | **Mots de passe conservés** (Argon2 identique) : les utilisateurs gardent leur mot de passe. Salaire, n° de sécu, téléphone, adresse chiffrés à l'import. Dates invalides (ex. « 30 ») ignorées. |
| `managers` | `supervisions` | |
| `demandes_congé` | `leaverequests` | Nombre de jours ouvrés recalculé selon la config du client |
| `demandes_arrêt` | `sickleaves` | Rattachés par e-mail dans l'ancienne base |
| `demandes_prime` | `bonusrequests` | |
| `réunion` + `réponse_réunion` | `meetings` (invités intégrés) | |
| `teletravail` | `teleworks` | |
| `demandes_contact` | `contactrequests` | |
| `feedback` | `feedbacks` | **Ré-anonymisé** : l'identifiant de l'utilisateur n'est pas repris |
| documents S3 `coffre_fort/...` | `storedfiles` + fichiers chiffrés | Uniquement avec `--files` ; rattachés par « NomPrénom » |

## Ce qui n'est pas migré

- **Notifications** (éphémères).
- **Photos de profil et justificatifs de congés/arrêts** stockés sur S3 : à récupérer manuellement (les téléverser via l'interface).
- Anciennes sessions, compteurs de tentatives, jetons.

## Après la migration

1. Se connecter avec un compte migré pour vérifier ; les administrateurs doivent activer la **2FA** à leur première connexion.
2. Le script est **idempotent par utilisateur** : si un e-mail existe déjà, ses données liées sont ignorées (aucun doublon).
3. Supprimer l'ancienne base, toute sauvegarde de l'ancien `.env` et les copies locales du bucket S3 ; révoquer les anciennes clés AWS et le mot de passe d'application Gmail
   (voir [SECURITE-RGPD.md](SECURITE-RGPD.md#secrets-de-lancienne-version)).
4. Les crédits de congés mensuels reprennent selon `dernierMoisMaj` (aucun double crédit).

Nécessite Node.js ≥ 22.5 (module `node:sqlite` intégré, aucune dépendance native).
