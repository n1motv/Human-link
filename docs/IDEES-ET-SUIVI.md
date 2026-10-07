# Idées et suivi : le diagnostic du projet
Le diagnostic de Human Link (constats et idées, classés par priorité et effort) vit dans un **artefact** : une page web privée, mise à jour à chaque point traité, avec le statut et le commit de chacun.

- **Artefact** : https://claude.ai/artifact/CquDbezR88erXs6r9yiPLT (privé : seul son propriétaire l'ouvre, tant qu'il ne l'a pas partagé depuis le menu Partager)
- **Ce fichier** en est la copie lisible dans le dépôt, pour que la liste, les statuts et les commits restent consultables (et dans le graphe graphify) sans ouvrir la page.
- Règle de travail : quand un point est traité, on le commit sur la branche `feat/refonte-ui-ux-ci-demo`, puis on met à jour l'artefact avec son statut (« Fait » ou « Partiel ») et le hash du commit.

**Bilan : 93 points, 38 faits, 1 partiels, 54 restants.**

Légende : priorité 1 (à faire en premier) à 3 ; effort S (petit), M (moyen), L (grand). Type : « constat » = défaut ou manque observé, « idée » = amélioration proposée.

## Sécurité et RGPD
| N° | Point | Type | Priorité | Effort | Statut | Commit |
|---|---|---|---|---|---|---|
| S-01 | Le fichier .env a été versionné dans l'historique git | constat | 1 | S | Partiel | `historique purgé` |
| S-02 | L'ancienne application Flask est encore dans le dépôt, avec une sauvegarde de .env | constat | 1 | S | Fait | `7ff1a60` |
| S-03 | La limite de tentatives sur les routes d'authentification est large | constat | 2 | S | Fait | `cfac87a` |
| S-10 | Liste des appareils connectés et déconnexion à distance | idée | 2 | M | Fait | `cfac87a, 88978c2` |
| S-11 | Connexion sans mot de passe avec passkeys (WebAuthn) | idée | 2 | L | À faire |  |
| S-12 | Alerte e-mail à la première connexion depuis un nouvel appareil | idée | 2 | M | Fait | `cfac87a, 88978c2` |
| S-13 | Identifiant de clé dans les données chiffrées, pour pouvoir changer de clé sans arrêt | idée | 2 | L | Fait | `cfac87a` |
| S-14 | Analyse antivirus des fichiers téléversés | idée | 3 | M | Fait | `cfac87a` |
| S-15 | Journal d'audit infalsifiable | idée | 3 | M | À faire |  |
| S-16 | Registre des traitements et export de demande d'accès par l'administrateur | idée | 2 | M | Fait | `342f29b` |
| S-17 | Vérifier les mots de passe contre les fuites connues | idée | 3 | S | Fait | `cfac87a` |
| S-18 | Secrets via Docker secrets ou un coffre | idée | 3 | S | Fait | `d88917f` |
| S-19 | Test de sécurité automatique dans la CI | idée | 3 | M | Fait | `40fa65d` |

## Technique et exploitation
| N° | Point | Type | Priorité | Effort | Statut | Commit |
|---|---|---|---|---|---|---|
| T-01 | Pas d'intégration continue | constat | 1 | S | À faire |  |
| T-02 | Sauvegardes décrites mais pas automatisées | constat | 2 | S | Fait | `40fa65d` |
| T-03 | Les erreurs du navigateur ne sont envoyées nulle part | constat | 3 | S | Fait | `483d46f` |
| T-10 | File d'attente pour les e-mails avec nouvel essai | idée | 2 | M | Fait | `6aab14a` |
| T-11 | Transactions pour les opérations qui touchent plusieurs documents | idée | 2 | M | Fait | `29a97c9` |
| T-12 | Renovate ou Dependabot | idée | 2 | S | À faire |  |
| T-13 | Compléter le durcissement de l'image Docker | idée | 3 | S | Fait | `786507d` |
| T-14 | Métriques et tableau de bord d'exploitation | idée | 3 | M | Fait | `384c05c` |
| T-15 | Vérifier les index MongoDB | idée | 3 | S | Fait | `37f8bc5` |
| T-16 | Page de maintenance et bannière de nouvelle version | idée | 3 | S | Fait | `384c05c` |
| T-17 | Décisions d'architecture écrites | idée | 3 | S | Fait | `37c144d` |
| T-20 | Lancer plusieurs clients en parallèle et livrer un colis à chaque client | idée | 1 | M | Fait | `branche instances` |

