# rester-en-mer — une colonne embarquée peut viser la mer et y rester (révision de la 72a)

Lis `CLAUDE.md` (l. ~216, la 72a), `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0019 §1, §2 et sa
« Révision du 04/09 — les navires ne roulent pas » (**c'est ce qui change**), l'ADR 0012 (même
bannière du 04/09), l'ADR 0014 (« en mer, on voit le navire, pas la cargaison — le leurre y
gagne »), l'ADR 0024 §1 (un camp posé se relève par son milieu), `src/domain/movement-orders.ts`
(`destinationRefusal`, `routeModeOf`, `afloat`, `coastal`, `embarking`), `src/domain/troops.ts`
(« being aboard is a computed state », `StackRow.carrier`, `LIFT_CAPACITY`), `convex/movement/
arrival.ts` (la pose à l'arrivée, une seule adresse), `convex/movement/orders.ts` (`originOf`,
le départ d'une coque depuis un point de mer), `convex/combat.ts` et `src/domain/combat.ts`
(déroute, destruction), `convex/movement/cargo-return.ts` (le retour d'une coque),
`convex/resources.ts` (`UPKEEP_UNSUPPLIED_MULTIPLIER`), `src/map/WorldMap.tsx` (deux
`console.log('[banc] …')` l. 219 et 266, à retirer). Ne commit pas, ne push pas. Un chantier,
un commit.

> **Décision de Pierre, 18/09 — révise la 72a du 04/09, à signaler dans l'ADR 0019 et l'ADR
> 0012** : « un cargo peut rester en mer avec des unités dedans ». Une colonne embarquée
> (terre + mer) peut viser **un point de mer** ; elle y reste, passagers à bord. Le débarquement
> reste une opération à part : viser une côte, depuis la mer comme depuis la terre. L'intérieur
> des terres reste refusé à une colonne embarquée (la jambe terrestre après la mer n'existe
> toujours pas).

## La règle

1. **Viser la mer.** `destinationRefusal` : pour `mode === 'combined'`, un `point` avec
   `!onLand` est **légal** ; une côte l'est (inchangé) ; tout le reste refuse
   `LANDING_NEEDS_A_COAST` (inchangé pour l'intérieur des terres). La table de la rose et le
   serveur lisent la même fonction — rien d'autre à toucher pour la visée.
2. **Arriver en mer.** À l'arrivée, coques et passagers sont posés **au même point de mer**
   (§1, une seule adresse) ; les passagers sont « à bord » par calcul, comme aujourd'hui
   (`StackRow.carrier`) — aucun champ nouveau, aucune migration. `afloat` vaut vrai pour la
   pile. La garnison de la pile en mer se lit au panneau comme à terre.
3. **Repartir de la mer.** Une pile en mer part par sa coque (§2 : une coque part d'un point
   en mer) : vers une côte (débarquement, la jambe terrestre est nulle) ou vers un autre point
   de mer. Une pile en mer **sans coque** ne part pas (`NO_HULL_AT_SEA`, phrase de refus).
4. **Coulés avec la coque** (nouveau). Après toute passe de résolution à un point de mer, les
   troupes terrestres posées là que la capacité d'emport (`LIFT_CAPACITY`) des coques *debout
   et non déroutées* ne couvre plus sont **détruites** — pas déroutées : il n'y a rien où se
   replier. Une coque déroutée emporte ses passagers dans son repli, à sa capacité, dans l'ordre
   canonique des rôles ; l'excédent coule. Dépêche `drownedAtSea` au propriétaire (nombre
   d'hommes et de machines, le point). C'est le prix de rester en mer, et la raison d'une
   escorte.
5. **Vivre en mer.** Pas de ravitaillement en mer : l'entretien joue à
   `UPKEEP_UNSUPPLIED_MULTIPLIER` (vérifie que c'est déjà le cas pour une pile `afloat`, sinon
   c'est la règle). Fonder, bâtir, entrer en garnison d'un bâtiment : refusés en mer avec une
   phrase, jamais un silence (`foundHere` : « on ne fonde pas en mer »).
6. **Ce qu'on voit.** Un camp en mer se relève par son milieu (ADR 0024 §1) : silhouette de
   coque, jamais la cargaison. Un cargo vide et un cargo plein sont indiscernables du dehors —
   c'est le gain de leurre nommé à l'ADR 0014, et il devient réel avec ce lot : écris-le dans
   la révision de l'ADR 0019.

## Ce qui change

- `movement-orders.ts` : `destinationRefusal` (règle 1), `NO_HULL_AT_SEA` (règle 3) ;
  `fr.errors` pour les deux phrases.
- `convex/movement/arrival.ts` : pose d'une colonne combinée à un point de mer (règle 2) ;
  vérifie que la garnison, le relevé et la vue n'ont pas de branche qui suppose « terre » pour
  une pile qui compte de l'infanterie.
- `convex/movement/orders.ts` : départ d'une pile combinée depuis un point de mer (règle 3).
- `convex/combat.ts` (après la passe) : règle 4, une fonction pure `drownedOf(posted,
  survivorsAtSea, lift)` dans `src/domain/` testée seule ; `cargo-return.ts` : les passagers
  suivent la coque déroutée.
- `WorldMap.tsx` : les deux `console.log('[banc]')` partent.
- Docs : ADR 0019 (bannière « Révision du 18/09 — rester en mer », le paragraphe du 04/09
  réécrit), ADR 0012 (même bannière), `CLAUDE.md` l. 216, `CONTEXT.md` (colonne embarquée),
  fiche `?` (« une pile en mer vit sur sa coque ; coque coulée, passagers coulés »).

## Cas d'acceptation (tests d'abord)

1. Cargo + infanterie, cible plein mer → `march` accepté (la table de `destinationRefusal`
   mise à jour : plein mer ✅, côte ✅, intérieur ✗) ; cargo seul et infanterie seule
   inchangés.
2. Arrivée en mer : coque et infanterie posées au même point, `afloat`, l'infanterie à bord
   par calcul ; le panneau de garnison les lit.
3. Départ depuis la mer vers une côte : route navale puis pose sur la plage ; vers un autre
   point de mer : route navale ; sans coque : `NO_HULL_AT_SEA`.
4. Passe en mer : une escorte adverse détruit le cargo → l'infanterie à bord est détruite,
   dépêche `drownedAtSea` ; le cargo déroute → l'infanterie suit à sa capacité, l'excédent
   coule ; deux cargos dont un coulé → seuls les passagers au-delà de la capacité restante
   coulent.
5. Entretien : une pile en mer paie le facteur non ravitaillé.
6. Fonder / bâtir / entrer en garnison depuis la mer : refus avec phrase.
7. Relevé d'un camp en mer par un adversaire : milieu `sea`, jamais la composition ; identique
   pour un cargo vide et un cargo chargé.
8. Vérifieur vert ; `a-mesurer.md` inchangé.

## Hors périmètre

Le combat air–mer, l'abordage, le sauvetage des naufragés. Le ravitaillement en mer par un
port ami à portée (une question pour plus tard, note-la dans `QUESTIONS.md` 🟡).
