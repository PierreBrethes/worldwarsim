# Prompt Claude Code — la visée ne trouve rien au dézoom

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, puis
`src/domain/movement-orders.ts`, `src/routes/-plateau/` (la visée et la rose des vents) et
`src/map/engine/`. Ne commit pas, ne push pas. **Petit prompt, un seul sujet.**

## Le défaut

`MovementAim` n'accepte que deux formes (`movement-orders.ts:10-12`) : une région, ou un
avant-poste. La visée retourne donc `null` pour un pays.

Or les régions admin-1 ne sont affichées qu'au rapproché — moins de 65 unités de caméra
(`CLAUDE.md`). Au-delà, la carte ne propose que des pays, la visée ne trouve rien, et **le clic
droit est mort pour n'importe quelle colonne, sur n'importe quelle cible**. C'est le défaut le
plus fréquent des deux remontés le 18/08 : il ne demande ni avant-poste, ni garnison, seulement
d'avoir dézoomé.

Ce n'est pas un défaut de règle. Le pays n'est pas une cible de mouvement et n'a pas à le
devenir — l'ADR 0013 pose les bâtiments sur des régions, l'ADR 0004 refuse toute couche de
conquête à l'échelle du pays. Le défaut est que **rien ne le dit et rien n'y remédie**.

## Ce que tu codes

Trois issues possibles. Instruis-les, choisis, et dis pourquoi dans le commentaire du module.

1. **La visée rapproche la caméra.** Entrer en visée alors qu'on est au-delà du seuil fait voler
   la caméra sous 65 unités, comme le clic sur une carte du widget de troupes le fait déjà. La
   visée n'existe qu'au rapproché, et l'interface s'y met d'elle-même. C'est ma préférence : elle
   ne demande aucune règle nouvelle et supprime l'état où le clic droit est mort.
2. **Le pays devient une visée qui refuse en le disant** — une troisième forme de `MovementAim`
   dont tous les types sont refusés avec un motif propre (« approchez pour viser une région »).
   Honnête, mais elle ajoute une forme au type pour ne rien porter.
3. **Le seuil disparaît en visée** : les régions s'affichent quel que soit le zoom dès qu'une
   colonne est armée. Vérifie le coût de rendu avant de la proposer — le seuil de 65 existe pour
   une raison.

Quelle que soit l'issue, l'état « je suis en visée et rien ne répond » doit disparaître.

## Critères d'acceptation

- Depuis un plateau dézoomé, préparer un mouvement puis viser aboutit à une rose des vents ou à
  un refus lisible — jamais à un silence.
- Le choix retenu est justifié en commentaire par un *pourquoi*, jamais par un *quoi*
  (`CONVENTIONS.md`).
- Si tu retiens l'issue 1, la caméra ne se déplace qu'à l'entrée en visée, jamais pendant.
- Aucun texte affiché hors de `src/i18n/fr.ts` (ADR 0016).
- Aucun terme banni. `npm run build` et `npm run test` passent.

## Ce que tu ne fais pas

Tu ne fais pas du pays une cible de mouvement légale. Tu ne touches ni à `refusalOf`, ni au
schéma Convex, ni à la rose muette de la garnison — elle a son propre prompt.
