---
type: prompt
statut: proposé
maj: 2026-10-03
code: [src/routes/index.tsx]
decisions: [marque-1c-2026-10-02, plan-5c-2026-10-02]
voir: [../../marque/marque-et-site.md, ../../marque/charte.md, ../code/done/film-sur-les-pages-d-entree.md]
---
# Prompt Claude design — la page d'accueil, version entre amis

**En bref.** La une que voit un visiteur sans session sur `/` : la boucle, trois lignes, le film,
deux portes (code d'invitation, connexion). Pas d'inscription publique (marque-1c) : c'est la
version « entre amis » de la page d'accueil que plan-5c reportait à l'ouverture, préparée en
parallèle de la première saison. Mobile d'abord.

À coller dans Claude design. Claude design ne peut pas ouvrir l'artifact du design system : téléverse
avec le prompt les quatre fichiers de `Claude outputs/marque/charte-claude-design/` (la charte en
texte, les deux planches, l'image de la boucle).

---

## Le prompt

Dessine la page d'accueil de **La Manchette**, un jeu de stratégie entre amis sur une carte du
monde réel, habillé comme la presse illustrée de 1940. Utilise exclusivement la charte jointe
(`la-manchette-charte.md` et ses deux planches) : ses couleurs, ses quatre faces (Bodoni Moda pour la manchette et les
titres, Source Serif 4 pour le texte courant, Archivo Narrow pour l'interface et les sur-titres,
IBM Plex Mono pour les chiffres et les codes), son logo (« la » en italique, MANCHETTE en
didone, filet rouge dessous), le papier tramé et le bureau sombre.

**Qui arrive ici.** Quelqu'un qui a tapé l'adresse nue, ou à qui un ami a montré le site. On
n'entre dans une partie que sur invitation : la page ne propose pas de créer un compte seul.

**Ce que la page contient, dans cet ordre de lecture :**

1. La manchette (le logo) et une ligne de date de journal.
2. La boucle muette de 8 s (`/media/la-manchette-boucle-8s.mp4`, image d'attente
   `/media/la-manchette-boucle-poster.jpg`) : le plateau, une carte du monde à l'encre où des
   forces se déplacent. Utilise l'image d'attente jointe (`la-manchette-boucle-poster.jpg`) comme visuel dans la maquette.
3. Le chapeau, trois lignes au plus : « Stratégie entre amis sur une carte du monde réel : 2 à 8
   joueurs, une saison de sept jours. » Tu peux proposer une ligne d'accroche au-dessus.
4. Trois brèves courtes, en colonnes de journal sur grand écran, empilées sur téléphone :
   - une saison dure sept jours, on y passe quelques minutes plusieurs fois par jour ;
   - chacun prend une nation de 1940, la développe, et envoie ses forces sur terre, en mer et
     dans les airs ;
   - les ordres se donnent, puis la carte les exécute pendant qu'on vit sa vie ; une dépêche
     prévient quand il se passe quelque chose.
5. « Voir le film (30 s) » : ouvre le film avec le son.
6. Deux portes, de poids égal ou presque :
   - « J'ai un code d'invitation » : un champ de six caractères (police mono, espacée), qui
     mène à la page de l'invitation ;
   - « Se connecter » : pour qui a déjà un compte.

**Deux pistes, chacune en deux formats (téléphone 390 × 844, puis bureau 1440 × 900) :**

- **A — La une.** Une vraie première page : manchette en tête, la boucle comme photo de une sur
  plusieurs colonnes, chapeau, brèves en colonnes, les deux portes dans un encadré en bas de
  colonne.
- **B — La feuille posée.** La boucle plein cadre sur le bureau sombre, une feuille de papier
  posée dessus qui porte manchette, chapeau, brèves et portes. C'est le langage déjà employé par
  les pages de connexion et d'invitation : montre comment l'accueil s'y raccorde.

Sur téléphone, l'écran d'arrivée (sans défiler) doit montrer la manchette, la boucle, le chapeau
et au moins une des deux portes.

**Contraintes.**
- Texte courant et petit texte à 4,5:1 au moins sur leur fond ; cibles tactiles de 44 px au
  moins ; aucun texte sous 16 px dans un champ de saisie.
- Coins carrés, pas d'ombre portée sauf une feuille posée sur le bureau, pas d'emoji, pas
  d'icône d'interface moderne.
- Typographie française : espace insécable avant « : ; ? ! », guillemets « ».
- Vocabulaire : on parle de mouvements, de passes de résolution, de dépêches. N'emploie jamais
  « temps réel », « tick », « micro », « base », « rush ».
- Pas de liste des nations, pas de capture de l'interface de jeu (elle va changer), pas de
  mentions légales, pas de bouton « s'inscrire ».

Termine par une ligne par piste : ce qu'elle fait bien, ce qu'elle fait mal.
