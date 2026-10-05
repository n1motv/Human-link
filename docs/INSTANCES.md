# Instances par client : lancer plusieurs clients et en livrer un

Principe : **une instance = un client** = un dossier `clients/<nom>/` (config, logos, secrets), un port, une base MongoDB. Le même code sert tous les clients ; aucune ligne de code n'est modifiée pour en ajouter un.

```
clients/
  acme/
    client.config.json   identité, couleurs, langues, modules, règles RH (versionné, sans secret)
    branding/            logo.svg (fond clair) et logo-on-dark.svg (fond sombre), sans arrière-plan
    instance.json        port et base MongoDB de cette instance (versionné)
    .env.example         modèle des secrets (versionné)
    .env                 secrets réels : clés, SMTP, mot de passe admin (JAMAIS versionné)
```

Un modèle est fourni : `clients/example/` (port 4100). Pour tester plusieurs clients en parallèle, créez-en d'autres à partir de lui (section « Ajouter un nouveau client »). Les exemples ci-dessous utilisent `acme`, `globex`, `initech` et `umbrella`.

---

## 1. Les lancer en parallèle sur votre machine (sans Docker)

```bash
npm run install:all && npm run build      # une seule compilation sert toutes les instances
npm run dev:db                            # MongoDB local (terminal séparé) ; une seule base serveur, une base par client
npm run instances -- init all             # crée clients/<nom>/.env avec des clés uniques par client
npm run instances -- up all               # démarre toutes les instances en arrière-plan
npm run instances -- seed all --demo      # administrateur + données de démonstration dans chaque base
npm run instances -- status
```

| Instance | Adresse | Base MongoDB |
| --- | --- | --- |
| example | http://localhost:4100 | humanlink_example |
| acme (si créée) | http://localhost:4101 | humanlink_acme |

Autres commandes : `down`, `restart`, `logs <nom>`, et `up acme globex` pour n'en lancer que certaines. Le mot de passe de l'administrateur est affiché par `init` ; celui des comptes de démonstration par `seed --demo`.

Comment ça marche : chaque instance est un processus Node distinct, lancé **depuis son propre dossier** (`clients/<nom>/`). Elle y lit son `.env` (port, base, clés) et son `client.config.json`. Les clés sont propres à chaque client : une base ne peut pas être lue avec les clés d'un autre.

Modifier un logo, une couleur ou un module : éditer `clients/<nom>/` puis `npm run instances -- restart <nom>` (pas de recompilation).

---

## 2. Les lancer en parallèle sur un serveur

Trois façons, de la plus simple à la plus légère. Dans tous les cas : **HTTPS obligatoire** (cookies sécurisés), un domaine par client, et chaque instance n'écoute que sur `127.0.0.1` derrière un reverse proxy commun.

### A. Docker (recommandé) : une pile isolée par client

Chaque client a son propre projet Compose : sa base MongoDB (non exposée), ses volumes, son port.

```bash
git clone <dépôt> /opt/human-link && cd /opt/human-link
cp clients/acme/.env.example clients/acme/.env        # idem pour chaque client
docker run --rm node:22-slim node -e "const c=require('crypto');for(const k of ['JWT_SECRET','FIELD_ENCRYPTION_KEY','FILE_ENCRYPTION_KEY','PSEUDONYM_KEY'])console.log(k+'='+c.randomBytes(32).toString('hex'))"
echo "MONGO_PASSWORD=$(openssl rand -hex 24)" > .env      # partagé par les projets : chacun a SA base et SES volumes
./deploy/instances-docker.sh up                           # construit et lance toutes les instances (4101, 4102, ...)
sudo cp deploy/Caddyfile.multi.example /etc/caddy/Caddyfile   # un domaine par client → son port
sudo systemctl reload caddy
```

Dans chaque `clients/<nom>/.env` : les 4 clés, `APP_URL=https://rh.<domaine du client>`, SMTP, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Puis, par client :

```bash
docker compose -p hl-acme exec app node dist/scripts/seed.js     # crée l'administrateur initial
./deploy/instances-docker.sh status | logs acme | down | pull-restart
```

### B. systemd, sans Docker

