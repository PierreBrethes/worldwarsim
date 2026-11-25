#!/bin/sh
# Remonte une archive de sauvegarder.sh dans le volume monté sur /convex/data. Le backend de ce
# volume doit être arrêté : deploiement/restauration.sh s'en charge pour un essai.
#   restaurer wws-2026-11-25T0410Z.tar.gz
# Une base déjà présente n'est écrasée qu'avec WWS_ECRASER=1.
set -eu
. /usr/local/bin/commun.sh

archive=${1:-}
[ -n "$archive" ] || echouer 'usage : restaurer <archive de /sauvegardes>'
case "$archive" in /*) ;; *) archive="$SAUVEGARDES/$archive" ;; esac
[ -f "$archive" ] || echouer "archive absente : $archive"
[ -f "$archive.sha256" ] || echouer "empreinte absente : $archive.sha256 (envoi interrompu ?)"
(cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive").sha256" >/dev/null) \
  || echouer "empreinte fausse : $archive"

travail=$(mktemp -d)
trap 'rm -rf "$travail"' EXIT
tar -xzf "$archive" -C "$travail"
source=$(find "$travail" -mindepth 1 -maxdepth 1 -type d -name 'wws-*')
[ -f "$source/db.sqlite3" ] || echouer "pas de db.sqlite3 dans $archive"
verifier_base "$source/db.sqlite3"

if [ -e "$DATA/db.sqlite3" ] && [ "${WWS_ECRASER:-0}" != 1 ]; then
  echouer "$DATA/db.sqlite3 existe : WWS_ECRASER=1 pour l'écraser"
fi
# Un -wal ou un -shm laissé là serait rejoué sur la base restaurée et la corromprait.
rm -rf "$DATA/db.sqlite3" "$DATA/db.sqlite3-wal" "$DATA/db.sqlite3-shm" "$DATA/storage"
cp "$source/db.sqlite3" "$DATA/db.sqlite3"
if [ -d "$source/storage" ]; then cp -a "$source/storage" "$DATA/storage"; fi
dire "restaurée dans $DATA :"
cat "$source/MANIFEST" >&2
