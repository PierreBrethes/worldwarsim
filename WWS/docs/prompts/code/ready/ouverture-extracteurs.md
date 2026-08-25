# Prompt Claude Code — l'ouverture : fondation d'extracteurs, gisement japonais, infanterie de départ

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0017 (format de saison et socle
placé) et `WWS/simulation/opening/` (le simulateur d'ouverture). Ne commit pas, ne push pas.

Décisions de Pierre (25/08) : la fondation offerte devient **les extracteurs — tous ceux que
le pays permet** ; le Japon reçoit un gisement de minerai ; chaque joueur démarre avec une
infanterie. Trois changements d'ouverture, un seul prompt, une seule passe de simulation à la
fin.

## 1 — La fondation, calculée depuis les gisements du pays

`SEASON_FORMATS[].foundation` cesse d'être une liste figée : la fondation d'un joueur se
calcule depuis les gisements de **son territoire national** — un extracteur dû par gisement
de ressource sèche présent (une `mine` par ressource minière présente : une pour le fer, une
pour le charbon ; une `farm` si nourriture ; un `mill` si tissu) et un `oilWell` **si et
seulement si** le pays a un gisement de pétrole. `foundry`, `warehouse` et `arsenal` sortent
de la fondation : ils se paient. `foundationOwed` change donc de signature (elle a besoin de
la nation) — remonte chaque site d'appel, y compris l'ordre de mobilisation côté client, qui
doit lister exactement ces clés-là.

Garde le mécanisme « une clé tenue debout consomme une dette » tel quel. Les formats gardent
chacun leur kit et leurs niveaux : seule la *liste due* devient nationale.

## 2 — Le gisement japonais

`public/deposits.json` : le Japon n'a **aucun** gisement de minerai (vérifié : 2 food,
4 textile, 3 coal, 0 ore, 0 oil) — sans pillage codé, la nation est injouable. Ajoute **un**
gisement `ore` sur une région du nord-est de Honshū (Kamaishi, préfecture d'Iwate — la vraie
mine de fer historique du Japon ; retrouve l'identifiant de région dans `public/regions.json`
/ `region-index.json`, même format de clé `JPN-<n>` que le fichier). Un seul : l'asymétrie de
la carte reste la règle (le commentaire de `constants.ts` sur « the asymmetry comes from the
map » fait foi), on corrige l'injouable, pas l'inégal. Le Japon reste sans pétrole — c'est sa
mèche, elle est voulue. Vérifie qu'après l'ajout, **chaque nation jouable** a au moins un
gisement de chacune des quatre ressources sèches (fer, charbon, tissu, nourriture) — c'est le
critère, le Japon n'est que le cas connu.

## 3 — L'infanterie de départ

Dans la dotation partagée du lancement (la fonction extraite par `rejoindre-en-guerre.md` —
ce prompt passe **après** lui) : chaque joueur doté reçoit **une infanterie**, stationnée à
son quartier général. Conséquence assumée par Pierre, à écrire en commentaire à l'endroit du
don : cette troupe compte dans le nominal de la règle « réduit = < 50 % du nominal » — un
joueur qui n'a que son infanterie offerte et la perd devient réduit, donc scalpable. Un test
grave la dotation (une infanterie, stationnée au QG, présente pour un retardataire aussi).

## 4 — La simulation avant de jouer

L'ouverture mesurée (paliers 1-4 un par journée) a été chiffrée avec l'ancienne fondation.
Relance `WWS/simulation/opening/run.mjs` (formats × profils) avec la nouvelle donne et
**rapporte les chiffres dans ta réponse** — sans les retoucher : si un palier déraille
(fonderie payante qui retarde l'alliage, par exemple), c'est un constat à remonter à Pierre,
pas un réglage à faire en douce. Le garde-fou du simulateur doit rester vert.

## Vérifications

Tests sur : fondation calculée par nation (France = mine fer, mine charbon, ferme, filature,
pas de puits ; USA = les mêmes + puits ; Japon post-gisement = mine, mine, ferme, filature) ;
`verify.mjs` exit 0 ; `npm run verifier` complet.
