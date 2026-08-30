# Prompt Claude Code — brancher l'Allemagne au manifeste des sprites

Lis `CLAUDE.md`, `CONVENTIONS.md`. Ne commit pas, ne push pas. Même travail que
`brancher-urss-au-manifeste.md` — si les deux se font ensemble, un seul passage suffit.

Les assets sont en place : `src/emblems/units/germany/` porte 10 webp (sources dans
`WWS/sprites/units_germany_clean/` + `noms.json`). Le porte-avions **existe** (Graf Zeppelin).
**C'est `airTransport` qui manque** : le Ju 52 généré portait un flou de mouvement cuit dans
l'image, inutilisable — il sera régénéré.

Dans `src/emblems/units/manifest.ts` : bloc `GERMANY: NationSprites` sur le modèle d'`UK`,
dix rôles depuis `./germany/*.webp`, `airTransport: null` (le cas « no visual yet » du type).
Branche `germany` dans `SPRITES_BY_NATION`. Même vérification que pour l'URSS : un rôle `null`
ne doit casser ni le widget Troupes, ni Production, ni `movementSprite`.

`npm run verifier`, dont `manifest.test.ts`. À la main : partie en Allemagne, recruter,
regarder le widget Troupes.
