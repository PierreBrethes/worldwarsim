// **Plusieurs piles prises ensemble** (#130, POC « Manipuler les pions ») : Maj + clic ou le
// lasso les rassemblent, et lâchées sur un lieu elles y partent toutes — chacune par son propre
// ordre, que le serveur relit pile par pile avec la même rose.
import { fr } from '@/i18n/fr';
import type { Compass, CompassAction } from './compass-rose';
import { freeSlotsOf, slotsAskedBy } from './movement-orders';
import type { PlayerView } from './player-view';
import { stationKeyOf, type MarchStation } from './troops';

export type Selection = ReadonlyArray<MarchStation>;

/** Maj + clic : la pile entre dans la sélection, ou en sort si elle y était. */
export function toggleIn(selection: Selection, station: MarchStation): Selection {
  const key = stationKeyOf(station);
  return selection.some((one) => stationKeyOf(one) === key)
    ? selection.filter((one) => stationKeyOf(one) !== key)
    : [...selection, station];
}

export const holds = (selection: Selection, station: MarchStation): boolean =>
  selection.some((one) => stationKeyOf(one) === stationKeyOf(station));

/**
 * **Ce que le trait entoure** : le lasso ne dessine que le passage de la main (POC du 16/10), le
 * retour à son départ est sous-entendu — pair-impair sur le polygone que le trait referme.
 */
export function insideStroke(
  stroke: ReadonlyArray<readonly [number, number]>,
  x: number,
  y: number,
): boolean {
  if (stroke.length < 3) return false;
  let inside = false;
  for (let i = 0, j = stroke.length - 1; i < stroke.length; j = i++) {
    const [xi, yi] = stroke[i]!;
    const [xj, yj] = stroke[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Les ordres qu'une sélection donne d'un lâcher : des marches. Embarquer, livrer, larguer,
 *  bombarder, fonder parlent d'une pile et d'un transport, pas d'un groupe. */
const GROUPED: ReadonlySet<CompassAction['key']> = new Set([
  'aim',
  'plunder',
  'capture',
  'collect',
]);

const same = (one: CompassAction, other: CompassAction): boolean =>
  one.key === other.key &&
  (one.key !== 'aim' ||
    (other.key === 'aim' &&
      one.type === other.type &&
      (one.join === undefined) === (other.join === undefined)));

const grouped = (action: CompassAction): boolean =>
  GROUPED.has(action.key) && !(action.key === 'aim' && action.boardsOn !== undefined);

/** **La branche de cette pile qui donne l'ordre choisi pour le groupe** : sa route, son aperçu. */
export const matchingOrder = (
  compass: Compass | null,
  chosen: CompassAction,
): CompassAction | undefined =>
  compass?.actions.find((action) => grouped(action) && same(action, chosen));

/**
 * **La rose d'une sélection** : la rose de chaque pile, lue sur la même cible — la fonction que le
 * serveur relit à chaque ordre (ADR 0015). Le groupe n'offre que ce que toutes offrent ; une seule
 * qui ne peut pas, et le refus le dit avant le lâcher. Chaque pile part en un mouvement, avec son
 * slot (`slots`, `null` en Blitz) — sauf les flottes du teneur d'Halifax (`slotsAskedBy`).
 */
export function groupCompassOf(
  compasses: ReadonlyArray<Compass | null>,
  slots: { readonly free: number; readonly asked: number } | null,
): Compass | null {
  const [lead] = compasses;
  if (lead === undefined || lead === null) return null;
  const count = compasses.length;
  const offered = lead.actions.filter(
    (action) => grouped(action) && compasses.every((one) => matchingOrder(one, action)),
  );
  const refuse = (refusal: string): Compass => ({ ...lead, actions: [], refusal });
  if (offered.length === 0) {
    const first = lead.actions.find(grouped);
    if (first === undefined) return lead.refusal === null ? null : refuse(lead.refusal);
    const unable = compasses.filter((one) => !matchingOrder(one, first));
    const why = unable.find((one) => one?.refusal)?.refusal ?? null;
    return refuse(fr.selection.partRefused(unable.length, count, why));
  }
  if (slots !== null && slots.asked > slots.free)
    return refuse(fr.selection.slots(slots.asked, slots.free));
  return {
    ...lead,
    kicker: fr.selection.piles(count),
    actions: offered.map((action) => ({
      ...action,
      cost: slots === null ? null : fr.selection.cost(slots.asked, slots.free),
    })),
  };
}

/** **Les slots que la sélection demande**, un par pile (Halifax en épargne un maritime) ;
 *  `null` en Blitz, qui n'en compte pas. */
export function groupSlotsOf(
  view: PlayerView,
  troopIdsPerPile: ReadonlyArray<ReadonlyArray<string>>,
): { readonly free: number; readonly asked: number } | null {
  if (view.mode === 'blitz') return null;
  return {
    free: freeSlotsOf(view.me.slots),
    asked: slotsAskedBy(
      troopIdsPerPile.map((troopIds) =>
        troopIds.flatMap((id) => {
          const troop = view.me.troops.find((one) => one.id === id);
          return troop === undefined
            ? []
            : [{ role: troop.role, carried: troop.carriedBy !== undefined }];
        }),
      ),
      view.strategicPoints.some((point) => point.key === 'halifax' && point.mine),
      view.me.slots.maritime ?? 0,
    ),
  };
}

/** **G rassemble la sélection sur sa plus grosse pile posée** : les autres la rejoignent. */
export function squadLeadOf(
  piles: ReadonlyArray<{ readonly station: MarchStation; readonly troops: number }>,
): Extract<MarchStation, { kind: 'point' }> | null {
  let lead: { station: Extract<MarchStation, { kind: 'point' }>; troops: number } | null = null;
  for (const { station, troops } of piles)
    if (station.kind === 'point' && (lead === null || troops > lead.troops))
      lead = { station, troops };
  return lead?.station ?? null;
}
