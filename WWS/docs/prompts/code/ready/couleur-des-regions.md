# Prompt Claude Code — les régions prennent la couleur de qui les tient

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`,
`WWS/docs/adr/0020-domination-par-couleur.md`,
`WWS/docs/adr/0015-economie-v2-ressources-localisees.md`, et `convex/regions.ts` en entier.
Ne commit pas, ne push pas. Un seul commit, préparé mais pas créé.

## Pourquoi

L'ADR 0004 justifiait le modèle des avant-postes en promettant « la course au territoire, les
fronts qui avancent et **la carte qui se colore** ». Le point a été codé, la couleur jamais — et
la carte ne dit toujours rien de qui tient quoi.

Ce prompt livre **la couleur, et rien d'autre** : pas de score, pas de production reliée, pas de
brume, pas de décoloration à la désactivation, **pas encore la péremption du relevé** (ADR 0020 §5,
prompt suivant). Le barème de points viendra plus tard, sur cette couche.

## La règle, en une phrase

Une région est **tenue** par un joueur si son point (`region-index.json`, `regionFacts`) tombe dans
`OUTPOST_REACH_KM` (400) d'un de ses avant-postes, **ou** si elle appartient au pays de sa nation
d'origine (`ADM0_BY_NATION`, `NATION_BY_COUNTRY`).

Aucune nouvelle constante : le rayon de contrôle **est** le rayon de construction (ADR 0020 §1) —
là où je peux bâtir est là où je tiens. Ne pas en introduire un second.

## Ce qui change

**Domaine — `src/domain/control.ts`, TS pur et testé.**
Une fonction pure qui prend la liste des avant-postes (propriétaire + point), la liste des nations
en jeu, et le catalogue des régions, et rend qui tient quoi. Aucune importation React ni Convex.
- Une région tenue par personne n'apparaît pas.
- **Le litige se tranche par la distance** : si deux joueurs couvrent la même région, elle revient
  au plus proche avant-poste ; à égalité exacte, personne ne la tient (une règle sans départage
  arbitraire vaut mieux qu'un `sort` implicite).
- Le sol national l'emporte toujours sur un avant-poste étranger : une nation n'est jamais annexée
  (ADR 0004).
- Tests : région dans le rayon, hors du rayon, litige, égalité, sol national sous un avant-poste
  adverse, liste d'avant-postes vide.

**Serveur — une query dédiée, jamais un champ de `PlayerView`.**
`PlayerView` est déjà invalidé par toute troupe (risque connu) ; la couleur ne bouge, elle, qu'à la
fondation ou à la perte d'un avant-poste. Écris une query séparée — `convex/control.ts`,
`control.held` — réactive sur la seule table des avant-postes et sur les joueurs de la saison.

⚠️ **La signature est « ce que ce joueur connaît », dès maintenant** : la query prend le jeton du
joueur et rend *sa* lecture de la carte. Dans ce commit elle rend la vérité entière — c'est
délibérément une étape, destinée à valider le rendu et le coût avant d'ajouter le filtre. Le
prompt suivant (`memoire-de-la-carte.md`) branche la connaissance et la péremption
(ADR 0020 §5) **sans changer la forme de l'API ni le client**. Ne code donc pas une query
« publique » : elle serait à démonter.
- Cloisonnée par saison, comme le reste.
- Rend une structure compacte : par joueur, la liste des identifiants de région tenus. 4 589
  régions existent ; ne renvoie jamais la carte entière, seulement ce qui est tenu.
- Ne stocke rien. La couleur se calcule à l'instant depuis les avant-postes, jamais dénormalisée —
  même contrat que la capacité dans `victory.ts`, et pour la même raison : un état stocké se
  désynchronise le jour où un avant-poste est détruit.

**Couleur par joueur.** Il n'y en a pas aujourd'hui. Attribue-la **par siège, à l'entrée dans la
saison**, stable pour toute la partie, dans une palette écrite une fois — pas une teinte dérivée
de la nation (deux nations peuvent se ressembler, et une nation change de mains d'une saison à
l'autre). La palette doit tenir dans la direction artistique 1940 (`WWS/docs/design/10-direction-artistique.md`) :
des encres, pas des couleurs saturées d'écran, et huit teintes distinctes à la découpe.

**Carte — `src/map/engine/`.**
Les régions sont déjà dessinées au rapproché (< 65 unités) avec surbrillance teintée par type de
terrain. Réutilise ce chemin : la teinte de possession **remplace** la teinte de terrain sur une
région tenue, elle ne s'y ajoute pas.
⚠️ **La couleur doit se lire de loin, les frontières non.** Décision de Pierre (31/08) : au-delà
du seuil de rapproché, **les traits de région disparaissent mais la teinte de possession reste** —
on voit qui tient quoi sans voir le découpage. En deçà du seuil, les frontières intérieures
apparaissent, et c'est ce qui signale au joueur qu'une région devient survolable. La teinte de
possession remplace alors la teinte de terrain, elle ne s'y ajoute pas.
Le moteur reste impératif et n'importe pas React (`WorldMap.tsx` est la seule frontière).

**Rien dans `src/i18n/fr.ts`** hormis, si nécessaire, une légende. Aucun libellé de score.

## Ce que ce prompt ne fait pas

Le score et son barème · la production reliée (ADR 0020 §6) · la décoloration d'un avant-poste
désactivé (§7) · la brume (§5) · les portées et les postures (ADR 0021) · le pillage.

## Vérifications

`npm run verifier`. Tests du domaine ci-dessus. À la main : fonder une partie à deux → poser un
avant-poste → les régions autour prennent la couleur du joueur → le pays d'origine est coloré dès
le lancement → un second joueur pose un avant-poste à portée du premier, la région litigieuse va au
plus proche → dézoomer : la couleur reste lisible.

**Mesure à rapporter dans le commit** : le temps de calcul de `control.held` avec huit joueurs et
une vingtaine d'avant-postes, et la taille de la réponse. Si l'un des deux dérape, dis-le plutôt
que de l'optimiser au jugé.
