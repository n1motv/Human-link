#!/bin/sh
# Sauvegarde d'un client : base MongoDB + fichiers (déjà chiffrés par l'application) + empreintes SHA-256.
# Variables : MONGODB_URI (obligatoire), DATA_DIR (/data/storage), BACKUP_DIR (/backups), BACKUP_KEEP_DAYS (14),
#             BACKUP_PASSPHRASE ou BACKUP_PASSPHRASE_FILE (facultatif : chiffre aussi la base et l'archive des fichiers).
set -eu

if [ -z "${MONGODB_URI:-}" ] && [ -n "${MONGODB_URI_FILE:-}" ]; then MONGODB_URI=$(cat "$MONGODB_URI_FILE"); fi
: "${MONGODB_URI:?MONGODB_URI (ou MONGODB_URI_FILE) est obligatoire}"
DATA_DIR=${DATA_DIR:-/data/storage}
BACKUP_DIR=${BACKUP_DIR:-/backups}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}

if [ -z "${BACKUP_PASSPHRASE:-}" ] && [ -n "${BACKUP_PASSPHRASE_FILE:-}" ]; then
  BACKUP_PASSPHRASE=$(cat "$BACKUP_PASSPHRASE_FILE")
fi
export BACKUP_PASSPHRASE="${BACKUP_PASSPHRASE:-}"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
tmp="$BACKUP_DIR/.tmp-$stamp"
mkdir -p "$tmp"
trap 'rm -rf "$tmp"' EXIT # une sauvegarde interrompue ne laisse jamais de dossier à moitié rempli

echo "[backup] base de données…"
mongodump --uri="$MONGODB_URI" --archive="$tmp/db.archive.gz" --gzip --quiet

echo "[backup] fichiers…"
if [ -d "$DATA_DIR" ]; then
  tar -czf "$tmp/files.tar.gz" -C "$DATA_DIR" .
else
  tar -czf "$tmp/files.tar.gz" -T /dev/null # rien n'a encore été téléversé : archive vide mais valide
fi

if [ -n "$BACKUP_PASSPHRASE" ]; then
  echo "[backup] chiffrement (AES-256)…"
  for f in db.archive.gz files.tar.gz; do
    openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE -in "$tmp/$f" -out "$tmp/$f.enc"
    rm -f "$tmp/$f"
  done
fi

(cd "$tmp" && sha256sum -- * > SHA256SUMS)
mv "$tmp" "$BACKUP_DIR/$stamp" # le dossier n'apparaît qu'une fois complet
trap - EXIT

# Supprime les sauvegardes plus anciennes que la durée de conservation (celles-ci contiennent des données personnelles).
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$KEEP_DAYS" -exec rm -rf {} +

date -u +%FT%TZ > "$BACKUP_DIR/last-success"
echo "[backup] terminé : $BACKUP_DIR/$stamp ($(du -sh "$BACKUP_DIR/$stamp" | cut -f1))"
