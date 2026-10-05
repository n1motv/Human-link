# Sécurité et RGPD

Ce document décrit ce que le logiciel met en œuvre, ce qu'il ne peut pas faire à la place de l'hébergeur et du client,
et les procédures courantes. **Il ne constitue pas un avis juridique** : la conformité RGPD d'un client dépend aussi de ses
propres traitements (registre, base légale, information des salariés, contrats de sous-traitance).

## 1. Mesures techniques implémentées

### Authentification et sessions
- Mots de passe hachés **Argon2id**. Longueur minimale configurable (≥ 10, 12 par défaut), mots de passe courants refusés.
- **Aucun mot de passe n'est envoyé par e-mail** : un nouvel employé reçoit un lien d'activation à usage unique (48 h) et choisit lui-même son mot de passe.
- Réinitialisation par lien à usage unique (30 min). La réponse est identique que l'e-mail existe ou non (pas d'énumération de comptes).
  Un changement de mot de passe déconnecte toutes les sessions.
- Message d'erreur de connexion unique et temps de réponse égalisé pour les comptes inconnus.
- Verrouillage temporaire après N échecs (configurable) + e-mail d'alerte au titulaire.
- **Freinage progressif par compte et par adresse IP** : 5 échecs tolérés (`security.loginFreeAttempts`, de 1 à 10), puis un délai qui double à chaque nouvel échec
  (15 s, 30 s, 1 min… jusqu'à 15 min, `loginBaseDelaySeconds` / `loginMaxDelayMinutes`). La réponse est un `429` avec `Retry-After` ; une connexion réussie remet le compteur à zéro.
  Il s'applique aussi aux comptes inexistants (aucune différence observable). Le renouvellement automatique de session a son propre seuil, bien plus large (600 requêtes / 15 min).
  Le compteur est en mémoire : une instance par client suffit ; avec plusieurs instances, le placer dans Redis.
- **Appareils connectés** (page Sécurité) : liste des sessions (navigateur, système, adresse **partiellement masquée**, dernière activité) et déconnexion à distance, d'un appareil ou de tous les autres.
  Un jeton d'accès déjà émis reste valable jusqu'à son expiration (10 min au plus) ; le jeton de rafraîchissement est coupé immédiatement. Pas de ville : elle exigerait une base de géolocalisation d'IP.
- **Alerte de nouvel appareil** : à la connexion depuis un navigateur/système jamais vu pour ce compte, un e-mail détaille la connexion avec un lien « ce n'était pas moi » (7 jours) qui ferme
  toutes les sessions, invalide les jetons d'accès et envoie un lien de nouveau mot de passe. Seule une empreinte navigateur + système est conservée (jamais l'adresse IP), 25 appareils au maximum.
