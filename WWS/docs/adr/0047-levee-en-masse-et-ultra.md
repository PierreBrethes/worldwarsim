# ADR 0047 — Deux atouts de plus : la Levée en masse (Chine) et Ultra (Royaume-Uni)

> **Précisée le 28/11/2026 (#726)** : §3, « la destination est celle du moment » se lit *du moment
> où la station entend*. Une flotte qui poursuit recourbe sa route sur place ; la cible qu'elle
> choisit hors d'écoute n'est pas servie, et l'observateur garde la dernière destination entendue.
> Un coude de la Doctrine du porte-avions, entendu, sert la nouvelle comme avant.

**Statut :** acceptée (26/11/2026). Pierre a rouvert l'ADR 0039 (« oui pour les atouts », 25/11),
jugé la première liste « un peu forte », puis validé les versions resserrées et l'ordre « deux
d'abord » (26/11). **Mondiale seule** (`assetOf` rend `null` en Blitz). Issue #649.

**Révise** l'ADR 0039 : §1 (quatre nations sans atout), « Ce qu'on abandonne » (Chine et
Royaume-Uni) et l'option écartée « Chine, levée en masse ». **Révise** la dernière ligne de
l'ADR 0027 §4 (« la saison test se joue sans atout national ») : la saison test, remise à plus
tard le 25/11, se jouera avec les atouts codés à sa date. **Ouvre** une troisième brèche au
brouillard, après le teneur de Lisbonne (P11) et la dépêche du Prêt-bail (ADR 0039 §3).

## Contexte

L'ADR 0039 a donné un atout à quatre nations et en a laissé quatre sans, faute d'une règle à
casser qui ne soit pas un nombre ou un chantier hors de proportion. Le 25/11, Pierre veut un jeu
« complet » avant toute saison test. Une première liste (France libre, Ultra, Mare Nostrum en
interception, Levée en masse) lui a paru trop forte : France libre donnait une seconde vie dans
une partie qui se gagne par les QG, et l'interception par une flotte posée fermait toute la mer.

Chaque atout a été resserré dans sa règle même (ADR 0039 §2 : on resserre une règle, jamais un
chiffre). On en code deux, les moins chers, et l'on juge les deux autres sur une série de bots.

## Décision

### 1. Six atouts

| Nation | Atout | Règle cassée |
|---|---|---|
| Chine | **Levée en masse** | « on forme dans le site de projection du domaine » (`WRONG_PROJECTION_BUILDING`) |
| Royaume-Uni | **Ultra** | « un relevé ne donne jamais la destination » (décision 4a du 13/09) |

S'ajoutent aux quatre de l'ADR 0039 dans la même table (`ASSET_BY_NATION`,
`src/domain/nation-assets.ts`), publics comme eux : le salon et la fiche de nation les disent. La
France et l'Italie restent sans atout et sans ligne, pas même « à venir ».

### 2. Levée en masse (Chine)

L'**infanterie MK1** chinoise se forme dans **tout bâtiment chinois debout** posé sur le **sol
national chinois**, en plus de la caserne : exploitation, entrepôt, centre de recherche, port,
aérodrome, QG. Prix et carte de recherche inchangés : ceux de l'infanterie MK1 à la caserne.

- **Les autres rôles et paliers** restent à leur site de projection, refusés comme aujourd'hui
  (`WRONG_PROJECTION_BUILDING`).
- **Hors du sol national**, et sur un **avant-poste**, rien ne change : un avant-poste n'est pas
  un bâtiment et n'a pas de file (l'objection de l'ADR 0039 ne s'applique plus).
- **La nation qui compte est celle du joueur qui tient le bâtiment.** Un Japonais qui capture une
  ferme du Sichuan n'y forme rien ; une Chine qui reprend son bâtiment y forme de nouveau.
- **La file** est celle du bâtiment, une par bâtiment (`recruitments`, indexé sur lui), avec la
  borne de lots de tout site (`MAX_QUEUED_BATCHES`). Un bâtiment qui n'est pas une caserne
  forme **sans le gain de niveau** de la caserne (ADR 0031) : sa durée est celle d'une caserne
  de niveau 1. La caserne garde son avantage, l'atout donne le nombre de lieux, pas la vitesse.
