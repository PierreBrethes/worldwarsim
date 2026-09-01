# Annexe au contrat 05 — Jeu de données réel pour la sélection sur carte

**Règle : ce fichier est la SEULE source de texte et de chiffres de la maquette.** Chaînes
verbatim de `src/i18n/fr.ts`, régions réelles de `public/region-index.json`, gisements de
`public/deposits.json`, rayons de `convex/constants.ts`. Ce qui manque se demande, ne
s'écrit pas. **Un tampon est un état servi** — n'en crée aucun (leçon de l'Économie v1).

## Scénario

France (le même que caserne et économie), plus un cran d'avancement pour couvrir les trois
lectures : un adversaire — **Allemagne** — et un **avant-poste relais niveau 1 en Belgique**
avec 2 troupes en garnison. Nations en jeu : France (moi), Allemagne (adverse). Tout autre
pays est neutre.

## A · Panneau de terre (clic gauche / survol du sol)

En-têtes : « `Pays neutre` » / « `Nation adverse` » ; marqueur « `sélection` » ou
« `survol` ».

**Pays neutre avec mon point — Belgique :**
- Titre : « `Belgique` » (`countryLabel`)
- « `avant-poste` » : « `France — relais logistique` » ; « `garnison` » : « `2` »
- Sans point à moi (autre pays neutre) : « `avant-poste` » : « `aucun` »

**Nation adverse — Allemagne :**
- Titre : « `Allemagne` » ; « `plage de repos` » : « `23h00 – 06h00` » (`formatWindow`)
- **Interdits (rien n'est servi)** : « progression », « dernier renseignement » — aucune
  ligne, même vide.

**Section région (au survol, zoom rapproché) — « `Région` » :**
- Ma région : « `Moselle` » · « `gisement de charbon` » ; ou « `Ardennes` » ·
  « `aucun gisement — caserne, aérodrome, baraquements` » ; côtière : « `Pas-de-Calais` » ·
  « `gisement de charbon` » · « `côtière — port possible` »
- « `tenue par` », trois états du relevé (ADR 0020 §5) :
  - **à jour** (une de mes portées couvre) : « `France` » — nom franc, couleur franche
  - **relevée** (vue autrefois) : « `Allemagne — relevé du 28 août` » (`heldBySurveyed` +
    `asPressDate` ; ex. région « `Bayern` ») — la teinte délavée porte l'ancienneté en
    permanence, la date dit *quand* au survol
  - **vierge** (jamais observée) : **aucune ligne** — inconnue n'est pas neutre, rien ne
    s'affiche
- Le gisement et la côte ne se disent que sur **mes** régions (`me.regions`) — une région
  adverse ou neutre n'a ni gisement ni « côtière » affichés (le brouillard est structurel).

## B · Panneau d'avant-poste (le mien)

- Kicker : pays hôte « `Belgique` » ; « `relais logistique` » · « `niveau 1` »
- **LE chiffre : la garnison — « `2` »** ; tampon : *debout* (rien) ou
  **« désactivé »** + compte à rebours « `4 h 12` » restantes (`disabledMinutesLeft`)
- Effet de la spécialisation (`specializationEffects`, rayon du niveau 1 = 120 km) :
  - relais : « `accélère de ×1.5 la part de vos routes qui passe à moins de 120 km` »
  - écoute : « `relève les mouvements adverses qui passent à moins de 120 km` »
- Emplacements du site : « `0 emplacements sur 1` » (le total est son niveau)
- Métier : modifiable tant qu'aucune passe ne l'a lu (`specializationLocked` faux) ; scellé :
  « `une passe s'est déjà servie de cet avant-poste — sa spécialisation ne change plus` »
- **Un avant-poste adverse n'a pas de panneau** — rien n'est servi.

## C · Cartouche de troupe / pile (clic gauche sur un sprite)

- Kicker : « `troupe` » ; bouton abaque **muet** (pictogramme, infobulle
  « `abaque de tir — qui bat qui` ») ; « `fermer` »
- Sprite en grand ; une troupe : « `infanterie · MK1` » ; une pile : le résumé `stackLabel`
  — « `2 infanterie · 1 transport terrestre` » — et « `pile de 3` »
- **LE chiffre : « `effectif 32 / 50` »** (somme de la pile ; `fr.troops.strength`, sans
  unité)
- **UN tampon : « `ravitaillée` »** ou « `hors ravitaillement — entretien ×2` » (une seule
  troupe hors suffit à tamponner la pile)
- Portée, en une phrase : « `relève à 60 km` » (`SCOUT_RADIUS_KM`)
- Pied en visée (désigner arme) : « `choisissez la destination — clic droit sur la carte` »
  + « `échap — désarme` ». Observateur : le pied se tait — plus d'ailleurs à viser.
- La **composition** (cases à cocher, allure, emport) vit dans la fenêtre de garnison — ses
  chaînes sont dans l'annexe caserne (`03-caserne-donnees.md`, section garnison).

## Chaînes les plus longues (la maquette doit les tenir)

« `Allemagne — relevé du 28 août` » · « `accélère de ×1.5 la part de vos routes qui passe à
moins de 120 km` » · « `une passe s'est déjà servie de cet avant-poste — sa spécialisation
ne change plus` » · « `aucun gisement — caserne, aérodrome, baraquements` » ·
« `hors ravitaillement — entretien ×2` » · noms longs : « `Alpes-de-Haute-Provence` »,
« `Territoire de Belfort` », « `Rheinland-Pfalz` », « `Royaume-Uni` ».

## Interdits (rappel du contrat 05)

« progression » et « dernier renseignement » d'un adversaire (échafaudage client, rien de
servi) · type de terrain dans le panneau · gisement / côte d'une région qui n'est pas la
mienne · tout panneau sur un avant-poste ou une troupe adverses · tampon de posture
(ADR 0021, pas codé — pas même la place) · aucun ordre dans les trois lectures (la popin
lit, la carte agit) · toute chaîne ou tout chiffre absent de ce fichier.
