---
type: prompt
statut: livré
maj: 2026-10-02
code: [deploiement/nginx.conf, deploiement/compose.prod.yml, deploiement/README.md, src/shell/Newspaper.tsx, src/routes/connexion.tsx, src/routes/rejoindre.$code.tsx, src/i18n/fr.ts, .gitignore]
decisions: [plan-3b-2026-10-02, plan-4b-2026-10-02, plan-5c-2026-10-02]
voir: [../../../marque/marque-et-site.md, ../../vps/dossier-media.md]
---

# film-sur-les-pages-d-entree — la boucle derrière la connexion et l'invitation

**En bref.** `/connexion` et `/rejoindre/$code` sont les deux pages qu'un ami voit en arrivant.
Derrière la feuille, la boucle muette du film remplace la photo de carte floutée, et un lien
ouvre le film de 30 s. Les vidéos sont servies par le conteneur `front` depuis un dossier du VPS
monté sur `/media/`, hors du dépôt.

> Décisions de Pierre du 02/10/2026 : plan-3b (deux films), plan-4b (vidéos sur le VPS, hors du
> dépôt), plan-5c (la page d'accueil publique attend l'ouverture ; d'abord la boucle sur les pages
> d'entrée, puis le lot D). Le dossier du VPS est créé à part : `WWS/docs/prompts/vps/dossier-media.md`.

Lis `CLAUDE.md`, `CONVENTIONS.md`, l'ADR 0016 (tout texte affiché passe par `fr.ts`),
`deploiement/nginx.conf`, `deploiement/compose.prod.yml`, `deploiement/README.md`,
`src/shell/Newspaper.tsx` (`MapTable`), `src/routes/connexion.tsx`, `src/routes/rejoindre.$code.tsx`,
et la section film de `WWS/docs/marque/marque-et-site.md`. Regarde
`Claude outputs/film/la-manchette-boucle-8s.mp4` et `la-manchette-boucle-poster.jpg` avant de
régler le fond. Ne commit pas, ne push pas. Un chantier, un commit.

## 1. Servir `/media/`

- `deploiement/nginx.conf` : `location /media/ { try_files $uri =404; add_header Cache-Control
  "public, max-age=86400"; }`. Le `=404` pour la même raison que `/assets/` : sans lui, le repli
  SPA rendrait `index.html` en 200 à la place d'une vidéo absente. Un jour de cache et pas
  `immutable` : les noms ne sont pas hachés, et un nouveau rendu du film (une URL qui change)
  garde son nom. Nginx sert les plages d'octets tout seul ; les mp4 ne sont pas dans `gzip_types`
  et ne doivent pas y entrer.
- `deploiement/compose.prod.yml`, service `front` :
  `volumes: ['${WWS_MEDIA_DIR:-/opt/worldwarsim-media}:/usr/share/nginx/html/media:ro']`, avec un
  commentaire : le dossier vit hors du dépôt (plan-4b), il est créé à la main sur le VPS et doit
  exister avant le premier `up`, sinon Docker le crée vide au nom de root.
- `deploiement/README.md` : une section « Médias » — où (`/opt/worldwarsim-media`), quoi (les trois
  fichiers), comment les envoyer (`scp` depuis `Claude outputs/film/`), et le renvoi au prompt VPS.
- `.gitignore` : `public/media/`. C'est là qu'on dépose les fichiers pour tester en local ; ils ne
  doivent jamais partir dans git.

## 2. La boucle derrière la feuille

- `Newspaper` prend `backdrop?: 'map' | 'film'`, `'map'` par défaut : l'accueil et le salon ne
  changent pas. `connexion` et `rejoindre.$code` passent `'film'`.
- Le fond `'film'` garde la table de carte d'aujourd'hui **dessous** — c'est le repli — et pose
  par-dessus une `<video>` décorative : `muted`, `loop`, `playsInline`, `autoPlay`, `aria-hidden`,
  `disablePictureInPicture`, aucun contrôle, `poster` sur l'image d'attente. Elle apparaît en fondu
  à l'événement `playing` et reste invisible sur `error` : sans médias (en dev, dossier vide), la
  page est exactement celle d'aujourd'hui.
- Par-dessus la vidéo, les couches de `MapTable` (dégradés, hachures, vignette), mais un flou d'au
  plus 2 px et une luminosité autour de 0,65 : le film doit se reconnaître dans les bandes
  latérales, la feuille rester parfaitement lisible. Réglage à l'œil, sur les captures.
- Quand ne pas lancer la vidéo — une fonction pure, testée, dans `src/shell/media.ts` avec les
  trois URL (`/media/la-manchette-boucle-8s.mp4`, `/media/la-manchette-boucle-poster.jpg`,
  `/media/la-manchette-film-30s-leger.mp4`) :
  `filmBackdrop({ reducedMotion, saveData, width }) → 'video' | 'poster' | 'map'`.
  `saveData` ou une largeur sous 900 px → `'map'` (sur un téléphone la feuille couvre l'écran :
  3 Mo pour rien) ; sinon `reducedMotion` → `'poster'` (l'image fixe, aucune vidéo) ; sinon
  `'video'`. `saveData` vient de `navigator.connection?.saveData`, absent sur Safari et Firefox :
  absent vaut `false`.

## 3. Le film de 30 s

- Sous le formulaire de `/connexion` et près de l'en-tête de `/rejoindre/$code`, un lien discret :
  « voir le film d'annonce — 30 s » (`fr.ts`). Il ouvre une `<dialog>` native (ou la fenêtre
  modale du projet si elle existe déjà) avec `<video controls autoPlay>` sur le film léger, fermée
  par Échap et par un bouton `fr.common.close`. Le son part parce que le clic l'autorise.
- Sur `error`, la fenêtre dit une phrase (`fr.ts`, par exemple « Le film n'est pas disponible
  pour l'instant. ») au lieu d'un cadre noir. Même règle de largeur : sous 900 px le lien reste
  visible (c'est un choix du joueur, pas un fond qu'on lui impose).

## Ne pas faire

Pas de page d'accueil publique (plan-5c), aucune vidéo dans le dépôt ni dans `public/` hors du
`public/media/` ignoré, aucune dépendance, rien sur l'accueil, le salon ou le plateau, pas
d'image de partage (OG).

## Acceptation

- `npm run verifier` vert, dont le test de `filmBackdrop` (les trois issues et l'ordre des
  priorités).
- `docker compose -f docker-compose.yml -f deploiement/compose.prod.yml --profile prod config`
  valide, avec le volume.
- Captures dans `Claude outputs/marque/captures-film/`, fichiers copiés dans `public/media/` pour
  le test : `/connexion` et `/rejoindre/<un code>` à 1440 px (la boucle derrière, feuille lisible),
  `/connexion` sans `public/media/` (identique à aujourd'hui), `/connexion` à 390 px (fond carte,
  aucune requête vidéo dans l'onglet réseau), la fenêtre du film ouverte.
- `WWS/docs/marque/marque-et-site.md` (lot C) et `WWS/docs/marque/actifs.md` (« Qui charge ») à
  jour.
