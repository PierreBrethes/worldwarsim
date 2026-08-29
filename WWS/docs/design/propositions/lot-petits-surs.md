# Le lot des petits sûrs (décidé le 29/08/2026)

**Décision de Pierre** : premier lot après le test en cours — quatre chantiers courts, sans
conflit de corpus, visibles par les joueurs dès la partie suivante. Un prompt Claude Code par
chantier, à écrire au moment de lancer (dans cet ordre, ils ne se marchent pas dessus).

## 1. Le départ programmé (Subterfuge)

Un ordre de mouvement peut porter une heure de départ future ; il part seul, joueur absent ou
non. L'absent planifie autant que le présent — le contrat asynchrone enfin récompensé.
Contraintes : l'ordre différé occupe un slot de mouvement dès sa pose (sinon il contourne le
plafond) ; annulable jusqu'au départ (c'est le départ qui est irréversible, pas la pose) ;
visible dans le widget comme un mouvement « à quai » avec son heure. La prévisualisation
existante donne déjà l'heure d'arrivée induite.

## 2. Le composant tampon

Le tampon comme **état** (héritier des boutons POSÉE/COMPRIS) : cadre au trait, encre, casse
haute, rotation subtile (±1°). Règle d'usage, à graver dans le composant même : *un tampon =
un acte ou un état administratif constaté, jamais une étiquette* ; deux par surface au plus ;
l'encre rouge réservée à ce qui exige l'attention. Premiers usages : la sorte des dépêches en
marge du journal (ALARME en rouge, le reste à l'encre) ; DÉSACTIVÉ / DÉTRUIT sur le panneau
d'avant-poste ; NON IDENTIFIÉ sur une force repérée sans composition ; SAISON CLOSE en une du
journal d'une saison conclue. Pas plus au premier jet.

## 3. Les manchettes épinglées

Une bataille nommée épingle sa manchette sur la région (« L'affaire des Ardennes — 40 hommes
perdus »). Dépend de la dépêche publique de fin de passe (en file) pour le contenu ; l'épingle
elle-même peut venir d'abord avec les seules dépêches privées du joueur. Fabrique les lieux et
la mémoire de la saison. S'estompe (papier jauni) mais ne disparaît pas.

## 4. Les ordres au crayon gras

Les mouvements en cours dessinés en flèches grasses, style craie d'état-major, distincts de la
prévisualisation ; la pose d'un ordre « écrit » la flèche — ce qui donne enfin la confirmation
d'envoi que l'audit réclamait. Respecter l'encre nationale existante.

## Séquence

2 (composant) avant 3 et 4 qui peuvent s'en servir ; 1 indépendant. Chaque chantier = un
prompt, une vérification `npm run verifier` + un scénario navigateur. Rien ici ne touche
l'économie ni le combat : le lot peut se glisser entre deux parties sans re-mesure.

## 5. Le canal général (ajouté le 29/08)

Décision de Pierre : un chat, **un seul canal général par partie**, diégétique — « le fil des
dépêches » : style journalistique, police du journal, et le tic-tac mécanographique d'une
machine à écrire à l'arrivée d'un message (discret, coupable dans Réglages, muet par défaut
si onglet inactif). Le troll entre amis est une *feature* : c'est le carburant social de
l'adversité. Pseudo + encre nationale, par saison, meurt avec elle (ADR 0009). Pas de canaux
privés — les télégrammes pseudo-à-pseudo restent au chapitre diplomatie. Techniquement : une
table `messages` cloisonnée par saison (index `bySeason`, leçon du 26/08), une fenêtre.

## Ordre révisé du lot

2 (tampon) → 5 (canal) → 1 (départ programmé) → 4 (crayon gras) → 3 (manchettes, qui peut
attendre la dépêche publique). Les deux prompts déjà prêts (`format-sans-horloge`,
`notifications-info`) s'intercalent où Pierre veut — le premier touche le schéma, à passer
seul.
