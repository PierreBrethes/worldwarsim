# Prompt Claude Code — capituler : « défaite : observer »

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, `convex/seasons.ts` (`conclude`),
`convex/players.ts`, `src/routes/accueil.tsx` (l'entrée « reprendre la partie »), et
`convex/victory.ts`. Ne commit pas, ne push pas. Un seul commit, préparé mais pas créé.

## Pourquoi

Décisions de Pierre (31/08) : un joueur peut **déclarer sa défaite** — il ne joue plus, il
observe. Et c'est l'événement qui referme le trou du fondateur : personne ne « quitte » jamais
une saison dans le code, donc le transfert du commandement n'avait rien où s'accrocher — la
capitulation le lui donne.

## Ce qui change

**Schéma** : `players.defeated: v.optional(v.boolean())` (absent = en jeu, même tolérance que
les champs legacy).

**`players.surrender`** (nouvelle mutation) : saison lancée seulement, irréversible, avec
confirmation côté client (pattern du bouton-tampon de `seasons.conclude`). Effets :

1. `defeated: true`. Toute mutation de jeu du défait est refusée ensuite (ordres, construction,
   recrutement, fondation, amélioration) — trouve la porte commune la plus étroite plutôt que
   d'éparpiller le contrôle. **Le canal général reste ouvert** : un observateur parle.
2. **Transfert du commandement** : si le capitulant est `creator`, le titre passe au plus ancien
   joueur **non défait** (`_creationTime`). Invariant en test : un seul `creator` par saison.
   Une dépêche journal sobre : « X prend la direction de la partie ».
3. **Dépêche publique** : « X capitule », datée, pour tous.
4. **Fin par capitulation générale** : s'il ne reste qu'un joueur non défait, la saison se
   conclut par la sortie commune (`concludeSeason`), `winnerId` = le survivant. C'est une
   victoire, pas une clôture administrative.

**Ce qui ne change pas, et le commit le dit** : les troupes posées du défait restent et
défendent (ADR 0019 — une garnison n'a pas besoin d'ordre), ses avant-postes tiennent, paient
leur entretien et gardent sa couleur tant qu'ils existent, son stock s'épuise (à sec, rien ne
meurt). Le défait reste pillable : capituler n'est pas s'évaporer.

**La vue de l'observateur (décision 47a)** : il garde **sa propre vue**, portée par ses
détecteurs restants — troupes posées, avant-postes — et qui se fige à mesure qu'ils tombent.
**Jamais d'omniscience** : lever le brouillard ferait de la capitulation un acte de
renseignement au profit d'un survivant ami. Concrètement : `PlayerView` continue de se calculer
comme avant ; il n'y a rien à ajouter, seulement à ne rien « débloquer ».

**Front** :
- Accueil/lobby du défait : l'entrée de la saison dit **« Défaite : observer »** au lieu de
  « reprendre la partie » ; elle ouvre le plateau en l'état.
- Sur le plateau, les surfaces d'action du défait se présentent en lecture (les portes serveur
  refusent déjà ; l'UI ne doit pas promettre ce que le serveur refuse — audit du 25/08).
- Le bouton « capituler » vit dans `SettingsWindow` à côté de « clore la saison », avec le même
  pattern de confirmation. Libellés 1940 dans `src/i18n/fr.ts` (« déposer les armes »).

## Vérifications

`npm run verifier`. Tests : capituler → ordres refusés, chat ouvert · le fondateur capitule →
transfert au plus ancien non défait, lui seul peut clore · avant-dernier capitulant → le
survivant gagne (`winnerId`) · les troupes du défait ripostent toujours · sa vue ne montre
toujours pas ce que ses détecteurs ne couvrent pas. À la main : capituler à deux → dépêches,
lobby « Défaite : observer », plateau lisible, victoire du survivant.
