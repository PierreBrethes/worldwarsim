# Annexe au contrat 02 — Jeu de données réel pour la maquette Économie

**Règle : ce fichier est la SEULE source de texte et de chiffres de la maquette.** Chaînes
verbatim de `src/i18n/fr.ts`, chiffres calculés depuis `convex/constants.ts`, gisements réels
de `public/deposits.json`, régions réelles de `public/region-index.json` (pour la France :
des **départements**). Ce qui manque se demande, ne s'écrit pas.

## Scénario

France, quartier général **niveau 1** — le même début de partie que l'annexe caserne, un cran
plus tôt dans la fondation. Debout : QG ; **fondation posée** : Mine (Meurthe-et-Moselle,
minerais) et Mine (Moselle, charbon) ; **hors fondation** : Caserne (Ardennes), Baraquements
(Meuse). **Fondation restant due : Ferme, Filature.** Gisements français réels : minerais ×3
(Meurthe-et-Moselle, Calvados, Maine-et-Loire), charbon ×2 (Moselle, Pas-de-Calais),
nourriture ×3 (Jura, Marne, Eure-et-Loir), tissus ×2 (Aisne, Ain), **pétrole : aucun**.
Armée : 3 troupes, toutes ravitaillées. Aucun avant-poste.

Stocks (uniquement collés à un coût, « x / y ») : alliage `320`, charbon `20`, nourriture
`114`, tissus `40`, minerais `20`, pétrole `40`, munitions `80`, bandages `0` — plafonds
`400` partout (aucun entrepôt ni dépôt).

## En-tête et chantier

- En-tête : « `économie` » · « `France — saison 1` » ; le chapeau : « `Tout ce qui se pose et
  tout ce qui coule. Aucun stock chiffré ici : les réserves sont au panneau haut-droit — cette
  fenêtre dit quelle entrée manque, jamais combien il en reste.` »
- « `chantier en cours` » : `Mine` · `en Meurthe-et-Moselle` · « `54 min restant` »
  (élévation vers le niveau 2 — pas de barre de progression, le restant est tout ce qui est su).
- « `en file — 1 chantier` » · « `payé d'avance` » : « `2ᵉ` » · `Baraquements` ·
  `en Meuse` · « `niveau 2` » · bouton « `annuler` » (infobulle « `annuler et rembourser
  intégralement` »). **Jamais de compte à rebours sur la file.**
- Variante sans chantier : « `Aucun chantier. La file est illimitée et se paie à la mise en
  file — un seul chantier avance à la fois.` »

## La filière (le graphe) — colonne par colonne

Légende : « `bâti` / `en chantier` / `en file` / `manquant` ». Un maillon manquant porte sa
condition **en clair** ; rôles des boîtes : « `gisement` », « `extracteur` »,
« `conversion` », « `sortie` », « `entrée` ».

| Colonne | Gisement | Extracteur | Conversion | Sortie |
|---|---|---|---|---|
| nourriture | « `3 gisements sur votre territoire` » | `Ferme` manquante — « `pose de fondation offerte` » | — | « `ne produit rien` » |
| tissus | « `2 gisements sur votre territoire` » | `Filature` manquante — « `pose de fondation offerte` » | — | « `ne produit rien` » |
| minerais | « `3 gisements sur votre territoire` » | `Mine` bâtie — « `9 / h` » | — | « `9 / h` » |
| charbon | « `2 gisements sur votre territoire` » | `Mine` bâtie — « `10 / h` » | — | « `10 / h` » |
| pétrole | « `gisement — aucun` » + « `aucun gisement de pétrole — ce qui manque se prend ailleurs` » | `Puits de pétrole` manquant — « `demande une région à gisement de pétrole` » | — | « `ne produit rien` » |
| alliage | minerais + charbon (les deux boîtes gisement ci-dessus) | `Mine` bâtie | `Fonderie` manquante — « `plus un emplacement libre sur vos sites — élevez le quartier général ou un avant-poste` » | « `ne produit rien` » |
| munitions | — | — | entrée « `alliage` · `de fonderie` » ; `Arsenal` manquant — « `demande un quartier général niveau 2` » | « `ne produit rien` » |
| bandages | tissus | `Filature` manquante | `Intendance` manquante — « `plus un emplacement libre sur vos sites — élevez le quartier général ou un avant-poste` » | « `ne produit rien` » |

