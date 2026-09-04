# retours-japon-lot-1 — ordre du rail et bandes de l'abaque

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, puis `WWS/CONTEXT.md` pour le vocabulaire
imposé. Ne commit pas, ne push pas.

Premier lot des retours de la partie de test de Pierre (Japon, 04/09). Deux retouches
client pures, aucun changement de domaine ni de `convex/`.

## 1. Le rail se réordonne (`src/shell/SurfaceRail.tsx`)

Ordre cible, de haut en bas :

- groupe du haut : **nation · écon. · abaque**, puis les bascules de bord (`EdgeToggles`)
  comme aujourd'hui ;
- groupe du bas : **télég.** juste au-dessus de **réglages**, puis le cartouche de saison.

Le télégraphe garde tout ce qu'il a : titre avec compte de non-lus, carré d'encre critique,
même gabarit de 46 px que les autres surfaces (pas le 34 px des réglages — c'est une surface,
pas un réglage). Le tableau `surfaces` reste la seule liste des surfaces : sors-en le télégraphe
vers le groupe du bas plutôt que de dupliquer son rendu — un petit composant `SurfaceLink`
partagé par les deux groupes si c'est le moyen le plus court. Le commentaire « le rail ne
montre que ce qui marche » reste où il est.

Rien ne change dans `plateau.tsx` : `WINDOWS`, les deep-links et la pile de fenêtres sont
intacts.

## 2. Les bandes de l'abaque se renomment (`src/i18n/fr.ts`, `fr.gunnery.bands`)

| clé | avant | après |
|---|---|---|
| `strong` | contre franc | **fort contre** |
| `even` | échange | échange |
| `weak` | frappe faible | **faible contre** |
| `none` | hors de portée | hors de portée |

Décision de Pierre (04/09) : « contre franc » et « frappe faible » ne se lisaient pas ; « fort
contre / faible contre » se lit depuis la ligne (la pièce est forte contre cette cible). Les
seuils `STRONG_SHARE` / `WEAK_SHARE` et `bandOf` ne bougent pas — c'est un libellé, pas un
combat. Mets à jour la ligne 27 du contrat `WWS/docs/design/contrats-de-vue/06-abaque-catalogue.md`
(et l'annexe si elle cite les bandes) pour que le contrat dise ce que l'écran dit.

## Cas d'acceptation

1. Étant donné le plateau ouvert, le rail lit de haut en bas : nation, écon., abaque, [bascules],
   … télég., réglages, S.n — et chaque entrée ouvre / ferme toujours sa fenêtre (toggle).
2. Étant donné 3 messages non lus au télégraphe, le carré « 3 » s'affiche sur l'entrée du bas,
   et son titre au survol le dit.
3. Étant donné l'abaque ouvert, la légende lit « fort contre · échange · faible contre · hors de
   portée » ; le survol d'une case dit toujours « X sur Y — 0,65 de l'effectif nominal par passe ».
4. `grep -rn "contre franc\|frappe faible" src WWS/docs/design/contrats-de-vue` ne rend rien.

`npm run verifier` vert. Un commit, dont le message décrit les deux retouches.
