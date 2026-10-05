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

À sauvegarder **ensemble** et à chiffrer :

1. la base : `docker compose exec mongo mongodump --archive --gzip -u humanlink -p "$MONGO_PASSWORD" --authenticationDatabase admin > humanlink-$(date +%F).archive.gz`
2. le volume des fichiers (`app-data`, dossier `STORAGE_DIR`) ;
3. les clés (`clients/<client>/.env`) **dans un coffre distinct** : sans elles, les sauvegardes sont illisibles.

Tester régulièrement une restauration. Les sauvegardes contiennent des données personnelles : mêmes règles de conservation et d'accès que la production.

## Exploitation

- Santé : `GET /api/health` (utilisé par le HEALTHCHECK Docker).
- Logs : sortie standard au format JSON (pino) — à collecter par l'infrastructure ; sans secrets ni cookies.
- Créer un administrateur supplémentaire : depuis l'interface (Employés → Ajouter, rôle Administrateur).
- Mot de passe admin perdu : « Mot de passe oublié » (SMTP requis) ; sinon relancer `seed` avec un nouvel `ADMIN_EMAIL`.
- 2FA perdue (téléphone changé) : un autre administrateur utilise **Employés → Réinitialiser la 2FA** ; la personne la reconfigure à sa prochaine connexion
  (action tracée dans le journal d'audit). Pour le **dernier administrateur** : il faut disposer de ses codes de secours, ou supprimer le champ `twoFactor` de son document
  dans MongoDB (procédure d'urgence à consigner).
- `npm audit` régulier sur `server/` et `client/`.
