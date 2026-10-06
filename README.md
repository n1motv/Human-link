# Human Link — gestion RH (v3)

Application de gestion des ressources humaines : congés, arrêts maladie, primes, télétravail, réunions,
coffre-fort de documents, feedback anonyme, assistant RH multilingue, organigramme, notifications.

**Stack** : Node.js 22 + Express 5 + TypeScript + MongoDB (Mongoose) · React 19 + Vite + Tailwind CSS 4 · design glassmorphism clair/sombre.

> La version précédente (Flask + SQLite) a été retirée de la branche principale ; elle reste consultable sur le tag git `v2-flask-archive` (`git checkout v2-flask-archive`).
> Script de migration des données : [docs/MIGRATION.md](docs/MIGRATION.md).

## Démarrage rapide : tout dans Docker (5 clients de test)

Prérequis : Docker Desktop. Chaque client de test (`example`, `nvidia`, `ibm`, `microsoft`, `linkedin`) a **sa propre image** ; elles tournent ensemble avec MongoDB.

```bash
npm run instances -- up                  # construit les 5 images et démarre (http://localhost:4100 à 4104)
npm run instances -- seed all --demo     # administrateur + données de démonstration
npm run instances -- test                # vérifie les 5 instances
npm run instances -- watch               # reconstruit l'image concernée à chaque modification du code
```

Détails, commandes et supervision (Prometheus, Grafana) : [docs/INSTANCES.md](docs/INSTANCES.md).

## Développement du code (sans conteneur)

Prérequis : Node.js ≥ 20. MongoDB est facultatif en local : un script en lance un pour vous.

```bash
npm run setup          # installe tout + crée server/.env avec des secrets uniques (note le mot de passe admin affiché)
npm run dev:db         # terminal 1 — MongoDB local (sans installation, données dans server/.devdb)
npm run seed           # crée l'administrateur   (npm run seed:demo : jeu de démonstration complet ; seed:demo:reset le recrée)
npm run dev:server     # terminal 2 — API sur http://localhost:4000
npm run dev:client     # terminal 3 — interface sur http://localhost:5173
```

Un administrateur doit activer la **double authentification** à sa première connexion (politique configurable).
Sans SMTP, les e-mails (liens d'activation, mot de passe oublié) s'affichent dans la console du serveur.

## Organisation du dépôt

```
clients/<client>/      Tout ce qui change d'un client : client.config.json, branding/ (logos), .env
server/src/
  config/              env.ts (secrets), client.ts (config client validée)
  models/              13 collections Mongoose (champs sensibles chiffrés)
  modules/<domaine>/   routes d'un domaine (auth, users, leaves, sick, bonuses, telework, meetings,
                       documents, feedback, chatbot, rgpd, org, calendar, dashboard, contact, notifications)
  middleware/          auth, rôles, CSRF, rate limit, upload
  utils/               crypto, mots de passe, 2FA, e-mail, notifications, audit, stockage de fichiers
  jobs/scheduler.ts    crédit mensuel des congés, rappels, purge RGPD
  scripts/             seed, init-env, dev-db, migrate-from-sqlite
server/tests/          39 tests (sécurité, droits d'accès, flux métier) sur une vraie base MongoDB
client/src/
  app/                 routes, layout, cloche de notifications, assistant RH
  pages/<rôle>/        écrans admin, manager, employé
  components/          design system (ui.tsx, Modal, Calendar...)
  locales/*.json       traductions (fr, en, ar, es, it)
docs/                  documentation détaillée
```

## Un client = un dossier

Pour déployer chez une nouvelle entreprise, **aucun code à modifier** :

```bash
cp -r clients/example clients/acme
# éditer clients/acme/client.config.json (nom, couleurs, modules, règles RH, durées RGPD)
# remplacer clients/acme/branding/logo*.png
```

Guide complet : [docs/PERSONNALISATION.md](docs/PERSONNALISATION.md). Chaque client a sa propre base MongoDB, ses clés de
chiffrement et son déploiement : isolation totale des données.

## Sécurité et RGPD en bref

| Sujet | Mise en œuvre |
|---|---|
| Mots de passe | Argon2id, politique configurable, jamais envoyés par e-mail (lien d'activation à usage unique) |
| Sessions | Cookies `httpOnly` + `SameSite=Strict`, JWT 10 min, refresh rotatif avec détection de vol, CSRF double-submit |
| Authentification forte | 2FA TOTP (obligatoire par rôle), codes de secours, verrouillage après échecs |
| Autorisations | Rôles admin/manager/employé revérifiés à chaque requête, périmètre « équipe » pour les managers |
| Données sensibles | Salaire, n° de sécu, téléphone, adresse chiffrés AES-256-GCM en base ; fichiers chiffrés sur disque |
| Fichiers | Type vérifié par signature binaire, stockage hors dossier public, accès contrôlé et tracé |
| Injections | Validation zod de chaque entrée (types stricts), requêtes paramétrées Mongoose, CSP stricte |
| RGPD | Export des données, archivage + anonymisation, rétention automatique, journal d'audit, feedback anonyme, aucune requête vers un tiers (polices hébergées, pas de traduction externe) |

Détails, limites et **responsabilités du client** : [docs/SECURITE-RGPD.md](docs/SECURITE-RGPD.md).

> ⚠️ **Action requise** : le fichier `.env` de l'ancienne version (clé de chiffrement, mots de passe e-mail) était versionné dans Git.
> Il a été retiré du suivi, mais il reste dans l'**historique**. Changez ces secrets (mot de passe d'application Gmail, anciennes clés)
> et purgez l'historique si le dépôt a été partagé ([docs/SECURITE-RGPD.md](docs/SECURITE-RGPD.md#secrets-de-lancienne-version)).

## Commandes

| Commande | Rôle |
|---|---|
| `npm test` | tests serveur + cohérence des traductions + typage client |
| `npm run build` | compile le front puis le serveur |
| `npm run typecheck` | typage TypeScript des deux projets |
| `docker compose up -d --build` | déploiement (voir [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md)) |

## Documentation

- [Personnalisation par client](docs/PERSONNALISATION.md) — config, logos, modules, langues, règles RH
- [Sécurité et RGPD](docs/SECURITE-RGPD.md) — mesures, procédures, checklist client
- [Instances par client](docs/INSTANCES.md) — les 5 instances de test dans Docker, en livrer un (`npm run instances`, `npm run ship`)
- [Décisions d'architecture](docs/adr/README.md) — une page courte par choix structurant
- [Déploiement et exploitation](docs/DEPLOIEMENT.md) — Docker, HTTPS, sauvegardes, mises à jour
- [Migration depuis l'ancienne version](docs/MIGRATION.md)
- [Développement](docs/DEVELOPPEMENT.md) — architecture, ajouter un module ou une langue
