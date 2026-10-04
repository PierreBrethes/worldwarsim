---
type: prompt
statut: livré
maj: 2026-10-04
code: [src/map/CompassRose.tsx, src/routes/-plateau/GarrisonPanel.tsx, src/routes/-plateau/ConstructionPanel.tsx, src/routes/-plateau/GroundPanel.tsx, src/routes/-plateau/MovementPreview.tsx, src/routes/-plateau/TroopBadge.tsx, src/routes/-plateau/SiteModal.tsx, src/routes/-plateau/JournalWindow.tsx, src/domain/push.ts, convex/combat.ts, src/i18n/fr.ts]
decisions: [mobile-1c-2026-10-03, mobile-piste-a-2026-10-03, mobile-regles-2026-10-03, 4a-2026-09-13]
voir: [mobile-2-cadre.md, ../done/mobile-1-socle-tactile.md, ../../design/plateau-sur-telephone-2.md, ../../../rapports/2026-10-03-releve-mobile.md]
---
# mobile-3-ordres — la rose, la fiche, la garnison, la visée, et l'arrivée sur une dépêche

**En bref.** Troisième lot de la refonte mobile, après `mobile-2-cadre` (barre, bandeau, feuilles
basses). Il met dans ce cadre tout ce qui donne un ordre ou le prépare, sous 768 px. **Au-dessus de
768 px, rien ne change**, sauf le §6 (le lien d'une notification d'attaque), qui sert les deux.

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, le compte rendu de `mobile-1` (§4 du rapport
`WWS/docs/rapports/2026-10-03-releve-mobile.md`) et **regarde** :
- `Claude outputs/marque/plateau-mobile/passe-2-b-rose-garnison-visee.png` (A6 rose + fiche, A7
  garnison, A8 visée) : la référence ;
- `piste-a-1-repos-a-faire-rose-garnison-visee.png` (A3 bis : la feuille de visée) ;
- `passe-2-c-attaque-a-refaire.png` : **seulement pour le gabarit** de la feuille (titre rouge,
  tampon, lignes, boutons) ; son contenu est faux, voir §6 ;
- les captures du relevé relancé (`Claude outputs/releve-mobile/captures/iphone13__*`) pour
  construction, sol, aperçu, site, camp relevé.
Ne commit pas, ne push pas. Un chantier, un commit.

## 1. La rose et la fiche (A6)

- Médaillons de **48 px**, libellé en cartouche sous chacun, la branche la plus fréquente
  (« marcher ») en encre pleine. Ce sont les branches **existantes** de chaque objet : n'en ajoute
  ni n'en retire aucune.
- **La rose ne sort jamais de l'écran** : près d'un bord, la carte se recale pour que la rose entière
  tienne (relevé : trois libellés sortaient de 18 px).
- La fiche de l'objet touché (ce que le clic gauche lit) s'ouvre en **feuille basse à l'aperçu** ;
  la tirer vers le haut l'agrandit. La rose reste au-dessus.

## 2. La garnison (A7)

Feuille basse à mi-hauteur, cases de 44 px, ligne « pile : n troupes cochées · butin », bouton
« préparer un mouvement » sous le pouce. La carte remonte pour garder le point visible au-dessus
de la feuille.

## 3. La visée et l'aperçu (A8, A3 bis)

- En visée, la feuille redescend à l'aperçu : « visée · n troupes depuis X », mouvements n/total,
  la destination choisie, distance, heure d'arrivée, « annuler » / « envoyer ».
- Les destinations possibles sont cerclées ; celles hors champ s'annoncent au bord, avec leur nom,
  et un toucher recentre la carte dessus.
- L'aperçu complet avant « envoyer » (ce que `MovementPreview` montre aujourd'hui, avertissement
  d'irréversibilité compris) tient dans la feuille, plein écran si besoin.

## 4. Construction, sol, site

- Les panneaux **construction** et **sol** deviennent des feuilles basses (mêmes règles que la
  garnison), contenu inchangé.
- Le **site** (caserne, aérodrome, port) reste une fenêtre plein écran (cadre du lot 2) ; sa file
  de recrutement en lignes de 44 px.

## 5. Un camp relevé

Toucher une force adverse ou neutre relevée ouvre sa fiche en feuille et la rose réduite à ce qui
existe déjà contre elle. Rien de ce que le relevé ne donne pas (décision 4a du 13/09 : jamais la
destination).

## 6. L'arrivée sur une dépêche de combat

Aujourd'hui une notification d'attaque ouvre `/plateau?windows=journal` (`journalUrl`). Elle
part **après** la passe de résolution (`push.attack`).
- **Une seule attaque** à notifier : l'adresse porte la dépêche (son identifiant, côté serveur dans
  `convex/combat.ts`, sans rien ajouter au texte visible sur l'écran verrouillé). Le plateau
  s'ouvre centré sur le lieu du combat, la dépêche du journal en feuille à l'aperçu, avec le
  gabarit de `passe-2-c` : titre, tampon « attaque subie », ce que le journal dit déjà (pertes,
  état de la garnison, « avant-poste désactivé » s'il l'est). L'assaillant n'est nommé que si la
  dépêche le nomme aujourd'hui.
- Actions : « ouvrir la garnison » du point (panneau du §2), « voir le journal », « plus tard » ;
  et « voir l'assaillant » **seulement** si la dépêche porte une position relevée, qui centre la
  carte sur sa dernière position connue.
- **Plusieurs attaques groupées** (fenêtre de repos) : on garde le journal, comme aujourd'hui.
- Sur ordinateur, la même adresse ouvre la dépêche dans le journal, centrée sur le lieu.
- Aucune règle nouvelle : pas d'alerte avant l'arrivée, pas de renfort suggéré.

## 7. Vérification

- Tests : rose recalée au bord, une seule surface ouverte, adresse d'une notification d'attaque
  unique et groupée (`convex/notifications.test.ts`), dépêche ouverte sans assaillant non nommé.
- Relance le relevé sur les trois appareils, captures à côté des maquettes : rose, fiche, garnison,
  visée jusqu'à « envoyer », construction, sol, site, camp relevé, arrivée sur une dépêche.
- Le parcours complet au doigt, mesuré : toucher une troupe → marcher → toucher une destination →
  envoyer, sans réglage de souris.
- `npm run verifier` complet.
