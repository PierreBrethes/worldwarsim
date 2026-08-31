# La recherche débloque, elle ne bonifie jamais (décidé, 31/08/2026)

**Décision de Pierre (31/08, question 44a)**, à graver dans la future ADR recherche — celle que
le schéma attend déjà (`troops` : « No specialization field […] It arrives with the research
ADR »).

## La règle

**Une recherche débloque une unité nouvelle. Aucune recherche ne modifie un chiffre existant.**

- Variante d'un rôle : infanterie **médecin**, **parachutiste** (les deux que l'ADR 0014 nomme
  déjà pour le tier 1) — chacune est une ligne nouvelle dans `DAMAGE_TABLE`, l'unique table.
- Matériel absent du catalogue : bombardier lourd, porte-avions… — même contrat.
- La destruction de QG (décision 39) est une recherche de ce type : elle débloque une capacité
  discrète, au palier 4 au moins.

## Pourquoi pas des pourcentages

L'intuition d'origine (« +X % de dégâts contre tel type », des « points d'attaque » améliorables)
est écartée pour trois raisons, toutes déjà dans le corpus :

1. **« Les bonus cassent une règle »** — la doctrine du projet ; l'audit a retoqué la fiche 03
   pour un pourcentage exactement semblable.
2. **Le garde-fou anti-contre-absolu deviendrait inauditable** : `combat.test.ts` rejoue 75
   couples à travers la vraie table ; avec des modificateurs cumulables par joueur, il faudrait
   rejouer chaque combinaison de recherches — la table cesserait d'être la vérité.
3. **Les marques ne sont pas une échelle** — objection de Pierre lui-même : mk1 = fusils,
   mk2 = bazooka, deux *contres* différents, pas deux qualités. Un « mk3 » n'aurait rien à être ;
   une variante nouvelle, si.

« Nouvelle arme ⇒ nouveaux ratios » reste vrai littéralement : la nouvelle arme est une nouvelle
ligne, visible dans l'abaque de tir (`fenetre-qui-bat-qui`), testée par le même garde-fou.

## Contraintes pour l'ADR recherche à venir

- La table reste unique et globale — jamais une table par joueur.
- Chaque unité débloquée passe le garde-fou : aucun contre absolu, hors transports.
- L'identité nationale peut vivre ici (le porte-avions japonais, le bombardier lourd américain)
  **en débloquant autre chose, jamais en chiffrant mieux la même chose** — c'est la règle des
  pouvoirs de nation, étendue à la recherche.
