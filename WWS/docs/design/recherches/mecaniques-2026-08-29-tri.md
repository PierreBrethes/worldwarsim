# Tri Cowork du rapport « mécaniques » (29/08/2026)

Le rapport brut est collé plus bas. Tri contre les ADR et la file existante. Quatre paquets.

## Retenir — petits, sûrs, tôt dans la file

- **M9 départ programmé** (Subterfuge). Un ordre de mouvement porte une heure de départ
  future. Pur asynchrone, petit chantier (un champ sur l'ordre + le job), zéro conflit de
  corpus. Le meilleur rapport valeur/coût du rapport.
- **Manchettes épinglées sur la carte** (§Visuel). Une bataille nommée épingle sa dépêche sur
  la région. Coût S, fabrique les récits — dépend de la dépêche publique déjà en file.
- **Ordres au crayon gras** (§Visuel). Flèches grasses pour les ordres en cours — répond au
  manque de confirmation d'envoi noté à l'audit. Coût S, pur front.
- **M4 le tir révèle + sillages** (Defcon + Plague Inc). Tout engagement publie une position ;
  tout mouvement laisse un sillage lisible par l'écoute, qui s'estompe. Répond au vrai risque
  « brouillard trop absolu à 2-4 joueurs » et à Q5 (l'anticipation récompensée, pas la
  présence). Compatible ADR 0018 (le sillage informe le joueur, pas le système). À chiffrer
  après les mesures du prochain test — c'est lui qui dira si le brouillard est trop absolu.

## Retenir — gros, à leur place dans la file

- **M1 la ferraille** (OGame) → s'intègre au design **pillage/objectifs neutres** : un combat
  laisse un stock sur la région, ramassable par qui la tient. Donne un gain à l'attaque même
  pyrrhique et un métier à l'écrasé. Même mécanisme que le dépôt neutre déjà proposé.
- **M6 objectif secret national** (Risk missions) → quand le brouillard de carte s'effondre à
  2-3 joueurs, celui des intentions tient. Pas cher (tirage au salon + décompte à l'édition
  finale). À brancher sur la page de presse (édition finale).
- **M8 bulletin météo** (Northgard corrigé) → campagne 7 j seulement. Règles dures, toujours
  annoncées une passe à l'avance au journal. Donne au journal quelque chose à dire chaque jour.
- **M7 gouvernement en exil** (Neptune's Pride) → la forme jouable de « jamais éliminé ».
  Après la victoire par seuil tenu, pas avant.
- **Terminateur jour/nuit porteur** (écoute réduite côté nuit) → se marie avec M9 (« arriver à
  la nuit tombée »). Après que l'écoute a été éprouvée en partie.

## À adapter — une réserve sérieuse chacun

- **M2 ultimatum obligatoire** : conflit frontal avec le cœur du jeu — l'ultimatum
  obligatoire **tue l'attaque surprise**, donc le brouillard, le leurre et l'interception
  perdent leur sel. À garder en version affaiblie : l'ultimatum comme *posture optionnelle*
  payée en prestige/presse, et la règle anti-boule-de-neige seule (le leader du score flou
  attaquable « gratuitement ») qui, elle, est bonne.
- **M3 soutien à la Diplomacy** : le manque n°1 côté social, mais il **relitige l'ADR 0019 §4**
  (l'avant-poste allié ne ravitaille pas, « la diplomatie n'existe pas encore ») — c'est le
  chapitre diplomatie qui s'ouvre, pas une règle isolée. Après pillage.
- **M5 ravitaillement coupé** (Unity of Command) : séduisant mais c'est un *deuxième* système
  de ravitaillement à côté de l'ancrage de l'ADR 0019 §4 (+ un calcul de route vers le QG à
  chaque passe). N'ouvrir que si le test montre que la position ne pèse rien.
- **Trêve post-frappe, nul partagé, mode vacances** : garde-fous sociaux, à noter dans les
  règles de la maison plutôt qu'en code, tant qu'on joue entre amis.

## Rejeter (d'accord avec le rapport, ou plus dur que lui)

Continu lent (NP), protection par ratio (OGame), carte-par-conquête (Risk), asymétrie totale
(Root), pouvoirs de CO en % (Advance Wars), lignes de front auto-dessinées (trompeuses sans
contrôle de zone), hubs saturables (doublon du plafond d'empilement).

## Déjà chez nous (le rapport confirme, rien à faire)

Passe de résolution (Diplomacy), slots d'ordres (SI), écoute = infrastructure (NP), mèche de
pétrole (OGame), relais (warp gates), gisements aux frontières (à vérifier au tirage des
cartes), doctrines = loadout (SI), spécialistes briseurs de règle = le moule des futurs atouts
nationaux, aucune alliance systémique (à ériger en règle de corpus : **ne jamais coder
d'alliance**).

---

*Rapport archivé ci-dessous, condensé par Cowork (verdicts et arguments conservés, prose resserrée).*

# Recherche — mécaniques de stratégie, inspirations pour worldwarsim

*29/08/2026. Balayage du spectre RTS → asynchrone pur → plateau. Verdicts : ✅ compatible · 🔧 à adapter · ❌ incompatible.*

## 1. Rythme et engagement asynchrone

| Mécanique | Source | Concrètement | Problème résolu | Verdict |
|---|---|---|---|---|
| Ordres simultanés à échéance | Diplomacy (1959) | Ordres secrets, résolution simultanée à date fixe. | L'avantage du présent disparaît. | ✅ C'est la passe de résolution. |
| Slots d'ordres limités | Solium Infernum (2009/2024) | 2-5 ordres par tour ; on bluffe sur ce qu'on n'a pas fait. | Plafonne la micro ; l'ordre devient un pari. | ✅ Déjà là (1 + QG). On peut baisser encore. |
| Machine à remonter le temps | Subterfuge (2015) | Simulation déterministe scrollable ; ordres programmés à date future. | L'absent planifie autant que le présent. | 🔧 À voler : le départ différé. |
| Continu lent | Neptune's Pride (2010) | Flottes en vol 24 h/24. | Engagement long. | ❌ Récompense la veille nocturne (diaries RPS). |
| Trêve post-frappe | Clash of Clans | Bouclier après attaque subie. | Protège l'absent du farming. | 🔧 En règle, pas en % ; peut diluer la peur. |
| Protection par ratio | OGame | Écart de score → attaque interdite. | Protège les petits. | ❌ Anti-jeu à 2-8 amis. |
| Course d'accélération de fin | Subterfuge | Extraction commune → horloge de fin. | La fin se voit venir. | 🔧 Jauge publique de fin. |
| Mode vacances | Travian | Gel volontaire. | Absence annoncée. | 🔧 Garde-fou social, hors mécanique. |

## 2. Information et espionnage

| Mécanique | Source | Concrètement | Problème résolu | Verdict |
|---|---|---|---|---|
| Double aveugle arbitré | Kriegsspiel (~1824) | L'arbitre tient la carte vraie. | L'ancêtre du brouillard serveur. | ✅ Pédagogique. |
| Rayon de scan = infrastructure | Neptune's Pride | La vision se construit. | L'info s'achète et s'installe. | ✅ Les stations d'écoute. |
| Le tir révèle | Defcon (2006) | Invisible jusqu'au tir ; l'action fuit. | L'info sort de l'action. | ✅ Quasi gratuit : tout engagement → relevé public. |
| Cachette de ressources | Travian (cranny) | Stock plafonné insaisissable, invisible aux rapports. | Contre-jeu au pillage. | ✅ Complément naturel du pillage. |
| Sonde consommable | OGame | Sonde jetable, rapport gradué, risque. | Info payante. | 🔧 Sans % de détection : la sonde laisse toujours une trace. |
| Gradation position/composition/intention | Stratego | On voit le pion, pas le grade. | Trois niveaux d'info vendus séparément. | 🔧 Détecteur=position, identification=composition, leurre=intention. |
| Fenêtre de déchiffrement | HOI4 La Résistance | Casser le chiffre → fenêtre de lecture temporaire. | Espionnage-campagne. | 🔧 « 24 h de relevés sur X », très cher, jamais de % combat. |
| Zéro brouillard, tout social | Diplomacy | Info parfaite, incertitude d'intention. | L'info cachée peut être sociale. | 🔧 Leçon pour 2-3 joueurs → objectifs secrets. |

## 3. Adversité

| Mécanique | Source | Concrètement | Problème résolu | Verdict |
|---|---|---|---|---|
| Champ de débris | OGame | Flotte détruite → débris recyclables sur place. | La guerre produit ; perdre laisse à ramasser. | ✅✅ La ferraille (M1). |
| Vendetta déclarée | Solium Infernum | Tribut exigé → refus = casus belli public borné. | Rampe d'escalade légitime entre amis. | 🔧 Voir M2. |
| Insulte publique | Solium Infernum | Insulte payée en prestige. | Conflit sans troupes. | 🔧 Gadget sans adossement au score. Réserve. |
| Rareté localisée | EVE, Diplomacy (34 centres) | Ce qui compte est fini et placé. | Le conflit émerge de la géographie. | ✅ Économie v2 ; placer les gisements majeurs aux frontières. |
| Attaque obligatoire récompensée | Risk (cartes) | Carte par conquête. | Tue la tortue. | ❌ Carotte artificielle. |
| Butin plafonné | Travian | Raid vole un stock borné. | Le raid paie sans ruiner. | ✅ Plafond à écrire dans le pillage. |

## 4. Diplomatie et trahison

| Mécanique | Source | Concrètement | Problème résolu | Verdict |
|---|---|---|---|---|
| Ordre de soutien | Diplomacy | Soutenir l'unité d'un autre ; trahir = ne pas écrire l'ordre. | La promesse a une forme, la trahison un instant. | 🔧🔧 Voir M3. |
| Convoi d'autrui | Diplomacy | Ta flotte transporte son armée. | La confiance devient un trajet. | 🔧 Droits de passage / cargo partagé. |
| Don d'actifs | Subterfuge, NP | Transferts comme monnaie de confiance. | Alliances = flux, pas contrats. | ✅ Prêt-bail, ressources. Pas de transfert de troupes. |
| Relevé transférable | ext. NP | Transmettre une dépêche authentifiée (y compris d'un leurre !). | L'info devient monnaie diplomatique. | 🔧 Original, peu coûteux. |
| Aucune alliance systémique | Diplomacy, Subterfuge | Zéro UI d'alliance. | Le jeu social est le jeu. | ✅ Ne jamais coder d'alliance. |
| Nul partagé | Diplomacy (DIAS) | Nul incluant les survivants. | Désamorce l'acharnement. | 🔧 « Paix blanche » votable honorable. |

## 5. Économie et logistique

| Mécanique | Source | Concrètement | Problème résolu | Verdict |
|---|---|---|---|---|
| Ligne de ravitaillement traçable | Unity of Command (2011) | Couper le chemin fait dépérir. | L'encerclement géométrique, sans malus chiffré. | ✅✅ Voir M5 (réserve Cowork : 2ᵉ système vs ADR 0019 §4). |
| Hubs saturables | HOI4 NSB | Capacité par nœud. | Limite la concentration. | 🔧 Doublon du plafond d'empilement. |
| Guerre des convois | HOI4 | Le flux traverse des zones chassables ; l'escorte est une mission. | L'économie devient cible militaire. | ✅ Portes cargo ; manque l'ordre d'escorte. |
| Spécialisation + chantier commun | Ikariam | Une ressource par île ; scierie co-financée. | Commerce obligatoire ; lien non violent. | 🔧 Chantier commun sur région neutre. |
| Carburant comme laisse | OGame | La portée coûte du carburant. | Borne la projection. | ✅ La mèche de pétrole. |
| PNJ marchands | Travian, RoK | Cours neutre. | Soupape anti-blocage. | ✅ Déjà en fiches. |

## 6. Territoire et carte

| Mécanique | Source | Concrètement | Problème résolu | Verdict |
|---|---|---|---|---|
| Goulots du graphe | Diplomacy | 2-3 provinces verrouillent un théâtre. | La géographie est le gameplay. | ✅ Gibraltar, Suez, Bosphore, Malacca gratuits. |
| Prime de continent | Risk | Continent entier = revenu fixe. | But macro lisible. | 🔧 En règle (« toutes les portes d'une mer »), jamais en rendement. |
| Régions-champs de bataille | Twilight Struggle | Des pays valent plus. | Hiérarchise la carte. | ✅ Bakou, la Ruhr — les gisements le disent déjà. |
| Contiguïté vitale | Slay | Coupé de la capitale = mort. | La découpe est une arme. | 🔧 Jumeau de M5 — en choisir un. |
| Portes accélératrices | NP (warp gates) | Payées aux deux bouts. | Le joli s'achète, en déplacement. | ✅ Le relais ×1,5. |
| Place forte | War of the Ring | Le siège a ses règles ; retraite choisie. | La défense est un lieu. | 🔧 « La garnison retranchée tire la première passe », jamais +X %. |

## 7. Progression courte

| Mécanique | Source | Concrètement | Problème résolu | Verdict |
|---|---|---|---|---|
| Spécialistes briseurs de règle | Subterfuge | Chaque unité unique casse UNE règle. | Progression = verbes, pas stats ; menace lisible. | ✅✅ Le moule des atouts nationaux. |
| Loadout d'avant-partie | Solium Infernum | Asymétrie composée avant, partiellement secrète. | L'asymétrie se choisit. | ✅ Les doctrines ; le secret partiel nourrit l'espionnage. |
| Asymétrie totale | Root (2018) | Quatre jeux sur un plateau. | Rejouabilité maximale. | ❌ Coût d'équilibrage sans fin en solo. |
| Vétérance en verbes | Wesnoth | La promotion donne une capacité. | Attachement, mémoire. | 🔧 Un verbe après N combats, jamais +X %. |
| Pouvoirs de commandant | Advance Wars | Jauge → pouvoir signature. | Moments mémorables. | ❌ Des % partout ; garder l'idée du moment signature en règle. |

## 8. Fin de partie et scoring

| Mécanique | Source | Concrètement | Problème résolu | Verdict |
|---|---|---|---|---|
| Décompte semi-caché | Twilight Struggle | On sait qu'il viendra, pas quand. | Personne ne campe la fin. | 🔧 Édition spéciale de mi-saison. |
| Lignes rouges | Twilight Struggle | Franchir = fin immédiate. | Pas d'enlisement. | 🔧 Prudence : aggrave la boule de neige. Après le seuil tenu. |
| Missions secrètes | Risk (1957) | Objectif de victoire caché. | L'intention devient l'info cachée. | ✅✅ Voir M6. |
| Deux chemins asymétriques | War of the Ring | Militaire OU quête masquée. | Le dominé garde un espoir lisible. | 🔧 Version légère = M6. |
| Coalition anti-expansion | EU4 | Trop conquérir ligue le monde contre toi. | Anti-boule de neige en règle. | 🔧 Leader du score flou attaquable sans ultimatum. |
| Concession et exil | NP | Cascades de redditions dignes. | Finir dignement. | 🔧🔧 Voir M7. |

## 9. Visuel

| Idée | Références | Cosmétique ou porteur ? | Risque / coût |
|---|---|---|---|
| Terminateur jour/nuit | HOI4 (en %, à ne pas suivre), Civ VI | Porteur en règle : écoute réduite côté nuit → arriver de nuit = manœuvre. La nuit frappe des régions, jamais des joueurs. | Jamais assombrir vraiment (« encre plus dense »). Coût moyen. |
| Météo annoncée | HOI4, Shadow Empire | Porteur si règle dure + annoncée une passe avant (bulletin météo = genre de presse 1940). | RNG subi si non annoncé. Coût moyen. |
| Saisons (7 j) | Northgard | Porteur : rasputitsa datée, rendez-vous collectif. | Campagne seulement. Coût faible. |
| Sillages | Plague Inc, sillages navals | Porteur ++ : un mouvement laisse une trace qui s'estompe, lisible par l'écoute. Informe le joueur, pas le système (ADR 0018 sauf). | Surcharge si trop persistant. |
| Lignes de front auto | HOI4 | Trompeur sans contrôle de zone continu. | ❌ Éviter. |
| Manchettes épinglées | SI + le journal | Cosmétique-mémoire : la bataille nommée épingle sa manchette sur la région. | Aucun. Coût S. La meilleure affaire. |
| Vieillissement du papier | Victoria 3 (carte papier) | Diégétique : la carte jaunit avec la saison — l'horloge de fin en ambiance. | Borner le jaunissement. Coût S. |
| Esthétique de la distance | Defcon | Leçon : des signes, pas de la densité. | Économie de moyens. |
| Ordres au crayon gras | Salles d'état-major | Cosmétique-UX : flèches grasses = confirmation d'envoi. | Coût S, gain réel. |

## 10. Mélanges candidats

- **M1 La ferraille** (OGame + pillage) : tout combat laisse un stock fixe ramassable sur la région. L'attaque paie même pyrrhique ; l'écrasé devient charognard.
- **M2 L'ultimatum public** (SI + EU4 + presse) : attaquer exige un ultimatum publié ; refus = casus belli 72 h ; le leader du score flou attaquable sans ultimatum.
- **M3 Le soutien** (Diplomacy) : mouvement « en soutien » d'une région amie, ne combat qu'en défense, annulable jusqu'à la passe — la trahison a un instant.
- **M4 Le tir révèle + sillages** (Defcon + Plague Inc) : l'engagement publie une position ; le mouvement laisse un sillage qui s'estompe, lisible par l'écoute.
- **M5 Le ravitaillement coupé** (Unity of Command) : route vers le QG coupée par une porte ennemie → avant-poste désactivé après une passe.
- **M6 L'objectif secret national** (Risk + WotR) : tiré au salon, décompté à l'édition finale. Le brouillard des intentions tient quand celui de la carte tombe.
- **M7 Le gouvernement en exil** (NP + partisans) : réduit depuis N heures → plus de production, mais leurres, sabotage, vente de relevés, partisans.
- **M8 Le bulletin météo** (Northgard + HOI4 corrigé) : un événement météo par jour de campagne, annoncé une passe à l'avance, effet en règle dure.
- **M9 Le départ programmé** (Subterfuge) : un mouvement porte une heure de départ future — « arriver à la nuit tombée sur Gibraltar ».

*Sources : attribution par jeu/studio/date, pas de citations web. À vérifier si passage en fiche : contre-espionnage OGame, sièges WotR 2ᵉ éd., spécialistes SI 2024.*

---

# Rapport 2 (même jour, recherche web) — ce qu'il ajoute au premier

Large recouvrement avec le rapport 1 (mêmes jeux, mêmes verdicts). Le neuf, trié :

## Retenu — vient enrichir des chantiers existants

- **Le rapport d'espionnage arrive toujours** (OGame, corroboré wiki + forum Gameforge) : le
  contre-espionnage détruit les moyens de l'espion et alerte la cible, mais ne prive jamais
  l'attaquant du renseignement. Principe à graver pour sondes/écoute : *l'info est chère mais
  fiable — le défenseur ne peut pas aveugler, seulement faire payer et savoir*.
- **Le grand carnage crée une position** (OGame : 100 000 débris = 1 % de chance de lune,
  plafond 20 %) : version worldwarsim, sans hasard — une bataille au-dessus d'un seuil laisse
  un **avant-poste ruiné réoccupable** sur les lieux, en plus de la ferraille (M1 enrichi).
  La grande bataille devient un lieu permanent de la saison.
- **Le tirage périodique de spécialistes** (Subterfuge : toutes les 18 h, un choix parmi
  trois — offensif/défensif/autre, effets en règles jamais en %) : le *rythme* à retenir pour
  les futurs atouts nationaux — un choix rare et daté, pas un arbre.
- **Écueil vendetta documenté** (communauté SI 2024) : résister/échouer coûte peu → chaînage
  dilatoire. Renforce la position du tri 1 : l'ultimatum reste *optionnel*, et s'il existe un
  jour, l'échec répété doit coûter.
- **Écueil méga-alliance** (Neptune's Pride, demandes communautaires de seuil 90-100 %) : à
  retenir pour le seuil de Domination — jamais de victoire d'alliance, et un seuil assez haut
  pour que la trahison finale soit obligatoire.
- **Kingmaking** (post-mortem Subterfuge) : à 2-8 amis, aider un tiers à gagner est une vraie
  menace — argument de plus pour l'objectif secret (M6), qui donne au troisième une raison
  égoïste de jouer sa propre partition.

## Retenu avec réserve

- **Les brigands contre-attaquent si ignorés** (Travian) : twist pour les objectifs neutres —
  une garnison locale ignorée finirait par frapper les extractions voisines. Réserve : en
  asynchrone, un PNJ qui attaque pendant l'absence est du subi ; s'il entre un jour, toujours
  annoncé plusieurs passes à l'avance au journal (même règle que la météo M8).
- **Saut temporel valorisé** (Blight of the Immortals) : pour le format sans horloge,
  éventuellement. Loin dans la file.

## Correction factuelle sur le rapport 1

Le terminateur jour/nuit de HOI4 est **purement cosmétique** (désactivable) — le rapport 1 lui
prêtait une pénalité de combat nocturne. « L'écoute réduite côté nuit » reste donc une
extrapolation de design à nous, pas une mécanique éprouvée ailleurs : à prototyper prudemment
(lisibilité), après que l'écoute a été jouée.

## Conclusion consolidée (les deux rapports)

Rien dans le rapport 2 ne change l'ordre du tri 1. Il l'épaissit : M1 gagne la ruine
réoccupable, M6 gagne l'argument anti-kingmaking, M2 reste affaibli (deux écueils documentés),
et deux principes de corpus s'ajoutent — *l'info est fiable une fois payée* et *jamais de
victoire d'alliance, seuil haut*.
