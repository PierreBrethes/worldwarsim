import { HOVER_ALTITUDE } from './thread';

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

/** Le champ de la caméra pilotée : tous les seuils de distance ont été mesurés à travers lui. */
export const CAMERA_FOV = 42;
/** Le télé du prototype, à travers lequel le plateau est rendu (`eye`). */
export const EYE_FOV = 30;
const halfTan = (fov: number): number => Math.tan((fov * Math.PI) / 360);
/** De combien l'œil recule le long de l'axe pour cadrer le même plan à `EYE_FOV`. */
export const EYE_BACKOFF = halfTan(CAMERA_FOV) / halfTan(EYE_FOV);

/**
 * **Plus près que d = 0,75, on se penche encore** (#535) pour voir les pièces de profil : le
 * plafond monte de `LEANING` à `CLOSE_LEANING` jusqu'à d = `LEAN_UNTIL`, mais l'œil de rendu reste
 * au-dessus d'un avion en vol au point visé (`HOVER_ALTITUDE`), sans quoi il passe sous lui.
 * La feuille (`COUNTRY_THICKNESS`, 0,08) monte l'avion d'autant : à d = 0,25, l'œil reste 0,04 sous
 * lui, et l'avion sort du cadre par le haut. L'y ajouter ramènerait l'inclinaison à 38° à d = 0,25.
 * @a-mesurer sur capture
 */
const LEAN_FROM = 0.75;
const LEAN_UNTIL = 0.4;
const CLOSE_LEANING = 1.3;

/** L'angle polaire où l'œil, à cette distance, est à la hauteur de l'avion en vol plus de quoi
 *  que le plan proche ne le rogne pas, au bas de l'écran. */
const airborneCeilingAt = (distance: number): number => {
  const clear = HOVER_ALTITUDE + nearPlaneAt(distance) / Math.cos((EYE_FOV * Math.PI) / 360);
  return Math.acos(Math.min(1, clear / (distance * EYE_BACKOFF)));
};

export function steepestTiltAt(distance: number): number {
  const t = Math.min(1, Math.max(0, (distance - NEAR) / (FAR - NEAR)));
  const usual = LEANING - (LEANING - OVERLOOKING) * t;
  if (distance >= LEAN_FROM) return usual;
  const closeness = Math.min(1, (LEAN_FROM - distance) / (LEAN_FROM - LEAN_UNTIL));
  const leaning = LEANING + (CLOSE_LEANING - LEANING) * closeness;
  return Math.min(leaning, airborneCeilingAt(distance));
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

/**
 * **Le plan proche suit le zoom** : 0,5 depuis toujours, au sixième de la distance quand on descend
 * plus près (le zoom le plus proche est à d = 0,25 depuis #535).
 * À 0,5, un avion en vol (`HOVER_ALTITUDE`) en bas d'écran, caméra penchée au plus, passait en
 * deçà du plan et se rognait. `@a-mesurer`
 */
export const nearPlaneAt = (distance: number): number => Math.min(0.5, distance / 6);
