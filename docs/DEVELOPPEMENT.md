# Guide de développement

## Principes pour rester maintenable

- **Un domaine = un dossier** dans `server/src/modules/<domaine>/` (routes + logique). Pas de logique métier dans les modèles.
- **Chaque entrée est validée** par un schéma zod au début de la route (`parse(schema, req.body)`). Ne jamais passer `req.body` à Mongoose.
- **Les droits sont déclarés sur la route** : `requireAuth()`, `requireRole('admin')`, puis le périmètre (`assertCanAccessUser`, `managedIds`).
- **Tout ce qui varie par client est dans `clients/<client>/`**, jamais dans le code.
- **Les textes de l'interface sont dans `locales/*.json`**, jamais en dur dans les composants. Les notifications sont stockées avec une clé + paramètres.
- **Les tests décrivent les règles de sécurité** : en ajoutant une route sensible, ajouter le test « un autre utilisateur n'y accède pas ».

## Lancer et tester

```bash
npm test                         # serveur (vitest + MongoDB temporaire), client (vitest + jsdom), i18n, typage
npm --prefix client test         # tests du client seuls (composants : Select, DatePicker, code 2FA ; pages : connexion 2FA, congés, approbation)
npm --prefix client run test:visual          # tests visuels (Playwright) : 3 pages clés x thème sombre et clair, comparées à des images de référence
npm --prefix client run test:visual:update   # après un changement d'interface voulu : réécrit les références (à relire dans le diff d'images avant de commiter)
npm --prefix server test         # tests serveur seuls (télécharge un binaire MongoDB au premier lancement)
npm run typecheck
```

## Ajouter un module (exemple : « formations »)

1. **Modèle** : `server/src/models/Training.ts` (schéma + `applyJsonTransform`). Champs personnels sensibles : `encryptedString`.
2. **Routes** : `server/src/modules/trainings/trainings.routes.ts` — `requireAuth`, rôles, zod, `audit(...)` pour les lectures sensibles, `notify(...)` si besoin.
3. **Activation par client** : ajouter `trainings` dans `modules` de `server/src/config/client.ts` (schéma zod) et `clients/example/client.config.json`,
   puis monter le routeur dans `server/src/app.ts` sous `if (mod.trainings)`.
4. **Notifications** : ajouter la clé dans `FR` de `server/src/utils/notify.ts` et `notif.*` dans chaque `locales/*.json`.
5. **Front** : page dans `client/src/pages/…`, route dans `client/src/app/App.tsx` (garde `RequireModule`), entrée de menu dans `client/src/app/nav.ts`,
   type `modules.trainings` dans `client/src/lib/types.ts`.
6. **Textes** : clés dans `fr.json` puis les autres langues ; `npm run i18n:check` vérifie la cohérence.
7. **RGPD** : si le module stocke des données personnelles, les ajouter à l'export (`rgpd.routes.ts`), à l'anonymisation (`rgpd/anonymize.ts`)
   et à la page Confidentialité.

## Ajouter une langue

1. Créer `client/src/locales/<code>.json` (copie de `fr.json` traduite).
2. L'importer dans `client/src/lib/i18n.ts` (ressources + `LANGUAGE_NAMES` ; ajouter le code dans `RTL` pour une langue écrite de droite à gauche).
3. Ajouter le code dans `i18n.languages` de `client.config.json` et dans la liste `full` de `client/scripts/check-i18n.mjs` si la langue est complète.
4. Assistant RH : mots-clés dans `server/src/modules/chatbot/intents.ts` et phrases dans `answers.ts` (type `Lang`).

## Conventions

- TypeScript strict des deux côtés ; `npm run typecheck` doit être vert.
- Dates métier = chaînes `AAAA-MM-JJ` (pas de fuseau) ; horodatages = `Date` UTC.
- Les montants et jours de congé sont des nombres ; l'affichage passe par `Intl` (`client/src/lib/format.ts`).
- Mongoose : valeurs d'`id` string côté API (`toJSON` transforme `_id` en `id`) ; ne jamais renvoyer un document brut sans passer par `toJSON`/`toPublicUser`.
- Pas de `localStorage` pour des jetons ; il ne sert qu'aux préférences (thème, langue).

## Carte des fichiers sensibles

| Sujet | Fichier |
|---|---|
| Sessions, rotation, cookies | `server/src/modules/auth/session.ts` |
| Login, 2FA, reset, activation | `server/src/modules/auth/auth.routes.ts` |
| Contrôle d'accès | `server/src/middleware/auth.ts`, `server/src/modules/access.ts` |
| Chiffrement des champs | `server/src/models/plugins.ts`, `server/src/utils/crypto.ts` |
| Stockage de fichiers | `server/src/utils/storage.ts`, `server/src/modules/files/files.service.ts` |
| CSP et en-têtes | `server/src/app.ts` |
| Rétention et anonymisation | `server/src/jobs/scheduler.ts`, `server/src/modules/rgpd/anonymize.ts` |

## Tests visuels

`client/e2e/visual.spec.ts` prend des captures de la connexion, de l'accueil employé et des demandes de congés d'un manager, en thème sombre puis clair, et les compare à `client/e2e/visual.spec.ts-snapshots/`. L'API est simulée (`e2e/fixtures.ts`) et l'heure figée : pas de serveur ni de base. Un décalage, une couleur ou une bande parasite produit une image « diff » dans `client/test-results/`.

