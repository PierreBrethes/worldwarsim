# 04 — Information : brouillard, espionnage, leurres

C'est le cœur du jeu, pas une couche annexe. Cf.
[ADR 0005](../adr/0005-brouillard-par-defaut.md).

## Le brouillard

**Par défaut, tu ne vois que tes propres arcs.** Les mouvements adverses ne sont visibles que dans le
rayon de détection de ton territoire, de ta station d'écoute et de tes avant-postes d'écoute.

C'est la décision la plus importante du design. Elle transforme d'un coup :

- l'espionnage, de système annexe en colonne vertébrale ;
- le rendu 3D, de décoration en ressource qu'on achète ;
- une flotte qui arrive, en événement.

Sans brouillard, le plus beau du jeu est offert gratuitement à tout le monde et ne sert à rien.

⚠️ **C'est un problème serveur avant d'être un problème de rendu.** Cf.
[technique/brouillard-et-fanout.md](../technique/brouillard-et-fanout.md).

## Outils

| Outil | Effet | Coût |
|---|---|---|
| **Sonde** | révèle les mouvements sortants d'un joueur pendant X min | ravitaillement |
| **Agent dormant** | posé dans un pays neutre, révèle en continu les arcs proches | ravitaillement + slot |
| **Sabotage** | un agent dormant retarde ou dégrade un convoi à sa portée | action de l'agent |
| **Convoi leurre** | mouvement à zéro unité, indiscernable d'un vrai pour l'espionnage | **forfait fixe + 1 slot** |

### Pourquoi le sabotage existe

Sans lui, la doctrine Influence n'a aucune prise sur la partie : elle observe sans jamais pouvoir
agir. Six couples nation × doctrine sur 24 devenaient morts, tous concentrés sur Influence. Le
sabotage est ce qui rend la doctrine jouable plutôt que contemplative.

### Pourquoi le leurre coûte un forfait fixe

Si le coût d'un mouvement dépendait de sa cargaison, un convoi vide coûterait zéro. Résultat : spam
illimité, espionnage réduit à du bruit pur, condition de victoire « suprématie de renseignement »
inatteignable, et facture serveur qui explose.

Forfait fixe **plus un slot de mouvement** : feinter se paie en attaques qu'on ne lancera pas. C'est
ce qui fait du leurre une décision plutôt qu'un réflexe.

Le leurre coûte trois lignes de code — un mouvement dont le tableau d'unités est vide — et produit à
lui seul la moitié des histoires que vous vous raconterez après la saison. C'est le meilleur rapport
effort/plaisir du design.
