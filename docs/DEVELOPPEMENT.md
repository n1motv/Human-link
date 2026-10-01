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
npm test                         # serveur (vitest + MongoDB temporaire), i18n, typage
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
