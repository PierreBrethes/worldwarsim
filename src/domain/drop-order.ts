// **Lâcher, c'est ordonner** (POC « Manipuler les pions », 16/10/2026) : la pièce posée donne
// l'ordre que la rose aurait offert là, sans rose. Ce module dit lesquels une dépose peut donner.
import { fr } from '@/i18n/fr';
import type { Compass, CompassAction } from './compass-rose';
import type { UnitRole } from './ids';
import { routeModeOf } from './movement-orders';

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

export type Forbidden = 'sea' | 'inland' | null;

/**
 * **Où la pièce portée ne peut pas aller**, voilé le temps du geste : la mer sous ce qui marche,
 * l'intérieur des terres sous ce qui flotte — une coque accoste une plage —, rien sous ce qui
 * vole. La lecture même du routage (`routeModeOf`), donc du serveur.
 */
export function forbiddenGroundOf(roles: ReadonlyArray<UnitRole>): Forbidden {
  if (roles.length === 0) return null;
  const mode = routeModeOf(roles);
  return mode === 'land' ? 'sea' : mode === 'air' ? null : 'inland';
}

/** Ce que la pastille dit d'un ordre : son signe, son encre, son verbe (POC, `#hint`). */
export type DropChip = {
  readonly icon: string;
  readonly tone: 'order' | 'fight';
  readonly verb: string;
};

const HOSTILE: ReadonlySet<CompassAction['key']> = new Set(['bombard', 'plunder', 'capture']);

/** **Le signe et le verbe d'un ordre de pièce**, et l'encre rouge de ce qui va au feu. Le verbe
 *  d'une marche dit ce qui part : à pied, par mer, par air (`forbiddenGroundOf`). */
export function chipOf(action: CompassAction, forbidden: Forbidden): DropChip {
  const { verbs } = fr.drop;
  const capital = action.label.charAt(0).toUpperCase() + action.label.slice(1);
  if (action.key === 'board') return { icon: '⤓', tone: 'order', verb: verbs.board };
  if (action.key !== 'aim')
    return {
      icon: HOSTILE.has(action.key) ? '⚔' : '✓',
      tone: HOSTILE.has(action.key) ? 'fight' : 'order',
      verb: capital,
    };
  if (action.type === 'attack' || action.type === 'raid')
    return { icon: '⚔', tone: 'fight', verb: verbs[action.type] };
  if (action.boardsOn !== undefined) return { icon: '⤓', tone: 'order', verb: verbs.board };
  if (action.join !== undefined)
    return { icon: '+', tone: 'order', verb: action.join.formed ? verbs.form : verbs.join };
  if (action.pictogram === 'doorway') return { icon: '✓', tone: 'order', verb: capital };
  return { icon: '✓', tone: 'order', verb: verbs[forbidden ?? 'air'] };
}
