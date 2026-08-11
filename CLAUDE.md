# WorldWarSim — codebase

Jeu de stratégie web asynchrone, carte du monde réel, esthétique presse illustrée 1940.
**La documentation, les décisions et le simulateur vivent dans `WWS/`** — ce dépôt ne
contient que le code.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # types + build
npm run test     # vitest
```

## Ce qui existe

Les surfaces 4.1 à 4.4 : le plateau (carte 3D, bandeau nation, rail, panneaux d'angle), le
journal d'événements, la colonne des mouvements en cours et l'envoi d'un mouvement. Les données
viennent du backend Convex quand un jeton de partie existe (accueil → salon → saison réelle,
carte vierge), du fixture `public/etat-reference.json` sinon. Le backend couvre le hors-saison et
l'état de nation (ADR 0009, 0010) ; mouvements et combat n'existent pas encore : « envoyer » ne
fait rien, le rejeu attend la surface 4.7.

## Architecture

```
src/domaine/     TS pur. Aucune importation React ni Convex. Testé.
src/donnees/     adaptateurs : d'une source vers VueJoueur. Deux : le fixture, et Convex.
convex/          schéma + fonctions serveur (hors-saison, état de nation). Testé (convex-test).
deploiement/     docker compose (backend Convex auto-hébergé + front), guide VPS et CI.
src/carte/       moteur three.js impératif + un composant React qui l'enveloppe.
src/coque/       bandeau + rail, partagés par toutes les surfaces.
src/routes/      une route par surface ; `-dossier/` = composants privés à cette route.
```

**`VueJoueur`, jamais `EtatPartie`.** Le client ne reçoit pas le monde, seulement ce qu'un joueur a
le droit d'en voir. Le nom du type est la première défense contre la fuite d'information.

**Les états d'arc sont une union discriminée.** Un arc adverse n'a structurellement ni `type` ni
`pile` — on ne peut pas les afficher par distraction. C'est le brouillard garanti par le
compilateur, pas par la relecture.

**Le moteur de carte n'importe pas React.** Une classe impérative, une API d'appels, une seule
frontière : `Carte.tsx`. La géométrie est cuite une fois ; react-three-fiber n'apporterait rien ici
et coûterait un modèle mental de plus.

**La courbure est appliquée côté CPU**, jamais dans un shader : sinon le raycasting vise une
géométrie plate et le clic tombe à côté sur les bords de la carte.

## Conventions

Elles sont dans [CONVENTIONS.md](CONVENTIONS.md) et font autorité. Les quatre qui structurent le
plus le dépôt :

- **Penser local.** Un sous-composant vit à côté de son unique usage ; on ne le remonte que quand un
  deuxième appelant apparaît, et du bon nombre de crans.
- **Pas de commentaire descriptif.** Un commentaire explique un *pourquoi*, jamais un *quoi*.
- **Nommer pour être repris.** Le nom porte l'intention ; `VueJoueur` plutôt que `EtatPartie` est
  déjà une décision de sécurité.
- **Tidy first.** Ranger et changer le comportement sont deux commits distincts.

## Vocabulaire imposé

**mouvement** (pas convoi) · **passe de résolution** (pas tour de combat) · avant-poste **désactivé**
ou **détruit** (jamais pris) · **journal d'événements** · **slot de mouvement**.
Bannis : tick, temps réel, micro, base, rush. Glossaire complet dans `WWS/CONTEXT.md`.

## Ce qui reste

Les surfaces 4.5 à 4.9 sont maquettées dans `WWS/maquettes/` mais pas implémentées — le rail
les affiche grisées. Le schéma de données et le backend ne sont pas écrits,
délibérément : le dernier point bloquant du design (l'avantage d'isolement géographique) n'est pas
tranché.