- **Sous Windows** avec Chrome installé : `PW_CHANNEL=chrome npm --prefix client run test:visual` (sans Chrome : `npx playwright install chromium`).
- **Les rendus dépendent du système** (polices, anticrénelage) : les références portent la plateforme dans leur nom (`…-win32.png`, `…-linux.png`).
  La CI (workflow « Tests visuels ») compare aux références **Linux** ; tant qu'elles n'existent pas, elle l'indique et ne bloque pas.
  Pour les créer ou les mettre à jour : GitHub, onglet Actions, « Tests visuels », « Run workflow » sur la branche, case **update** cochée ; les images sont alors enregistrées sur la branche.
- Un changement d'interface voulu fait échouer ces tests : relire les images « diff », puis `test:visual:update` (Windows) et relancer le workflow avec « update » (Linux).

## Parcours de bout en bout

`client/e2e/flows/parcours.spec.ts` pilote un vrai navigateur sur la vraie application : le front compilé et l'API servis par `server/src/scripts/e2e-server.ts`, avec une base MongoDB jetable en mémoire et quatre comptes connus (administrateur avec 2FA, manager, deux employés). Rien n'est simulé.

```bash
npm --prefix client run test:e2e              # compile le front, démarre le serveur de test, joue les 6 parcours
PW_CHANNEL=chrome npm --prefix client run test:e2e   # sous Windows avec Chrome installé
```

Parcours : connexion (refus puis succès) ; 2FA (code périmé refusé, bon code accepté) ; congé demandé, accepté par le manager puis par l'administrateur ; congé refusé avec motif obligatoire ; contrôle d'accès (pages et API) ; recherche d'un employé côté serveur et rattachement à un manager.
Ils s'enchaînent sur la même base. La CI les lance dans le job « Parcours de bout en bout » ; en cas d'échec, le rapport et les traces (`npx playwright show-trace`) sont joints au job.
Les tests visuels (`test:visual`) sont distincts : API simulée, captures comparées.

## Style de code

```bash
npm run lint          # ESLint : React, hooks, accessibilité (jsx-a11y) ; zéro alerte tolérée
npm run format        # Prettier sur tout le dépôt (format:check pour seulement vérifier)
```

`npm install` à la racine installe un crochet git (husky) : avant chaque commit, lint-staged corrige et formate les fichiers modifiés, et le commit est refusé s'il reste une erreur.
La CI refait les deux contrôles. Le commit de mise en forme initial est ignoré par `git blame` (`.git-blame-ignore-revs`, activé par `git config blame.ignoreRevsFile .git-blame-ignore-revs`).

## Contrat de données partagé (`shared/`)

`shared/src/index.ts` décrit les données de l'API : listes de valeurs (rôles, statuts…), schémas zod des corps de requête et des réponses, types TypeScript qui en découlent.

- Le **client** les importe par l'alias `@shared` (`client/src/lib/types.ts` ne contient plus que des ré-exports).
- Le **serveur** utilise les mêmes corps de requête (`schemas.loginBody`, `schemas.leaveCreateBody`…). `shared/sync.mjs` en copie la source dans `server/src/_shared/` (dossier généré, non versionné, relancé par `npm run sync:shared` et avant chaque `dev`, `test`, `build`, `typecheck`) : tsc ne compile que `server/src`.
- Les schémas sont fabriqués avec le zod de chacun (`createSchemas(z)`) : deux copies de zod ne se reconnaissent pas, `shared/` n'en importe donc que les types.
- **Garde-fou** : `server/tests/contract.test.ts` valide les vraies réponses de l'API contre ces schémas ; les tests du client et les données simulées des tests visuels y sont aussi confrontés. Ajouter un champ à une réponse sans mettre à jour `shared/` fait échouer les tests.

## Documentation de l'API (OpenAPI)

`docs/openapi.json` est générée depuis le code : méthodes, chemins, authentification et rôles autorisés sont lus dans les routeurs Express ; les corps, paramètres et réponses viennent des schémas des routes et du contrat partagé (`server/src/openapi/annotations.ts`).

```bash
npm --prefix server run gen:openapi    # régénère docs/openapi.json (sans base ni .env)
```

- Un test échoue si le fichier n'est plus à jour, si une annotation vise une route disparue, ou si un fichier `*.routes.ts` n'est pas monté (`server/src/routes.ts` est la liste unique des routes).
- En développement (hors production et hors tests) : `http://localhost:4000/api/docs` (page de lecture avec filtre) et `/api/openapi.json`.
- Les 84 opérations sont décrites. Une nouvelle route sans entrée dans `annotations.ts` fait échouer les tests. Les corps et paramètres sont les schémas que les routes utilisent pour valider (exportés par chaque `*.routes.ts`) : la documentation ne peut pas s'en écarter. Les réponses viennent de `shared/` et sont vérifiées contre les vraies réponses par `server/tests/contract.test.ts`.

## Page de styles

En développement, `http://localhost:5173/styleguide` montre les composants (boutons, champs, listes, dates, code 2FA, confirmations, badges, cartes, états) dans leurs différents états, côte à côte en thème sombre et clair. La page n'existe pas dans le build de production.
