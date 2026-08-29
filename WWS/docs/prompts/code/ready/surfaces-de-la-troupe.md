# Prompt Claude Code — les surfaces de la troupe posée (décisions Pierre, 29/08)

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`. Ne commit pas, ne push pas.
Retours de jeu réel : la fenêtre de sélection sert trop tôt et dit trop de choses.

## Décisions

1. **Sélectionner une troupe seule n'ouvre plus la fenêtre.** Clic gauche = surbrillance du
   sprite + un petit cartouche d'état près de lui (effectif, rôle, état — ce que la vue du
   joueur connaît déjà) + **le cercle de détection** de la troupe (`SCOUT_RADIUS_KM`), rendu
   comme le cercle d'écoute existant (`map/engine/reach.ts`) — une onde, l'encre du joueur,
   jamais persistante. La fenêtre complète (composition de colonne) ne s'ouvre que si le
   point porte **plusieurs** troupes, ou depuis le widget Troupes.
2. **« Fonder un avant-poste » passe au clic droit** (menu contextuel de la carte quand une
   troupe sélectionnée peut le faire là), et sort de la fenêtre de sélection.
3. **La spécialisation relais/écoute sort de la fenêtre de troupe.** Elle se choisit sur le
   **panneau de l'avant-poste** une fois fondé (déplacement du sélecteur existant de
   `GarrisonPanel.tsx:297-330`). Si le serveur exige la spécialisation à la fondation,
   adapte : la fondation pose en « relais » par défaut et le panneau permet de changer tant
   qu'aucune passe n'a servi la spécialisation — dis-le dans le rapport si c'est le cas.
4. **Le menu contextuel** : « Marche » partout, inchangé. · « Attaquer » n'apparaît que si
   **la vue du joueur** (`playerView` : relevés, bâtiments et avant-postes connus, jamais
   l'état serveur) montre quelque chose d'attaquable au point cliqué — décision de Pierre
   (29/08) : on n'ordonne un assaut que sur un objectif identifié ; le renseignement devient
   le préalable de l'attaque. ⚠️ La condition se lit EXCLUSIVEMENT dans la vue du joueur —
   la lire dans l'état serveur percerait le brouillard. Un relevé périmé qui montre encore
   l'option est un comportement correct (le serveur résoudra une bredouille). L'agression à
   l'aveugle reste possible par « Marche » et en subit l'interception. · « Leurre » **sort du
   menu contextuel** (décision de Pierre, 29/08) — le serveur et les tests ne bougent pas
   pour l'instant, seul le point d'entrée UI disparaît ; le sort définitif du leurre se
   tranche après une vraie partie (note de guet dédiée).

## Vérifications

`npm run verifier`. À la main : clic sur troupe seule → surbrillance + cartouche + onde, pas
de fenêtre ; point à deux troupes → fenêtre ; clic droit sur sa propre région → pas
d'« Attaquer » ; clic droit en territoire inconnu → « Attaquer » présent même si vide ;
fonder un avant-poste au clic droit → panneau d'avant-poste → changer la spécialisation.
