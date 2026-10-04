# Personnaliser Human Link pour un client

Principe : **le même code sert tous les clients**. Ce qui varie vit dans `clients/<client>/` :

```
clients/acme/
  client.config.json   identité, couleurs, modules, règles RH, sécurité, RGPD
  branding/            logo.png, logo-dark.png, logo-white.png (remplaçables sans recompiler)
  .env                 secrets et infrastructure (jamais versionné) — modèle : .env.example
```

Créer un client : `cp -r clients/example clients/acme`, éditer, puis déployer avec `CLIENT_DIR=./clients/acme`
(en développement : `CLIENT_DIR=../clients/acme` dans `server/.env`). Redémarrer le serveur après modification de `client.config.json` ;
le navigateur recharge la configuration à chaque visite (pas de rebuild du front).

## client.config.json

| Section | Clé | Effet |
|---|---|---|
| `company` | `name`, `legalName`, `address` | Titre de l'onglet, page Confidentialité, formulaire de contact |
| | `supportEmail`, `dpoEmail` | Contact affiché ; **dpoEmail** = contact RGPD de la page Confidentialité |
| `branding` | `logoUrl` | Logo pour fond clair (ex. `/branding/logo-dark.png`) |
| | `logoOnDarkUrl` | Logo pour le thème sombre (généralement blanc) |
| | `showName` | `true` : affiche le nom à côté du logo (inutile si le logo contient déjà le nom) |
| | `accent`, `accent2` | Dégradé principal des boutons, graphiques, éléments actifs (format `#rrggbb`) |
| | `defaultTheme` | `dark` ou `light` au premier chargement (l'utilisateur peut changer) |
| `i18n` | `languages`, `defaultLanguage` | Langues proposées (`fr en ar es it`) |
| `modules` | `leaves`, `sickLeaves`, `bonuses`, `telework`, `meetings`, `vault`, `feedback`, `contact`, `chatbot`, `orgChart` | `false` désactive le module : entrée de menu, page et — pour les modules qui ont des routes dédiées — routes API (404). `orgChart` ne masque que la page Organisation |
| `hr` | `monthlyLeaveAccrual` | Jours crédités par mois (2,5 par défaut) |
| | `workingDays` | Jours ouvrés, 0 = dimanche … 6 = samedi (`[1,2,3,4,5]`) ; sert au décompte des congés et au télétravail |
| | `minimumAge`, `defaultTeleworkMaxDays` | Âge minimum d'un employé ; quota de télétravail par défaut |
| | `leaveAttachmentRequiredForReasons` | Motifs de congé exigeant un justificatif (ex. `["family"]`) |
| `security` | `passwordMinLength` | ≥ 10 |
| | `maxLoginAttempts`, `lockMinutes` | Verrouillage temporaire après échecs |
| | `accessTokenMinutes`, `refreshTokenDays` | Durée de session |
| | `require2faForRoles` | Rôles contraints d'activer la 2FA : `["admin"]`, `["admin","manager"]`… |
| `gdpr` | `auditLogRetentionDays`, `notificationRetentionDays`, `contactRequestRetentionDays`, `feedbackRetentionMonths`, `departedEmployeeRetentionYears` | Durées de conservation appliquées automatiquement chaque nuit ; affichées dans la page Confidentialité |
| `notifications` | `*Cron` | Planification (format cron) des rappels et du crédit mensuel de congés |

Le fichier est validé au démarrage : une valeur invalide empêche le serveur de démarrer avec un message clair.

## Identité visuelle

- **Couleurs** : `accent` / `accent2`. Le design (verre dépoli, thèmes clair/sombre) reste identique, seul l'accent change.
- **Logos** : déposer des PNG transparents dans `clients/<client>/branding/`. Prévoir une version claire (pour le thème sombre)
  et une version foncée (pour le thème clair).
- **Aller plus loin** (rarement nécessaire) : les jetons de design (`--glass`, `--radius`, couleurs de statut…) sont centralisés
  en tête de `client/src/index.css`.

## Langues

Les textes sont dans `client/src/locales/<langue>.json`. Le français est la référence : toute clé absente d'une langue
s'affiche en français.

- **Corriger un libellé** : modifier la clé dans le(s) fichier(s) de langue.
- **Vocabulaire propre à un client** (ex. « Congés » → « Absences ») : modifier la valeur dans les fichiers de langue utilisés.
- **Ajouter une langue** : voir [DEVELOPPEMENT.md](DEVELOPPEMENT.md#ajouter-une-langue).
- `npm run i18n:check` (lancé par `npm test` et `npm run build`) échoue si une langue complète a des clés manquantes ou des variables incohérentes.
- **Arabe** : l'interface passe automatiquement en lecture de droite à gauche.

## Règles métier spécifiques à un client

Ce qui est paramétrable sans code est dans la config ci-dessus. Pour une règle plus spécifique (ex. congés par demi-journée,
paliers de validation différents), les emplacements sont :

| Besoin | Fichier |
|---|---|
| Circuit de validation des congés | `server/src/modules/leaves/leaves.routes.ts` (route `/:id/decision`) |
| Chevauchements congés / arrêts / télétravail | `server/src/modules/absences/absences.service.ts` |
| Calcul des jours ouvrés | `server/src/utils/dates.ts` |
| Questions du feedback mensuel | `server/src/models/Feedback.ts` (`FEEDBACK_CRITERIA`) + `locales/*.json` (`feedback.criteria.*`) |
| Réponses de l'assistant RH | `server/src/modules/chatbot/intents.ts` (mots-clés) et `answers.ts` (phrases) |
| Motifs de congé proposés | `client/src/pages/employee/MyLeaves.tsx` (`REASONS`) + `locales/*.json` (`leave.reasons.*`) |

## Assistant RH (facultatif)

Par défaut il répond à partir des données de la personne connectée, sans service externe. Pour permettre des questions libres,
renseigner `LLM_API_URL` (et `LLM_MODEL`) dans `.env` : API compatible OpenAI `/v1/completions` (LM Studio, Ollama, vLLM…).
Seules des données **non sensibles** (ni salaire, ni n° de sécurité sociale, ni adresse, ni téléphone) sont envoyées au modèle.
Préférer un modèle hébergé en interne ou dans l'UE.