## Qualité et tests
| N° | Point | Type | Priorité | Effort | Statut | Commit |
|---|---|---|---|---|---|---|
| Q-01 | Aucun test côté client | constat | 1 | M | Fait | `0ce3c8e` |
| Q-02 | Couverture serveur limitée à l'authentification et à quelques règles métier | constat | 2 | M | Fait | `ec1a312` |
| Q-10 | Tests de bout en bout avec Playwright | idée | 1 | M | Fait | `84fa0af` |
| Q-11 | ESLint, Prettier et un contrôle avant chaque commit | idée | 2 | S | Fait | `7592045` |
| Q-12 | Types partagés entre serveur et client | idée | 2 | M | Fait | `11156e0` |
| Q-13 | Documentation de l'API générée depuis les schémas | idée | 3 | M | Fait | `24f93d9` |
| Q-14 | Page de styles interne (Storybook ou équivalent) | idée | 3 | M | Fait | `4ece616` |
| Q-15 | Tests visuels des composants | idée | 3 | S | Fait | `40fa65d` |

## Performance
| N° | Point | Type | Priorité | Effort | Statut | Commit |
|---|---|---|---|---|---|---|
| P-01 | Les listes d'employés sont chargées par blocs de 200, sans pagination à l'écran | constat | 2 | M | Fait | `483d46f` |
| P-02 | Deux gros paquets JavaScript | constat | 3 | M | Fait | `d4f4e87` |
| P-10 | Réglage du cache des requêtes | idée | 3 | S | Fait | `05bc642` |
| P-11 | Liste virtualisée pour les très grands tableaux | idée | 3 | M | Fait | `473508a` |
| P-12 | Miniatures des photos de profil | idée | 3 | S | Fait | `32abab9` |

## UX et interface
| N° | Point | Type | Priorité | Effort | Statut | Commit |
|---|---|---|---|---|---|---|
| U-01 | Les listes déroulantes d'employés n'ont pas de recherche | constat | 2 | S | Fait | `473508a` |
| U-02 | Le sélecteur de date et la liste déroulante ne se mettent pas à jour après un reset programmatique | constat | 3 | S | Fait | `473508a` |
| U-10 | Actions en lot sur les demandes | idée | 1 | M | Fait | `473508a` |
| U-11 | Annuler une action juste après (undo) | idée | 2 | M | À faire |  |
| U-12 | Prévenir avant de fermer un formulaire modifié | idée | 2 | S | À faire |  |
| U-13 | Brouillons enregistrés automatiquement | idée | 2 | S | À faire |  |
| U-14 | Tri, colonnes visibles et export dans les tableaux | idée | 2 | M | À faire |  |
| U-15 | Visite guidée à la première connexion | idée | 2 | M | À faire |  |
| U-16 | Navigation mobile en barre du bas | idée | 1 | M | Fait | `473508a` |
| U-17 | Tableaux affichés en cartes sur petit écran | idée | 2 | M | À faire |  |
| U-18 | Calendrier plus complet | idée | 2 | M | À faire |  |
| U-19 | Recadrage de la photo avant l'envoi | idée | 3 | S | À faire |  |
| U-20 | Indicateur de profil complet | idée | 3 | S | À faire |  |
| U-21 | Choix du thème « système » | idée | 3 | S | À faire |  |
| U-22 | Densité des tableaux | idée | 3 | S | À faire |  |
| U-23 | États vides avec une action | idée | 3 | S | À faire |  |
| U-24 | Squelettes adaptés à chaque page | idée | 3 | S | À faire |  |
| U-25 | Raccourcis clavier avec page d'aide | idée | 2 | S | À faire |  |
| U-26 | Recherche globale dans la palette Ctrl+K | idée | 2 | M | À faire |  |
| U-27 | Fil d'Ariane sur les pages profondes | idée | 3 | S | À faire |  |
| U-28 | Impression et PDF des demandes | idée | 3 | M | À faire |  |
| U-30 | Texte lisible sur la couleur d'accent de chaque client | idée | 2 | S | Fait | `branche instances` |

