# Prompt Claude Code — la pile dit ses places, la visée dit son milieu

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, la note
`WWS/docs/design/propositions/transport-terrestre-et-allure.md` (§ « À bord : un état calculé »),
puis `src/domain/movement-orders.ts` (`LIFT_CAPACITY`, `LIFT_COST`, `routeModeOf`), le panneau de
garnison et le widget de troupes (`src/routes/-plateau/`), et `MovementPreview.tsx`.
Ne commit pas, ne push pas. **Un seul sujet : ce que le joueur voit en composant une pile.**
Aucune règle ne change.

## Le défaut

Le pied de pile dit « 2 troupes · 1 slot ». Le joueur compose à l'aveugle : il ne voit ni combien
de places ses transports offrent, ni combien sa pile en demande, ni si la route qu'il s'apprête à
payer passe par la mer. Le premier retour de jeu réel l'a dit en une phrase : « combien de troupes
est capable d'embarquer un transport terrestre ? ça serait bien de mieux le voir ».

## Ce que tu codes

### 1. Le compteur de places

Dès que la pile cochée contient au moins un transport, le pied de pile gagne
**« places : x/y »** — x le coût en places des troupes non-transport (`LIFT_COST`), y la somme des
capacités (`LIFT_CAPACITY`). Rouge quand x > y, avec le même libellé que le refus
`NOT_ENOUGH_LIFT` servira : le joueur voit le refus **avant** de viser, jamais après.

Lis les deux tables telles qu'elles sont — n'invente pas de capacité pour le transport terrestre :
tant qu'il n'en a pas, une pile qui n'a que lui n'affiche pas de compteur. Le jour où l'allure lui
en donnera une (note de design, prompt suivant), l'affichage suivra sans une ligne.

### 2. L'indentation « à bord »

Dans le panneau de garnison et dans la liste de la pile, les troupes embarquées s'affichent
**indentées sous leur transport** — affectation **calculée**, gloutonne, dans l'ordre de la liste.

**Et le geste existe, comme sucre de composition** (arbitrage du 19/08, § « À bord » de la note) :
glisser une troupe sur un transport la coche et l'indente sous lui ; glisser sur un transport
plein est refusé visuellement — le geste dit que les places sont pleines, avec le même compte que
le compteur. Le geste est **purement client** : il produit exactement l'état que la coche produit,
rien ne part au serveur, aucune relation stockée — et la coche reste l'autre porte du même état
(un seul état, deux portes, comme le flux l'exige déjà). L'indentation suit le placement du geste
quand il y en a eu un, l'affectation gloutonne sinon. Décocher le transport rend ses passagers à
leur niveau, geste ou pas.

### 3. Le milieu du trajet dans l'aperçu

L'aperçu de visée montre déjà la route réelle ; il dit maintenant son **milieu** — terre, mer,
combiné, air — lisible d'un coup d'œil à côté de la durée. Les tronçons existent
(`ComputedRoute.legs`), c'est une lecture, pas un calcul. Vocabulaire : le mot du code est
`Milieu`/`medium` (fiche 04) — à l'écran, « par terre », « par mer », « terre et mer », « par
air », via `fr.ts`.

### 4. Le clic ouvre le panneau

Cliquer une troupe ou un transport dans la carte « stationnaires » du widget ouvre le panneau de
garnison avec la troupe pré-cochée — c'est déjà le flux prévu par `flux-mouvement-en-carte.md`
(« un seul état de sélection, deux portes ») ; vérifie qu'il marche aussi pour une troupe posée
sur un point et pour une garnison d'avant-poste, pas seulement pour un bâtiment.

## Critères d'acceptation

- Une pile « 2 infanteries + 1 cargo » affiche « places : 2/6 » ; « 7 infanteries + 1 cargo »
  affiche « places : 7/6 » en alerte, et le message dit combien il manque.
- L'indentation suit la coche : décocher le cargo rend les infanteries à leur niveau.
- Glisser une infanterie sur un cargo plein est refusé visuellement, et l'état reste identique à
  ce que la coche aurait produit — un test d'égalité entre les deux portes, pas deux logiques.
- L'aperçu d'un trajet Calais → Kent dit « terre et mer » ; Marne → Ruhr dit « par terre ».
- Aucun texte hors de `src/i18n/fr.ts`. Aucun terme banni. `npm run build` et `npm run test`
  passent.
- **Regarde l'écran.** Ce prompt est né d'un défaut que 515 tests ne voyaient pas : lance
  l'application, compose les deux piles des critères, et dis ce que tu as vu — une capture vaut
  mieux qu'une assertion.

## Ce que tu ne fais pas

Tu n'ajoutes aucune capacité au transport terrestre, aucune allure, aucune règle — le prompt de
l'allure suit la validation de la note. Tu ne stockes aucune relation « à bord de ».
