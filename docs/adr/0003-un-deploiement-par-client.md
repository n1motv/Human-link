# ADR 0003 : Un déploiement et un fichier de configuration par client

**Statut :** acceptée

## Contexte

Le produit est adapté pour chaque entreprise (logo, couleurs, langues, modules activés, règles RH, durées de conservation RGPD). On veut livrer un client **sans modifier une ligne de code** et sans qu'un client puisse voir les données d'un autre.

## Décision

Une **instance par client** : un dossier `clients/<nom>/` (`client.config.json`, `branding/`, `instance.json`, `.env.example`), son propre conteneur, sa propre base, ses propres clés de chiffrement. Le même code sert tous les clients ; la configuration est lue au démarrage et validée par zod.

## Pourquoi

- L'isolation est physique (processus, base, clés, volume de fichiers) et non logique : une erreur de filtre ne peut pas mélanger deux clients.
- Les clés de chiffrement étant propres à chaque client, une base volée ne se lit qu'avec **ses** clés.
- Activer ou retirer un module (`modules.bonuses: false`) fait disparaître ses routes : une route désactivée n'existe pas.

## Conséquences

- Plus d'instances à exploiter : d'où l'outillage (`docker-compose.test.yml`, `deploy/instances-docker.sh`, `npm run instances`) et une image Docker par client (`--build-arg CLIENT=<nom>`).
- Une mise à jour du code se déploie client par client (avantage : on peut la décaler pour l'un d'eux).
- Les réglages sans secret sont versionnés ; tout secret reste dans `.env` (ou des secrets Docker), jamais dans le dépôt.

## Alternatives écartées

Une seule application multi-clients (`client_id` partout, clés partagées, risque de fuite entre clients) ; un fork du code par client (maintenance impossible).
