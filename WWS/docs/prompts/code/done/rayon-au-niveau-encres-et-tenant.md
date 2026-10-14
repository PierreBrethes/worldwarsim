> **Historique (14/10/2026) : `SEAT_INKS` n'existe plus dans le code ; ce prompt est livré et gardé pour mémoire.**

# Prompt Claude Code — retouches du contrôle visuel : rayon au niveau, encres franches, tenant à l'infobulle

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/docs/adr/0020-domination-par-couleur.md`,
`src/domain/control.ts`, `convex/sites.ts`, `convex/surveys.ts`, `src/map/engine/regions.ts`,
`src/routes/-plateau/GroundPanel.tsx`. Ne commit pas, ne push pas. Un seul commit, préparé mais
pas créé.

## Pourquoi

Premier contrôle visuel en prod (31/08 au soir), trois constats de Pierre : la zone d'un
avant-poste est **beaucoup trop grande** (400 km de rayon = un quart de la France) · **sa propre
encre se lit grise** (lavis trop timide) · l'infobulle d'une région tenue hors du pays hôte dit
**« avant-poste : aucun »** alors que la carte la peint — deux surfaces qui se contredisent, le
fil « cohérence UI ↔ serveur » de l'audit.

## 1. Le rayon suit le niveau (décision 49a)

`OUTPOST_REACH_KM = 400` devient **`outpostReachKm(level)`** : 120 / 180 / 240 km pour les
niveaux 1 / 2 / 3. **Placeholders assumés, `@a-mesurer`**, même statut que les valeurs
d'entretien.

La règle de l'ADR 0020 §1 ne change pas — *là où je peux bâtir est là où je tiens* — les deux
montent ensemble avec le niveau. Remplace la constante **partout où elle signifie le rayon d'un
avant-poste**, en passant le niveau du point concerné : la pose de bâtiments
(`constructions.ts`), l'ancrage des sites (`sites.ts`), le contrôle (`control.held`,
`heldRegions`), les relevés (`surveys.ts` : `standingObserversOf`, `surveyFoundation`),
l'entretien par ancrage des troupes (`economy.ts`). Fais l'inventaire par grep avant, et si un
usage ne connaît pas de niveau (un écran, un texte), dis-le dans le commit plutôt que
d'improviser.

⚠️ C'est un **nerf réel** : des bâtiments existants peuvent se retrouver hors du rayon réduit de
leur avant-poste. Ne déplace rien, ne détruis rien — l'ancrage écrit à la pose (`outpostId`)
reste ; seules les **nouvelles** poses lisent le nouveau rayon. Note dans le commit que les
saisons en cours gardent des bâtiments « au large » — c'est l'alpha, le wipe les emportera.

Mets à jour la note de l'ADR 0020 §1 (révision datée, une ligne) et le registre `@a-mesurer`.

## 2. Les encres s'affirment (décision 50a)

Un joueur doit reconnaître sa couleur au premier regard — aujourd'hui `#2f5d7c` en lavis léger se
lit gris. Deux réglages, en restant dans la DA 1940 (des encres, jamais des néons) :

- monte l'opacité du lavis **« à jour »** (le plancher `FADED_WASH` des relevés ne bouge pas —
  le contraste franc/délavé est une information, ADR 0020 §5) ;
- sature légèrement les huit `SEAT_INKS` — chacune doit rester distincte à la découpe ET
  identifiable comme « une couleur », pas comme du terrain.

Vérifie le rendu des huit sur le terrain clair et sur la mer si elle borde (capture d'écran de
contrôle bienvenue dans le rapport).

## 3. L'infobulle dit le tenant (le bug de cohérence)

`GroundPanel.tsx:49` répond à une question d'avant la couleur : « ai-je un avant-poste dans **ce
pays** » (`hostCountry === country`). Sur une région tenue d'un pays voisin, ça affiche
« avant-poste : aucun » pendant que la carte la peint. Deux questions, deux lignes :

- **« tenue par »** : le tenant de la région survolée, lu depuis les données que `control.held`
  sert déjà au client (les claims/encres par région — n'invente pas une seconde requête) ; à jour
  = le nom franc, relevé = « URSS — relevé du 12 août », inconnue = la ligne ne s'affiche pas.
- **« avant-poste »** : garde son sens actuel (l'avant-poste posé dans ce pays), il est juste —
  c'était l'étiquette qui mentait par omission.

Libellés dans `src/i18n/fr.ts` (`selectedCountry`), vocabulaire 1940, pas de « contrôlée par ».

## Vérifications

`npm run verifier`. À la main : fonder un avant-poste niveau 1 → la tache fait ~120 km et se lit
comme SA couleur → survoler une région tenue hors du pays hôte → « tenue par : <nation> » et
« avant-poste : aucun » cohabitent sans se contredire → améliorer l'avant-poste → le rayon
s'étend.
