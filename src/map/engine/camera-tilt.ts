import { REGIONS_FULL_DISTANCE, REGIONS_GONE_DISTANCE } from './regions';

/**
 * **Penché sur la table au rapproché, plus haut pour lire le monde** (13/10/2026). La pente
 * permise — l'angle polaire d'`OrbitControls` — suit la distance : à hauteur de pays on se
 * penche jusqu'à 66°, à la vue monde on ne dépasse plus 52°, ce qui garde l'ouverture du
 * plateau. Rien n'est imposé : sous ce plafond l'inclinaison reste celle du joueur, et
 * l'aplomb toujours permis. Une feuille plate vue de trop bas au loin ne montre que son bord.
 */
const LEANING = 1.15;
const OVERLOOKING = 0.9;
const NEAR = 30;
const FAR = 300;

export function steepestTiltAt(distance: number): number {
  const t = Math.min(1, Math.max(0, (distance - NEAR) / (FAR - NEAR)));
  return LEANING - (LEANING - OVERLOOKING) * t;
}

/**
 * **La pente qui garde le bord lointain du plateau hors de l'image** (19/10/2026, #131) : le
 * rayon du haut de l'écran touche la table à `distance · sin(demi-champ) / cos(pente + demi-champ)`
 * devant la cible ; au-delà du bord, on voit le bureau, une bande sombre sous le bandeau. La
 * pente maximale résout cette égalité pour `edgeAhead`, la distance de la cible au bord devant
 * elle. Quand même l'aplomb ne suffit pas (la vue monde, plus large que l'écran), la pente reste
 * près de la verticale : le plateau se lit entier, entouré de bureau, sans bande d'un seul côté.
 */
export function edgeSafeTiltAt(distance: number, fovDegrees: number, edgeAhead: number): number {
  const half = (fovDegrees * Math.PI) / 360;
  const ratio = (distance * Math.sin(half)) / Math.max(edgeAhead, 1e-6);
  return ratio >= 1 ? 0 : Math.max(0, Math.acos(ratio) - half);
}

/**
 * **Le flou de la table penchée, 0..1** : nul à l'aplomb, plein à la pente la plus rasante que la
 * distance permet, et nul au-delà du fondu des régions — la vue monde est lue de haut et ne
 * s'estompe pas. Le carré garde le début de l'inclinaison nette.
 */
export function tiltShiftOf(polarAngle: number, distance: number): number {
  const slope = Math.min(1, Math.max(0, polarAngle / steepestTiltAt(distance)));
  const near = Math.min(
    1,
    Math.max(
      0,
      (REGIONS_GONE_DISTANCE - distance) / (REGIONS_GONE_DISTANCE - REGIONS_FULL_DISTANCE),
    ),
  );
  return slope * slope * near;
}
