#!/bin/sh
# Dit l'âge de la dernière copie distante (locale si WWS_DISTANT est vide) ; échoue au-delà de
# WWS_FRAICHEUR_HEURES (26 par défaut : un cron quotidien et deux heures de battement).
set -eu
. /usr/local/bin/commun.sh

if [ -n "${WWS_DISTANT:-}" ]; then
  lieu=$WWS_DISTANT
  nom=$(rclone lsf "$WWS_DISTANT" | plus_recente)
else
  lieu=$SAUVEGARDES
  nom=$(ls "$SAUVEGARDES" | plus_recente)
fi
[ -n "$nom" ] || echouer "aucune copie complète dans $lieu"

horodatage=$(echo "$nom" | sed -E 's/^wws-([0-9-]+)T([0-9]{2})([0-9]{2})Z.*/\1 \2:\3Z/')
age=$(( ($(date -u +%s) - $(date -u -d "$horodatage" +%s)) / 3600 ))
echo "dernière copie : $lieu/$nom, il y a ${age} h"
[ "$age" -le "${WWS_FRAICHEUR_HEURES:-26}" ] || echouer "plus vieille que ${WWS_FRAICHEUR_HEURES:-26} h"