## Fonctionnalités
| N° | Point | Type | Priorité | Effort | Statut | Commit |
|---|---|---|---|---|---|---|
| F-01 | Agenda iCal des congés et des réunions | idée | 1 | M | À faire |  |
| F-02 | Plusieurs types de congés et règles de solde | idée | 1 | L | À faire |  |
| F-03 | Jours fériés et fermetures par pays ou région | idée | 1 | M | À faire |  |
| F-04 | Demi-journées | idée | 2 | M | À faire |  |
| F-05 | Délégation et relance des approbations | idée | 2 | M | À faire |  |
| F-06 | Annuler ou modifier un congé déjà accepté | idée | 2 | M | À faire |  |
| F-07 | Alerte de chevauchement dans l'équipe | idée | 1 | M | À faire |  |
| F-08 | Tableau de bord du manager | idée | 2 | M | À faire |  |
| F-09 | Indicateurs RH pour l'administrateur | idée | 2 | M | À faire |  |
| F-10 | Rapports et exports planifiés | idée | 2 | M | À faire |  |
| F-11 | Import des employés par fichier CSV | idée | 2 | S | À faire |  |
| F-12 | Dépôt en masse des bulletins de paie | idée | 2 | M | À faire |  |
| F-13 | Signature et accusé de lecture des documents | idée | 2 | L | À faire |  |
| F-14 | Parcours d'arrivée et de départ | idée | 2 | M | À faire |  |
| F-15 | Entretiens annuels et objectifs | idée | 2 | L | À faire |  |
| F-16 | Notes de frais | idée | 3 | L | À faire |  |
| F-17 | Feuilles de temps et pointage | idée | 3 | L | À faire |  |
| F-18 | Réservation de bureaux liée au télétravail | idée | 3 | L | À faire |  |
| F-19 | Fil d'actualités, anniversaires et ancienneté | idée | 3 | M | À faire |  |
| F-20 | Formulaires de demande personnalisés | idée | 3 | M | À faire |  |
| F-21 | Préférences de notification | idée | 2 | M | À faire |  |
| F-22 | Application installable et notifications push | idée | 3 | L | À faire |  |
| F-23 | Assistant RH qui connaît la politique de l'entreprise | idée | 3 | M | À faire |  |
| F-24 | Organigramme interactif | idée | 3 | M | À faire |  |
| F-25 | Enquête de climat ponctuelle | idée | 3 | S | À faire |  |

## Ce qui a été fait, point par point

