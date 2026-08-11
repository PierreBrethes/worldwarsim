# WorldWarSim — Design v0.2

Document de travail. Tout ce qui est chiffré est un **placeholder à simuler**, pas une décision.
Ce qui compte ici, c'est la structure : qui décide quoi, et pourquoi c'est difficile.

> **v0.2** — révision après audit adversarial. Les corrections majeures sont signalées par ⚠️.
> Le journal des changements est en §12.

---

## 0. Le principe directeur

> Le jeu n'est pas « faire une grosse armée ». Le jeu est **projeter de la force sur une planète
> où l'information est chère et où tout engagement est irréversible pendant N minutes**.

Trois conséquences suivies partout :

- Les bonus **cassent une règle**, ils ne modifient pas un pourcentage.
- Ce qui est joli à l'écran (les arcs) est une **ressource qu'on achète**, pas une décoration.
- Un joueur écrasé reste **nuisible**, jamais éliminé.

---

## 1. Format de saison

| Paramètre | Valeur | Note |
|---|---|---|
| Durée | 48 h (test) / 7 j (vraie saison) | wipe complet à la fin |
| Joueurs | 2 à 8 | noté `n` dans tout le document |
| Région jouable | fonction de `n` | 2-3 → Europe · 4-6 → Europe + Méditerranée + Moyen-Orient · 7-8 → monde |
| Compensation géographique | curseur `0.0 → 1.0`, fixé à la création | 0 = géographie brute, 1 = isolés fortement compensés |
| Graine de saison | aléatoire | ⚠️ détermine la richesse des pays (§4.1) |

Un seul jeu, des paramètres de saison. Pas de modes séparés : deux modes = deux problèmes
d'équilibrage sur lesquels on n'a aucune donnée.

---

## 2. Ressources

Trois ressources, délibérément acquises de trois manières différentes. C'est la structure
d'acquisition qui crée les décisions, pas leur nombre.

| Ressource | Source | Propriété clé |
|---|---|---|
| **Ravitaillement** | pays d'origine + commerce PNJ | Flux sûr. La ressource du joueur prudent. |
| **Acier** | avant-postes d'extraction uniquement | **Contestée.** On ne peut pas en avoir sans sortir de chez soi. |
| **Effectifs** | pays d'origine seul, régénération lente, plafond dur | **Ni achetable, ni convertible.** Une seule exception : le Revanchisme (§7). |

Les effectifs sont le pivot du design. Tant qu'une ressource se rachète, perdre une bataille n'est
qu'un contretemps comptable. Un plafond dur rend chaque engagement réellement coûteux — et rend
l'attaque une décision, pas une routine.

**Accumulation paresseuse** : on stocke `lastUpdate` et `rate`, on calcule à la lecture.

---

## 3. Bâtiments (pays d'origine)

Cinq, chacun alimentant explicitement une doctrine ou l'information. Coût exponentiel.

| Bâtiment | Effet |
|---|---|
| **Quartier général** | débloque les paliers, relève les plafonds de stockage |
| **Complexe industriel** | vitesse et rendement de conversion acier → unités |
| **Centre logistique** | réduit le temps de trajet, **et fixe le nombre de slots de mouvement simultanés** ⚠️ |
| **Conscription** | régénération et plafond des effectifs |
| **Station d'écoute** | rayon de révélation passif autour du territoire et des avant-postes |

⚠️ **Les slots de mouvement sont la ressource la plus rare du jeu** (`1 + niveau du centre
logistique`). Tout part de là : attaquer, ravitailler, feinter et espionner consomment le même
stock. C'est ce qui empêche le spam et ce qui rend chaque envoi arbitrable.

---

## 4. Le socle : avant-postes, brouillard, espionnage

### 4.1 Avant-postes

Un avant-poste est un **point** (`lon`, `lat`, propriétaire, niveau, spécialisation) posé sur un pays
neutre. Jamais un polygone. Couche territoriale contestée sans toucher au découpage administratif.

