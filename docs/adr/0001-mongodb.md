# ADR 0001 : MongoDB plutôt qu’une base SQL

**Statut :** acceptée

## Contexte

L'ancienne version (Flask) utilisait SQLite : un fichier, pas de contrôle d'accès, pas de réplication. Chaque client doit avoir **ses données isolées**, avec des sauvegardes et une montée en charge simples. Les données RH sont des documents assez autonomes (une demande de congé, un arrêt, une prime) qui évoluent d'un client à l'autre.

## Décision

MongoDB 7, **une base par client**, avec authentification, accessible uniquement depuis l'application (aucun port publié).

## Pourquoi

- Une base par client donne une isolation vérifiable : pas de colonne `client_id` à oublier dans une requête, une sauvegarde ou une suppression concerne un seul client.
- Les documents suivent les écrans (une demande = un document) et les champs sensibles se chiffrent un par un.
- `mongodump` / `mongorestore` suffisent pour les sauvegardes (voir `deploy/backup/`).

## Conséquences

- Pas de jointures : on dénormalise peu et on utilise `populate` avec parcimonie. Les index sont vérifiés par `server/tests/indexes.test.ts` (chaque requête fréquente doit utiliser un index).
- Pas de contraintes relationnelles : l'intégrité vient des schémas Mongoose, de zod aux frontières et d'index uniques (un seul manager par personne, un seul directeur).
- Un seul MongoDB peut héberger plusieurs clients (une base chacun) pour les tests ; en production, une instance par client est recommandée.

## Alternatives écartées

PostgreSQL (jointures et contraintes, mais isolation par client plus lourde : une base par client demande plus d'administration) ; SQLite conservé (aucune authentification, un seul processus).