Note : la boîte `Mine` du graphe affiche le **niveau sommé** des deux mines (niveau 2) mais le
débit de **sa colonne** (9 / h côté minerais, 10 / h côté charbon). L'élévation en cours ne
change pas son état : un maillon debout dont le niveau suivant se bâtit reste « bâti ».

## États de chaîne (tampons — pour la planche d'états)

**Un état de chaîne n'existe que sur les trois conversions** (`chains[].state` : fonderie,
arsenal, intendance) — jamais sur une colonne brute : minerais, charbon, nourriture, tissus
et pétrole n'ont **aucun tampon**, leur débit dit tout. Les cinq états, montrés sur de
vraies chaînes : « `éteinte` » → alliage (fonderie absente) ; « `en attente d'ordre` » →
munitions (arsenal au repos) ; « `tourne` » → alliage (fonderie en marche) ;
« `à sec — alliage` » (`starvedOn`) → munitions ; « `débordée` » → bandages. Encres : `off`
discret, `idle` discret (**pas** une panne), `running` valide, `starved` critique,
`overflowing` notable.

**Gisement vs entrée** : les intrants bruts d'une conversion sont des boîtes **gisement**
avec leur compte (colonne alliage : minerais « 3 gisements… » + charbon « 2 gisements… » ;
colonne bandages : tissus « 2 gisements… »). « `entrée` » est réservé au seul intrant
produit par une autre filière : l'alliage de l'arsenal (« `de fonderie` »).

## Le lot de l'arsenal (planche « milieu de partie », arsenal bâti niveau 1)

- En-tête : « `Arsenal — se commande` ». Nominal 3 / h par niveau.
- Au repos, **deux états exclusifs** — jamais les deux sur une carte : réserve > 0 →
  « `Le alliage reste disponible pour les bâtiments et les troupes.` » + bouton
  « `commander un lot` » ; réserve vide → « `lot impossible : aucun alliage en réserve` » +
  « `Le goulot nommé : bâtissez une fonderie, elle seule fait de l'alliage.` », **sans
  bouton**.
