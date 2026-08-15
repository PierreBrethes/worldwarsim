# Prompt Claude Code — profils nationaux de gisements

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, puis
`WWS/docs/adr/0015-economie-v2-ressources-localisees.md`. Ne commit pas, ne push pas.

Troisième passe sur `scripts/generate-deposits.mjs`. Tu ne touches à rien d'autre.

## Le problème

La passe de rééquilibrage a tenu la bande de 2× — et l'a payée en aplatissant les profils.
Sept nations sur huit sont à exactement 4 en nourriture, c'est-à-dire au plafond par pays.
**Hors pétrole, l'écart entre nations tombe à 1,33×.** Toute l'asymétrie géographique qui
reste, c'est « as-tu du pétrole ». Le plafond unique par ressource a acheté l'équité en
dépensant la variété.

Une seule nation échappe à la platitude, et par accident : le Royaume-Uni, à 2 en
nourriture. Ce n'est pas un manque de *un peu de tout*, c'est le manque **de ce qui le
définit** — l'île qui importe son pain, ses convois, sa Maîtrise des mers. C'est le modèle
à généraliser.

## Le principe

**La bande reste sur les totaux, la variance revient sur la composition.** Chaque nation
garde un total dans la bande ; c'est sa *forme* qui diffère. Un excédent nommé et un manque
nommé par nation, chacun historiquement sourcé et cohérent avec son atout.

## Travail

1. **Le plafond par pays devient un profil par nation.** Remplace le plafond unique par un
   `Record` de plafonds par ressource, une ligne par nation jouable de `NATIONS`
   (`src/domain/ids.ts`). Chaque écart au profil moyen porte en commentaire **sa source
   historique**, pas une justification d'équilibrage.

   | nation | excédent | manque |
   |---|---|---|
   | `france` | minerais — le bassin de fer lorrain | pétrole |
   | `uk` | charbon — Galles, Midlands, Yorkshire | nourriture *(déjà en place)* |
   | `usa` | pétrole | — *(aucun : c'est le 🔴, et c'est assumé)* |
   | `ussr` | nourriture et minerais — terres noires, Oural | tissus |
   | `germany` | charbon — Ruhr, Silésie, Sarre | minerais — d'où le fer suédois |
   | `japan` | tissus — la soie, premier exportateur mondial | minerais **et** nourriture |
   | `italy` | minerais — Sardaigne, Elbe | charbon — d'où la dépendance allemande |
   | `china` | nourriture | minerais et charbon |

2. **Le Japon est la correction la plus rentable**, et la plus importante à réussir. Il est
   aujourd'hui à 4/3/2/0/1, un profil générique. Historiquement c'est la nation qui a
   déclenché une guerre *parce qu'elle n'avait rien* : ni fer, ni pétrole, du riz importé de
   Corée. Vise 2 en nourriture, 0 en minerais, et compense par 4 en tissus et 3 en charbon
   (Kyūshū, Hokkaidō) — total 9, dans la bande, et une nation qui doit sortir ou mourir.
   C'est ce que promettent déjà son porte-avions et ses Rikusentai.

3. **Les garde-fous.** Garde la bande de 2× sur les totaux. Ajoute-lui deux compagnons :
   - **aucune nation ne peut être au plafond sur toutes ses ressources** — c'est ce qui a
     produit la platitude actuelle ;
   - **chaque nation a au moins un excédent et un manque déclarés**, et le script échoue si
     un profil est plat.

   Le garde-fou d'hier surveillait la quantité ; ceux-ci surveillent la **forme**. Imprime
   l'audit avec une colonne `profil` résumant excédent et manque, et prouve-moi une fois que
   chacun mord.

4. **Ne touche pas au pétrole.** Aucune des six nations qui en manquent n'en gagne. C'est le
   seul motif universel de sortir de chez soi, et il tient tout le système d'expansion.

## Une tension à ne pas masquer

Ce travail donne au Japon une pauvreté qui paie sa demi-insularité. C'est la bonne forme :
**l'isolement se paie en rareté.** Or les États-Unis sont à la fois les plus inatteignables
et les plus riches — l'inverse exact. On ne le corrige pas ici, parce que l'histoire refuse
de payer : les États-Unis de 1940 ne manquaient de rien qui figure dans nos cinq ressources.
Signale-le dans ta sortie, ne le bricole pas. C'est au simulateur de dire ce que ça coûte.

## Critères d'acceptation

- Deux exécutions consécutives : md5 identique sur `public/deposits.json`.
- La bande de 2× sur les totaux tient toujours.
- Hors pétrole, l'écart entre nations est **nettement supérieur à 1,33×** — c'est la mesure
  du succès de cette passe.
- Aucune des six nations sans pétrole n'en a gagné.
- Aucun profil plat ; aucune nation au plafond partout.
- Chaque écart de profil porte une source historique en commentaire.
- Aucun terme banni dans le code ni les commentaires.
