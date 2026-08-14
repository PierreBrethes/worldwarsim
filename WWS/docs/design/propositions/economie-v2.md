# Proposition — Économie v2 : ressources localisées et filières courtes

**Statut : retenue — gravée par l'[ADR 0015](../../adr/0015-economie-v2-ressources-localisees.md)**,
qui tranche aussi les questions ouvertes de la fin. Ce document reste comme trace de la
proposition ; la fiche [02-economie](../02-economie.md) est à réécrire depuis l'ADR.
Issu de la session du 14/08/2026.

## Le principe

Deux règles tiennent tout le système :

1. **Une ressource n'existe que si elle crée une décision différente.** Sinon c'est de la
   comptabilité. Le jeu tourne à ~1,2 décision par joueur et par heure (mesuré) : chaque
   ligne d'inventaire se paie en attention.
2. **Types réels et types décoratifs.** La Gironde produit « du vin » à l'étiquette et de la
   *nourriture* dans le stock. Blé, porc, avoine, soie, obus : décor régional, texte, art.
   Le stock ne connaît que les types réels ci-dessous.

## Les ressources

| Niveau | Ressource | La décision qu'elle crée |
|---|---|---|
| **Sur la carte** (gisements par région, à exploiter) | nourriture · tissus · charbon · pétrole · minerais | où s'étendre, quoi défendre, quoi raider |
| **Transformées** (une étape, jamais deux) | alliage (minerais + charbon) · munitions (alliage) · bandages (tissus) | quoi produire avec une industrie limitée |

Consommation — chaque ressource pèse sur un *état* de l'armée :

- **nourriture** — exister : entretien permanent des unités ;
- **munitions** — se battre : consommées au combat ;
- **bandages** — se remettre : récupération après combat ;
- **pétrole** — se déplacer : unités motorisées uniquement ;
- **charbon** — produire : la fonderie et l'industrie le brûlent (pas d'électricité :
  la chaîne charbon → élec → bâtiments n'offrait aucun choix, elle est coupée).

Le duo **pétrole / charbon** est le pivot stratégique voulu : bombarder les stocks de
pétrole cloue les blindés adverses au sol. C'est une cible qui raconte.

**Les hommes ne sont pas une ressource.** Pas de stock d'effectifs : une unité coûte des
matières. En revanche l'armée a un **plafond d'hommes**, porté par un bâtiment (les
casernements, voir parc). Le plafond reste une contrainte d'équilibrage centrale.

## Le parc de bâtiments (14)

Règle de lecture : un bâtiment = une idée. Le bâtiment qui ouvre un domaine **fabrique
aussi ses unités** — la production est localisée, donc ciblable.

| Famille | Bâtiment | Rôle |
|---|---|---|
| Commandement | **Quartier général** | unique, chez soi ; plafonne le niveau des autres ; porte les slots (ADR 0006) et la **recherche** (paliers mk, spécialisations — pas de bâtiment dédié, pas d'arbre géant) |
| Exploitation | **Ferme** | nourriture — variété décorative selon la région |
| | **Filature** | tissus |
| | **Mine** | charbon *ou* minerais, selon le gisement de la région |
| | **Puits de pétrole** | pétrole |
| Transformation | **Fonderie** | minerais + charbon → alliage |
| | **Arsenal** | alliage → munitions |
| | **Intendance** | tissus → bandages |
| Projection | **Caserne** | ouvre le terrestre ; forme infanterie et véhicules |
| | **Aérodrome** | ouvre l'aérien ; assemble les avions |
| | **Port** | ouvre le maritime ; construit les navires (région côtière) |
| Renseignement | **Station d'écoute** | détection passive ; contre-espionnage actif (cf. proposition espionnage) |
| Plafond | **Casernements** | relève le plafond d'hommes de l'armée |
| Stockage | **Entrepôt** | matières et alliage — se **pille** |
| | **Dépôt** | pétrole et munitions — **explose**. Le raid spectaculaire |

Les deux stockages se distinguent par leur mort : l'entrepôt se vole, le dépôt saute.

Disparus par rapport à la fiche 02 : le complexe industriel (dissous dans fonderie et
bâtiments de projection), le centre logistique (ses effets deviennent les *niveaux* des
bâtiments de projection ; ses slots remontent au QG), la conscription (devient les
casernements), le centre de recherche un temps envisagé (fondu dans le QG).

L'écran de construction reste digeste parce qu'il est **contextuel** : une région à
charbon ne propose que la mine ; une région côtière ajoute le port ; le reste n'apparaît
pas (règle de la rose des vents : rien de grisé, jamais).

## Placement et expansion

- **Chez soi** : un bâtiment se pose librement sur n'importe quelle région de sa nation.
- **Ailleurs** : il faut un **avant-poste**. Il ne peut être fondé que par de
  l'**infanterie mk1 ou mk2** (l'infanterie gagne un rôle hors combat). Une fois fondé,
  il ouvre un **rayon de quelques régions** où l'on peut bâtir — typiquement
  l'exploitation d'un gisement.
- La boucle d'expansion : repérer un gisement → envoyer l'infanterie fonder → bâtir la
  mine ou le puits dans le rayon → défendre la ligne. Et recommencer plus loin.

## Kit de départ

Assez pour se *déployer*, pas pour s'installer : de quoi bâtir une caserne, une ferme et
une filature, plus une avance offerte d'alliage et de munitions pour former les
premières unités légères. Le reste s'exploite.

## Questions ouvertes

- **Les taux.** Débits d'exploitation, coûts de transformation, entretien par rôle :
  tout est à chiffrer, puis à passer au simulateur. Le rapport de simulation existant
  (calibré sur trois ressources) ne vaut plus.
- **La répartition des gisements.** C'est le nouveau visage de l'asymétrie géographique
  (🔴) : qui a du pétrole chez soi ? La distribution est un levier d'équilibrage majeur.
- **La capacité de stockage.** Les stocks sont-ils plafonnés sans entrepôt ? (Proposé :
  oui, plafond bas — l'entrepôt devient vite nécessaire, donc vite une cible.)
- **Acheminement.** Les ressources exploitées loin arrivent-elles seules au stock
  national, ou par convois interceptables ? (La seconde option est riche mais lourde —
  à trancher avec la question des piles localisées, déjà ouverte.)
