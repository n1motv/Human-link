# ADR 0006 : TypeScript partout et un contrat de données partagé (zod)

**Statut :** acceptée

## Contexte

Le serveur et le client répétaient les mêmes formes de données : une divergence ne se voyait qu'à l'exécution, chez l'utilisateur.

## Décision

TypeScript pour le serveur et le client. Le dossier `shared/` décrit les données de l'API avec des **schémas zod** (listes de valeurs, corps de requête, réponses) ; le client en tire ses types, le serveur ses validations, et `server/tests/contract.test.ts` vérifie les vraies réponses contre ces schémas.

## Pourquoi

Une seule définition, vérifiée automatiquement : ajouter un champ côté serveur sans mettre à jour le contrat fait échouer les tests. C'est aussi la base de la documentation OpenAPI générée (`docs/openapi.json`).

## Conséquences

- `shared/` n'importe zod que pour ses **types** : le serveur et le client ont chacun leur copie de zod, et deux copies ne se reconnaissent pas (`instanceof`, types). Les schémas sont fabriqués avec la copie de celui qui les utilise (`createSchemas(z)`).
- Le serveur compile avec `rootDir: src` : `shared/sync.mjs` en copie la source dans `server/src/_shared/` (dossier généré, non versionné).

## Alternatives écartées

Types écrits deux fois (dérive garantie) ; génération de types depuis OpenAPI (un outil de plus, et la source de vérité resterait dans le code serveur).
