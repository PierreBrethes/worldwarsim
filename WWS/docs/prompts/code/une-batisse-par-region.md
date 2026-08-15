# Prompt Claude Code — une bâtisse par région, et le plafond sur le QG

Lis la révision du 15/08 de l'[ADR 0015](../../adr/0015-economie-v2-ressources-localisees.md),
sections « une bâtisse par région » et « aucune quantité de jeu ne se compte en régions », puis la
fiche [02 — Économie](../../design/02-economie.md). Ne commit pas, ne push pas.

Passe serveur, courte. Elle précède `rose-des-vents-construire.md` : le panneau de construction
doit connaître ces deux règles pour n'offrir que le possible.

## Ce qu'on ajoute

1. **Une région ne porte qu'un seul bâtiment.** Refus typé si la région en porte déjà un, quel
   qu'il soit — y compris le QG. La règle vit dans `placementRefusal`, avec les autres : c'est la
   fonction que le serveur refuse avec et que le client interroge pour afficher, une seule
   implémentation.

2. **Un plafond global de bâtiments, indexé sur le QG.** Formule dans `constants.ts`, avec les
   autres placeholders. Ordre de grandeur proposé : `3 + 2 × niveau du QG` — cinq au départ, une
   douzaine au maximum. Refus typé distinct de celui de la région : on doit savoir lequel a mordu.

## Le garde-fou qui compte, et il est exécutable

Le plafond doit rester **strictement inférieur au nombre de régions de la plus petite nation
jouable**, sans quoi le découpage administratif de Natural Earth redevient un équilibrage. Compté
sur les huit nations : Royaume-Uni 232, Italie 110, France 101, URSS 85, États-Unis 51, Japon 47,
Chine 32, **Allemagne 16**.

**Écris un test qui l'assure**, plutôt qu'un commentaire qui le demande : il calcule le plafond au
niveau de QG maximal, le compare au minimum des comptes de régions par nation jouable lus depuis
`region-index.json`, et échoue si le plafond l'atteint. Le jour où quelqu'un montera la formule ou
changera de jeu de données, le test parlera avant le joueur.

C'est la troisième fois que la même erreur se présente déguisée — un chantier par région, puis un
bâtiment par région. Mets la règle générale en commentaire à l'endroit du plafond, pas en tête de
fichier : *aucune quantité de jeu ne se compte en régions ; le QG est l'unique étranglement.*

## Critères d'acceptation

- Poser un second bâtiment sur une région déjà occupée est refusé, avec une erreur typée qui lui
  est propre.
- Dépasser le plafond global est refusé, avec une erreur différente de la précédente.
- Le test du garde-fou existe, passe, et échoue si on porte la formule au-delà de 16 — prouve-le
  une fois.
- `placementRefusal` porte les deux règles ; aucune n'est réimplémentée ailleurs.
- Les libellés d'erreur sont dans `src/i18n/fr.ts`.
- `npm run build` et `npm run test` passent ; aucun terme banni.

## Ce que tu ne fais pas

Tu ne touches pas au client, ni aux sprites, ni à la teinte des régions. Tu ne changes pas le
nombre de chantiers simultanés. Si la règle « une par région » casse un test existant qui posait
deux bâtiments au même endroit, corrige le test — ce n'est plus un cas valide — et dis-le.
