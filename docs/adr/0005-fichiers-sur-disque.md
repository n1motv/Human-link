# ADR 0005 : Fichiers sur disque local plutôt que dans un stockage objet

**Statut :** acceptée

## Contexte

Il faut conserver des pièces jointes et un coffre-fort de documents par employé, avec un accès contrôlé et tracé.

## Décision

Les fichiers vivent sur un **volume local** (`STORAGE_DIR`, `/data/storage` dans le conteneur), chiffrés, sous un nom aléatoire. Ils ne sont jamais servis directement : chaque lecture passe par l'API (droits vérifiés, lecture tracée).

## Pourquoi

- Une instance par client sans dépendance externe : pas de compte S3 à créer ni de politique d'accès à maintenir par client.
- Le client héberge où il veut (sur site compris) : aucune donnée ne quitte son serveur, ce qui simplifie le RGPD.

## Conséquences

- Le volume fait partie des sauvegardes (`files.tar.gz`) et doit rester sur un disque fiable.
- Pas de montée en charge horizontale de l'application sans volume partagé : sans objet à l'échelle visée (quelques milliers d'employés par client).
- Migration vers du stockage objet possible plus tard : tout passe par `server/src/utils/storage.ts`.

## Alternatives écartées

S3 ou équivalent (dépendance et coût par client) ; stockage des fichiers dans MongoDB (GridFS : base plus lourde à sauvegarder, pas de gain de sécurité).
