#!/bin/sh
# Auto-test des scripts de sauvegarde, contre une base MongoDB JETABLE (jamais une production) : MONGODB_URI=mongodb://hôte:27017/humanlink
# Joué par le workflow « Sauvegardes » ; en local : MONGODB_URI=... SCRIPTS_DIR=deploy/backup sh deploy/backup/selftest.sh
set -u

: "${MONGODB_URI:?MONGODB_URI est obligatoire (base jetable)}"
S=${SCRIPTS_DIR:-/scripts}
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
export DATA_DIR="$W/data" BACKUP_DIR="$W/backups"
mkdir -p "$DATA_DIR/2026/10" "$BACKUP_DIR"
unset BACKUP_PASSPHRASE BACKUP_PASSPHRASE_FILE

FAILED=0
ok() { echo "  ok    $1"; }
ko() { echo "  ÉCHEC $1"; FAILED=1; }
expect_ok() { desc=$1; shift; if "$@" > "$W/out" 2>&1; then ok "$desc"; else ko "$desc"; cat "$W/out"; fi; }
expect_fail() { desc=$1; shift; if "$@" > "$W/out" 2>&1; then ko "$desc (aurait dû échouer)"; cat "$W/out"; else ok "$desc"; fi; }
pause() { sleep 1; } # les sauvegardes sont nommées à la seconde

mongosh "$MONGODB_URI" --quiet --eval 'db.users.insertMany([{nom:"A"},{nom:"B"}]); db.storedfiles.insertOne({k:1})' > /dev/null || { echo "MongoDB injoignable"; exit 1; }
printf 'HLF2%060d' 0 > "$DATA_DIR/2026/10/a.bin"

echo "Sauvegarde en clair"
expect_ok "sauvegarde" sh "$S/backup.sh"
expect_ok "restauration dans une base temporaire" sh "$S/restore-test.sh"
n=$(mongosh "$MONGODB_URI" --quiet --eval 'db.getMongo().getDBNames().filter(n => n.endsWith("_restoretest")).length')
[ "$n" = "0" ] && ok "la base temporaire est supprimée" || ko "la base temporaire est restée"

echo "Sauvegarde chiffrée"
pause
BACKUP_PASSPHRASE=secret expect_ok "sauvegarde chiffrée" sh "$S/backup.sh"
newest=$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' | sort | tail -1)
[ -f "$newest/db.archive.gz.enc" ] && [ ! -f "$newest/db.archive.gz" ] && ok "la base n'est plus lisible en clair" || ko "la base n'est pas chiffrée"
BACKUP_PASSPHRASE=secret expect_ok "restauration avec la bonne phrase" sh "$S/restore-test.sh"
BACKUP_PASSPHRASE=faux expect_fail "refus avec une mauvaise phrase" sh "$S/restore-test.sh"
expect_fail "refus sans phrase de passe" sh "$S/restore-test.sh"

echo "Sauvegardes défectueuses"
first=$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' | sort | head -1)
printf 'x' >> "$first/files.tar.gz"
expect_fail "archive corrompue détectée" sh "$S/restore-test.sh" "$first"
pause
rm -f "$DATA_DIR/2026/10/a.bin"
sh "$S/backup.sh" > /dev/null 2>&1
expect_fail "fichier manquant détecté" sh "$S/restore-test.sh"

echo "Conservation"
mkdir "$BACKUP_DIR/20200101T000000Z"
touch -d '2020-01-01' "$BACKUP_DIR/20200101T000000Z"
pause
sh "$S/backup.sh" > /dev/null 2>&1
[ ! -d "$BACKUP_DIR/20200101T000000Z" ] && ok "les sauvegardes trop anciennes sont supprimées" || ko "rotation absente"
[ -f "$BACKUP_DIR/last-success" ] && ok "last-success à jour" || ko "last-success absent"

[ "$FAILED" -eq 0 ] && echo "Auto-test réussi." || { echo "Auto-test en échec." >&2; exit 1; }
