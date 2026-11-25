#!/bin/sh
# Ce que les outils de sauvegarde partagent. Sourcé, jamais lancé seul.
DATA=/convex/data
SAUVEGARDES=/sauvegardes

dire() { echo "$(basename "$0") : $*" >&2; }
echouer() { dire "$*"; exit 1; }

# L'intégrité d'une base SQLite, lue en entier : « ok » ou la liste des pages abîmées.
verifier_base() {
  resultat=$(sqlite3 "$1" 'PRAGMA integrity_check;' 2>&1) || echouer "base illisible : $1 ($resultat)"
  [ "$resultat" = ok ] || echouer "intégrité refusée pour $1 : $resultat"
}

# La copie complète la plus récente d'une liste de fichiers (stdin) : une archive dont l'empreinte
# manque est un envoi interrompu, elle ne compte pas. L'horodatage UTC du nom
# `wws-AAAA-MM-JJTHHMMZ.tar.gz` se trie comme du texte.
plus_recente() {
  liste=$(cat)
  echo "$liste" | grep -E '^wws-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{4}Z\.tar\.gz$' | sort -r |
    while read -r f; do
      if echo "$liste" | grep -qxF "$f.sha256"; then echo "$f"; break; fi
    done
}
