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
