# Décisions d'architecture

Une page courte par décision structurante : le contexte, ce qui a été choisi, pourquoi, et ce que cela coûte. Quand une décision change, on n'efface pas l'ancienne page : on écrit une nouvelle et on marque l'ancienne « remplacée par ».

Format : **Contexte → Décision → Pourquoi → Conséquences → Alternatives écartées**.

| N° | Décision |
|---|---|
| [0001](0001-mongodb.md) | MongoDB plutôt qu’une base SQL |
| [0002](0002-cookies-httponly.md) | Cookies httpOnly plutôt que des jetons stockés dans le navigateur |
| [0003](0003-un-deploiement-par-client.md) | Un déploiement et un fichier de configuration par client |
| [0004](0004-chiffrement-des-donnees-sensibles.md) | Chiffrement au repos des champs et des fichiers sensibles, avec clés versionnées |
| [0005](0005-fichiers-sur-disque.md) | Fichiers sur disque local plutôt que dans un stockage objet |
| [0006](0006-contrat-partage-et-typescript.md) | TypeScript partout et un contrat de données partagé (zod) |
| [0007](0007-tout-dans-docker-pour-les-tests.md) | Les instances de test tournent toutes dans Docker, une image par client |

Pour en ajouter une : copier une page existante, prendre le numéro suivant, l'ajouter au tableau ci-dessus.
