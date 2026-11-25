#!/bin/sh
# L'essai de restauration (#650) : une copie remontée sur un backend neuf, à côté de la
# production, sans réseau sortant (deploiement/compose.essai.yml).
#   deploiement/restauration.sh derniere                       # la dernière copie distante
#   deploiement/restauration.sh wws-2026-11-25T0410Z.tar.gz    # une copie de WWS_SAUVEGARDES_DIR
#   deploiement/restauration.sh --nettoyer                     # arrête l'essai, efface son volume
# Le projet `wws-essai` est jetable : chaque essai repart d'un volume vide.
set -eu
cd "$(dirname "$0")/.."
projet=wws-essai
outils() { docker compose -p "$projet" -f docker-compose.yml --profile outils run --rm -T outils "$@"; }
essai() { docker compose -p "$projet" -f docker-compose.yml -f deploiement/compose.essai.yml "$@"; }

if [ "${1:-}" = --nettoyer ]; then
  WWS_BACKEND_IMAGE=nettoyage essai down -v --remove-orphans
  exit 0
fi
archive=${1:?usage : deploiement/restauration.sh derniere|<archive>|--nettoyer}

docker compose -p "$projet" -f docker-compose.yml --profile outils build -q outils
if [ "$archive" = derniere ]; then
  archive=$(outils recuperer derniere | tail -n 1)
fi

# Le dossier des sauvegardes tel que compose le monte, lu dans `.env` comme lui.
dossier=$(grep -E '^WWS_SAUVEGARDES_DIR=' .env 2>/dev/null | tail -n 1 | cut -d= -f2-)
dossier=${dossier:-./sauvegardes}
[ -f "$dossier/$archive" ] || { echo "restauration : $dossier/$archive absente" >&2; exit 1; }
image=$(tar -xzOf "$dossier/$archive" --wildcards '*/MANIFEST' | sed -n 's/^image=//p')
case "$image" in
  '' | inconnue) echo "restauration : image du backend inconnue dans le MANIFEST" >&2; exit 1 ;;
esac
export WWS_BACKEND_IMAGE="$image"

essai down -v --remove-orphans
essai create backend
outils restaurer "$archive"
essai up -d --wait backend relais

cle=$(essai exec -T backend ./generate_admin_key.sh | tail -n 1)
port=${WWS_ESSAI_PORT:-3310}
cat <<FIN

Essai levé sur http://127.0.0.1:$port (image $image).
Relire une saison, depuis un poste qui a le dépôt (tunnel : ssh -L $port:127.0.0.1:$port <vps>) :

  CONVEX_SELF_HOSTED_URL=http://127.0.0.1:$port CONVEX_SELF_HOSTED_ADMIN_KEY='$cle' \\
    npx convex data seasons

Puis : deploiement/restauration.sh --nettoyer
FIN
