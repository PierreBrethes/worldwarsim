# Prompt Claude Code — schéma économie v2 + troupes discrètes (ADR 0014, 0015)

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, puis les ADR
`0013`, `0014` et `0015` avant d'écrire quoi que ce soit. Ne commit pas, ne push pas.

**Prérequis : le prompt `gisements-par-region.md` est passé** — `regions.json` porte
des `id` stables et `public/gisements.json` existe. Sans eux, arrête-toi.

## Contexte

Le schéma actuel (`convex/schema.ts`) vit encore dans l'économie v1 (ravitaillement /
acier / effectifs), des bâtiments nationaux non localisés, et des unités-compteurs
sans position (ADR 0011, révisée). L'ADR 0015 grave huit ressources, quatorze
bâtiments posés sur des régions et une production localisée ; l'ADR 0014 grave des
troupes discrètes. On refond la tranche entière. Pas de migration de données : le jeu
fonctionne par saisons wipées, les tables se remplacent.

**Repère d'abord l'existant** et liste-le-moi avant de coder : `convex/schema.ts`,
`ressources.ts`, `unites.ts`, `chantiers.ts`, `constantes.ts`, `saisons.ts`,
`src/domaine/troupes.ts`, `src/domaine/vue-joueur.ts`, et la surface 4.6.

## Implémentation

1. **Ressources.** Huit clés : `nourriture`, `tissus`, `charbon`, `petrole`,
   `minerais`, `alliage`, `munitions`, `bandages`. Garde l'accrual paresseux
   (`stock`, `majLe`) mais le taux n'est plus stocké : il se **calcule** à la lecture
   depuis les bâtiments d'exploitation du joueur et le gisement de leur région.
   Plafond de stock bas par défaut, relevé par les entrepôts et dépôts du joueur
   (l'entrepôt plafonne matières et alliage, le dépôt pétrole et munitions — leur
   mort diffère, leur plafond aussi).

2. **Transformation.** Fonderie (minerais + charbon → alliage), arsenal (alliage →
   munitions), intendance (tissus → bandages). Conversion **continue et paresseuse**,
   au même rythme que l'accrual : à chaque lecture, le temps écoulé convertit ce que
   les intrants permettent, borné par le niveau du bâtiment. Pas de file, pas d'ordre
   du joueur : construire la fonderie *est* la décision.

3. **Bâtiments.** Une table `batiments` localisée : `joueurId`, `cle` (les quatorze
   de l'ADR 0015), `regionId` (l'`id` de `regions.json`), `niveau`. Contraintes à
   l'écriture : QG unique par joueur ; mine, puits, ferme, filature exigent le
   gisement correspondant dans la région (la mine sort charbon *ou* minerais selon le
   gisement) ; port en région côtière ; hors de son territoire, une pose exige un
   avant-poste dans le rayon — si les avant-postes ne sont pas encore portés par le
   schéma, pose la contrainte « chez soi seulement » et signale-le, ne l'invente pas.
   `chantiers` suit : `regionId` + `batiment` + `finitLe`, un chantier à la fois par
   région.

4. **Troupes.** Remplace `unites` par `troupes` : une ligne **par troupe** —
   `joueurId`, `role`, `mk`, `effectifNominal`, `effectifCourant`, `specialisation`
   (union discriminée par rôle, `null` tant que la recherche n'existe pas),
   `rattachement` (le bâtiment de projection où elle stationne). Pas de position
   libre : une troupe est rattachée, les mouvements viendront la déplacer (4.7).
   Le nombre de troupes d'une nation est borné (constante, ordre 10–30). La somme
   des `effectifNominal` respecte le plafond d'hommes porté par les casernements.

5. **Recrutement.** Une file séquentielle **par bâtiment de projection** — la caserne
   forme le terrestre, l'aérodrome l'aérien, le port le maritime (aligne-toi sur
   `DOMAINE_PAR_ROLE`). Datation paresseuse conservée : seule la tête d'une file
   porte `finitLe` ; annulation remboursée d'un lot non commencé. À l'achèvement, le
   lot devient une **troupe** rattachée au bâtiment producteur. Un lot = une troupe
   entière (son effectif nominal), pas un compteur.

6. **Constantes.** Réécris `convex/constantes.ts` : coûts d'unités **en matières**
   (alliage surtout, munitions pour l'emport initial — plus d'acier, plus
   d'effectifs), débits d'exploitation par gisement et par niveau, ratios de
   transformation, entretien en nourriture par troupe, consommation de pétrole des
   motorisés (constante posée, consommée réellement par 4.7 plus tard), plafonds de
   stock, kit de départ de l'ADR 0015 (de quoi bâtir caserne + ferme + filature, plus
   une avance d'alliage et de munitions). Tout est placeholder, dit tel quel en tête
   de fichier — c'est le seul endroit à corriger quand le simulateur reprendra.

7. **Domaine et vue.** Adapte `src/domaine/troupes.ts` et `vue-joueur.ts` : la vue
   liste des troupes (effectif lisible « 50 soldats », rattachement) et huit stocks.
   `VueJoueur` reste la seule forme qui sort du serveur — aucun stock ni aucune
   troupe d'un adversaire ne transite, structurellement.

8. **Surface 4.6 et tests.** Adapte la production au minimum pour que tout compile et
   fonctionne (choix du bâtiment producteur, files par bâtiment) — la refonte
   visuelle attendra un brief. Réécris les tests : `unites.test.ts` gravait « l'acier
   ne vient de nulle part » ; grave l'inverse — une ferme sur gisement nourrit, une
   fonderie convertit, une caserne forme une troupe, le plafond d'hommes bloque.

## Critères d'acceptation

- Un joueur avec mine (région à charbon) + fonderie voit son alliage monter sans
  aucune action, et s'arrêter quand minerais ou charbon manquent.
- Bâtir une mine sur une région sans gisement est refusé par le serveur.
- Deux lots en file dans une caserne : seul le premier porte `finitLe` ; annuler le
  second rembourse intégralement ; le premier achevé apparaît comme troupe rattachée
  à cette caserne.
- Créer une troupe au-delà du plafond d'hommes des casernements est refusé.
- `npm run build` et `npm run test` passent ; aucun terme banni nulle part.

## Ce que tu ne fais pas

Pas de combat, pas de soin, pas de mouvements de troupes, pas d'espionnage, pas de
recherche/spécialisations actives, pas d'avant-postes s'ils n'existent pas déjà, pas
de rendu des gisements sur la carte, pas de refonte visuelle de 4.6. Si une de ces
frontières bloque la compilation, signale-le et arrête-toi plutôt que de déborder.
