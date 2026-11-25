# La boîte à outils des sauvegardes (#650) : sqlite3, rclone, et socat pour le relais de
# l'essai. Elle tourne à côté du backend, sur le même volume, pour ne rien supposer de l'image
# Convex (qui n'a pas à porter sqlite3) ni de l'hôte (qui n'a besoin que de Docker).
FROM ubuntu:24.04
RUN apt-get update \
 && apt-get install -y --no-install-recommends sqlite3 rclone socat wget ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY deploiement/outils/ /usr/local/bin/
RUN chmod 755 /usr/local/bin/*.sh \
 && for f in /usr/local/bin/*.sh; do ln -s "$f" "${f%.sh}"; done
WORKDIR /sauvegardes
