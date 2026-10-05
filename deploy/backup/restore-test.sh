#!/bin/sh
# Test de restauration : prend la dernière sauvegarde (ou celle donnée en argument), vérifie ses empreintes, la restaure dans une
# base TEMPORAIRE (jamais dans la production), contrôle les données et les fichiers, puis supprime la base temporaire.
# Variables : MONGODB_URI (obligatoire), BACKUP_DIR (/backups), BACKUP_PASSPHRASE ou BACKUP_PASSPHRASE_FILE si les sauvegardes sont chiffrées.
set -eu

if [ -z "${MONGODB_URI:-}" ] && [ -n "${MONGODB_URI_FILE:-}" ]; then MONGODB_URI=$(cat "$MONGODB_URI_FILE"); fi
: "${MONGODB_URI:?MONGODB_URI (ou MONGODB_URI_FILE) est obligatoire}"
BACKUP_DIR=${BACKUP_DIR:-/backups}
SRC_DB=${MONGO_DB:-humanlink}
TEST_DB="${SRC_DB}_restoretest"

if [ -z "${BACKUP_PASSPHRASE:-}" ] && [ -n "${BACKUP_PASSPHRASE_FILE:-}" ]; then
  BACKUP_PASSPHRASE=$(cat "$BACKUP_PASSPHRASE_FILE")
fi
export BACKUP_PASSPHRASE="${BACKUP_PASSPHRASE:-}"

fail() { echo "[restore-test] ÉCHEC : $*" >&2; exit 1; }

dir=${1:-$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' | sort | tail -1)}
[ -n "$dir" ] && [ -d "$dir" ] || fail "aucune sauvegarde trouvée dans $BACKUP_DIR"
echo "[restore-test] sauvegarde testée : $dir"

work=$(mktemp -d)
cleanup() {
  rm -rf "$work"
  mongosh "$MONGODB_URI" --quiet --eval "db.getSiblingDB('$TEST_DB').dropDatabase()" > /dev/null 2>&1 || true
}
trap cleanup EXIT

(cd "$dir" && sha256sum -c SHA256SUMS --quiet) || fail "empreintes SHA-256 incorrectes : la sauvegarde est corrompue"
echo "[restore-test] empreintes valides"

for f in db.archive.gz files.tar.gz; do
  if [ -f "$dir/$f.enc" ]; then
    [ -n "$BACKUP_PASSPHRASE" ] || fail "sauvegarde chiffrée : définir BACKUP_PASSPHRASE"
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$dir/$f.enc" -out "$work/$f" || fail "déchiffrement impossible (mauvaise phrase de passe ?)"
  else
    cp "$dir/$f" "$work/$f"
  fi
done

echo "[restore-test] restauration de la base dans « $TEST_DB »…"
mongorestore --uri="$MONGODB_URI" --archive="$work/db.archive.gz" --gzip --quiet --drop \
  --nsFrom="$SRC_DB.*" --nsTo="$TEST_DB.*" || fail "mongorestore a échoué"

count() { mongosh "$MONGODB_URI" --quiet --eval "db.getSiblingDB('$1').getCollection('$2').countDocuments()"; }
restored_users=$(count "$TEST_DB" users)
restored_files=$(count "$TEST_DB" storedfiles)
echo "[restore-test] restauré : $restored_users comptes, $restored_files fichiers référencés"
[ "$restored_users" -gt 0 ] || fail "aucun compte dans la base restaurée"

mkdir "$work/files"
tar -xzf "$work/files.tar.gz" -C "$work/files" || fail "archive des fichiers illisible"
on_disk=0
bad=0
for f in $(find "$work/files" -type f -name '*.bin'); do
  on_disk=$((on_disk + 1))
  # Format chiffré de l'application : « HLF2 » en tête (l'ancien format n'a pas d'en-tête, il est seulement compté).
  [ "$(wc -c < "$f")" -ge 44 ] || bad=$((bad + 1))
done
echo "[restore-test] fichiers chiffrés dans l'archive : $on_disk"
[ "$bad" -eq 0 ] || fail "$bad fichier(s) tronqué(s) dans l'archive"
[ "$on_disk" -ge "$restored_files" ] || fail "il manque des fichiers : $restored_files référencés, $on_disk présents"

date -u +%FT%TZ > "$BACKUP_DIR/last-restore-test"
echo "[restore-test] OK : la sauvegarde est complète et restaurable."
