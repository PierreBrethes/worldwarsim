# Prompt Claude Code — l'adresse de la colonne fondatrice

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, l'ADR `0014`, puis
`convex/movements.ts`. Ne commit pas, ne push pas. **Petit prompt, un seul sujet** — il précède
`combat-sequentiel.md` et lui prépare le terrain.

## Le défaut

À l'arrivée d'un mouvement `outpost`, la colonne fondatrice passe à `stationedAt: null` — « elle
ne pend à rien ». Conséquence mesurable : ces troupes ne sont plus acceptées par aucune mutation
(`foundOutpost` exige une caserne), comptent dans le plafond, et selon la lecture de `null` par
la vue, s'affichent comme si elles étaient à domicile — alors qu'elles ont marché jusqu'en
Arabie. Le commentaire du module dit lui-même que `stationedAt` est « un rattachement, jamais
une position » : un avant-poste **est** un rattachement valide. Décision du 18/08 : la colonne
fondatrice devient la **garnison** de l'avant-poste qu'elle fonde.

## Ce que tu codes

- Le schéma : `stationedAt` accepte un avant-poste en plus d'un bâtiment (union d'ids, ou champ
  parallèle si l'union est pénible dans Convex — dis lequel tu choisis et pourquoi). Une troupe
  a toujours **exactement un** rattachement ou est en mouvement, jamais les deux, jamais aucun.
- `movements.arrive` rattache la colonne à l'avant-poste fondé au lieu de la détacher.
- L'inventaire (`src/domain/troops.ts`) sert la situation `garrison` qui existe déjà dans
  `TroopSituation` — avec l'avant-poste et son pays hôte. La vue suit ; l'écran peut dire
  « en garnison — Arabie saoudite ».
- **Aucun effet de combat** : c'est une adresse, pas une règle. La garnison ne défend rien tant
  que `combat-sequentiel.md` n'est pas passé — et c'est lui qui s'en chargera.

## Critères

- Les tests existants passent ; un nouveau cas dans `movements.test.ts` : la colonne arrivée est
  rattachée à l'avant-poste, visible dans l'inventaire en `garrison`, refusée par `foundOutpost`
  (elle n'est pas dans une caserne), comptée dans le plafond de troupes.
- Aucune troupe de la base ne peut se retrouver avec `stationedAt: null` hors mouvement — si un
  autre chemin le produit encore, dis-le au lieu de le rustiner.
- Aucun terme banni.
