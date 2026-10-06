# ADR 0007 : Les instances de test tournent toutes dans Docker, une image par client

**Statut :** acceptée

## Contexte

Lancer les instances « en direct » (processus Node sur la machine) ne ressemblait pas à la livraison : chemins différents, pas d'image, pas de santé Docker, résultats parfois différents du serveur du client.

## Décision

`npm run instances -- up` construit **une image par client** (`humanlink/test-<nom>:dev`, `docker build --build-arg CLIENT=<nom>`) et les lance toutes avec une base MongoDB, dans `docker-compose.test.yml`. `npm run instances -- watch` reconstruit l'image d'une instance dès qu'un fichier de code change (`docker compose watch`). Plus aucun lancement direct.

## Pourquoi

- Ce qui est testé est exactement ce qui est livré : même image, même utilisateur non administrateur, même HEALTHCHECK.
- Les couches Docker sont organisées pour que les 5 images partagent la compilation et que `npm ci` ne soit pas refait à chaque modification du code (reconstruction en environ une minute).
- `npm run instances -- test` vérifie les instances de l'extérieur : santé, configuration, logo, droits, connexion, métriques.

## Conséquences

- Docker Desktop est un prérequis pour tester une instance complète. Les tests unitaires et les parcours Playwright (`test:e2e`) n'en ont pas besoin.
- Les clés des instances de test sont générées dans `clients/<nom>/.env` (jamais versionné) ; les mots de passe de MongoDB et de Grafana de test sont volontairement faibles et réservés au poste local.

## Alternatives écartées

Garder les deux modes (deux chemins à maintenir, résultats divergents) ; un seul conteneur pour tous les clients (contraire à l'isolation, voir ADR 0003).
