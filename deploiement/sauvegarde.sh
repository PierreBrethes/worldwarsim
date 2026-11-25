#!/bin/sh
# La sauvegarde quotidienne du VPS (#650), lancée par cron depuis le dossier du dépôt :
#   10 4 * * * /opt/worldwarsim/deploiement/sauvegarde.sh >> $HOME/wws-sauvegarde.log 2>&1
# Réglages dans `.env` : WWS_DISTANT, WWS_RETENTION_*, WWS_PING_URL (deploiement/README.md).
set -eu
cd "$(dirname "$0")/.."
compose() { docker compose -f docker-compose.yml -f deploiement/compose.prod.yml "$@"; }

conteneur=$(compose ps -q backend)
[ -n "$conteneur" ] || { echo "sauvegarde : le backend ne tourne pas" >&2; exit 1; }
# Le digest et pas le tag : `latest` aura bougé le jour où il faudra restaurer. Une image bâtie
# sur place n'en a pas ; on garde alors son nom plutôt que de manquer la sauvegarde.
image=$(docker image inspect --format '{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}' \
  "$(docker inspect --format '{{.Image}}' "$conteneur")")
[ -n "$image" ] || image=$(docker inspect --format '{{.Config.Image}}' "$conteneur")

compose --profile outils build -q outils
compose --profile outils run --rm -T -e WWS_BACKEND_IMAGE="$image" outils sauvegarder
