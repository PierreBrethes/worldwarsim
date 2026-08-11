# 02 — Économie et bâtiments

## Trois ressources, trois modes d'acquisition

Ce n'est pas le nombre de ressources qui crée les décisions, c'est le fait qu'elles s'obtiennent
de manières incompatibles.

| Ressource | Source | Propriété clé |
|---|---|---|
| **Ravitaillement** | nation d'origine + commerce PNJ | Flux sûr. La ressource du joueur prudent. |
| **Acier** | avant-postes d'extraction uniquement | **Contestée.** On ne peut pas en avoir sans sortir de chez soi. |
| **Effectifs** | nation d'origine seule, régénération lente, plafond dur | **Ni achetables ni convertibles.** Une seule exception : le Revanchisme. |

### Pourquoi les effectifs sont le pivot

Tant qu'une ressource se rachète, perdre une bataille n'est qu'un contretemps comptable. Un plafond
dur sur les effectifs rend chaque engagement réellement coûteux — et transforme l'attaque en
décision plutôt qu'en routine.

C'est aussi ce qui rend la couche information rentable : si les pertes ne comptent pas, savoir ce qui
arrive ne vaut rien.

**Corollaire à ne pas oublier** : parce que les pertes d'effectifs sont quasi définitives, le joueur
attaqué pendant son sommeil perd sa saison. D'où la plage de repos, cf.
[07 — Friction sociale](07-friction-sociale.md).

## Accumulation paresseuse

On stocke `lastUpdate` et `rate`, on calcule le stock au moment de la lecture. Pas de boucle de jeu,
pas de cron d'accumulation. C'est ce qui rend le format asynchrone quasi gratuit à opérer.

Attention : cela vaut pour **l'accumulation seulement**. Les résolutions datées (arrivée d'un
convoi, fin de sonde, fin d'embargo) ont besoin du scheduler.
Cf. [technique/architecture.md](../technique/architecture.md).

## Bâtiments

Cinq, sur la nation d'origine. Coût exponentiel. Chacun alimente une doctrine ou l'information.

| Bâtiment | Effet |
|---|---|
| **Quartier général** | débloque les paliers, relève les plafonds de stockage |
| **Complexe industriel** | vitesse et rendement de conversion acier → unités |
| **Centre logistique** | réduit le temps de trajet, **et fixe le nombre de slots de mouvement** |
| **Conscription** | régénération et plafond des effectifs |
| **Station d'écoute** | rayon de révélation passif autour du territoire et des avant-postes |

## Les slots de mouvement

`slots = 1 + niveau du centre logistique`

**C'est la ressource la plus rare du jeu, et le régulateur central du design.** Attaquer, ravitailler,
raider, feinter et poser un agent puisent tous dans le même stock.

Trois problèmes réglés d'un coup :

- **Le spam de leurres.** Sans slots, un convoi vide coûte presque zéro : espionnage noyé sous le
  bruit, et facture serveur qui explose. Avec slots, feinter se paie en attaques qu'on ne lancera pas.
- **L'arbitrage permanent.** Chaque envoi se fait au détriment d'un autre. C'est la décision que le
  joueur prend le plus souvent dans la journée.
- **Le plafond de charge serveur.** Le nombre de mouvements en vol est borné par construction.

Cf. [ADR 0006](../adr/0006-slots-de-mouvement.md).