### Sécurité et RGPD
- **S-01 Le fichier .env a été versionné dans l'historique git** (Partiel, historique purgé) : Le .env a été retiré de tous les commits des branches main, adding_futures, feat/refonte-ui-ux-ci-demo et des tags, puis poussé de force (aucun secret retrouvé par recherche dans l'historique). Restent : les références de pull requests GitHub (refs/pull/1 et 2) qui gardent les anciens commits, à faire purger par le support GitHub ; et le changement des anciens secrets, le dépôt étant public.
- **S-02 L'ancienne application Flask est encore dans le dépôt, avec une sauvegarde de .env** (Fait, 7ff1a60) : legacy/ supprimé de la branche, avec sa copie locale de l'ancien .env ; le code Flask reste sur le tag local v2-flask-archive.
- **S-03 La limite de tentatives sur les routes d'authentification est large** (Fait, cfac87a) : Freinage par compte et par IP : 5 échecs tolérés, puis délai doublé de 15 s à 15 min (429 + Retry-After). Renouvellement de session sur un seuil séparé de 600 / 15 min.
- **S-10 Liste des appareils connectés et déconnexion à distance** (Fait, cfac87a, 88978c2) : Page Sécurité : appareils connectés (navigateur, système, IP masquée, dernière activité) et déconnexion à distance. Pas de ville : elle demanderait une base de géolocalisation d'IP.
- **S-12 Alerte e-mail à la première connexion depuis un nouvel appareil** (Fait, cfac87a, 88978c2) : E-mail à la première connexion depuis un navigateur ou système inconnu, avec lien « ce n'était pas moi » (7 jours) : sessions fermées, jetons invalidés, lien de nouveau mot de passe.
- **S-13 Identifiant de clé dans les données chiffrées, pour pouvoir changer de clé sans arrêt** (Fait, cfac87a) : Identifiant de clé dans chaque valeur chiffrée et chaque fichier, anciennes clés lisibles via *_KEYS_OLD, script npm run rotate-keys (simulation, reprise, écriture atomique). Procédure dans docs/SECURITE-RGPD.md.
- **S-14 Analyse antivirus des fichiers téléversés** (Fait, cfac87a) : Analyse ClamAV avant stockage (service Compose « antivirus »). Refus des fichiers infectés ; refus aussi si l'antivirus est injoignable avec CLAMAV_REQUIRED=true.
- **S-16 Registre des traitements et export de demande d'accès par l'administrateur** (Fait, 342f29b) : Page Conformité (administration) : registre des 10 traitements (finalité, base légale, données, destinataires, conservation, sécurité), durées de conservation lues dans la configuration donc identiques à celles que les purges appliquent, téléchargement CSV, et dossier complet d'un employé en un clic (ZIP : données + documents déchiffrés), tracé dans le journal d'audit, refusé pour un compte anonymisé. 9 tests serveur, 2 client.
- **S-17 Vérifier les mots de passe contre les fuites connues** (Fait, cfac87a) : Refus des mots de passe présents dans des fuites (Have I Been Pwned, k-anonymat), désactivable par client. Si le service est en panne, le mot de passe est accepté.
- **S-18 Secrets via Docker secrets ou un coffre** (Fait, d88917f) : Variables <NOM>_FILE (clés, SMTP_PASS, ADMIN_PASSWORD, MONGODB_URI), docker-compose.secrets.yml et npm run secrets:gen. Démarrage vérifié sans aucune clé dans l'environnement.
- **S-19 Test de sécurité automatique dans la CI** (Fait, 40fa65d) : Scan ZAP baseline joué pour de vrai contre l'image Docker de production : 0 échec, 62 contrôles passés, 5 alertes non bloquantes assumées. Premier passage : en-tête Permissions-Policy manquant, ajouté, alerte disparue au second passage. Le job GitHub reste à voir tourner une fois (il ne se lance que sur main et les pull requests).

### Technique et exploitation
- **T-02 Sauvegardes décrites mais pas automatisées** (Fait, 40fa65d) : Validé pour de vrai : image de sauvegarde construite et auto-test joué dedans contre un MongoDB, 13 contrôles sur 13 (sauvegarde en clair et chiffrée, restauration, corruption, fichier manquant, rotation). A révélé un défaut : des fins de ligne CRLF d'un dépôt extrait sous Windows cassaient les scripts. Corrigé dans l'image.
- **T-03 Les erreurs du navigateur ne sont envoyées nulle part** (Fait, 483d46f) : Suivi auto-hébergé sans service tiers : plantages de page (ErrorBoundary, erreurs et promesses non gérées) et erreurs 500 ou non interceptées du serveur, journalisés sous la clé monitoring après retrait des e-mails, identifiants, jetons et paramètres d'adresse. Alerte facultative par ERROR_WEBHOOK_URL (Slack, Teams, Mattermost, ntfy). 9 tests.
- **T-10 File d'attente pour les e-mails avec nouvel essai** (Fait, 6aab14a) : File d'attente dans MongoDB (choix documenté, ADR 0009) : e-mail enregistré, pris de façon atomique, repris à 1 min, 5 min, 30 min, 2 h, 6 h, puis en échec (alerte webhook et journal). Page Administration, E-mails : relancer ou abandonner. Corps chiffré et effacé à l'envoi. 9 tests (reprises, abandon, pas d'envoi en double, reprise après bail expiré).
- **T-11 Transactions pour les opérations qui touchent plusieurs documents** (Fait, 29a97c9) : Décisions de congé, d'arrêt et de prime, et anonymisation, dans des transactions MongoDB : tout ou rien, e-mails et fichiers seulement après validation. Testé sur un vrai jeu de réplicas avec des pannes injectées. MongoDB démarre en jeu de réplicas dans les compose ; essayé sur le volume existant (les 5 bases conservées), et les 5 instances annoncent les transactions actives. Repli sans transactions sur une base autonome.
- **T-13 Compléter le durcissement de l'image Docker** (Fait, 786507d) : Images de base (node, mongo, caddy, clamav, prometheus, grafana) figées par empreinte, suivies par Dependabot. SBOM : syft en CI (SPDX et CycloneDX, artefact du job « Image Docker ») et npm run sbom en local (essayé : 3 845 composants listés). Le job CI n'a pas encore tourné sur GitHub.
- **T-14 Métriques et tableau de bord d'exploitation** (Fait, 384c05c) : GET /metrics au format Prometheus (débit, temps de réponse, erreurs, connexions réussies/échouées, connexions et taille MongoDB, mémoire), protégé par METRICS_TOKEN, sans donnée personnelle. Tableau Grafana de 11 panneaux, fourni avec Prometheus (npm run instances -- up --monitoring) : les 5 instances sont relevées, le tableau se charge.
- **T-15 Vérifier les index MongoDB** (Fait, 37f8bc5) : 42 requêtes réelles de l'application passées à explain() : 17 n'étaient pas servies par un index (tri en mémoire ou balayage complet). 17 index ajoutés ; un test échoue si une requête repasse sans index. Profil de requêtes lentes (100 ms) activé dans MongoDB, lecture documentée.
- **T-16 Page de maintenance et bannière de nouvelle version** (Fait, 384c05c) : Identifiant de build (empreinte des sources) porté par le serveur et le front ; /api/health l'annonce. Écart = bannière « Nouvelle version disponible » avec Recharger, sans rechargement forcé. MAINTENANCE=true : API en 503 et page de maintenance qui se relance seule. Vérifié dans un vrai navigateur sur l'instance Docker NVIDIA.
- **T-17 Décisions d'architecture écrites** (Fait, 37c144d) : docs/adr/ : 7 décisions en une page chacune (MongoDB, cookies httpOnly, un déploiement par client, chiffrement, fichiers sur disque, contrat partagé, tests dans Docker).
- **T-20 Lancer plusieurs clients en parallèle et livrer un colis à chaque client** (Fait, branche instances) : scripts/instances.mjs, scripts/ship-instance.mjs, deploy/ et docs/INSTANCES.md. Quatre instances de test : NVIDIA, IBM, Microsoft, LinkedIn.