**Une seule spécialisation, choisie à la construction, irréversible :**

- **Relais logistique** — les convois passant dans son rayon accélèrent.
- **Extraction** — produit de l'acier, à un débit fonction de la richesse du pays hôte.
- **Écoute** — révèle les arcs ennemis passant dans son rayon.

⚠️ **Corrections après audit :**

- **On peut stationner des troupes sur n'importe quelle spécialisation**, pas seulement les relais.
  Sinon un avant-poste d'extraction est indéfendable par construction, et l'Hégémonie devient une
  doctrine que n'importe qui annule avec un raid à deux sous.
- **La richesse des pays est tirée par la graine de saison**, pas codée en dur. Si le Golfe est
  toujours le Golfe, la liste des trois meilleures cases est connue avant le début, la première
  heure décide des 47 suivantes, et toutes les saisons se ressemblent.
- **Rendement décroissant par joueur sur un même pays hôte** : le 3ᵉ avant-poste rapporte nettement
  moins que le 1ᵉʳ. Force l'étalement, donc l'exposition.
- Un raid **désactive** temporairement et laisse une **fenêtre d'immunité** après coup. Un avant-poste
  ne change jamais de propriétaire ; il peut être **détruit** après plusieurs raids, ce qui libère
  l'emplacement pour quelqu'un d'autre.

### 4.2 Le brouillard, et pourquoi c'est le cœur

**Par défaut, tu ne vois que tes propres arcs.** Les mouvements ennemis ne sont visibles que dans le
rayon de détection de ton territoire, de ta station d'écoute et de tes avant-postes d'écoute.

C'est la décision la plus importante du document. Elle transforme d'un coup :

- l'espionnage, de système annexe en colonne vertébrale ;
- le rendu 3D, de décoration en ressource achetée ;
- une flotte qui arrive, en événement.

### 4.3 Espionnage, leurres, sabotage

- **Sonde** — révèle les mouvements sortants d'un joueur pendant X minutes.
- **Agent dormant** — placé dans un pays neutre, révèle en continu les arcs passant à proximité.
- **Sabotage** ⚠️ — un agent dormant peut retarder ou dégrader un convoi qui passe à sa portée.
  Sans ça, la doctrine Influence n'a aucune prise sur la partie et six couples nation × doctrine
  meurent (§6).
- **Convoi leurre** — un mouvement contenant zéro unité, indiscernable d'un vrai pour l'espionnage.

⚠️ **Le leurre coûte un slot de mouvement et un forfait fixe, indépendant de la cargaison.** Si son
coût dépendait des unités transportées, un convoi vide coûterait zéro : spam illimité, espionnage
réduit à du bruit, et facture Convex qui explose. Feinter doit se payer en attaques qu'on ne lancera
pas.

### 4.4 Pays PNJ — et pourquoi ils ne doivent pas être un robinet

Les pays non sélectionnés proposent commerce, mercenaires et droits de passage.

**Garde-fou obligatoire** : capacité d'échange **finie** par pays, et **relation par joueur**. Deux
joueurs qui commercent avec le même pays se gênent. Sans ça, la stratégie optimale devient « ignorer
les autres et farmer les PNJ », et ton jeu de guerre devient un jeu de gestion solo.

⚠️ **Aucune nation ne doit être immunisée à ce garde-fou** — c'était le cas de l'Inde en v0, sur la
doctrine qui est précisément un farm PNJ. Auto-victoire.

---

## 5. Les trois doctrines (conditions de victoire)

Chaque joueur choisit une doctrine au départ.

⚠️ **Révélation à 25 % de progression, ou à la première action offensive.** En v0 c'était 50 % :
compte tenu des temps de trajet, quand tu apprenais qui contrer, tu n'avais plus le temps de te
repositionner. Le triangle était désactivé pendant la moitié de la saison.

### 5.1 Conditions, mises à l'échelle de `n` ⚠️

En v0, « détruire X % de la capacité militaire adverse **cumulée** » se divisait par 7 à 8 joueurs
et par 1 à 2 joueurs. Domination était triviale à 2 et impossible à 8.

