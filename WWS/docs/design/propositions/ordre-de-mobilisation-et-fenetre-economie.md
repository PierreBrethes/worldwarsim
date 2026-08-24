# Proposition — l'ordre de mobilisation et la fenêtre Économie

**Statut : proposition, session du 19/08/2026.** Issue du premier playtest à deux nations
(France / USA). Elle prolonge le [dégraissage des surfaces](brief-degraissage-surfaces.md) et
s'attaque à ce que le dégraissage ne couvrait pas : **l'ouverture**. Les deux trous de code
qu'elle constate partent dans un prompt à part
([fondation-hors-chantier.md](../../prompts/code/ready/fondation-hors-chantier.md)) — ils se
corrigent avant de maquetter quoi que ce soit, parce qu'on ne juge pas un feeling par-dessus
un bug.

## Le constat du playtest

Le format skirmish offre **six poses de fondation** — gratuites, instantanées. Le joueur ne
l'apprend nulle part : rien ne dit qu'elles existent, rien ne dit où elles peuvent aller, et
les gisements se découvrent au clic droit, région par région. Résultat mesuré en partie
réelle : une filature **payante** lancée avant les mines **offertes**, et le verrou « un
chantier à la fois » qui bloque alors trois poses qui ne coûtent rien et n'attendent rien —
deux extracteurs jamais posés, une économie qui ne démarre pas, et aucun écran qui explique
pourquoi.

Le sentiment produit n'est pas « je suis libre », c'est « je suis lâché ». Or aucune règle ne
manque : `foundationOwed` existe, le client reçoit `me.foundation`, le panneau de construction
sait déjà distinguer une pose offerte d'un chantier payant. **Tout existe, rien ne se voit.**

## Le principe

> **Le jeu répond toujours à « et maintenant ? » — sans tutoriel.**

C'est le complément du principe du dégraissage (« une donnée a une maison ») : le dégraissage
enlève ce qui se répète, cette proposition ajoute le seul fil qui manque — celui qui dit au
joueur où porter le prochain geste. Pas un tutoriel, pas une surcouche : la dette du format,
rendue visible.

## 1 · L'ordre de mobilisation

Une carte persistante sur le plateau, style dépêche 1940 :

```
ORDRE DE MOBILISATION
Fondation — 3 poses offertes restantes
   fonderie · entrepôt · arsenal
```

Le geste : **cliquer une clé → la carte surligne les régions qui l'acceptent** (chez soi, avec
le gisement requis pour un extracteur — la donnée est déjà servie, `PlayerView.me.regions`
porte `deposit` et `coastal`, cf. dégraissage §8) **→ cliquer la région → posée, debout à
l'instant.** Quand la fondation est soldée, la carte se retire d'elle-même et ne revient
jamais.

Ce que ça achète, en passant :

- l'ouverture devient une séquence lisible de deux minutes — le « qu'est-ce que je place en
  premier » a une réponse à l'écran, pas dans une doc ;
- elle apprend la grammaire du jeu sans la dire : **construire, c'est choisir un lieu** ;
- l'erreur du playtest devient impossible à faire sans la voir — lancer un chantier payant
  quand l'ordre affiche encore trois poses offertes, ça se lit comme un contretemps.

**Frontière avec la couche de gisements du dégraissage (§8)** : la couche affiche en continu,
sur bascule ; l'ordre surligne **à la demande**, pour une clé cliquée. Les deux se composent —
la couche dit « voilà le pays », l'ordre dit « voilà où ce bâtiment-ci peut aller ».

## 2 · La fenêtre Économie

Industrie absorbe le recensement des bâtiments et devient **Économie** — la fenêtre de tout ce
qui se pose et de tout ce qui coule. C'est une **révision assumée du dégraissage §1**, qui
gardait le recensement dans la fiche Nation : le playtest a montré trois fenêtres ouvertes en
cascade pour suivre une seule pose. Le recensement sert une décision — *quoi élever, quoi
poser ensuite* — et cette décision se prend dans Économie ; c'est le principe du dégraissage
lui-même qui commande le déménagement.

