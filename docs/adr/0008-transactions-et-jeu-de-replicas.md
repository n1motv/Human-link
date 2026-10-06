# ADR 0008 : Transactions MongoDB, donc jeu de réplicas d'un seul nœud

**Statut :** acceptée

## Contexte

Une décision de congé écrit dans quatre collections (demande, solde, télétravail, notifications) ; une anonymisation dans une douzaine. Une panne au milieu laissait un état incohérent (congé accepté sans solde débité), compensé à la main dans un seul cas.

## Décision

Ces opérations s'exécutent dans une **transaction MongoDB** (`withTransaction`, `server/src/utils/transaction.ts`). MongoDB n'offre les transactions que sur un jeu de réplicas : les déploiements Docker démarrent un jeu de réplicas d'un seul nœud. Les effets hors base (e-mails, suppression de fichiers) n'ont lieu qu'après la validation.

## Pourquoi

C'est la seule garantie « tout ou rien » qui ne dépend pas de code de compensation à maintenir pour chaque cas. Un jeu de réplicas d'un seul nœud ne coûte rien de plus en ressources et ouvre la voie à une réplication plus tard.

## Conséquences

- Les tests tournent sur un vrai jeu de réplicas (`tests/global-setup.ts`) et injectent des pannes pour vérifier l'annulation (`tests/transactions.test.ts`).
- **Repli** : sur un MongoDB autonome, le code s'exécute sans transaction (comme avant) et le signale ; la métrique `humanlink_mongo_transactions_supported` le rend visible.
- Le jeu de réplicas impose une clé interne et une initialisation au premier démarrage (gérées par `docker-compose*.yml`).

## Alternatives écartées

Compensation manuelle partout (fragile, un cas oublié suffit) ; remettre en cause le choix de MongoDB pour une base relationnelle (voir ADR 0001).