- **Désactivé** (sabotage, frappe, ADR 0046) ou **hors réseau**, un bâtiment forme ce qu'une
  caserne dans le même état formerait : la même lecture, aucune règle neuve.
- **Famine** : la file attend comme toutes les files (ADR 0044, inchangé).

Le frein est dans la règle : de l'infanterie de première ligne seulement, chez soi, aussi lente
qu'une caserne neuve. Ce qu'elle casse est la géographie du recrutement : on ne prive pas la
Chine de renforts en rasant ses casernes.

### 3. Ultra (Royaume-Uni)

Quand une **station d'écoute britannique** relève une **colonne qui porte au moins une coque**, le
relevé de l'observateur britannique **porte la destination** de la colonne : le point visé et le
nom du lieu, tels que la vue les sert pour une colonne à soi. Rien d'autre : ni type, ni pile, ni
nation, ni cargaison.

- **Colonne navale** : au moins une troupe du domaine mer dans la pile. Une colonne embarquée
  (des chars à bord d'un cargo) en est une : Ultra lit le plan d'un débarquement. Une colonne de
  terre ou d'air n'en est pas une, même relevée par une station.
- **La station seule.** Une vigie d'avant-poste, une ronde, une troupe ou le territoire relèvent
  comme avant, sans destination. Il suffit qu'**une** des fenêtres du relevé vienne d'une station
  britannique : le détecteur gardé sur la ligne (le premier) ne suffit pas à le dire.
- **La destination est celle du moment.** Un coude de la Doctrine du porte-avions (ADR 0039 §4)
  la change ; la réévaluation qu'il déclenche déjà sert la nouvelle.
- **Elle survit à la fenêtre** comme le reste du relevé (dernière position connue datée) : ce qui
  a été intercepté reste su. Elle n'est jamais servie à un autre joueur que l'observateur.
- **Station capturée** : elle écoute pour son nouveau teneur, qui n'est pas britannique ; Ultra
  suit la nation du teneur de la station, comme la Levée en masse.

C'est la **troisième brèche au brouillard**, bornée comme les deux autres : à un bâtiment qu'on
voit, qu'on frappe et qu'on rase, et à la mer. Le contre-jeu est de frapper les stations, ou de
passer hors de leur rayon. La « Maîtrise des mers » de la fiche 06 (tout entendre en mer, un
relevé sans segment) reste écartée.

### 4. Le socle ne change pas

La table, la vue et le salon de l'ADR 0039 §7 suffisent : deux clés de plus, deux textes de plus
dans `fr.nationAssets`. Chaque refus sort de la même fonction pure à l'écran et au serveur ; la
fiche de site d'un bâtiment chinois qui n'en avait pas offre l'infanterie MK1, et le dit.

## Conséquences

- Deux lots, la Chine puis le Royaume-Uni, sur une branche et une PR.
- Ultra touche la vue des relevés et la détection (invariant « Brouillard ») : son lot ajoute la
  trace « relevé par une station britannique » à la ligne du relevé (`v.optional`, lue avec un
  défaut), et le prouve par un test qui sert la destination au seul Britannique.
- La Levée en masse ouvre la fiche de site aux bâtiments chinois du sol national ; le contrat de
  vue dit quels bâtiments forment.
- Le rapport de saison compte l'usage des deux atouts comme des quatre autres (ADR 0039 §2).
- France (**Résistance** : sur le sol national français, un bâtiment capturé ne produit rien pour
  son capteur) et Italie (**Mare Nostrum** : une flotte italienne posée en mer intercepte les
  seules colonnes navales qui passent à sa portée, et sa cible la relève) attendent un jugement
  sur une série de bots, puis leur propre ADR.

## Ce qu'on abandonne

- **France libre** (le QG pris n'élimine pas tant qu'un avant-poste tient) : une seconde vie
  dans une partie qui se gagne par les QG.
- **Ultra sur toute colonne** : lire aussi les offensives terrestres et aériennes donnait au
  Royaume-Uni le renseignement de tout le plateau.
- **La Levée en masse à tout palier, ou sur les avant-postes** : la masse devient une armée
  entière, et les avant-postes demandent des files neuves.
- **Dunkerque**, **Decima MAS**, **Légion étrangère**, **Vit sur le pays** : rares en partie,
  frustrants, en doublon, ou presque jamais déclenchés (la Chine a des vivres en excédent).
