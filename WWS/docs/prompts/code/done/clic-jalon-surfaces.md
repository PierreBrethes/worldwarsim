# Prompt Claude Code — le clic sur un jalon ouvre sa surface

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md` et la proposition
[clic-batiment-et-surfaces.md](../../design/propositions/clic-batiment-et-surfaces.md), qui porte
la table complète. Ne commit pas, ne push pas.

**Prérequis : `fenetre-industrie.md` et `ameliorer-sur-la-ligne.md` sont passés.** Brancher un clic
vers une fenêtre qui n'existe pas n'apprend rien au joueur. Sinon, arrête-toi.

## Le principe

> **Un clic ouvre la surface où l'on *utilise* le bâtiment, pas celle où on l'entretient.**

Sans lui, quinze bâtiments donnent quinze règles arbitraires. Le verbe du clic est toujours le
même : *voir ce que ce bâtiment fait pour moi.*

## La table des quinze

| Fenêtre | Focus à l'ouverture | Bâtiments |
|---|---|---|
| **Production** | section du domaine dépliée, **site présélectionné** | `barracks` `airfield` `port` |
| **Production** | ligne du plafond de troupes | `billets` |
| **Industrie** | ligne du bâtiment | `farm` `mill` `mine` `oilWell` `foundry` `arsenal` `quartermaster` `warehouse` `depot` `listening` |
| **Nation** | fiche du QG | `hq` |

Quatre destinations, quinze bâtiments, aucune exception. Dérive la table d'un `Record<BuildingKey,
…>` **complet** — une clé ajoutée au domaine sans destination doit casser la compilation, jamais
produire un clic mort. C'est la même exigence que `BUILDING_SPRITES` dans
`src/emblems/buildings/manifest.ts`.

## Le lien porte l'instance, jamais la clé

Une nation peut tenir trois casernes. L'état d'URL est :

```
?building=<Id<'buildings'>>
```

**Jamais `?building=barracks`** — sinon un clic sur la caserne de Bretagne ouvre celle de
Normandie. Ajoute le champ à `BoardSearch` dans `src/routes/plateau.tsx`, à côté de `windows` et
`send`, et valide-le dans `validateSearch` comme le reste.

Il suit la même discipline que `send` dans `withoutWindow` : **un focus appartient à la fenêtre qui
le porte et s'en va avec elle.** Fermer Industrie doit retirer `building` de l'URL, sinon rouvrir la
fenêtre plus tard ressuscite un focus que personne n'a demandé.

**Un identifiant périmé n'est pas une erreur.** Un bâtiment rasé entre deux lectures laisse un
`building` qui ne pointe sur rien : la fenêtre s'ouvre sans focus. Le repli est déjà écrit ailleurs
dans le projet — `ProductionWindow` fait exactement ça pour un site sélectionné disparu (« *a stale
id selected, and the first site of the domain is the honest fallback* »). Aligne-toi dessus.

## Le clic n'est pas à créer, il est à brancher

`src/styles/labels.css` porte déjà tout :

- `.label--clickable` met `cursor: pointer` sur la flaque et le bloc ;
- `.label::before` — la flaque au pied du mât — a `pointer-events: auto` et est documentée comme
  « *the click target, the role the pictogram used to hold* » ;
- `.label-plate` est la vignette du bâtiment, rendue dans `src/map/MapLabels.tsx`.

Le jalon d'un bâtiment doit devenir cliquable ; les autres jalons ne changent pas de comportement.

**Vérifie le conflit avec la carte avant d'écrire quoi que ce soit.** Le clic droit est pris par la
rose des vents. Le clic **gauche** sur la carte sélectionne-t-il déjà une région ? Si oui, un clic
sur un jalon doit stopper la propagation — un clic qui ouvre une fenêtre *et* change la sélection
est un bug qu'on ne voit qu'à l'usage. **Si le conflit est plus profond qu'un `stopPropagation`,
arrête-toi et dis-le.**

## Ce que le focus veut dire, concrètement

- **Production** : la section du domaine est visible sans défilement et le sélecteur de site porte
  déjà le bon `Id`. La fenêtre **n'a pas d'onglets** — elle empile trois sections de domaine,
  chacune avec son `<select>` (`DOMAINS.map`, `sitesOf(domain)`). Ne construis pas de système
  d'onglets : le sélecteur existe, il attend une valeur.
- **Industrie** : la ligne du bâtiment est visible et signalée. Une mise en évidence discrète, pas
  une couleur d'alerte — `--critical` sert l'urgence, pas la désignation.
- **Nation** : la fiche du QG est visible.

## Critères d'acceptation

- Cliquer une caserne ouvre Production avec **cette** caserne présélectionnée, pas une autre.
- Cliquer une mine ouvre Industrie sur la ligne de **cette** mine.
- Cliquer le QG ouvre Nation.
- Fermer la fenêtre retire `building` de l'URL.
- Une URL portant un `building` détruit ouvre la fenêtre sans focus et sans erreur.
- L'URL est partageable : recharger la page rouvre le même écran.
- Un clic sur un jalon ne modifie pas la sélection de région.
- La table des destinations est un `Record<BuildingKey, …>` complet : retirer une entrée casse la
  compilation.
- `npm run build` et `npm run test` passent ; aucun terme banni.

## Ce que tu ne fais pas

Pas de nouvelle fenêtre, pas de refonte visuelle, pas de clic sur les jalons de mouvement ni sur
les avant-postes — un seul geste à la fois. Aucun bâtiment adverse n'est cliquable, pour la raison
habituelle : il n'arrive jamais dans `PlayerView` (ADR 0005).
