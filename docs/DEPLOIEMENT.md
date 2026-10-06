# Déploiement et exploitation

Modèle recommandé : **un déploiement par client** (une application, une base MongoDB, ses propres clés).
Plusieurs clients sur un même serveur, ou livraison d'un colis à un client : voir [INSTANCES.md](INSTANCES.md).

## Option A — Docker Compose (recommandé)

Prérequis : un serveur Linux avec Docker, un nom de domaine pointant vers lui.

```bash
git clone <dépôt> human-link && cd human-link
cp -r clients/example clients/acme                  # config + logos du client
cd server && npm install && npm run gen:keys        # affiche 4 clés ; les copier ci-dessous
cd ..
cp clients/acme/.env.example clients/acme/.env      # remplir : clés, APP_URL=https://rh.acme.com, SMTP, ADMIN_*
cp .env.docker.example .env                         # MONGO_PASSWORD, CLIENT_DIR=./clients/acme, DOMAIN, TRUST_PROXY=1, APP_PORT=127.0.0.1:4000
docker compose --profile https up -d --build        # application + MongoDB + Caddy (HTTPS automatique)
docker compose exec app node dist/scripts/seed.js   # crée l'administrateur initial
```

- MongoDB n'est **pas exposé** : il n'est joignable que par l'application, avec authentification.
- Sans le profil `https`, l'application écoute sur `APP_PORT` : à placer derrière votre propre reverse proxy TLS (avec `TRUST_PROXY=1`).
- **HTTPS est obligatoire en production** (cookies `Secure`).
- Mise à jour : `git pull && docker compose --profile https up -d --build`. Les migrations de schéma ne sont pas nécessaires (MongoDB) ; les index sont synchronisés au démarrage.

### Variante : Docker secrets (clés hors de l'environnement)

Avec `docker-compose.yml`, les clés se trouvent dans le `.env` du client et donc dans l'environnement du conteneur (visibles par `docker inspect`).
`docker-compose.secrets.yml` les fournit à la place comme **fichiers** montés dans `/run/secrets/`, lus par l'application via `<NOM>_FILE` :

```bash
npm run secrets:gen                                   # ./secrets/ : jwt_secret, field_encryption_key, file_encryption_key, pseudonym_key, mongo_password, mongodb_uri (--admin ajoute admin_password)
cp clients/acme/.env.example clients/acme/.env        # sans les clés : seulement APP_URL, SMTP_HOST, ADMIN_EMAIL, ...
CLIENT_DIR=./clients/acme docker compose -f docker-compose.secrets.yml --profile https up -d --build
docker compose -f docker-compose.secrets.yml exec app node dist/scripts/seed.js
```

