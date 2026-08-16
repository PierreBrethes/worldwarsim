# Prompt Claude Code — le bandeau à huit ressources, ordonné par la chaîne

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, la fiche
[10 — Direction artistique](../../design/10-direction-artistique.md) et la proposition
[clic-batiment-et-surfaces.md](../../design/propositions/clic-batiment-et-surfaces.md).
Ne commit pas, ne push pas.

**Prérequis : `fenetre-industrie.md` est passé.** Le bandeau alerte, la fenêtre détaille : l'état
des chaînes est calculé là-bas et lu ici. Sans lui, tu recalculerais un état en double. Sinon,
arrête-toi.

## Deux soldes à passer d'abord, courts

**Une frontière, pas deux.** `src/routes/-plateau/NationWindow.tsx` est le seul fichier de `src/`
qui importe `convex/constants`, et par un chemin relatif nu (`'../../../convex/constants'`) là où
tout le reste passe par `@/`. L'incohérence est dans le même bloc : `buildingCap` et `slots.total`
viennent de `PlayerView`, `chainSpeed` / `TIER_2_HQ_LEVEL` / `MAX_HQ_LEVEL` d'un import direct —
cinq faits sur le QG, deux sources. **Sers les trois dans `PlayerView`** et supprime l'import.
`constants.ts` dit de lui-même être « the one place to correct when the simulator takes over » :
il le suppose lu par personne d'autre.

**L'extrapolation du stock doit être monotone.** `useClock` compare un `Date.now()` client à un
`loadedAt` produit par le serveur : un décalage de pendule se lit comme du temps écoulé. Le double
plancher l'absorbe aujourd'hui, mais c'est une marge, pas une correction. **Ancre le delta sur
`performance.now()`** — horloge locale et monotone — plutôt que sur `Date.now()`. L'écart disparaît
au lieu d'être toléré. Ne change aucun affichage au passage.

## Ce qui change

`src/shell/NationBanner.tsx` n'affiche que trois ressources sur huit, avec un commentaire qui
l'assume : « *Three of the eight, because the banner cannot hold eight* ». La place existe
désormais.

**Les huit à plat seraient un tableur** — huit nombres de même poids, et le joueur doit connaître
les chaînes par cœur pour les relier. Le bandeau doit **dessiner l'économie**, pas l'énumérer :

```
minerais · charbon  →  alliage  →  munitions      tissus  →  bandages      nourriture · pétrole
```

Trois groupes séparés par du blanc, dans cet ordre : la chaîne métallurgique, la chaîne sanitaire,
puis les deux ressources qui n'alimentent rien. **L'ordre est la seule pédagogie du bandeau** — il
enseigne les chaînes sans une ligne de texte.

Dérive-le de `CHAINS` (`convex/constants.ts`), ne le code pas en dur : une chaîne ajoutée doit
réordonner le bandeau toute seule. Les ressources qui n'apparaissent dans aucune chaîne ferment la
marche.

## La flèche est le signal

Entre deux maillons, une flèche. **Une flèche barrée en rouge signale une chaîne à sec** — le même
diagnostic que la fenêtre Industrie, en un glyphe, sans rien ouvrir.

Trois états, ceux qu'Industrie calcule déjà (`fenetre-industrie.md`, section 1). **Lis-les, ne les
recalcule pas** : deux boucles qui font le même arbitrage sont deux chances de diverger.

| état | flèche |
|---|---|
| tourne | trait plein, encre discrète |
| **à sec** | **barrée, `--critical`** |
| débordée | trait plein, atténué |

Le survol de la flèche nomme la ressource qui manque. C'est la même formulation que dans Industrie,
au mot près.

## Les icônes

`ResourceIcon` (`src/emblems/ResourceIcon.tsx`) porte déjà les huit silhouettes vectorielles, en
`currentColor`, avec `resourceColor` pour l'encre. **Elles restent le jeu du bandeau** : à 13 px un
aplat vectoriel bat une planche illustrée, dont la texture se détruit à cette taille.

**Le charbon a besoin d'un liseré.** Mesuré : la planche du charbon tombe à **2,80 de contraste**
sur `--desk` (`#0f0a04`), sous le plancher de 3:1 admis pour un pictogramme, avec 33 % de pixels
quasi noirs. Le geste existe déjà dans le projet — `.label-plate` porte
`drop-shadow(0 0 1.2px var(--paper))`, une réserve de papier autour de la vignette. Applique le même
principe aux icônes du bandeau : il détache le contour du fond de nuit. **Applique-le aux huit**,
pas au seul charbon : une exception par ressource est une exception à maintenir.

## Ce qui ne change pas

- **Le compteur reste icône + chiffre.** Le débit se lit une fois par partie, il attend le survol.
  Le commentaire du composant `Counter` porte déjà cette décision, garde-la.
- **Un stock à zéro s'estompe** (`resource-depleted`), il ne disparaît pas et ne s'alarme pas.
- **Le journal garde sa place et son poids** : le bandeau répond d'abord « quoi de neuf ». Un titre,
  pas une énumération.
- Le cartouche de nation ne bouge pas.

## Le débordement

Huit compteurs, deux séparateurs de groupe et deux flèches tiennent sur un écran large et **pas sur
un écran étroit**. Le commentaire actuel du bandeau prévient : le remède est le **retrait**, jamais
un défilement horizontal.

Décide un ordre de sacrifice et **écris-le en commentaire** : sous une largeur donnée, les chiffres
s'effacent avant les icônes, et les groupes qui ne sont pas à sec s'effacent avant ceux qui le sont.
Un bandeau étroit doit garder ce qui alerte.

## Critères d'acceptation

- Les huit ressources apparaissent, groupées par chaîne, dans l'ordre dérivé de `CHAINS`.
- Une chaîne à sec barre sa flèche ; le survol nomme la ressource manquante, avec la même
  formulation qu'Industrie.
- L'état des chaînes n'est **calculé qu'une fois** dans tout le projet, et le bandeau le lit.
- Les huit icônes portent la réserve de papier ; le charbon se détache du fond de nuit.
- Un stock à zéro reste visible, estompé.
- À 1024 px de large, le bandeau ne défile pas horizontalement et ne déborde pas.
- Aucun fichier de `src/` n'importe `convex/constants`.
- L'extrapolation du stock ne dépend plus de l'horloge murale du client.
- Aucune chaîne française en dur hors de `src/i18n/fr.ts`.
- `npm run build` et `npm run test` passent ; aucun terme banni.

## Ce que tu ne fais pas

Tu ne remplaces pas `ResourceIcon` par les planches illustrées de `WWS/sprites/ressources/` : les
deux jeux coexistent, le vectoriel tient le bandeau, l'illustré tiendra les grandes surfaces. Tu ne
touches ni à la fiche Nation, ni à la fenêtre Industrie. Tu n'ajoutes aucun réglage d'affichage.