La fenêtre, de haut en bas :

**Le chantier, en tête, une seule fois.** Quoi, où, temps restant, annuler. La phrase
« Chantier en cours : Filature — reste 00:06. Un seul à la fois » cesse de se répéter sur
chaque ligne — répétée quatre fois, l'information la plus importante de la fenêtre est devenue
du bruit de fond. Le bandeau garde sa version de veille (il la porte déjà) ; la fenêtre porte
la version d'action, avec l'annulation.

**La filière, dessinée.** Un schéma vertical — gisement → extracteur → conversion → sortie —
aligné sur le groupement par chaîne du panneau des réserves (dégraissage §6). Un maillon bâti
est plein et porte son débit réel ; un maillon manquant est **en pointillé avec sa condition
écrite** : « fonderie — pose de fondation offerte », « demande un quartier général niveau 3 »,
« aucun gisement de pétrole — ce qui manque se prend ailleurs ». Le trou dans la chaîne saute
aux yeux : c'est la réponse au « et maintenant ? » de milieu de partie, celle que l'ordre de
mobilisation ne couvre plus une fois la fondation soldée. Et ça remplace les blocs
« Fonderie niv. 0 — éteinte » actuels, qui affichent du néant comme si c'était un état de
panne.

**La projection, en bas.** Caserne, aérodrome, port, baraquements — la section de ce qui arme.
Deux sections, pas trois onglets : à un instant donné on ne pose qu'une chose, un catalogue à
onglets serait de la navigation pour rien.

**Pas de colonne réserves.** Le panneau haut-droit les porte (dégraissage §6). La fenêtre
garde le *pourquoi* — quelle entrée manque, quelle sortie déborde — jamais le *combien*.

**Ce que Nation devient** : la fiche d'identité stratégique — pouvoir national, manque
déclaré, doctrine, armée présente/en transit, plage de repos, plus tard l'occupation et le
revanchisme (fiche 11 §4.5). Elle ne gère plus rien ; elle se lit.

## 3 · La règle du grisé

L'ADR 0015 dit « l'écran de construction est contextuel — rien de grisé, jamais ». La filière
en pointillé la révise. La règle qui remplace :

> **Rien de caché ne se débloque, rien d'affiché sans sa condition.**

- l'**impossible structurel** (pas de gisement ici, pas de côte) n'apparaît pas sur le panneau
  de région — le contextuel demeure, c'est lui qui empêche le catalogue de quinze lignes ;
- l'**actionnable** apparaît avec sa condition en clair — « demande un quartier général
  niveau 3 » est déjà l'esprit du refus `BUILDING_LOCKED`, le seul refus sur lequel un joueur
  peut toujours agir ;
- dans la fenêtre Économie, le catalogue complet se lit **avec ses conditions** : c'est une
  carte du jeu, pas un menu grisé.

Si la proposition est retenue, l'ADR 0015 prend une note de révision datée, comme celle du
15/08 — pas un contournement silencieux.

## Ce que ça ne touche pas

**Un chantier à la fois** reste — aucune file de construction : une UI de file promettrait un
empilement que le serveur refuse. **Le contextuel du panneau de région** reste. **Le panneau
des réserves et le bandeau** restent tels que le dégraissage les a tranchés. Aucune règle de
jeu ne bouge : cette proposition ne déplace que des surfaces.

## L'ordre

1. **[fondation-hors-chantier.md](../../prompts/code/ready/fondation-hors-chantier.md)** — les
   deux trous (le verrou sur les poses offertes, la fausse alarme de saturation) et la phrase
   de chantier répétée. Puis **rejouer l'ouverture** : c'est le feeling corrigé qu'on juge.
2. **L'ordre de mobilisation** — maquette, puis code.
3. **La fenêtre Économie** — maquette ; peut rejoindre les planches du dégraissage.
