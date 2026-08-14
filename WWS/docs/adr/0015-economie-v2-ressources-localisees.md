# ADR 0015 — Économie v2 : ressources localisées et filières courtes

**Statut :** acceptée

## Contexte

La fiche 02 (ravitaillement / acier / effectifs) a été écrite quand les régions ne
portaient rien. Depuis, l'ADR 0013 a posé la projection sur les régions, l'ADR 0014 a
donné aux bandages un consommateur sans leur donner de producteur, et le blocage le plus
visible du dépôt reste entier : l'acier ne vient de nulle part, la file de production
d'une saison réelle reste vide (`convex/unites.test.ts` grave le constat). La
proposition [économie v2](../design/propositions/economie-v2.md) (session du 14/08) a
été retenue ; elle laissait quatre questions ouvertes, tranchées ici.

## Décision

**Les huit ressources.** Cinq ressources de carte — nourriture, tissus, charbon,
pétrole, minerais — existent en **gisements par région**, à exploiter. Trois
transformées — alliage (minerais + charbon), munitions (alliage), bandages (tissus) —
une étape de filière, jamais deux. Chaque ressource pèse sur un état de l'armée :
exister (nourriture), se battre (munitions), se remettre (bandages), se déplacer
(pétrole, motorisés seuls), produire (charbon). Les types régionaux — vin, blé, soie —
sont décoratifs : le stock ne connaît que les huit types réels. **Les hommes ne sont pas
une ressource** : une unité coûte des matières ; l'armée a un plafond d'hommes porté par
les casernements.

**Le parc de quatorze bâtiments**, tel que la proposition le fixe : QG (unique, chez
soi, porte les slots et la recherche) ; ferme, filature, mine (charbon *ou* minerais
selon le gisement), puits de pétrole ; fonderie, arsenal, intendance ; caserne,
aérodrome, port ; station d'écoute ; casernements ; entrepôt (se pille) et dépôt
(explose).

**Tout bâtiment se pose sur une région.** L'ADR 0013 avait laissé l'économie au niveau
de la nation ; cette portée est révisée : l'économie descend aussi. Un bâtiment
d'exploitation exige le gisement correspondant dans sa région ; l'écran de construction
est contextuel — rien de grisé, jamais.

**La production est localisée.** Le bâtiment qui ouvre un domaine fabrique ses unités :
la file de recrutement devient **une file séquentielle par bâtiment de projection** —
révision de la file nationale unique de l'ADR 0011, dont la datation paresseuse (seule
la tête porte un `finitLe`) reste la règle, par file.

**Placement et expansion.** Chez soi, pose libre. Ailleurs, un avant-poste — fondé
uniquement par de l'infanterie mk1 ou mk2 — ouvre un rayon de quelques régions où bâtir.

**Les quatre questions ouvertes, tranchées par défaut :**

1. **Les taux** (débits, coûts, entretien) sont des placeholders dans
   `convex/constantes.ts`, jamais tenus pour justes — même contrat que l'ADR 0011.
2. **Les stocks sont plafonnés bas** sans entrepôt : l'entrepôt devient vite nécessaire,
   donc vite une cible.
3. **L'acheminement est automatique** : une exploitation verse au stock national. Les
   convois interceptables restent une extension possible, non gravée — on ne paie pas
   leur complexité avant d'avoir mesuré le besoin.
4. **Les gisements suivent une distribution réaliste corrigée** : données réelles
   d'abord (bassins houillers, champs pétroliers, terres arables), correction manuelle
   ensuite pour que chaque nation jouable ait **un manque volontaire, jamais deux**.
   Générée hors ligne, cuite en asset statique, jamais retouchée à la main.

## Justification

**Chaque ressource crée une décision différente** — c'est le critère qui a coupé
l'électricité et fondu quatre bâtiments. Le duo pétrole / charbon est le pivot voulu :
bombarder les stocks de pétrole cloue les blindés au sol, une cible qui raconte.

**Les gisements donnent enfin un contenu au territoire.** L'ADR 0013 a fait des régions
des emplacements ; les gisements en font des enjeux — où s'étendre, quoi défendre, quoi
raider — et redessinent le 🔴 isolement en termes mesurables.

**La production localisée est ciblable.** Une caserne détruite arrête ce qu'elle
formait. C'est la règle 2 du projet appliquée à l'économie : ce qui produit se voit, ce
qui se voit s'attaque.

## Conséquences

- **Le schéma de jeu est à refondre**, conjointement avec l'ADR 0014 : ressources à
  huit clés, bâtiments localisés, troupes discrètes, files par bâtiment de projection.
  Prompt dédié dans `docs/prompts/code/`.
- **Deux pouvoirs de nation sont à reformuler** (fiche 06) : États-Unis (« ravitaillement
  → acier » n'existe plus) et Chine (« entretien croissant en ravitaillement » devient
  nourriture). À retoucher sans changer la règle brisée.
- **La fiche 02 est remplacée** par la proposition promue ; le rapport de simulation,
  déjà invalidé par 0013 et 0014, l'est une fois de plus.
- **Le bandeau ne peut pas montrer huit stocks.** L'affichage devra hiérarchiser
  (question UI ouverte, à trancher avec la surface 4.5).
- **Huit icônes de ressources** remplacent les trois existantes — doctrine de la
  maquette « Icônes ressources » : silhouettes SVG pleines, distinctes à la découpe.

## Ce qu'on abandonne

- Ravitaillement, acier et effectifs comme ressources.
- La chaîne électricité (charbon → élec → bâtiments n'offrait aucun choix).
- Le complexe industriel, le centre logistique, la conscription et le centre de
  recherche comme bâtiments propres — dissous dans la fonderie, les bâtiments de
  projection, les casernements et le QG.
- La file de production nationale unique (ADR 0011, portée révisée).
- Le stock d'effectifs et son taux horaire.
