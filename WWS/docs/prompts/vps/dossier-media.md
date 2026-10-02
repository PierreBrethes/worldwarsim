---
type: prompt
statut: validé
maj: 2026-10-02
code: [deploiement/compose.prod.yml, deploiement/nginx.conf]
decisions: [plan-4b-2026-10-02, plan-5c-2026-10-02]
voir: [../../marque/marque-et-site.md, ../code/ready/film-sur-les-pages-d-entree.md]
---

# dossier-media — les vidéos du film sur le VPS

**En bref.** Prompt pour le Claude du VPS, en deux étapes : créer le dossier média hors du dépôt
et vérifier l'envoi (avant le déploiement), puis vérifier que le front le sert (après). Le
montage dans le conteneur arrive par le dépôt :
[film-sur-les-pages-d-entree](../code/ready/film-sur-les-pages-d-entree.md).

Ordre : étape 1 → envoi depuis le Mac → prompt Claude Code, commit, push, CI → étape 2. Le
dossier doit exister **avant** le déploiement : sinon Docker le crée vide, au nom de root.

## Le prompt (à coller tel quel)

Tu es sur le VPS de La Manchette (nom de code worldwarsim). Le dépôt est cloné dans
`/opt/worldwarsim` et la CI le redéploie (`git`, puis `docker compose -f docker-compose.yml -f
deploiement/compose.prod.yml --profile prod up -d --build front`) : **n'y modifie aucun fichier**,
toute configuration passe par le dépôt. Ne touche ni à Traefik, ni au backend Convex, ni aux
autres sites du VPS. Ne commit pas, ne push pas.

But : un dossier média hors du dépôt (décision plan-4b-2026-10-02 : les vidéos vivent sur le
VPS, pas dans git). Le conteneur `front` le montera en lecture seule sur `/media/` ; ce montage
arrive par le dépôt, pas par toi.

**Étape 1 — maintenant**

1. Crée `/opt/worldwarsim-media` (sudo si besoin), propriétaire l'utilisateur SSH courant,
   droits 755. Les fichiers devront être en 644 : le nginx du conteneur lit avec son propre
   utilisateur.
2. Donne-moi la commande `scp` exacte, prête à coller dans le terminal de mon Mac, qui envoie
   depuis `~/Documents/Projects/Worldwarsim/Claude outputs/film/` ces trois fichiers dans ce
   dossier : `la-manchette-boucle-8s.mp4`, `la-manchette-boucle-poster.jpg`,
   `la-manchette-film-30s-leger.mp4`. Relève toi-même l'utilisateur (`whoami`), un nom d'hôte
   joignable en SSH depuis l'extérieur et le port SSH réel : aucun paramètre à remplacer.
3. Quand je te dis que c'est envoyé, vérifie tailles, empreintes et droits :

| Fichier | Octets | sha256 |
|---|---|---|
| `la-manchette-boucle-8s.mp4` | 3 039 464 | `8fa5c5e6ed9fb9ed86687afd1c818ce4d9a34fa7e64fe8887831e2047c483752` |
| `la-manchette-boucle-poster.jpg` | 153 152 | `30aef4a0ac898dacfd177fde5602db8cf290619fe7465585ecf3384b4da01062` |
| `la-manchette-film-30s-leger.mp4` | 11 349 653 | `be37e6f8208eab2fca6d255d0b4827cf9efbaaa9749b3399efd7ce757b90e830` |

**Étape 2 — quand je te dis que le déploiement est passé**

Depuis `/opt/worldwarsim` :

- `docker compose -f docker-compose.yml -f deploiement/compose.prod.yml --profile prod exec front ls -l /usr/share/nginx/html/media` : les trois fichiers.
- `curl -sI https://wws.pierrebrethes.cloud/media/la-manchette-boucle-8s.mp4` : 200,
  `Content-Type: video/mp4`, `Accept-Ranges: bytes`, un `Cache-Control`.
- `curl -s -o /dev/null -w '%{http_code}\n' -H 'Range: bytes=0-99' https://wws.pierrebrethes.cloud/media/la-manchette-boucle-8s.mp4` :
  206 (Safari ne lit pas une vidéo servie sans plages d'octets).
- `curl -s -o /dev/null -w '%{http_code}\n' https://wws.pierrebrethes.cloud/media/absent.mp4` :
  404, jamais 200 (le repli SPA ne doit pas couvrir `/media/`).

Rapporte en quelques lignes : ce qui passe, ce qui casse, rien d'autre.