- Les fichiers sont en lecture seule pour leur propriétaire et exclus de git (`secrets/`). **Sauvegardez `field_encryption_key` et `file_encryption_key`** dans un coffre : sans elles, les données chiffrées sont perdues.
- Secrets acceptés en `<NOM>_FILE` : `JWT_SECRET`, `FIELD_ENCRYPTION_KEY`, `FILE_ENCRYPTION_KEY`, `PSEUDONYM_KEY`, `FIELD_ENCRYPTION_KEYS_OLD`, `FILE_ENCRYPTION_KEYS_OLD`, `SMTP_PASS`, `ADMIN_PASSWORD`, `MONGODB_URI`. Si la variable et son fichier existent tous les deux, le fichier l'emporte.
- Même mécanisme hors Docker : Kubernetes (secrets montés), Vault Agent, systemd `LoadCredential=` (`JWT_SECRET_FILE=%d/jwt` dans l'unité).
- Rotation d'une clé : voir [SECURITE-RGPD.md](SECURITE-RGPD.md#rotation-des-clés-de-chiffrement) ; remplacer le fichier de secret et déclarer l'ancienne clé dans `FIELD_ENCRYPTION_KEYS_OLD` (variable ou fichier).

## Option B — Sans Docker

```bash
npm run build                    # front (client/dist) + serveur (server/dist)
cd server
cp .env.example .env             # NODE_ENV=production, SERVE_CLIENT=true, MONGODB_URI, clés, SMTP, TRUST_PROXY=1, APP_URL
node dist/scripts/seed.js        # administrateur initial
node dist/index.js               # à lancer via systemd ou pm2
```

Exemple d'unité systemd (`/etc/systemd/system/humanlink.service`) :

```ini
[Service]
WorkingDirectory=/opt/human-link/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
User=humanlink
EnvironmentFile=/opt/human-link/server/.env
```

Derrière Nginx : `proxy_pass http://127.0.0.1:4000;` avec `proxy_set_header X-Forwarded-For $remote_addr;` et TLS (certbot).
Régler `TRUST_PROXY=1`, faute de quoi la limitation de débit se baserait sur l'IP du proxy.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `MONGODB_URI` | Connexion MongoDB (avec identifiants en production) |
| `APP_URL` | URL publique (CORS, liens dans les e-mails) |
| `JWT_SECRET` | Signature des jetons de session |
| `FIELD_ENCRYPTION_KEY` | Chiffrement des champs sensibles — **à sauvegarder** |
| `FILE_ENCRYPTION_KEY` | Chiffrement des fichiers — **à sauvegarder** |
| `PSEUDONYM_KEY` | Pseudonymisation (feedback, IP dans l'audit) |
| `CLIENT_DIR` | Dossier du client (config + logos) |
| `STORAGE_DIR` | Fichiers chiffrés (volume à sauvegarder) |
| `SMTP_*`, `MAIL_FROM` | E-mail sortant |
| `TRUST_PROXY` | Nombre de reverse proxies (0, 1…) |
| `COOKIE_SECURE` | Forcer/désactiver le flag Secure (intranet HTTP uniquement) |
| `SERVE_CLIENT` / `CLIENT_DIST` | Node sert le front compilé |
| `LLM_API_URL`, `LLM_MODEL` | Assistant RH avec modèle de langage (facultatif) |

Le serveur refuse de démarrer si une clé est absente ou malformée.

## Sauvegardes

### Automatiques (profil `backup`)

```bash
docker compose --profile backup up -d backup                    # ou : docker compose -f docker-compose.secrets.yml --profile backup up -d backup
docker compose run --rm backup /scripts/backup.sh               # une sauvegarde immédiate
docker compose run --rm backup /scripts/restore-test.sh         # un test de restauration immédiat
```

Chaque nuit (`BACKUP_HOUR`, 2 h UTC par défaut), le conteneur `backup` écrit dans `BACKUP_PATH` (`./backups`) un dossier horodaté contenant :

| Fichier | Contenu |
|---|---|
| `db.archive.gz` | la base MongoDB (`mongodump`) |
| `files.tar.gz` | le volume des fichiers (déjà chiffrés par l'application) |
| `SHA256SUMS` | les empreintes, vérifiées avant toute restauration |

- **Conservation** : `BACKUP_KEEP_DAYS` jours (14 par défaut), puis suppression automatique.
- **Chiffrement** : avec `BACKUP_PASSPHRASE` (ou le secret `backup_passphrase` créé par `npm run secrets:gen`), la base et les fichiers sont chiffrés en AES-256 (`.enc`). La base contient des noms et des e-mails : **chiffrez dès que les sauvegardes quittent le serveur**.
  Conservez la phrase de passe et les clés de l'application (`FIELD_ENCRYPTION_KEY`, `FILE_ENCRYPTION_KEY`) dans un coffre **distinct** des sauvegardes : sans elles, elles sont illisibles.
- **Écriture atomique** : un dossier n'apparaît qu'une fois complet ; une sauvegarde interrompue ne laisse rien.
- **Supervision** : le conteneur passe en `unhealthy` si aucune sauvegarde n'a réussi depuis 26 h (`docker compose ps`). Avec `ERROR_WEBHOOK_URL`, un échec de sauvegarde ou de test de restauration prévient aussi l'équipe.
- **Copie hors site** : `BACKUP_PATH` doit être sur un autre disque ou un montage réseau ; copiez-le ensuite hors du serveur (`rclone`, `rsync`, stockage objet). Un serveur perdu avec ses sauvegardes n'est pas sauvegardé.

### Test de restauration (automatique le 1er de chaque mois)

`restore-test.sh` prend la dernière sauvegarde, vérifie ses empreintes, la restaure dans une base **temporaire** `humanlink_restoretest` (jamais dans la production), contrôle qu'il y a des comptes et que chaque fichier référencé est dans l'archive, puis supprime la base temporaire.
Il échoue, avec un code de sortie non nul, si la sauvegarde est corrompue, tronquée, indéchiffrable ou incomplète. À consigner : date du dernier test réussi dans `backups/last-restore-test`.

Le workflow GitHub « Sauvegardes » rejoue ce scénario complet (données d'exemple, sauvegarde en clair et chiffrée, restauration, cas d'échec) chaque mois et à chaque modification de `deploy/backup/`.

### Restaurer pour de bon (sinistre)

```bash
docker compose stop app
# 1. décompresser et remettre les fichiers dans le volume
docker compose run --rm --no-deps -v "$PWD/backups/<horodatage>:/restore:ro" --entrypoint sh app -c 'tar -xzf /restore/files.tar.gz -C /data/storage'
# 2. recharger la base (--drop remplace les collections existantes)
docker compose run --rm -v "$PWD/backups/<horodatage>:/restore:ro" backup sh -c 'mongorestore --uri="$MONGODB_URI" --archive=/restore/db.archive.gz --gzip --drop'
docker compose start app
```

Sauvegardes chiffrées : déchiffrer d'abord (`openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in db.archive.gz.enc -out db.archive.gz`), de même pour `files.tar.gz.enc`.
Les mêmes clés (`.env` du client) doivent être en place : une restauration avec d'autres clés donne des fichiers illisibles.

### Sans le conteneur

À sauvegarder **ensemble** : la base (`mongodump --archive --gzip`), le volume des fichiers (`app-data`, dossier `STORAGE_DIR`) et les clés (`clients/<client>/.env`, dans un coffre distinct).
Les sauvegardes contiennent des données personnelles : mêmes règles de conservation et d'accès que la production.

## Supervision, versions et maintenance

- **Métriques** : `GET /metrics` au format Prometheus (débit, temps de réponse, erreurs par route modèle, connexions réussies et échouées, connexions et taille de MongoDB, mémoire, retard de la boucle d'événements). **Désactivé** tant que `METRICS_TOKEN` (16 caractères au moins) n'est pas défini ; sinon l'en-tête `Authorization: Bearer <jeton>` est exigé. Aucune donnée personnelle : les routes sont des modèles (`/api/users/:id`).
  Un tableau Grafana prêt à l'emploi est dans `deploy/monitoring/` (voir « Instances » : `npm run instances -- up --monitoring`). Pour votre Prometheus : `metrics_path: /metrics`, `authorization: { type: Bearer, credentials_file: ... }`.
- **Version déployée** : `GET /api/health` renvoie `{ ok, version, maintenance }`. `version` est l'empreinte des sources, calculée à la construction de l'image ; le front compilé porte la même. Quand elles diffèrent (mise à jour pendant qu'un onglet est ouvert), le client affiche « Nouvelle version disponible » avec un bouton **Recharger** (jamais de rechargement forcé : un formulaire en cours n'est pas perdu).
- **Maintenance** : `MAINTENANCE=true` dans le `.env` du client puis redémarrage. L'API répond 503 (sauf santé et configuration) et les utilisateurs voient une page de maintenance qui se relance toute seule au retour du service.
- **Requêtes lentes MongoDB** : le profil est activé (`--profile 1 --slowms 100`, voir `docker-compose*.yml`) : toute requête de plus de 100 ms est enregistrée. Lecture : `docker compose exec mongo mongosh -u humanlink -p "$MONGO_PASSWORD" --authenticationDatabase admin humanlink --eval "db.system.profile.find().sort({ts:-1}).limit(10).pretty()"` ; une entrée avec `planSummary: COLLSCAN` désigne un index manquant. `server/tests/indexes.test.ts` garantit en test que les requêtes connues utilisent un index.
- **SBOM** : la CI produit la liste des composants de l'image (SPDX et CycloneDX, artefact « sbom » du job « Image Docker ») ; en local `npm run sbom`. À conserver avec chaque livraison.
- **Images de base figées** : `node`, `mongo`, `caddy`, `clamav`, `prometheus` et `grafana` sont référencés par empreinte (`tag@sha256:…`). Dependabot propose chaque mise à jour avec la nouvelle empreinte ; à la main : `docker buildx imagetools inspect node:22-slim`.

## Exploitation

- Santé : `GET /api/health` (utilisé par le HEALTHCHECK Docker).
- Logs : sortie standard au format JSON (pino) — à collecter par l'infrastructure ; sans secrets ni cookies.
- **Erreurs** : les plantages de page (navigateur) et les erreurs 500 ou non interceptées (serveur) sont journalisés au niveau `error` sous la clé `monitoring`, avec une empreinte (`id`) qui regroupe les répétitions. Rien de personnel n'y figure : e-mails, identifiants, jetons et paramètres d'adresse sont retirés avant l'écriture, et aucun compte n'est joint.
  Avec `ERROR_WEBHOOK_URL` (Slack, Teams, Mattermost, ntfy… : un POST JSON dont le champ `text` est lisible), l'équipe est prévenue, au plus une fois par erreur et par 10 minutes. Sans outil tiers : filtrer les logs sur `monitoring.id`.
- Créer un administrateur supplémentaire : depuis l'interface (Employés → Ajouter, rôle Administrateur).
- Mot de passe admin perdu : « Mot de passe oublié » (SMTP requis) ; sinon relancer `seed` avec un nouvel `ADMIN_EMAIL`.
- 2FA perdue (téléphone changé) : un autre administrateur utilise **Employés → Réinitialiser la 2FA** ; la personne la reconfigure à sa prochaine connexion
  (action tracée dans le journal d'audit). Pour le **dernier administrateur** : il faut disposer de ses codes de secours, ou supprimer le champ `twoFactor` de son document
  dans MongoDB (procédure d'urgence à consigner).
- `npm audit` régulier sur `server/` et `client/`.