- **Mots de passe divulgués** : à la création et au changement de mot de passe, refus des mots de passe présents dans des fuites publiques (Have I Been Pwned, méthode **k-anonymat** : seuls les 5 premiers caractères
  de l'empreinte SHA-1 quittent le serveur). Si le service est injoignable, le mot de passe est accepté (une panne externe ne doit pas bloquer). Désactivable : `security.checkPwnedPasswords: false` dans `client.config.json`
  (client sans accès Internet sortant ou politique interdisant tout appel externe) ou `HIBP_ENABLED=false`.
- Session : jeton d'accès JWT de 10 min et jeton de rafraîchissement **rotatif** (7 j) dans des cookies `httpOnly` + `SameSite=Strict` (+ `Secure` en production).
  Aucun jeton dans le `localStorage` : un script injecté ne peut pas les voler. Un jeton de rafraîchissement rejoué (vol probable) révoque toute la famille de sessions.
- **CSRF** : double-submit cookie (`X-CSRF-Token`) en plus de `SameSite=Strict`.
- **2FA TOTP** (Google Authenticator, Authy…) avec 8 codes de secours à usage unique. Obligatoire pour les rôles listés dans `security.require2faForRoles`
  (administrateur par défaut) : tant qu'elle n'est pas activée, l'API refuse tout le reste. Le secret TOTP est chiffré en base.
- Archivage, changement de rôle ou changement de mot de passe : effet **immédiat** (l'utilisateur est relu en base à chaque requête).

### Autorisations
- Trois rôles ; chaque route déclare explicitement les rôles autorisés.
- Un manager n'accède qu'aux données de **son équipe** et ne voit ni salaire, ni n° de sécurité sociale, ni justificatifs d'arrêts maladie.
- Un employé ne voit que ses propres données ; une ressource d'un tiers répond `404` (pas de fuite d'existence).
- Corrections par rapport à l'ancienne version : propriétaire vérifié sur les notifications, primes limitées à l'équipe du manager, route de debug supprimée,
  administrateur identifié par son **rôle** (et non par un e-mail), validation congé protégée contre le double décompte.

### Données
- **Chiffrement au repos (AES-256-GCM)** des champs : salaire, n° de sécurité sociale, téléphone, adresse, secret 2FA. Clé dans `.env` (`FIELD_ENCRYPTION_KEY`), jamais en base.
  Conséquence : ces champs ne sont pas interrogeables par MongoDB (la moyenne des salaires est calculée par l'application).
- **Fichiers** (bulletins, contrats, justificatifs, photos) : chiffrés AES-256-GCM avant écriture disque, nom aléatoire, dossier hors serveur web,
  téléchargement via l'API après contrôle d'accès, en-têtes `nosniff`, `no-store` et CSP `sandbox`.
- **Téléversements** : type réel vérifié par signature binaire (pas l'extension), PDF/JPG/PNG/WebP uniquement, 10 Mo maximum.
- **Antivirus ClamAV** (optionnel) : avec `CLAMAV_HOST`, chaque fichier est analysé avant d'être stocké ; un fichier infecté est refusé (`INFECTED_FILE`). Si ClamAV est injoignable, les fichiers sont acceptés
  et l'incident journalisé, sauf avec `CLAMAV_REQUIRED=true` (alors refus `503`). Démarrer le démon : `docker compose --profile antivirus up -d clamav` puis `CLAMAV_HOST=clamav` dans le `.env` du client
  (le premier démarrage télécharge les signatures, quelques minutes).
- **Secrets hors de l'environnement** : variante `docker-compose.secrets.yml` (Docker secrets, fichiers montés dans `/run/secrets/`, variables `<NOM>_FILE`) : voir [DEPLOIEMENT.md](DEPLOIEMENT.md).
- **Scan de sécurité automatique** : la CI lance OWASP ZAP (baseline : analyse passive + araignée AJAX) sur l'application démarrée avec une base vide et des clés jetables. Les règles
  critiques (CSP absente, anti-clickjacking, `nosniff`, fuite de version serveur, cookies sans `SameSite` ou sans `Secure`) font **échouer** la CI ; les autres sont signalées dans le rapport
  (artefact `rapport-zap`). Réglage : `.zap/rules.tsv`. Ce scan est passif : il ne remplace pas un test d'intrusion ni un scan actif sur un environnement de recette.
- **Clés versionnées** : chaque valeur chiffrée porte l'identifiant de sa clé (`enc:v2:<kid>:…`, fichiers `HLF2`), ce qui permet de changer de clé sans arrêt (voir « Rotation des clés »).
- **Validation** de toute entrée avec zod (types stricts, champs inconnus supprimés) : une injection NoSQL (`{"$ne":null}`) est rejetée en 400.
  Les saisies de recherche sont échappées avant d'être utilisées dans une expression régulière.
- **Feedback mensuel anonyme** : aucune référence à l'utilisateur n'est stockée (seulement un pseudonyme HMAC qui empêche le double envoi) ;
  les suggestions libres sont masquées tant qu'il y a moins de 3 réponses (anti ré-identification).

### Navigateur et réseau
- En-têtes via Helmet : CSP stricte (`script-src 'self'`), `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, HSTS en production.
- Limitation de débit globale, renforcée sur l'authentification et les formulaires publics. Champ piège anti-robots sur le formulaire de contact.
- **Aucune requête vers un tiers** : polices hébergées localement (pas de Google Fonts), plus de service de traduction externe pour l'assistant.

### Traçabilité
- **Journal d'audit** (`/admin/audit`) : connexions, échecs, consultation du dossier d'un tiers, téléchargements de documents, lecture des arrêts maladie,
  exports, archivages… L'IP n'est conservée que sous forme de pseudonyme (HMAC).
- Logs applicatifs sans cookie, jeton ni mot de passe (masqués).

## 2. Droits des personnes

| Droit | Comment l'exercer |
|---|---|
| Accès / portabilité (art. 15, 20) | L'employé : **Sécurité → Télécharger mes données** (JSON structuré). Opération tracée. |
| Rectification (art. 16) | Profil (champs personnels) ; l'administration RH pour le reste. |
| Effacement (art. 17) | Admin : **Employés → Archiver** (accès coupé, données conservées pendant la durée légale) puis **Anonymiser** (irréversible : identité, coordonnées, fichiers, notifications effacés ; seules des statistiques sans identité subsistent). Anonymisation automatique après `departedEmployeeRetentionYears`. |
| Opposition / limitation (art. 18, 21) | Via le DPO (`dpoEmail`) ; l'archivage suspend l'accès au compte. |

Les obligations légales (ex. conservation des bulletins de paie) peuvent primer sur l'effacement : l'archivage existe pour cela.

## Rotation des clés de chiffrement

Les clés `FIELD_ENCRYPTION_KEY` (champs) et `FILE_ENCRYPTION_KEY` (fichiers) peuvent être changées **sans interruption de service** :

1. Générer une nouvelle clé : `cd server && npm run gen:keys` (utiliser la ligne `FIELD_ENCRYPTION_KEY=…` ou `FILE_ENCRYPTION_KEY=…`).
2. Dans le `.env` du client : mettre la **nouvelle** clé dans `FIELD_ENCRYPTION_KEY`, et l'**ancienne** dans `FIELD_ENCRYPTION_KEYS_OLD` (liste séparée par des virgules ; idem pour les fichiers avec `FILE_ENCRYPTION_KEYS_OLD`).
3. Redémarrer : tout reste lisible (les anciennes valeurs se déchiffrent avec l'ancienne clé), les nouvelles écritures utilisent la nouvelle clé.
4. Rechiffrer l'existant : `npm run rotate-keys -- --dry-run` (compte ce qui reste), puis `npm run rotate-keys`. Le script est reprenable et écrit les fichiers de façon atomique.
   Avec Docker : `docker compose exec app node dist/scripts/rotate-keys.js`.
5. Quand le script ne signale plus rien, retirer l'ancienne clé de `*_KEYS_OLD` et la détruire.

Faire une **sauvegarde** de la base et du dossier `storage` avant l'étape 4. Une clé perdue rend les données chiffrées sous cette clé définitivement illisibles.

## 3. Rétention automatique

Une tâche quotidienne (03:30) supprime : journal d'audit, notifications, demandes de contact, feedbacks au-delà des durées de
`client.config.json` (section `gdpr`) et anonymise les comptes archivés trop anciens. Les durées par défaut sont des **valeurs
indicatives** : à valider avec le client.

## 4. Ce qui reste à la charge de l'hébergeur et du client

- **HTTPS obligatoire** en production (voir [DEPLOIEMENT.md](DEPLOIEMENT.md)) : sans lui, cookies `Secure` et HSTS sont inopérants.
- **Hébergement** : choisir un hébergeur dans l'UE (ou avec garanties adéquates), signer le **contrat de sous-traitance** (art. 28).
- **Chiffrement du disque / de la base** de l'hébergeur et accès SSH restreint, mises à jour système.
- **Sauvegardes chiffrées** de MongoDB **et** du dossier `storage`, et conservation des clés `.env` dans un coffre séparé
  (sans `FIELD_ENCRYPTION_KEY` / `FILE_ENCRYPTION_KEY`, les données chiffrées sont irrécupérables).
- **Registre des traitements** (art. 30), information des salariés (la page Confidentialité fournit une base), analyse d'impact si nécessaire
  (traitement de données de santé : arrêts maladie).
- **Procédure de violation de données** : notification à l'autorité sous 72 h. Le journal d'audit aide à qualifier l'incident.
- **Serveur SMTP** : les e-mails (notifications) transitent par le fournisseur choisi ; le contenu est volontairement minimal.
- Surveillance : suivre les alertes de sécurité des dépendances (`npm audit`) et mettre à jour régulièrement.

## 5. Limites connues

- Le verrouillage de compte peut être utilisé pour **empêcher un utilisateur de se connecter** (déni de service ciblé, durée = `lockMinutes`) : compromis assumé, atténué par la limitation de débit.
- Un code TOTP valide peut être réutilisé dans sa fenêtre de 30 s.
- Le freinage de connexion est en mémoire : il est remis à zéro au redémarrage du serveur et n'est pas partagé entre plusieurs instances.
- Les tâches planifiées s'exécutent dans le processus Node : avec **plusieurs instances** pour un même client, elles seraient jouées en double
  (le crédit de congés est idempotent, les rappels seraient dupliqués). Un client = une instance.
- L'e-mail n'est pas chiffré de bout en bout.
- Les champs chiffrés ne sont ni triables ni recherchables.

## Secrets de l'ancienne version

Le fichier `.env` de la version Flask était **versionné dans Git**. Il a été retiré du suivi (`git rm --cached`) et le dossier `legacy/` (dont sa copie locale de sauvegarde) a été supprimé de la branche principale, mais le fichier reste dans l'historique des commits. À faire :

1. **Changer immédiatement** le mot de passe d'application Gmail (`MAIL_PASSWORD_APP`) et tout secret qu'il contenait ; l'ancienne `SECRET_KEY` (Fernet) ne doit plus être utilisée.
2. Si le dépôt a été partagé ou publié, **purger l'historique** (`git filter-repo --path .env --invert-paths`, ou BFG Repo-Cleaner) puis forcer le push et demander
   aux collaborateurs de re-cloner. Considérer les secrets comme compromis dans tous les cas.
3. Vérifier qu'aucune copie de l'ancien `.env` ne subsiste (poste local, sauvegardes, messageries).