| Doctrine | Condition | Ce que ça force à faire |
|---|---|---|
| **Domination** | réduire de X % la capacité militaire d'au moins `K = ⌈(n-1)/2⌉` joueurs **distincts** | attaquer plusieurs cibles, donc se découvrir longtemps |
| **Hégémonie** | accumuler `N(n)` **avant-poste-heures** d'extraction | tenir du terrain dans la durée, donc devenir prévisible |
| **Influence** | aligner `N(n)` pays neutres, ou atteindre la suprématie de renseignement | jouer la couche PNJ et l'information |

Hégémonie compte en **cumulé**, plus en continu : sinon un raid remet le compteur à zéro
indéfiniment, sans contre-jeu possible.

### 5.2 Le triangle doit être mécanique, pas déclaratif ⚠️

C'est la faille la plus grave de la v0. Domination *détruit* les armées et les avant-postes qui font
les points des deux autres, tandis qu'Hégémonie et Influence n'avaient **aucun moyen de réduire** la
progression de qui que ce soit. « Influence bat Domination » reposait sur le fait de *voir venir*
l'attaque — mais voir n'annule rien, c'est une atténuation, pas un contre.

**Chaque doctrine reçoit un outil de soustraction :**

| Doctrine | Outil | Effet |
|---|---|---|
| Domination | destruction | détruit armées et avant-postes (donc les points d'Hégémonie) |
| Hégémonie | **embargo** | plafonne la production militaire d'une cible pendant X h (donc étrangle Domination) |
| Influence | **exposition** | révèle publiquement la doctrine d'une cible et **gèle sa progression** X min |

```
        Domination
         ↗       ↘
   Influence ← Hégémonie
```

- **Domination bat Hégémonie** — l'hégémon concentre de la valeur immobile et prévisible.
- **Hégémonie bat Influence** — l'influence s'achète, et l'hégémon a plus de moyens ; l'embargo
  assèche l'acier qui paie les agents.
- **Influence bat Domination** — l'exposition gèle la barre du militaire au pire moment, et le
  sabotage (§4.3) casse ses convois en vol.

---

## 6. Nations — huit pouvoirs qui cassent une règle

Un bon pouvoir asymétrique **brise une règle**. « +15 % de dégâts blindés » ne change aucune
décision ; « je peux réorienter mes troupes en vol » change ta carte mentale. Économie de base
identique pour tous.

| Nation | Pouvoir | Règle brisée |
|---|---|---|
| **France** | *Projection outre-mer* — avant-postes à n'importe quelle distance, **mais coût croissant avec la distance** ⚠️ | l'adjacence requise |
| **Royaume-Uni** | *Maîtrise des mers* — voit tous les arcs maritimes, **mais sans origine, destination ni cargaison** ⚠️ | le brouillard (partiellement) |
| **États-Unis** | *Arsenal* — convertit ravitaillement → acier, un sens seulement, avec cooldown | la non-fongibilité des ressources |
| **Russie** | *Profondeur stratégique* — l'occupation ne réduit pas sa production, l'occupant subit de l'attrition ; **l'occupant prélève quand même du butin** ⚠️ | la pénalité d'occupation |
| **Allemagne** | *Guerre éclair* — enchaîne deux mouvements offensifs sans respecter le cooldown de slot ⚠️ | la rareté des slots de mouvement |
| **Japon** | *Doctrine du porte-avions* — réoriente un convoi en vol, **avant mi-parcours, en consommant un slot supplémentaire** ⚠️ | l'irréversibilité de l'engagement |
| **Chine** | *Masse* — pas de plafond d'effectifs, **mais entretien croissant en ravitaillement** ⚠️ | le plafond d'effectifs |
| **Inde** | *Non-alignement* — pose des agents dormants dans les pays où un adversaire est déjà installé | l'exclusivité territoriale |

⚠️ **Corrections après audit.** Quatre pouvoirs étaient dégénérés en v0 :

- **France × Hégémonie** était le combo n°1 : extractions posées là où l'adjacence interdit aux
  autres d'aller, sur des points qui ne changeaient jamais de main. Le coût croissant avec la
  distance le ramène à un arbitrage.
- **Royaume-Uni × Influence** offrait une suprématie de renseignement gratuite et permanente sur la
  moitié maritime. L'information partielle (un arc, mais pas ses extrémités) garde la saveur.
- **Chine** dépendait pour son contrepoids d'un système de combat non spécifié — donc ni équilibrable
  ni simulable. L'entretien en ravitaillement est un frein économique, mesurable dès la simulation.
- **Russie** cassait une arête du triangle : occuper sa capitale ne rapportait rien, donc Domination
  ne battait pas Russie × Hégémonie. Le butin rétablit l'intérêt d'attaquer.

Le pouvoir japonais reste le plus fort du lot : il annule le levier de drame n°1. Premier candidat
au nerf après la première saison test.

---

## 7. Anti-élimination ⚠️

Le risque n°1 du format d'une semaine n'est pas l'équilibrage, c'est le joueur écrasé mardi matin
qui a cinq jours de rien devant lui. C'est le défaut fatal de Monopoly, étalé sur sept jours.

**Trois règles :**

1. **Le pays d'origine ne peut jamais être annexé**, seulement occupé. Occupation = production
   réduite de moitié. Tu joues moins bien, tu joues quand même.
2. **Revanchisme.** Un joueur très en retard reçoit une **régénération d'effectifs accélérée** — la
   seule exception à la non-convertibilité de §2 — plus un bonus de ressources dépensable
   **uniquement** en actions offensives et en sabotage.
3. **Bouclier de repos** (§8).

⚠️ En v0, le Revanchisme ne distribuait que des ressources. Un joueur vidé de ses effectifs recevait
un multiplicateur sur une ressource qu'il ne pouvait pas transformer en armée : le filet de sécurité
ne touchait pas la variable qui tue. C'était une contradiction directe entre §2 et §7.

⚠️ **Garde-fous anti-farm**, également issus de l'audit :

- **Flux non thésaurisable** : décroît s'il n'est pas dépensé. On ne peut pas se laisser écraser
  volontairement pour accumuler un trésor de guerre.
- **Calculé sur les pertes infligées par le leader**, pas sur les pertes brutes — sinon, entre amis,
  A laisse B farmer du Revanchisme pour frapper C. Du kingmaking involontaire.
- **Les progrès de Domination financés par le Revanchisme ne comptent pas dans la barre.**

Cette mécanique reste du rubber banding, légitimement controversé. La variante défendable est
celle-ci : elle ne rend **pas** la victoire au perdant, elle le rend redoutable. Le leader ne peut
pas écraser quelqu'un puis l'oublier, et le perdant a une raison de se reconnecter mercredi.

---

## 8. Le joueur qui dort ⚠️

Absent de la v0, et obligatoire : en asynchrone sur sept jours, avec des pertes d'effectifs quasi
définitives, **le joueur attaqué à 3 h du matin perd sa saison dans son sommeil**. Ogame a un mode
vacances et un seuil de non-pillage. Il nous faut l'équivalent.

- **Plage de repos** — chaque joueur déclare 7 h par 24 h. **Aucun mouvement ne peut arriver pendant
  sa plage** : il attend à la frontière et se résout à la fin. La plage est publique.
- **Plancher de pertes** — une attaque unique ne peut pas faire descendre en dessous de X % des
  effectifs.

La plage publique est meilleure que le bouclier caché : elle donne à l'attaquant une fenêtre connue
à planifier autour, ce qui ajoute une décision au lieu d'en retirer une. Et elle se calcule
entièrement **à la création du mouvement** (on décale `arrivesAt`), donc elle ne coûte rien côté
serveur.

---

## 9. Les quatre leviers de situation drôle

Propriétés à préserver, pas systèmes à coder. Rendement maximal.

1. **Engagement irréversible avec délai** — acquis gratuitement via les temps de trajet.
2. **Les troupes en transit ne défendent pas** — attaquer, c'est se découvrir. Le « ta flotte était
   sortie » d'Ogame.
3. **Résolution simultanée** — deux joueurs qui s'attaquent mutuellement échangent leurs capitales.
4. **Information asymétrique** — cf. §4.2.

Toute règle future qui casse un de ces quatre leviers doit être justifiée.

---

## 10. Réalité technique ⚠️

Trois points où j'avais sous-estimé le coût.

**« Aucun tick serveur » est faux.** L'accumulation de ressources reste paresseuse, ça c'est acquis.
Mais la résolution de combat à l'arrivée, la durée des sondes, l'embargo, le gel d'exposition et
l'occupation ont tous besoin du scheduler Convex. La formulation correcte est : **pas de boucle
globale, mais un job planifié par événement** (`scheduler.runAt(arrivesAt, ...)`). C'est cheap et ça
scale avec le nombre de mouvements, pas avec le temps.

**Le brouillard est un problème serveur, pas un problème de rendu.** Une requête réactive naïve
« arcs visibles par moi » se recalcule pour tous les joueurs à chaque écriture de mouvement :
bombe de fan-out. Il faut calculer les **fenêtres de révélation à la création du mouvement**
(intersection segment/cercle avec chaque détecteur existant) et les dénormaliser en enregistrements
`(observateur, mouvement, tDébut, tFin)`. Chaque joueur ne lit alors que ses propres lignes.

**Le routage n'est pas « un point (lon, lat) ».** Terre/mer, droits de passage PNJ, portée des
unités : c'est un graphe de navigation à construire et à équilibrer. C'est le plus gros morceau
technique restant après le brouillard, très au-dessus du schéma Convex.

---

## 11. Questions ouvertes

- **Le ratio temps de trajet ÷ temps de construction.** Le vrai risque du projet. À trancher par
  simulation.
- **Un modèle de combat jouet doit être figé avant de simuler.** ⚠️ On ne peut pas mesurer « quelle
  doctrine gagne » sans résolution de combat : sinon la simulation ne mesure que les constantes
  économiques. Même un pierre-papier-ciseaux terre/air/mer trivial suffit, mais il faut l'écrire.
- **Le secret des doctrines à 2 joueurs** est déductible immédiatement. Révéler d'emblée en dessous
  de 4 joueurs ?
- **La granularité de l'occupation** : binaire ou progressive ?
- **La régénération des effectifs pendant l'occupation.** Si elle continue, l'occupation ne pèse pas
  assez ; si elle s'arrête, elle devient définitive et contredit §7.

---

## 12. Journal des changements v0 → v0.2

| § | Correction |
|---|---|
| 3, 4.3 | Slots de mouvement introduits ; le leurre coûte un slot et un forfait fixe |
| 4.1 | Garnison sur toute spécialisation ; richesse tirée par graine de saison ; rendement décroissant ; destruction possible, jamais capture |
| 4.3 | Sabotage ajouté — sans lui, Influence n'a aucune prise et 6 combos meurent |
| 4.4 | Plus aucune immunité nationale au garde-fou PNJ |
| 5.1 | Conditions de victoire indexées sur `n` ; Hégémonie en cumulé (avant-poste-heures) |
| 5.2 | Chaque doctrine reçoit un outil de soustraction — le triangle était déclaratif |
| 5 | Révélation de doctrine à 25 % au lieu de 50 % |
| 6 | France, Royaume-Uni, Chine, Russie, Allemagne, Japon, Inde retouchés |
| 7 | Le Revanchisme débloque des **effectifs** ; non thésaurisable ; calculé sur les pertes infligées par le leader |
| 8 | **Section entièrement nouvelle** — protection du joueur endormi |
| 10 | **Section entièrement nouvelle** — correction honnête sur les ticks, le fan-out du brouillard, le graphe de routage |
| 11 | Modèle de combat jouet requis avant simulation |
