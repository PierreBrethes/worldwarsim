import { PIN_APPROACH_DISTANCE } from '@/map/engine/pins';

/** Where the camera stands to read a place or the home, and why each stands where it does. */

/**
 * **D'où l'on regarde le lieu d'une dépêche** : assez près pour lire les régions et les passes
 * autour — la place d'un combat est une scène entre régions, pas une pièce : aucune figurine à
 * lire, donc la part où les pièces tiennent debout n'y décide rien.
 */
export const DISPATCH_VIEW_DISTANCE = 20;

/**
 * **Le retour au quartier général** : on rentre chez soi pour y lire ses pièces, donc à la
 * distance où elles tiennent debout (`PIN_APPROACH_DISTANCE`), pas à une vue où tout est épingle.
 */
export const HOME_VIEW_DISTANCE = PIN_APPROACH_DISTANCE;