### Qualité et tests
- **Q-01 Aucun test côté client** (Fait, 0ce3c8e) : 29 tests client : connexion avec code 2FA (faux puis bon code, code de secours, délai après échecs), création d'une demande de congé, approbation par un manager, composants Select, DatePicker et OtpInput. npm test et la CI les lancent.
- **Q-02 Couverture serveur limitée à l'authentification et à quelques règles métier** (Fait, ec1a312) : 24 tests serveur ajoutés (server/tests/modules.test.ts) : coffre-fort (seul l'admin touche au coffre d'un tiers, fichier trop gros ou de mauvais type refus'), anonymisation RGPD, journal d'audit, calendrier, notifications, organisation, contact, tableau de bord, seuil du feedback anonyme. Aucun défaut trouvé. 84 tests serveur au total.
- **Q-10 Tests de bout en bout avec Playwright** (Fait, 84fa0af) : 6 parcours Playwright sur la vraie application (front compilé + API) et une base MongoDB jetable : connexion, 2FA (code périmé refusé), congé accepté par le manager puis par l'administrateur, congé refusé avec motif, contrôle d'accès, recherche et rattachement. Les 6 passent en local. Job « e2e » ajouté à la CI, pas encore lancé sur GitHub.
- **Q-11 ESLint, Prettier et un contrôle avant chaque commit** (Fait, 7592045) : ESLint (React, hooks, jsx-a11y) à zéro alerte, Prettier sur tout le dépôt (commit de formatage ignoré par git blame), husky + lint-staged avant chaque commit, job « lint » dans la CI.
- **Q-12 Types partagés entre serveur et client** (Fait, 11156e0) : Paquet shared/ : listes de valeurs, schémas zod et types de l'API. Le client en tire ses types, le serveur ses corps de requête. Des tests de contrat valident les vraies réponses du serveur ; ils ont déjà révélé que la liste des employés n'a ni soldeConge ni teleworkMax (type client corrigé : UserRow).
- **Q-13 Documentation de l'API générée depuis les schémas** (Fait, 24f93d9) : docs/openapi.json (OpenAPI 3.1) décrit les 84 opérations : méthode, authentification et rôles lus dans les routeurs ; corps et paramètres = les schémas que les routes utilisent pour valider ; réponses = contrat partagé, vérifié contre les vraies réponses par les tests. Un test échoue si une route n'est pas décrite ou si le fichier n'est plus à jour. Page de lecture /api/docs en développement.
- **Q-14 Page de styles interne (Storybook ou équivalent)** (Fait, 4ece616) : Route /styleguide (développement uniquement, absente du build de production) : boutons, champs, listes, dates, code 2FA, confirmations, badges, cartes et états, côte à côte en thème sombre et clair.
- **Q-15 Tests visuels des composants** (Fait, 40fa65d) : Références Linux générées dans l'image officielle Playwright (6 captures) et enregistrées ; le workflow Tests visuels tourne maintenant dans cette même image, donc mêmes navigateur et polices. Les tests ont déjà détecté un vrai changement (colonne de cases à cocher sur les congés d'équipe).

