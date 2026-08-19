# Prompt Claude Code — la déroute reflue vers le ravitaillement

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, puis l'**ADR 0019 §3** — le paragraphe des
précisions ratifiées, amendé le 19/08 : c'est la décision que ce prompt applique. Ensuite
`convex/movements.ts` (`sendHome`, `sendCampsHome`, `attachHome`) et `src/domain/outposts.ts`
(`nearestOutpostKm`). Ne commit pas, ne push pas. **Petit prompt, un seul sujet.**

## La décision (19/08)

**Toute force en déroute dont l'adresse est un point reflue vers son ancrage le plus proche** —
le sol national, ou un de **ses** avant-postes. C'est le même ensemble que celui de l'entretien
×1 et du « sol reconnu » de la visée : une seule notion de « chez soi élargi », trois lecteurs.
L'avant-poste gagne son troisième rôle sans règle nouvelle : il ouvre le terrain, il nourrit, il
**rallie**.

Elle remplace deux comportements de la veille :

- le campement vaincu sur place rentrait « au pays » via la capitale (`sendCampsHome`) — il
  reflue désormais vers l'ancrage le plus proche, qui peut être un avant-poste à 300 km plutôt
  que la capitale à 2 000 ;
- la colonne **partie d'un campement** et mise en déroute en chemin se **téléportait** à son
  point de départ (`sendHome` l'ignorait). Plus jamais : elle marche, comme tout le monde — le
  temps de trajet est réel aussi pour les vaincus.

Une colonne partie d'un **bâtiment** continue de rentrer à son bâtiment — rien ne change pour
elle.

## Ce que tu codes

Une fonction unique — `nearestAnchor(playerId, from)` ou approchant — qui répond : le point de
ralliement le plus proche parmi **la capitale** (l'unique coordonnée de « chez soi » que le jeu
écrive, ADR 0015 — ne pas inventer une frontière) et **les avant-postes du joueur**. Elle
réutilise `nearestOutpostKm` ; elle ne duplique pas sa géométrie.

- Si l'ancrage gagnant est un **avant-poste**, le `return` y marche et la colonne arrivée devient
  sa **garnison** (`stationedAt` reçoit l'avant-poste) — l'adresse existe déjà.
- Si c'est la **capitale**, comportement d'hier : trajet visé sur elle, adresse `null` à
  l'arrivée.
- **Un avant-poste désactivé rallie quand même.** Il héberge déjà sa garnison en étant désactivé
  (ADR 0004 : le raid désactive, ne prend jamais) — refuser le ralliement créerait un troisième
  état. Ce qu'il perd en étant désactivé, c'est ses effets, pas son adresse. Dis-le en
  commentaire ; c'est le genre de distinction qu'on relit.
- Le repli existant tient : sans route et sans nation, la troupe passe à `null` sur-le-champ —
  elle rentre quand même, elle ne meurt pas (règle n°3).

Le calcul se fait **au moment de la déroute**, une fois. Un avant-poste fondé ou détruit pendant
que le `return` vole ne change pas sa destination — même règle que l'interception, même raison.

## Un coin à trancher en codant, pas à taire

Le `return` peut arriver sur un point désormais tenu par l'ennemi — l'ancrage était un
avant-poste, il a été détruit entre-temps, ou un campement adverse s'est posé dans le rayon
d'arrivée. Dis ce que fait l'arrivée d'un `return` dans ce cas, et pourquoi. Ma préférence : le
`return` **n'engage jamais** — des survivants ne relancent pas une passe — et la colonne se pose
là où elle arrive, à ses risques ; mais c'est toi qui vois le code, tranche et écris-le.

## Critères d'acceptation

- Un test : campement vaincu à 300 km d'un de ses avant-postes et à 2 000 km de sa capitale → le
  `return` vise l'avant-poste, la colonne arrivée est sa garnison.
- Un test : colonne partie d'un campement, mise en déroute en chemin → un `return` réel, aucune
  téléportation — le test échoue si `stationedAt` retrouve le point d'origine sans mouvement.
- Un test : aucun avant-poste → capitale, adresse `null` à l'arrivée (le comportement d'hier,
  conservé).
- Le coin du `return` qui arrive en terrain tenu est testé, quel que soit ton choix.
- Aucun `return` ne consomme de slot ni ne demande de porte. Aucun texte hors de
  `src/i18n/fr.ts`. Aucun terme banni. `npm run build` et `npm run test` passent.

## Ce que tu ne fais pas

Tu ne changes pas le retour des colonnes parties d'un bâtiment. Tu ne touches ni à l'entretien ni
au repérage. Tu ne fais pas d'un avant-poste **allié** un point de ralliement — même décision que
pour le ravitaillement, même raison : pas de monnaie diplomatique avant la diplomatie.
