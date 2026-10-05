#!/bin/sh
# Planificateur du conteneur « backup » : une sauvegarde par nuit (BACKUP_HOUR, heure UTC, 2 par défaut),
# un test de restauration le 1er de chaque mois. Un échec n'arrête pas la boucle ; il est journalisé et, si
# ERROR_WEBHOOK_URL est défini, signalé à l'équipe.
set -u

HOUR=${BACKUP_HOUR:-2}
alert() {
  echo "[backup] $1" >&2
  [ -n "${ERROR_WEBHOOK_URL:-}" ] && curl -fsS -m 10 -H 'Content-Type: application/json' -d "{\"text\":\"Human Link — $1\"}" "$ERROR_WEBHOOK_URL" > /dev/null 2>&1
  return 0
}

[ "${BACKUP_ON_START:-false}" = "true" ] && { /scripts/backup.sh || alert "la sauvegarde au démarrage a échoué"; }

while true; do
  now=$(date -u +%s)
  next=$(date -u -d "today $HOUR:00" +%s)
  [ "$next" -le "$now" ] && next=$(date -u -d "tomorrow $HOUR:00" +%s)
  echo "[backup] prochaine sauvegarde : $(date -u -d "@$next" +%FT%TZ)"
  sleep $((next - now))

  /scripts/backup.sh || alert "la sauvegarde de la nuit a échoué"
  if [ "$(date -u +%d)" = "01" ]; then
    /scripts/restore-test.sh || alert "le test de restauration mensuel a échoué : la dernière sauvegarde n'est peut-être pas exploitable"
  fi
done
