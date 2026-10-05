#!/usr/bin/env bash
# Lance, arrête ou liste TOUTES les instances Docker d'un serveur : un projet Compose isolé par client
# (sa propre base MongoDB, ses propres volumes, son propre port sur 127.0.0.1).
#
#   ./deploy/instances-docker.sh up            # toutes les instances de clients/ qui ont un .env
#   ./deploy/instances-docker.sh up acme globex # certaines seulement
#   ./deploy/instances-docker.sh status | logs <nom> | down | pull-restart
#
# Prérequis : un fichier .env à la racine (MONGO_PASSWORD=...) ; chaque client a clients/<nom>/.env et instance.json.
set -euo pipefail
cd "$(dirname "$0")/.."

cmd="${1:-status}"; shift || true
mapfile -t all < <(find clients -mindepth 2 -maxdepth 2 -name instance.json -printf '%h\n' | sed 's|clients/||' | sort)
if [ "$#" -gt 0 ]; then names=("$@"); else names=("${all[@]}"); fi

port_of() { sed -n 's/.*"port": *\([0-9]*\).*/\1/p' "clients/$1/instance.json"; }
dc() { # dc <client> <args...>
  local c="$1"; shift
  CLIENT_DIR="./clients/$c" APP_PORT="127.0.0.1:$(port_of "$c")" TRUST_PROXY=1 \
    docker compose -p "hl-$c" "$@"
}

for c in "${names[@]}"; do
  [[ -f "clients/$c/.env" ]] || { echo "• $c : pas de clients/$c/.env, ignoré"; continue; }
  case "$cmd" in
    up)           echo "→ $c (port $(port_of "$c"))"; dc "$c" up -d --build ;;
    down)         dc "$c" down ;;
    status)       echo "== $c =="; dc "$c" ps ;;
    logs)         dc "$c" logs --tail 100 app ;;
    pull-restart) dc "$c" pull && dc "$c" up -d ;;
    *)            echo "Commande inconnue : $cmd"; exit 1 ;;
  esac
done
