# zone-hors-service-hachuree — la zone d'un avant-poste désactivé se lit, elle ne s'efface pas

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0020 §5 et **§7**, l'ADR 0005,
`src/map/engine/regions.ts` (le délavage `surveyWash`), `convex/control.ts` et `convex/view.ts`
(l. 615-625, `disabledUntil` servi en minutes). Ne commit pas, ne push pas. Indépendant des
autres lots. Un chantier, un commit. **Rendu seulement : aucune règle ne change.**

## La demande (Pierre, 15/09, en répondant 3a)

Quand un avant-poste est désactivé, sa zone **disparaît** de la carte (§7 : « décolore »). Pierre
veut qu'elle reste lisible : hachurée, ou rayée de blanc, la couleur en pâle — plus « pleine »,
mais encore là — avec un avertissement clair : hors service, pendant encore tant de temps. Une
UI/UX soignée.

## Ce que ça ne change pas — dit explicitement

**L'ADR 0020 §7 tient.** Un point désactivé ne *tient* pas ses régions : elles ne comptent pas
au classement, ce qui y produit est coupé (§6), une région disputée revient au voisin. La
hachure n'est pas une couleur : c'est **le souvenir d'une couleur et une promesse de retour**,
et elle ne doit tromper ni le joueur ni le classement. Si le rendu laisse croire que la région
est encore à lui, il ment.

**Pour le propriétaire seulement.** Un adversaire voit son **dernier relevé** (§5) : s'il
observe la zone à l'instant, il la voit décolorée comme aujourd'hui. Lui dessiner une hachure
« temporaire jusqu'à HH:MM » lui donnerait la durée restante d'un raid qu'il n'a pas forcément
fait — une information de plus que la couleur ne porte pas (ADR 0005). Celui qui a raidé le
sait déjà par son compte rendu.

## Ce qu'il faut

- **`control.held`** sert, pour le joueur lui-même, une troisième forme à côté de « tenu » et
  « rien » : `{ kind: 'suspended', until }` sur les régions qu'un de **ses** points désactivés
  tiendrait s'il était debout — calculée par la même fonction (`heldRegions` avec le point
  lu comme debout, puis différence), jamais une seconde règle. Pour les autres joueurs, rien
  ne change.
- **Rendu** (`regions.ts`) : hachure diagonale dans l'encre du siège, opacité au plancher du
  délavage (`FADED_WASH`), sur fond papier — lisible comme « suspendu », distinct d'un relevé
  ancien (qui est plein et délavé) et d'une région tenue (pleine et franche). Le motif se fait
  en shader ou en texture répétée, jamais en géométrie par région (4 589 régions). Au dézoom,
  la hachure tient à toute distance comme la couleur (§1, « une couleur qui est le score doit se
  lire à toute distance »).
- **Le mât de l'avant-poste** porte déjà le cachet « désactivé » (`GarrisonPanel`) : y ajouter
  le **temps restant** en clair (« hors service — encore 4 h 12 »), au survol de la zone
  hachurée aussi (même `HoverCard` que la date d'un relevé : « suspendu jusqu'à 17 h 40 »).
- **Bandeau / « à faire maintenant »** : rien de nouveau — les dépêches `productionCut` et
  `productionRestored` existent, et une ligne « attendre » n'est pas une action.
- **Fin de désactivation** : la hachure redevient pleine sans rechargement (la vue se
  réinvalide au règlement de `disabledUntil`).

## Cas d'acceptation

1. Mon avant-poste désactivé : ses régions sont hachurées dans mon encre, avec au survol
   « suspendu jusqu'à HH:MM » ; le mât dit le temps restant.
2. Le classement et `heldRegions` ne les comptent pas ; un bâtiment dessus reste « hors
   réseau » — inchangé.
3. Un adversaire qui observe la zone à l'instant la voit décolorée, sans hachure ni date.
4. Une région disputée revenue au voisin pendant la désactivation est dans **sa** couleur
   pleine pour lui, hachurée pour moi — les deux à la fois, sans conflit de rendu (l'hachure
   passe sous la couleur pleine).
5. À la fin de la désactivation, retour à la couleur pleine sans rechargement.
6. Captures : zoom monde, pays, région — la hachure se lit aux trois.
7. Vérifieur vert.
