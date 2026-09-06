# Annexe de données réelles — 07 · Page de presse

**Seule source de texte et de chiffres de la maquette.** Chiffres recalculés depuis
`convex/constants.ts` (`BUILDING_SPEC`, `LEVEL_COST_FACTOR = 1.8`, `COST_BY_ROLE`,
`TIER_2_FACTOR = 1.6`) selon `propositions/classement-bareme.md`. Les chaînes marquées **⚠ nouvelle
clé fr** n'existent pas encore dans `fr.ts` : elles seront créées par le prompt code telles
quelles — design les utilise mot pour mot, il n'en propose pas d'autres.

## Le scénario

Saison à **3 joueurs**, jour 2, **scores relevés à 14:00:00**, prochaine édition à **17:00:00**
(cadence 3 h, décision 80). Je joue la
**France**. Aucun défait sur la planche 1 ; le Japon est défait sur la planche 2.

### La liste (ordonnée par territoire — moi en 2ᵉ)

| Rang | Nation (`fr.nations`) | Pseudo | Territoire | Général | Faits d'armes |
|---|---|---|---|---|---|
| 1 | Allemagne | Tacoctus-le-Grand | 47,7 % | 1 460 | 3 |
| 2 | **France** (moi) | Pierre | 31,8 % | **561** | 2 |
| 3 | Japon | Yamamoto-56 | 20,5 % | 402 | 1 |

Territoire = régions tenues ÷ total tenu par quelqu'un (21 / 14 / 9 sur 44). Le compte de
régions **ne s'affiche pas** — seulement le %.

### Mes registres (France) — exacts, avec delta depuis l'édition de 11:00:00

| Donnée | Valeur | Delta | Détail du calcul (ne s'affiche pas) |
|---|---|---|---|
| Territoire | 31,8 % | +2,3 | 14 régions (13 à 11 h) |
| Industrie | 393 | +85 | QG 2 (60 + 108) · mine 1 (30) · ferme 1 (20) · fonderie 1 (50) · caserne 1 (40) · port 1 (65) · moulin 1 (20) — le port est nouveau |
| Puissance militaire | 168 | −6 | 2 inf. MK1 pleines (18 + 18) · 1 inf. MK1 à 32/50 (11,5) · 1 cargo plein (120) — arrondi après somme |
| Faits d'armes | 2 | +1 | 2 engagements (attaquant ou défendeur) |
| Général | 561 | +79 | 393 + 168 |

### Les autres — ce que le serveur sert, et rien d'autre

- Allemagne : territoire 47,7 %, général **1 460**, faits d'armes 3.
- Japon : territoire 20,5 %, général **402**, faits d'armes 1.
- **Jamais** : leur industrie, leur militaire, un delta, un compte de régions.

### Planche 3 — huit joueurs (moi France, 4ᵉ)

| Rang | Nation | Pseudo | Territoire | Général | Faits d'armes |
|---|---|---|---|---|---|
| 1 | Allemagne | Tacoctus-le-Grand | 22,2 % | 2 340 | 5 |
| 2 | URSS | Joukov | 18,5 % | 1 980 | 4 |
| 3 | États-Unis | Ike | 16,7 % | 2 115 | 2 |
| 4 | **France** (moi) | Pierre | 13,0 % | **561** | 2 |
| 5 | Italie | Balbo | 11,1 % | 890 | 3 |
| 6 | Japon | Yamamoto-56 | 9,3 % | 402 | 1 |
| 7 | Chine | Tchang | 5,6 % | 310 | 0 |
| 8 | Royaume-Uni | Tacoctus-le-Grand | 3,6 % | 4 870 | 14 |

(Le Royaume-Uni : gros général, petit territoire, quatorze faits d'armes — une histoire que le
classement raconte sans un mot de plus.)

## Les chaînes

### Existantes (`src/i18n/fr.ts`)

- Nations : `France · Royaume-Uni · États-Unis · URSS · Allemagne · Japon · Italie · Chine`
  (la plus longue : « Royaume-Uni »).
- Tampon défait : `défaite` (`fr.stamps`, l. 754). Sur la ligne d'un observateur.
- Libellé de pseudo : `pseudo` (l. 444).
- Heures : `asLocalTime` → `14:00:00` (avec les secondes, comme partout).

### ⚠ Nouvelles clés fr (mot pour mot)

| Clé | Chaîne |
|---|---|
| `press.title` | `Presse` |
| `press.capturedAt(t)` | `scores relevés à 14:00:00` |
| `press.next(t)` | `prochaine édition à 17:00:00` |
| `press.final` | `édition finale` |
| `press.none` | `Aucune édition n'a encore paru — la première tombe trois heures après le lancement.` |
| `press.columns.rank` | `rang` |
| `press.columns.territory` | `territoire` |
| `press.columns.general` | `score général` |
| `press.columns.deeds` | `faits d'armes` |
| `press.ownRegisters` | `selon nos propres registres` |
| `press.registers.title` | `nos registres` |
| `press.registers.industry` | `industrie` |
| `press.registers.military` | `puissance militaire` |
| `press.registers.since(t)` | `depuis l'édition de 11:00:00` |
| `press.delta` | `+85` · `−6` · `=` (signe toujours imprimé, `=` quand nul) |

## Les chaînes les plus longues — la maquette se valide dessus

- Ligne : `8 · Royaume-Uni · Tacoctus-le-Grand · 3,6 % · 4 870 · 14` (pseudo de 17 caractères —
  pas de borne serveur aujourd'hui, prévoir la coupe) ; un général à cinq chiffres (`12 400`)
  doit tenir dans la colonne.
- État vide : `Aucune édition n'a encore paru — la première tombe trois heures après le lancement.`
- Manchette : `scores relevés à 14:00:00 — prochaine édition à 17:00:00` + tampon `édition finale`.

## Planches demandées

1. **Nominal** — le scénario ci-dessus, moi 2ᵉ, mes registres dépliés.
2. **Édition finale** — même liste, tampon « édition finale », pas de « prochaine édition »,
   Japon défait (tampon `défaite`, ligne estompée, toujours 3ᵉ).
3. **Huit joueurs** — le tableau ci-dessus, moi 4ᵉ (registres pliés).
4. **Vide** — `press === null`, la phrase `press.none` seule.

## Interdits (rappel)

Pas de courbe, pas d'historique, pas de compte de régions, pas d'industrie ni de militaire d'un
autre, pas de mention « estimations », pas de vainqueur, pas de tampon sur un score, pas de bouton qui recentre. Le rang et le delta
disent tout ce qu'il y a à dire.
