import { fr } from '@/i18n/fr';
import { asClockTime } from './duration';
import type { LonLat } from './geo';
import type { MapMotion } from './map-motion';
import type { JournalDispatch } from './player-view';

/** What a stamp says: a word and the hour, the prototype's `★ 14:32 ★`. */
export type StampWords = { readonly word: string; readonly hour: string };

/**
 * A mark of ink on the board. `words` turns it into the prototype's grained stamp; without, it
 * is the wordless ring (an arrival) or splash (a combat). `delayMs` holds it back, so a second
 * stamp waits for the first to lift.
 */
export type InkBurst = {
  readonly kind:
    | 'arrival'
    | 'combat'
    | 'cut'
    | 'held'
    | 'built'
    | 'captured'
    | 'airdropped'
    | 'delivered'
    /** Any other dispatch the absence tour stamps, with its word of the journal's margin (#439). */
    | 'dispatch';
  readonly at: LonLat;
  readonly words?: StampWords;
  readonly delayMs?: number;
  /** How long it is held before it lifts, 3 s unless said (`stampAt`). */
  readonly holdMs?: number;
  /** **Le combat dont « terrain tenu » dit l'issue** (#327) : si la carte l'a joué, son tampon de
   *  compte-rendu le remplace, et celui-ci ne se pose pas. Sur le coup de ma batterie, le trait
   *  droit attend de même : une scène jouée le trace en arc (#325). */
  readonly combatId?: string;
  /** **D'où ma batterie a tiré** (B20) : le trait d'encre du coup, jusqu'au tampon. */
  readonly from?: LonLat;
};

/** The prototype's `stampAnim`: pressed from 1.7 to 1 in 0.14 s, held to 3 s, lifted at 1.5/s. */
const PRESS_MS = 140;
const HOLD_MS = 3000;
const PEAK = 0.88;
const LIFT_PER_MS = 0.0015;
export const STAMP_MS = HOLD_MS + PEAK / LIFT_PER_MS;

/** @a-mesurer : un geste lève tout en 0,25 s (#439, la maquette « la tournée »). */
export const TAKEN_UP_MS = 250;

/** A stamp at `age` ms: its scale and opacity, `null` once lifted. Reduced motion lays it flat
 *  at once — no press, the same hold. `liftedAt` is the age at which a gesture took it up. */
export function stampAt(
  age: number,
  motion: MapMotion,
  holdMs = HOLD_MS,
  liftedAt: number | null = null,
): { readonly scale: number; readonly opacity: number } | null {
  if (age >= holdMs + PEAK / LIFT_PER_MS) return null;
  const taken = liftedAt === null ? 1 : 1 - (age - Math.max(liftedAt, 0)) / TAKEN_UP_MS;
  if (taken <= 0 || (liftedAt !== null && liftedAt < 0 && age >= 0)) return null;
  if (age < 0) return { scale: 1, opacity: 0 };
  if (age < PRESS_MS && motion === 'full') {
    const pressed = age / PRESS_MS;
    return { scale: 1.7 - 0.7 * pressed, opacity: Math.min(pressed, taken) * PEAK };
  }
  return {
    scale: 1,
    opacity: Math.min(
      age > holdMs ? Math.max(0, PEAK - (age - holdMs) * LIFT_PER_MS) : PEAK,
      taken * PEAK,
    ),
  };
}

export const stamped = (word: string, at: number): StampWords => ({ word, hour: asClockTime(at) });

/**
 * The map stamps only what a dispatch already tells the player, never more: a combat the player
 * is a party to (the report carries its point, and whether the ground was held), and an arrival
 * of the player's own column. An arrival dispatch names no place, so its place is the end of the
 * thread that just disappeared. `seenAt` keeps out the dispatches already there when the map
 * opened.
 */
export function inkBursts(
  journal: ReadonlyArray<JournalDispatch>,
  seenAt: number,
  vanishedEnds: ReadonlyArray<LonLat>,
  /** The map plays the combats that arrive (#327): « terrain tenu » is then the stamp's to say. */
  mapPlays = false,
  /** The ground under a point (`groundOf`): a combat won at sea holds no ground (#324). */
  landAt: (at: LonLat) => boolean = () => true,
): ReadonlyArray<InkBurst> {
  const fresh = journal.filter((dispatch) => dispatch.at > seenAt);
  const combats = fresh.flatMap((dispatch) => combatBursts(dispatch, mapPlays, landAt));
  // A dispatch does not name its movement: the ends only pair with the dispatches when every
  // vanished thread has one. Otherwise an attack resolved alongside would steal the stamp. Nor
  // does an end say which dispatch is its own: the batch wears the hour of the latest.
  const columns = fresh.filter((dispatch) => dispatch.kind === 'column');
  const paired = vanishedEnds.length === columns.length;
  const words = stamped(fr.stamps.arrived, Math.max(0, ...columns.map((column) => column.at)));
  const arrivals = paired
    ? vanishedEnds.map((at): InkBurst => ({ kind: 'arrival', at, words }))
    : [];
  return [...combats, ...arrivals, ...fresh.flatMap(placedBursts)];
}

/** A combat's stamps: « engagé » (or « bombardé »), then what the ground says when it was held. */
export function combatBursts(
  dispatch: JournalDispatch,
  mapPlays: boolean,
  landAt: (at: LonLat) => boolean,
): InkBurst[] {
  if (dispatch.combat === null) return [];
  const at: LonLat = [dispatch.combat.point.lon, dispatch.combat.point.lat];
  const { firedFrom, cause } = dispatch.combat;
  const engaged: InkBurst = {
    kind: 'combat',
    at,
    ...(firedFrom === undefined ? {} : { from: [firedFrom.lon, firedFrom.lat] as const }),
    // Where the map plays its combats, the scene's arc of ink may draw the shot (#325): the
    // straight one waits for the map to say it played none.
    ...(firedFrom !== undefined && mapPlays ? { combatId: dispatch.combat.id } : {}),
    words: stamped(cause === 'bombardment' ? fr.stamps.shelled : fr.stamps.engaged, dispatch.at),
  };
  /** Un bombardement ne tient aucun terrain : personne n'y est allé. */
  return dispatch.combat.won && cause !== 'bombardment'
    ? [
        engaged,
        {
          kind: 'held',
          at,
          words: stamped(landAt(at) ? fr.replay.held : fr.replay.heldAtSea, dispatch.at),
          delayMs: STAMP_MS,
          ...(mapPlays && cause === 'arrival' ? { combatId: dispatch.combat.id } : {}),
        },
      ]
    : [engaged];
}

/**
 * **Un site a changé de main** (14/10) : le même tampon chez qui l'a pris et chez qui l'a perdu.
 * **Un paquet est descendu** (ADR 0028 §4) : le parachute et le tampon. Chacun à la place que
 * sa dépêche porte.
 */
export function placedBursts(dispatch: JournalDispatch): InkBurst[] {
  if (dispatch.place === null) return [];
  const at: LonLat = [dispatch.place.lon, dispatch.place.lat];
  if (dispatch.kind === 'captured' || dispatch.kind === 'siteLost')
    return [{ kind: 'captured', at, words: stamped(fr.stamps.captured, dispatch.at) }];
  if (dispatch.kind === 'airdrop')
    return [{ kind: 'airdropped', at, words: stamped(fr.stamps.airdropped, dispatch.at) }];
  return [];
}
