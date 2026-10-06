# ADR 0004 : Chiffrement au repos des champs et des fichiers sensibles, avec clés versionnées

**Statut :** acceptée

## Contexte

Salaire, numéro de sécurité sociale, adresse, téléphone, bulletins de paie et arrêts maladie sont des données à risque. Une sauvegarde ou un export de base ne doit pas les exposer.

## Décision

- Champs sensibles : **AES-256-GCM** au niveau de l'application (`enc:v2:<kid>:…`), déchiffrés à la lecture par Mongoose.
- Fichiers : chiffrés avant d'être écrits sur disque (format `HLF2`), sous un nom aléatoire, hors de tout dossier public ; contrôle du vrai type par « magic bytes », antivirus ClamAV en option.
- Clés **versionnées** : on peut en ajouter une nouvelle (`npm run rotate-keys`) sans perdre les anciennes données.

## Pourquoi

Le chiffrement applicatif protège aussi quand la base elle-même est lue (sauvegarde perdue, administrateur de base). Un champ chiffré n'est pas requêtable ni triable : c'est acceptable pour ces champs (on ne cherche jamais par salaire).

## Conséquences

- **Perdre les clés = perdre les données** : elles sont à sauvegarder dans un coffre distinct des sauvegardes (voir `docs/DEPLOIEMENT.md`).
- Les moyennes de salaire se calculent dans l'application (tableau de bord), pas dans la base.
- Les sauvegardes peuvent en plus être chiffrées (`BACKUP_PASSPHRASE`) puisque la base contient encore des noms et des e-mails en clair.

## Alternatives écartées

Chiffrement du disque seul (ne protège pas contre une fuite de sauvegarde ni contre un accès à la base) ; chiffrement transparent de MongoDB (édition Enterprise).
