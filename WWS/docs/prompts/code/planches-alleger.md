# Prompt Claude Code — alléger les planches et solder trois lignes mortes

Lis `WWS/sprites/README.md` §7. Ne commit pas, ne push pas.

**Prérequis : `echelles-a-plat.md` est passé.** Les quinze planches sortent à la même hauteur et
`echelles.json` n'existe plus. Sinon, arrête-toi.

Prompt court, trois points sans rapport entre eux sauf qu'ils traînent depuis la même session.

## 1. `HAUTEUR_REFERENCE` passe de 512 à 160 px

Tranché le 16/08, après mesure. Les planches s'affichent à **46 px de haut** (`.label-plate`,
`src/styles/labels.css`) et n'ont qu'un seul appelant, `buildingSprite()` dans
`src/routes/plateau.tsx`. À 512 px, le sur-échantillonnage est de ×11 pour **618 Ko** de WebP —
`listening` pèse 35 Ko pour s'afficher dans un carré de 46 px.

**160 px** couvre un écran 3× DPR avec une échelle HUD jusqu'à ~1,16, ou 2× DPR jusqu'à ~1,74.
Attendu : **autour de 60 Ko**, sur-échantillonnage ramené à ×3,5.

Régénère les quinze et **donne-moi le poids réel mesuré**, pas l'estimation. Si l'écart au chiffre
ci-dessus dépasse le double, dis-le plutôt que de l'absorber.

**Le choix n'est pas irréversible et n'a pas à être défendu comme tel :**
`WWS/sprites/buildings_clean/` garde les sources pleine résolution, et regénérer est une commande.
Écris-le en commentaire au-dessus de la constante — sinon quelqu'un hésitera à la rebouger.

Mets à jour le poids cité dans `WWS/sprites/README.md` §7.

## 2. Le docstring de `BUILDING_SPRITES` ment sur la teinte

`src/emblems/buildings/manifest.ts` dit encore « *neutral, tinted with the national ink at display
time* ». **Aucune teinte n'est appliquée aux bâtiments et aucune ne doit l'être** : `PlayerView` ne
sert jamais les bâtiments adverses, donc tout ce qui s'affiche appartient déjà au joueur qui
regarde — une teinte nationale ne distinguerait rien de rien. `WWS/sprites/README.md` §7 porte le
raisonnement complet.

Réécris le passage : les planches sont neutres **et le restent à l'affichage**, avec un renvoi au
README. Garde le reste du docstring, qui est exact.

## 3. `BUILDING_REFERENCE_HEIGHT` n'a plus d'appelant

Elle n'était citée que dans un commentaire CSS qui a été remplacé. **Supprime-la**, avec ce qui ne
sert plus qu'à elle. Si tu trouves un appelant que je n'ai pas vu, garde-la et dis-le-moi.

## Critères d'acceptation

- Les quinze WebP font 160 px de haut, et le poids total mesuré est reporté dans le README.
- Aucun docstring ne promet une teinte qui n'est pas appliquée.
- `BUILDING_REFERENCE_HEIGHT` a disparu, ou a un appelant nommé.
- `npm run build` et `npm run test` passent ; aucun terme banni.
- **Regarde la carte avant de conclure.** Le seul critère qui compte est qu'aucune planche ne soit
  visiblement plus floue qu'avant à l'écran.