### Performance
- **P-01 Les listes d'employés sont chargées par blocs de 200, sans pagination à l'écran** (Fait, 483d46f) : Tableau Employés paginé (25 par page, filtres et recherche côté serveur). Organisation et Coffre-fort : liste déroulante remplacée par un champ de recherche interrogeant le serveur, sans limite d'effectif (le serveur exclut aussi les personnes déjà rattachées). 4 tests.
- **P-02 Deux gros paquets JavaScript** (Fait, d4f4e87) : Paquet principal 310 Ko vers 264 Ko (82 Ko compressé), fichier des langues 167 Ko vers 69 Ko : seul le français est embarqué, les autres langues se chargent à la demande. Graphiques (366 Ko) dans un fichier à part chargé à l'ouverture du tableau de bord ; les chiffres s'affichent sans l'attendre. npm run analyze produit la carte des paquets (rollup-plugin-visualizer).
- **P-10 Réglage du cache des requêtes** (Fait, 05bc642) : Durée de fraîcheur par type de donnée : organigramme 10 min, personnes invitables 5 min, résultats de recherche 1 min, notifications 0, le reste 30 s. Une écriture recharge toujours tout de suite. 4 tests.
- **P-11 Liste virtualisée pour les très grands tableaux** (Fait, 473508a) : TanStack Virtual sur le journal d'audit et la liste des employés : au-delà de 60 lignes, seules les lignes visibles existent dans la page. Choix de 25, 50, 100 ou 200 lignes par page. Vérifié dans un vrai navigateur : 20 lignes dans la page sur 200, la première disparaît au défilement.
- **P-12 Miniatures des photos de profil** (Fait, 32abab9) : Miniatures WebP de 96 et 256 px générées à la première demande (sharp), chiffrées et conservées ; l'avatar demande la plus petite taille qui suffit. Les métadonnées de la photo (position GPS) ne sont pas recopiées. Supprimées avec la photo et à l'anonymisation. 5 tests. Coût : l'image Docker passe de 680 à 750 Mo.

### UX et interface
- **U-01 Les listes déroulantes d'employés n'ont pas de recherche** (Fait, 473508a) : Au-delà de 8 options, la liste déroulante s'ouvre avec un champ de recherche (sans accents ni majuscules) ; flèches, Entrée, Échap ; une lettre tapée sur la liste fermée l'ouvre filtrée. 6 tests.
- **U-02 Le sélecteur de date et la liste déroulante ne se mettent pas à jour après un reset programmatique** (Fait, 473508a) : Défaut confirmé par un test : après setValue() de react-hook-form, la liste déroulante gardait l'ancienne valeur (reset() fonctionnait, car il provoque un rendu). Corrigé : le composant écoute l'écriture dans son champ natif (Select et sélecteur de date).
- **U-10 Actions en lot sur les demandes** (Fait, 473508a) : Cases à cocher sur les congés et les arrêts maladie, barre flottante, une seule confirmation qui liste les personnes (accepter) ou motif commun (refuser). Chaque décision passe par la route habituelle (mêmes droits et règles) ; un échec n'arrête pas les autres et est nommé. 4 tests.
- **U-16 Navigation mobile en barre du bas** (Fait, 473508a) : Sous 768 px : barre fixe en bas (accueil, congés, calendrier, alertes avec pastille, menu), adaptée au rôle. Vérifiée dans un vrai navigateur sur l'instance Docker IBM, 390 px de large.
- **U-30 Texte lisible sur la couleur d'accent de chaque client** (Fait, branche instances) : Variable --on-accent calculée au chargement d'après les deux couleurs du client.
