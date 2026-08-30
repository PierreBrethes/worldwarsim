# Prompt Claude Code — la popin lit, la carte agit (couche permanente 2/3)

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`. Maquette validée :
`WWS/docs/prompts/design/maquette-couche-permanente-2.md` planche 2b. Ne commit pas, ne push pas.

## La décision (Pierre, 30/08)

**La carte au clic droit = agir, la popin = lire.** Le cartouche Troupe (`TroopBadge.tsx`) ne
porte aucune action — c'était déjà sa règle du 29/08. Les ordres passent par la **rose des
vents existante** (`CompassRose.tsx`, `compassOf`), et le clic gauche sur une troupe ouvre
**les deux à la fois** : le cartouche en lecture, la rose en action. La fenêtre « visée armée »
en haut à gauche disparaît : le cartouche porte l'état.

## Ce qui change

- **Clic gauche sur un sprite de troupe** (`map/engine`, `WorldMap.tsx`) : ouvre le
  `TroopBadge` **et** la rose des vents de cette cible, posée sur le sprite, avec exactement
  les branches que `compassOf` donne déjà pour une force à soi (« Envoyer », « Fonder un
  avant-poste », « Voir le pays »…). Aucune branche nouvelle, aucun `compassOf` parallèle.
  Le clic droit sur le sprite ouvre la même rose ; le clic droit sur la région ouvre celle du
  bâti — **deux cibles, jamais un menu mixte** : si aujourd'hui le clic droit sur un point
  mélange les deux, sépare-les par ce qui est sous le curseur.
- **Choisir « Envoyer »** : la rose se ferme, le cartouche reste et passe en visée — sous-titre
  « choisissez la destination », pied « échap — désarme » ; hors visée, le pied dit
  « clic droit — ordres ». Curseur en croix, destinations légales au survol : ce qui existe.
- **La fenêtre « visée armée »** (`plateau.tsx` ~1143-1148, `fr.aim.armed/column/gesture/disarm`)
  est supprimée. Ce qu'elle disait d'unique — le nombre de troupes de la pile — se lit sur le
  cartouche (« pile de 3 » en sous-titre quand la pile en compte plusieurs).
- `GarrisonPanel` (composer une pile sur un point à plusieurs troupes) ne change pas : il
  reste à un clic sur un point qui porte plusieurs troupes.

## Vérifications

`npm run verifier`. À la main : clic gauche sur une troupe → cartouche + rose ; « Envoyer » →
rose fermée, cartouche en visée, plus rien en haut à gauche ; échap → cartouche au repos ;
clic droit sur la région sous la troupe → rose du bâti, sans branche d'ordre ; clic droit sur
le sprite → rose de la troupe, sans « Bâtir ici ».
