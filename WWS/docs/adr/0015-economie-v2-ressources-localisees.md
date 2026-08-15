# ADR 0015 — Économie v2 : ressources localisées et filières courtes

**Statut :** acceptée — **critère de distribution renforcé le 15/08/2026** (voir plus bas)

> ⚠️ **Révision (15/08/2026) : « un manque volontaire, jamais deux » ne suffit pas — il est
> **complété**, pas remplacé.** Le critère mesure une **présence**, jamais une quantité ni une
> forme. Deux passes de génération l'ont montré coup sur coup — d'abord un écart de 3,2× entre
> la nation la mieux dotée et la moins bien, puis, une fois l'écart ramené dans une bande, un
> aplatissement complet : sept nations sur huit au plafond en nourriture, et hors pétrole un
> écart résiduel de 1,33×. Trois garde-fous s'y ajoutent, décrits à la fin de ce document, et
> la règle du manque unique devient **exceptionnable sur déclaration**. Le reste de l'ADR est
> inchangé.

## Contexte

La fiche 02 (ravitaillement / acier / effectifs) a été écrite quand les régions ne
portaient rien. Depuis, l'ADR 0013 a posé la projection sur les régions, l'ADR 0014 a
donné aux bandages un consommateur sans leur donner de producteur, et le blocage le plus
visible du dépôt reste entier : l'acier ne vient de nulle part, la file de production
d'une saison réelle reste vide (`convex/units.test.ts` grave le constat). La
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
   `convex/constants.ts`, jamais tenus pour justes — même contrat que l'ADR 0011.
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

## Révision du 15/08 — les trois garde-fous de la distribution

Le point 4 des questions tranchées ci-dessus posait « un manque volontaire, jamais deux ».
La règle **reste** — elle protège la promesse anti-élimination : une nation qui démarre avec
deux dépendances dures peut être étranglée avant d'avoir joué. Mais elle ne suffit pas, parce
qu'elle ne regarde ni **combien** ni **quelle forme**. Trois garde-fous s'y ajoutent, tous
portés par l'audit de `scripts/generate-deposits.mjs`, qui fait échouer le script :

1. **La bande** — sur les huit nations jouables, `total max ≤ 2 × total min`. Une nation
   n'est jamais annexée (ADR 0004) : un gisement à domicile est définitivement acquis, donc
   un écart de départ est un écart permanent.
2. **Aucun profil plat** — chaque nation déclare au moins un excédent et un manque, chacun
   sourcé historiquement. C'est ce qui empêche la bande d'être obtenue en saturant tout le
   monde aux plafonds.
3. **Aucune nation au plafond partout** — corollaire du précédent, vérifié séparément parce
   que c'est exactement la façon dont la deuxième passe a triché sans le vouloir.

### Les exceptions se déclarent, elles ne se contournent pas

Deux nations sortent du cadre, et chacune le dit dans son profil plutôt que de le subir en
silence :

- **`noGap`** — les États-Unis n'ont aucun manque. Rien dans nos cinq ressources ne manquait
  aux États-Unis de 1940 ; en fabriquer un serait la seule ligne malhonnête de la table.
- **`secondGap`** — une nation peut manquer d'une **seconde** ressource si son atout répond
  précisément à ce manque. Le Japon en est le seul cas : ni pétrole ni minerais, et un
  porte-avions dont toute la raison d'être est d'aller les chercher. C'est le Japon
  historique, celui qui entre en guerre *parce qu'il n'a rien*.

Une exception non déclarée reste un échec du script. Une exception déclarée est **imprimée
dans l'audit** avec sa justification : on la voit à chaque exécution, elle ne se perd pas
dans un commentaire. C'est la différence entre une règle qu'on assouplit et une règle qu'on
contourne.

**Ce que le critère précédent avait raté, et qui compte** : le manque doit porter sur ce qui
*définit* une nation, pas sur un peu de tout. Le Royaume-Uni sans nourriture, c'est l'île
qui importe son pain, ses convois et sa Maîtrise des mers — le manque, l'atout et l'histoire
disent la même chose. C'est le modèle ; la platitude en est le contraire exact.

**Le pétrole reste le manque de six nations sur huit, et ce n'est pas un défaut.** Il devient
le motif universel de sortir de chez soi, et chaque nation a sa façon d'aller le chercher —
le porte-avions japonais, la Guerre éclair allemande, le rayon impérial français, Mare
Nostrum italien. Ne pas « varier les manques » pour la variété : ce serait casser la colonne
vertébrale du système d'expansion.

## Un principe qui sort de là : l'isolement se paie en rareté

Le Japon est à demi coupé du monde et sa géologie est misérable : les deux se compensent, et
sa pauvreté est ce qui rend crédible qu'il doive sortir. C'est la forme que devrait prendre
la réponse au 🔴 — richesse et accessibilité vont en sens inverse.

Les États-Unis sont l'exception qui reste ouverte : les plus inatteignables **et** les mieux
dotés. On ne la corrige pas ici, parce que l'histoire refuse de payer — les États-Unis de
1940 ne manquaient de rien qui figure dans nos cinq ressources ; leurs vraies pénuries
étaient le caoutchouc, l'étain et le chrome, qui n'existent pas dans ce jeu. Inventer un
manque américain serait de la fiction au service d'un tableau.

La distribution des gisements **borne** donc le déséquilibre américain sans le supprimer.
La question reste ouverte dans [QUESTIONS.md](../../QUESTIONS.md) et c'est au simulateur
refondu de chiffrer ce que l'exception coûte.

## Ce qu'on abandonne

- Ravitaillement, acier et effectifs comme ressources.
- La chaîne électricité (charbon → élec → bâtiments n'offrait aucun choix).
- Le complexe industriel, le centre logistique, la conscription et le centre de
  recherche comme bâtiments propres — dissous dans la fonderie, les bâtiments de
  projection, les casernements et le QG.
- La file de production nationale unique (ADR 0011, portée révisée).
- Le stock d'effectifs et son taux horaire.
