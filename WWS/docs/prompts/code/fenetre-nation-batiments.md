# Prompt Claude Code — la fenêtre Nation devient l'inventaire des bâtiments

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, la fiche
[02 — Économie](../../design/02-economie.md) pour les sept familles, et
`WWS/docs/design/11-brief-ui.md` pour la mise en page des fenêtres. Ne commit pas, ne push pas.

**Prérequis : `rose-des-vents-construire.md` est passé.** Poser un bâtiment se fait à la carte, et
la fenêtre a déjà perdu ses boutons « bâtir ». Sans ça, tu recréerais un second chemin de
construction. Arrête-toi si ce n'est pas le cas.

## Le principe

**Un verbe par surface.** La carte répond à *où ?*, la fenêtre Nation répond à *qu'est-ce que
j'ai ?*.

| Surface | Verbe |
|---|---|
| La carte, au clic droit | **poser** |
| La fenêtre Nation | **améliorer** et **retrouver** |

La fenêtre ne construit rien, jamais. C'est un inventaire et un tableau de bord, pas un
formulaire.

## Ce qui ne va pas aujourd'hui

La fenêtre liste **toutes les régions utilisables** — une par ligne, avec son gisement. C'est
l'inverse de ce qu'on veut : un joueur français a 101 régions, un Britannique 232. Une liste de
places libres n'est pas un inventaire, c'est un catalogue foncier, et elle transforme un jeu de
carte en tableur.

**Ne montre que ce que le joueur possède.**

## Implémentation

1. **Grouper par famille**, celles de l'ADR 0015 — commandement, exploitation, transformation,
   projection, renseignement, plafond, stockage. **Une famille sans bâtiment n'apparaît pas** :
   règle de la rose des vents, rien de grisé jamais. Un joueur qui vient de démarrer ne voit donc
   qu'une ligne, son quartier général, et c'est la vérité.

2. **Une ligne dit ce que le bâtiment fait**, pas seulement qu'il existe. Nom, région, niveau, et
   surtout son **effet chiffré** : « ferme · Côte-d'Or · niveau 2 · +12 nourriture / h »,
   « entrepôt · Nord · niveau 1 · plafond des matières 400 », « caserne · Oise · niveau 1 · forme
   l'infanterie et les véhicules ». C'est ce qui fait la différence entre un inventaire et un
   tableau de bord. Les valeurs viennent des mêmes constantes que le serveur — ne les recalcule
   pas à la main dans le composant.

3. **Améliorer** depuis la ligne : coût du niveau suivant, durée, et le refus s'il y a lieu —
   plafonné par le QG, chantier déjà en cours, matières insuffisantes. Même mutation que la carte,
   mêmes erreurs typées affichées telles quelles. Un seul chantier à la fois par joueur : quand il
   y en a un, la fenêtre le montre en cours, avec son échéance, plutôt que d'offrir un bouton qui
   sera refusé.

4. **Retrouver sur la carte.** Chaque ligne porte une action qui **amène la caméra sur la région**
   du bâtiment. Le moteur a déjà ce qu'il faut : `journeyTo(ids)` dans `src/map/engine/index.ts`,
   documenté comme « amener la cible orbitale sur un ou plusieurs points d'ancrage ». Étends-le au
   besoin pour accepter une région — ne construis pas un second système de déplacement de caméra à
   côté.

   La fenêtre **reste ouverte** : les fenêtres ne sont pas exclusives, et la refermer ferait
   perdre au joueur l'endroit d'où il venait.

5. **L'état vide doit enseigner.** Un joueur qui n'a que son QG doit comprendre *où* on construit.
   Une phrase, pas un bouton : le bouton recréerait le second chemin qu'on vient de supprimer.
   Quelque chose comme « les bâtiments se posent sur la carte, au clic droit sur une région ». Le
   texte va dans `src/i18n/fr.ts`.

6. **Pas de nouveau modèle de fenêtre.** `Window.tsx` et `Panel.tsx` existent, `ProductionWindow`
   et `TroopsWindow` sont les voisines les plus proches : suis leur mise en page plutôt que d'en
   inventer une troisième.

## Critères d'acceptation

- La fenêtre n'affiche **aucune** région où le joueur n'a rien.
- Un joueur fraîchement lancé y voit exactement une ligne : son quartier général, sur la région de
  sa capitale, plus la phrase qui dit où l'on construit.
- Chaque ligne porte un effet chiffré, pas seulement un niveau.
- Améliorer fonctionne et affiche le refus du serveur tel quel ; pendant un chantier, la fenêtre
  montre l'échéance au lieu d'offrir un bouton condamné.
- L'action « retrouver » déplace la caméra sur la bonne région et laisse la fenêtre ouverte.
- Aucun chemin de construction dans cette fenêtre.
- Aucune chaîne française en dur hors de `src/i18n/fr.ts` ; aucun terme banni.
- `npm run build` et `npm run test` passent.

## Ce que tu ne fais pas

Tu ne touches pas à la rose des vents ni au panneau de construction. Tu n'ajoutes pas de
pictogrammes de bâtiment — il n'en existe que trois sur quinze, cette fenêtre est en toutes
lettres. Tu ne traites pas la hiérarchie des huit compteurs du bandeau : c'est la question ouverte
de la surface 4.5, et elle mérite son propre brief.
