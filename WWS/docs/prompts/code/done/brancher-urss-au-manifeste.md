# Prompt Claude Code — brancher l'URSS au manifeste des sprites

Lis `CLAUDE.md`, `CONVENTIONS.md`. Ne commit pas, ne push pas.

Les assets sont déjà en place : `src/emblems/units/ussr/` porte 10 webp optimisés
(`optimiser.py --serrer`, sources dans `WWS/sprites/units_ussr_clean/` avec leur `noms.json`).
**Le porte-avions manque au lot** — c'est voulu pour l'instant.

Dans `src/emblems/units/manifest.ts`, ajoute le bloc `USSR: NationSprites` sur le modèle
d'`UK` : les dix rôles depuis `./ussr/*.webp`, et `carrier: null` — c'est exactement le cas
que le type documente (« this role has no visual yet »), aucun contournement. Branche `ussr`
dans `SPRITES_BY_NATION`.

Vérifie ce que fait l'UI d'un `carrier: null` (widget Troupes, `ProductionWindow`,
`movementSprite`) : si un écran suppose l'URL présente, corrige l'affichage (silhouette
absente, pas de crash), sans toucher aux autres nations.

`npm run verifier`, dont `manifest.test.ts`. À la main : partie en URSS, recruter, regarder le
widget Troupes et un mouvement sur la carte.
