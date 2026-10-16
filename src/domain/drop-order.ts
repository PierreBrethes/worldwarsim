// **Lâcher, c'est ordonner** (POC « Manipuler les pions », 16/10/2026) : la pièce posée donne
// l'ordre que la rose aurait offert là, sans rose. Ce module dit lesquels une dépose peut donner.
import type { Compass, CompassAction } from './compass-rose';

/** Ce qu'une pile lâchée exécute d'elle-même : partir, monter à bord, tirer, fonder. Le reste —
 *  bâtir, élever, raser, débarquer — n'est pas un ordre de pièce et reste au clic droit. */
const DROPPABLE: ReadonlySet<CompassAction['key']> = new Set([
  'aim',
  'plunder',
  'capture',
  'collect',
  'board',
  'bombard',
  'found',
]);

export type DropReading =
  | { readonly kind: 'none' }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'orders'; readonly verbs: ReadonlyArray<CompassAction> };

/**
 * **Ce que ferait le lâcher ici**, lu sur la rose de la cible — la même fonction que le serveur
 * refuse avec (ADR 0015) : les ordres de pièce dans l'ordre de la rose, le premier par défaut ;
 * sinon le motif du refus ; sinon rien, et la pièce rentre sans un mot.
 */
export function dropReadingOf(compass: Compass | null): DropReading {
  const verbs = compass?.actions.filter((action) => DROPPABLE.has(action.key)) ?? [];
  if (verbs.length > 0) return { kind: 'orders', verbs };
  return compass?.refusal ? { kind: 'refused', reason: compass.refusal } : { kind: 'none' };
}

/** Le verbe choisi parmi `count`, tourné d'un cran dans un sens ou l'autre (Tab, chiffres). */
export const turnChoice = (count: number, chosen: number, step: number): number =>
  (((chosen + step) % count) + count) % count;
