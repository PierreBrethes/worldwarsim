# Prompt Claude Code — l'accueil multi-parties, la suppression, le centrage

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`. Ne commit pas, ne push pas.

## Pourquoi

Le client ne connaît qu'**une** partie : `src/data/token.ts` garde un seul token
(`wws-token`), l'accueil ne propose qu'un seul « reprendre », et supprimer une partie n'est
possible que depuis son salon. Maintenant que le jeu est en ligne, un joueur accumule des
parties (en salon, en cours, conclues) et doit pouvoir les voir toutes, en reprendre une,
et faire le ménage.

Décisions prises (24/08) : le **créateur** détruit sa partie quel qu'en soit l'état ; un
**non-créateur** ne détruit rien — il retire la partie de sa liste locale, la partie survit
pour les autres. Et les écrans Newspaper (accueil + salon) se centrent verticalement.

## 1 — `token.ts` : une liste de tokens, pas un token

`src/data/token.ts` passe d'un token unique à une **liste** (`wws-tokens`, JSON array) plus
un **token actif** (l'existant `wws-token` garde ce rôle — migration gratuite : un ancien
client a déjà son token actif, l'ajouter à la liste au premier chargement).

- `keepToken(token)` : ajoute à la liste (sans doublon) et rend actif.
- `forgetToken(token)` : retire de la liste ; si c'était l'actif, efface l'actif.
- `useToken()` inchangé dans son contrat (le token actif, réactif) ; ajoute `useTokens()`
  sur le même `useSyncExternalStore` — la synchronisation multi-onglets existante
  (annonce manuelle + événement `storage`) couvre les deux clés.

Tous les appels existants de `forgetToken()` (sans argument) passent au token actif —
vérifie chaque site d'appel.

## 2 — Serveur : un aperçu pour plusieurs tokens

`convex/seasons.ts` : une query `previews({ tokens: v.array(v.string()) })` qui rend, pour
chaque token encore valide (les tokens morts sont silencieusement omis — la partie a été
détruite) : code, statut (`lobby` / `launched` / `concluded`), format (durée), nation et
pseudo du joueur, `creator`, date de création. Réutilise la mécanique de l'actuelle
`preview` ; garde `preview` si l'accueil s'en sert encore, sinon remplace-la.

## 3 — Accueil : la liste « Mes parties »

Dans `src/routes/accueil.tsx`, remplace l'unique « reprendre » par une section listant
chaque partie de `useTokens()` via `previews` : code, statut lisible, nation si choisie.
Par ligne :

- **Reprendre** : rend ce token actif puis navigue — salon si `lobby`, plateau sinon
  (une partie `concluded` s'ouvre aussi : la une de victoire est un écran qu'on revisite).
- **Créateur → Supprimer** : la confirmation en deux clics existe déjà — extrais
  `DestroyButton` de `src/routes/salon.tsx` en composant partagé et réutilise-le tel quel
  (deux clics, le second n'est pas au même endroit). À la confirmation :
  `destroy({ token })` puis `forgetToken(token)`.
- **Non-créateur → Retirer de ma liste** : même pattern de confirmation, mais l'avertissement
  dit la vraie conséquence : le token est perdu, `join` avec le code créerait un **nouveau**
  joueur — la nation jouée reste orpheline. Aucun appel serveur : `forgetToken(token)` seul.

Textes dans `src/i18n/fr.ts`, style presse comme le reste (pas d'emoji, pas de « êtes-vous
sûr ? » littéral — regarde `destroyConfirm` existant).

## 4 — `destroy` : la purge est incomplète, complète-la

`convex/seasons.ts` → `erasePlayer` efface resources, buildings, troops, recruitments,
constructions — **mais le schéma a grandi depuis** : movements, outposts, orders,
engagements, sightings restent orphelins après un `destroy` d'une partie lancée. Ouvre
`convex/schema.ts` et fais l'inventaire toi-même plutôt que de recopier cette liste :
toute table portant des lignes d'un joueur ou de la saison doit être purgée. Un test le
verrouille : une saison lancée avec au moins un mouvement, un avant-poste et un engagement,
`destroy`, puis assertion que **chaque** table du schéma est vide de toute ligne liée à
cette saison — écrit en itérant sur les tables, pour que la prochaine table ajoutée au
schéma fasse échouer le test si la purge l'oublie.

`destroy` reste réservé au créateur (`CREATOR_ONLY`) et ne prend aucune condition de
statut : on détruit un salon, une partie en cours ou une conclue à l'identique.

## 5 — Centrage vertical des écrans Newspaper

`src/shell/Newspaper.tsx` : le conteneur scrollable garde `overflow-auto`, mais le journal
se centre verticalement quand il tient dans la fenêtre. **Pas** `items-center` sur le
parent (ça tronque le haut d'un contenu plus grand que l'écran) : retire `items-start` et
mets `m-auto` sur l'enfant `hud` — auto-marges = centré quand ça tient, scroll intact
quand ça déborde. Ça s'applique à l'accueil comme au salon, c'est voulu.

## Vérifications

`npm run verifier` complet. Puis à la main : accueil avec deux parties dans la liste
(une créée, une rejointe), reprise croisée, suppression d'une conclue, retrait d'une
rejointe, et le salon centré verticalement à 1080p.
