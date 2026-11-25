#!/bin/sh
# Une sauvegarde de l'état Convex (#650) : la base SQLite copiée à chaud (cohérente même pendant
# une écriture), relue en entier, plus le stockage de fichiers du backend (les modules déployés
# y vivent), en une archive datée et son empreinte. Puis, si `WWS_DISTANT` est
# posé, la copie part hors du VPS par rclone.
#
# Lancée par deploiement/sauvegarde.sh, dans le conteneur `outils`, volume `convex-data` monté.
set -eu
. /usr/local/bin/commun.sh

signaler() {
  [ -n "${WWS_PING_URL:-}" ] || return 0
  wget -q -T 10 -O /dev/null "$WWS_PING_URL$1" || dire "ping injoignable : $WWS_PING_URL$1"
}

sauvegarder() {
  [ -f "$DATA/db.sqlite3" ] || echouer "$DATA/db.sqlite3 absent : le volume monté n'est pas celui du backend"
  nom="wws-$(date -u +%Y-%m-%dT%H%MZ)"
  travail=$(mktemp -d)
  mkdir "$travail/$nom"

  # `VACUUM INTO` et pas `.backup` : la copie se lit dans une seule transaction de lecture, que
  # les écritures du backend (WAL) ne dérangent pas, alors qu'un `.backup` recommence à chaque
  # écriture d'une autre connexion et peut ne jamais finir sous un backend actif. Le délai
  # couvre un verrou pris au moment d'ouvrir (« database is locked » sans lui, à l'essai).
  sqlite3 -cmd '.timeout 60000' "$DATA/db.sqlite3" "VACUUM INTO '$travail/$nom/db.sqlite3'"
  verifier_base "$travail/$nom/db.sqlite3"
  if [ -d "$DATA/storage" ]; then cp -a "$DATA/storage" "$travail/$nom/storage"; fi
  # L'image exacte qui a écrit la base : la restaurer sous un autre backend est un pari.
  {
    echo "date=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "image=${WWS_BACKEND_IMAGE:-inconnue}"
    echo "octets_base=$(stat -c %s "$travail/$nom/db.sqlite3")"
  } > "$travail/$nom/MANIFEST"

  # Écrite à côté puis renommée : une archive à moitié écrite ne porte jamais le nom d'une copie.
  tar -czf "$SAUVEGARDES/$nom.tar.gz.partiel" -C "$travail" "$nom"
  mv "$SAUVEGARDES/$nom.tar.gz.partiel" "$SAUVEGARDES/$nom.tar.gz"
  (cd "$SAUVEGARDES" && sha256sum "$nom.tar.gz" > "$nom.tar.gz.sha256")
  dire "écrite : $nom.tar.gz ($(stat -c %s "$SAUVEGARDES/$nom.tar.gz") octets)"

  find "$SAUVEGARDES" -maxdepth 1 -name 'wws-*.tar.gz*' -mtime +"${WWS_RETENTION_LOCALE:-14}" -delete

  if [ -z "${WWS_DISTANT:-}" ]; then
    dire "WWS_DISTANT vide : la copie reste sur cette machine"
    return 0
  fi
  # rclone vérifie taille et somme de chaque objet envoyé ; l'empreinte part après l'archive,
  # si bien qu'une archive distante sans empreinte est un envoi interrompu.
  rclone copyto "$SAUVEGARDES/$nom.tar.gz" "$WWS_DISTANT/$nom.tar.gz"
  rclone copyto "$SAUVEGARDES/$nom.tar.gz.sha256" "$WWS_DISTANT/$nom.tar.gz.sha256"
  dire "envoyée : $WWS_DISTANT/$nom.tar.gz"
  # Vide, la rétention distante revient au fournisseur (règle de cycle de vie) : la clé du VPS
  # peut alors être privée du droit d'effacer, et un VPS compromis n'efface rien au-dehors.
  if [ -n "${WWS_RETENTION_DISTANTE:-}" ]; then
    rclone delete "$WWS_DISTANT" --min-age "$WWS_RETENTION_DISTANTE" --include 'wws-*.tar.gz*'
  fi
}

# Sur EXIT et pas autour d'un `if` : `set -e` ne joue pas dans la condition d'un `if`, et une
# étape ratée y passerait pour réussie.
travail=
finir() {
  statut=$?
  [ -z "$travail" ] || rm -rf "$travail"
  if [ "$statut" -eq 0 ]; then signaler ''; else signaler /fail; fi
}
trap finir EXIT
sauvegarder