- Dimensionnement (curseur) : lecture en quatre cases « `coûte` / `durée` / `fin` / `couvre la
  nuit` », et le bouton de validation est « `lancer le lot` » (jamais « commander un lot »,
  qui est le bouton d'ouverture) — ex. lot de `40` munitions : « `40 alliage` », « `13 h 20` », fin (heure locale),
  « `oui, et au-delà` » ; « `max 320 — le stock d'alliage` » (1 alliage par munition, réserve 320) ; « `Une fois, exactement cette
  quantité. La chaîne s'arrête ensuite.` »
- En cours : jauge + « `12 sur 40 munitions` » · « `reste 9 h 20` » · « `fin …` » + bouton
  « `annuler le lot` » et la note : « `L'annulation ne rembourse rien parce que rien n'a été
  pris d'avance : la matière est consommée au fil des heures. Ce qui n'est pas converti reste
  en réserve.` »
- Livré : « `lot terminé` » · « `40 munitions livrées` » · « `Arsenal se tait et rend
  l'alliage au reste de la nation.` »

## Entretien (sous « les sites de la filière »)

- « `3 troupes en service` » · « `− 3 nourriture / h` »
- « `toutes ravitaillées — sol national ou rayon d'un avant-poste` » · « `solde − 3
  nourriture / h` » (extraction nourriture 0, l'armée mange 3 — le solde est négatif et c'est
  la tension voulue du scénario : la ferme de fondation attend d'être posée).
- Pas de ligne avant-postes (aucun tenu). Variante affamée : « `À sec : les files de
  recrutement sont à l'arrêt. Rien n'est perdu, aucune troupe ne meurt — elles repartent dès
  que la nourriture revient.` »
- Variante hors ravitaillement : « `dont 1 hors ravitaillement — entretien ×2` »

## Emplacements et quartier général

- Budget « `sol national` » : « `2 emplacements sur 2` » · barre pleine (rouge) · « `plus un
  emplacement libre` » · remède : « `un QG niveau 2 les porte à 4` ». **La fondation ne
  compte pas** dans les 2 pris (caserne + baraquements).
- QG : « `niveau 1 sur 5` » ; « `ce qu'il porte` » : « `2 slots de mouvement` » ·
  « `2 emplacements sur le sol national` » · « `chaînes de production ×1.00` » (`toFixed(2)`, point décimal) · « `palier 2 en
  production au niveau 2` ».
- Élévation du QG (exemple de retenue par la matière) : coût « `alliage 108 / 320` » +
  « `charbon 72 / 20` », « `1 h 21` », bouton « `améliorer` » retenu — « `il faut 72 de
  charbon (20 disponibles)` » puis l'échéance « `disponible dans 5 h 12` » (la mine de
  Moselle en fait 10 / h).
- Autres élévations chiffrées : Mine → 2 : `alliage 54 / 320`, `54 min` ; Caserne → 2 :
  `alliage 72 / 320` + `nourriture 54 / 114`, `1 h 12` ; Baraquements → 2 (en file) : ligne
  retenue « `un chantier vise déjà cette région — annulez-le ou attendez son tour` ».
- Recensement : une ligne par instance (vignette, nom, « `en <département>` », « `niveau n` »,
  effet, élévation). Les effets existent (`fr.buildingEffects`) : Mine — « `exploite un
  gisement de charbon ou de minerais, selon la région` » ; Caserne — « `ouvre le domaine
  terrestre et forme l'infanterie et les véhicules` » ; Baraquements — « `relève le nombre de
  troupes que l'armée peut aligner` » ; QG — « `unique et chez soi — plafonne les autres,
  porte les slots de mouvement et la recherche` » ; clé absente : la ligne dit sa condition (mêmes
  phrases que le graphe). « `plafonné par le QG` » : aucun cas dans ce scénario (tout est au
  niveau 1) — le tampon existe, ne pas l'inventer ici.

## Chaînes les plus longues (la maquette doit les tenir)

Le chapeau d'en-tête · « `Aucun chantier. La file est illimitée…` » · la condition
« `plus un emplacement libre sur vos sites — élevez le quartier général ou un avant-poste` » ·
la note d'annulation du lot · la variante affamée · « `quartier général au maximum — le sol
national ne s'élargira plus` » (état au niveau 5).

## Observateur (planche 4)

Le bloc « élever le quartier général » disparaît **entier** — coûts et retenue compris, pas
seulement le bouton (décision du 31/08, codée : `UpgradeControl` rend null pour un défait).
Idem pour la colonne d'élévation des lignes de recensement. Partent aussi : « annuler » sur
la file, « commander un lot ». La lecture reste entière.

## Interdits (rappel du contrat 02)

Aucun stock nu (le bandeau les porte ; ici un stock n'existe que collé à un coût) · aucune
date sur la file · aucune barre de progression de chantier · pas de tampon « production
reliée » chiffré (ADR 0020 §6, pas codé — réserver la place au plus) · aucun tampon d'état
sur une colonne brute (l'état de chaîne n'existe que sur les trois conversions) · toute
chaîne ou tout chiffre absent de ce fichier. Intitulés de grille tolérés (« débit réel »,
« gisement », « extracteur »…) : ⚠ clés fr à créer au branchement.
