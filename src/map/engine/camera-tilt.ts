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

/**
 * **De combien la cible revient vers le plateau à ce tour** (#187), sur un axe : rien tant
 * qu'elle est sur le monde (`|at| ≤ half`), sinon `rate` de ce qui dépasse, jamais plus. Le
 * dernier cheveu revient d'un coup, pour que la boucle cesse de demander des images.
 */
export function boardHoldOf(at: number, half: number, rate: number): number {
  const over = at - Math.max(-half, Math.min(half, at));
  if (over === 0) return 0;
  return Math.abs(over) < 1e-3 ? -over : -over * rate;
}
