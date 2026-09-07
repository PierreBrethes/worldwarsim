# Simulation et état de référence

Deux choses vivent ici, et aucune n'est un prototype de jeu.

## L'état de référence — exporté, plus jamais simulé

`ETAT-REFERENCE.md` est la vue d'un joueur sur une **saison réellement jouée**, brouillard
appliqué : ce que `playerView` et `control.held` servent à son jeton, mis en pages. C'est ce
qu'on donne à un designer.

```bash
node scripts/exporter-etat-reference.mjs --token=…   # interroge le backend, écrit les deux
node scripts/exporter-etat-reference.mjs             # rend le Markdown depuis le JSON déjà là
```

Le jeton se lit dans l'URL de plateau du joueur. Le script appelle `dev.snapshot`
(`convex/dev.ts`), une `internalQuery` qui **rappelle les fonctions de la vue** au lieu d'en
recopier une projection — une copie aurait divergé au premier champ ajouté, et le document
aurait recommencé à décrire un jeu que personne ne joue.

| Fichier | Rôle |
|---|---|
| `etat-reference.json` | l'instantané brut, tel que le serveur l'a servi |
| `ETAT-REFERENCE.md` | le même, lisible — chaque section titre le champ dont elle sort |

Les deux sont **absents tant que personne n'a exporté** : ils ne sont pas dans le dépôt par
défaut, et c'est voulu — un état de référence périmé trompe plus qu'il n'aide.

## Le simulateur d'ouverture — `opening/`

L'instrument de mesure vivant : combien de décisions un joueur prend pendant l'ouverture d'une
saison, et à quels moments. Il a son propre [README](opening/README.md). `verify.mjs` en est le
miroir de constantes, lu par `npm run verifier`.

**La production reliée ne l'a pas touché** (ADR 0020 §6, livrée le 07/09) : il n'a pas de carte,
donc pas de couleur, donc rien à couper — tout y produit comme sur un sol national, qui est de
toute façon ce que mesure une ouverture. Le jour où il posera un avant-poste, il devra le dire.

## Ce qui a été retiré — `../docs/_to_delete/simulation-v1/`

Le simulateur de saison complète (`sim.mjs`, `run.mjs`, `derniere-sortie.txt`, `resultats.json`,
`world.json`) et son générateur d'instantané (`etat-reference.mjs`, avec le JSON et le Markdown
qu'il avait produits) y sont rangés. Ils mesuraient un jeu d'avant les ADR 0013 à 0015 :
doctrines, acier, effectifs, slots 3/3 — plus une ligne n'en vaut. Ce que ces campagnes ont
appris est déjà écrit dans `docs/technique/rapport-simulation.md`, et le nouvel état de
référence sort d'une vraie partie.