```bash
sudo cp deploy/humanlink@.service /etc/systemd/system/
# clients/<nom>/.env : MONGODB_URI=mongodb://127.0.0.1:27017/humanlink_<nom>, PORT=<instance.json>, CLIENT_DIR=., SERVE_CLIENT=true,
#                      CLIENT_DIST=../../client/dist, STORAGE_DIR=./storage, TRUST_PROXY=1, APP_URL=https://...
sudo systemctl enable --now humanlink@acme humanlink@globex humanlink@initech humanlink@umbrella
journalctl -u humanlink@acme -f
```

L'unité est un modèle : `%i` est le nom du client. Même Caddyfile que ci-dessus.

### C. Le même script qu'en local

`npm run instances -- up all` fonctionne aussi sur un serveur (avec `COOKIE_SECURE=true` et `TRUST_PROXY=1` dans les `.env`), mais ne redémarre pas seul après un reboot : préférez A ou B en production.

### Dimensionnement

Une instance au repos utilise environ 90 Mo de mémoire (mesuré sur les quatre instances de test). Une machine de 4 Go héberge confortablement une dizaine de petits clients ; la base MongoDB (une par client en mode Docker A) est le poste le plus gourmand. Au-delà, un serveur par groupe de clients.

---

## 3. Livrer une instance à un client

Deux façons : **l'héberger vous-même** (section 2, c'est vous qui exploitez) ou **lui remettre un colis** qu'il installe sur son propre serveur.

```bash
npm run ship -- acme                       # construit l'image, exporte tout dans ship/acme-<version>.tar.gz
npm run ship -- acme --no-image            # sans image (le client la tire d'un registre)
npm run ship -- acme --registry ghcr.io/votre-org/human-link --push    # publie l'image sur un registre
```

Le script vérifie la configuration (logos présents, couleurs valides) puis produit :

```
acme-3.0.0-<commit>/
  human-link-<version>.tar     l'application (image Docker)
  docker-compose.yml           application + MongoDB (+ HTTPS avec --profile https)
  Caddyfile, .env.example      reverse proxy et variables de compose
  client/                      client.config.json, branding/ (logos), .env.example
  INSTALL.md                   notice d'installation pour son administrateur système
  SHA256SUMS                   empreintes pour vérifier l'intégrité
```

**Aucun secret n'est livré** : ni `.env`, ni clés, ni mot de passe. Le client génère ses propres clés sur son serveur (`gen-keys`, expliqué dans `INSTALL.md`). Vous n'avez donc jamais accès à ses données chiffrées.

Ce que le client fait (résumé de `INSTALL.md`) : `docker load -i …tar`, renseigner `.env` et `client/.env`, `docker compose --profile https up -d`, créer l'administrateur avec `seed.js`.

Mises à jour : vous livrez une nouvelle image (nouveau `ship`), il la charge et relance `up -d`. Sa configuration et ses données ne bougent pas. Les évolutions de personnalisation (logo, couleurs, modules) passent par `client/client.config.json`, sans nouvelle image.

### Ajouter un nouveau client

```bash
cp -r clients/example clients/acme
# éditer clients/acme/client.config.json (nom, couleurs, langues, modules) et déposer branding/logo.svg + logo-on-dark.svg
echo '{ "port": 4101, "database": "humanlink_acme" }' > clients/acme/instance.json
# adapter le nom et le domaine dans clients/acme/.env.example
npm run instances -- init acme && npm run instances -- up acme && npm run instances -- seed acme --demo
```

### Logos : le cahier des charges

- **SVG de préférence** (net à toutes les tailles), **fond transparent**, recadré au plus juste (pas de marge).
- **Deux fichiers** : `logo.svg` pour le thème clair, `logo-on-dark.svg` pour le thème sombre (texte clair), car un logo sombre disparaît sur fond sombre.
- Le nom de l'entreprise n'est répété à côté du logo que si `branding.showName` vaut `true` (inutile quand le logo contient déjà le nom).
- Les couleurs `accent` et `accent2` pilotent boutons, liens et fond. Le texte posé dessus (blanc ou foncé) est choisi automatiquement pour rester lisible, y compris avec une couleur claire comme un vert citron.

> N'utilisez que des logos dont vous avez le droit : les marques déposées de tiers ne doivent pas être publiées ni livrées.
