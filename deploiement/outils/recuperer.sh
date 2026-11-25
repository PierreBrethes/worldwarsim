#!/bin/sh
# Ramène une copie distante dans /sauvegardes et imprime son nom sur la dernière ligne.
#   recuperer derniere | recuperer wws-2026-11-25T0410Z.tar.gz
set -eu
. /usr/local/bin/commun.sh

[ -n "${WWS_DISTANT:-}" ] || echouer "WWS_DISTANT vide : rien à récupérer"
nom=${1:-}
[ -n "$nom" ] || echouer 'usage : recuperer derniere | recuperer <archive>'
if [ "$nom" = derniere ]; then
  nom=$(rclone lsf "$WWS_DISTANT" | plus_recente)
  [ -n "$nom" ] || echouer "aucune copie dans $WWS_DISTANT"
fi
rclone copyto "$WWS_DISTANT/$nom" "$SAUVEGARDES/$nom"
rclone copyto "$WWS_DISTANT/$nom.sha256" "$SAUVEGARDES/$nom.sha256"
echo "$nom"
