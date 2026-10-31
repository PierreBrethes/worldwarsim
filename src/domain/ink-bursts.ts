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
    'arrival' | 'combat' | 'cut' | 'held' | 'built' | 'captured' | 'airdropped' | 'delivered';
  readonly at: LonLat;
  readonly words?: StampWords;
  readonly delayMs?: number;
  /** **Le combat dont « terrain tenu » dit l'issue** (#327) : si la carte l'a joué, son tampon de
   *  compte-rendu le remplace, et celui-ci ne se pose pas. */
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

/** A stamp at `age` ms: its scale and opacity, `null` once lifted. Reduced motion lays it flat
 *  at once — no press, the same hold. */
export function stampAt(
  age: number,
  motion: MapMotion,
): { readonly scale: number; readonly opacity: number } | null {
  if (age >= STAMP_MS) return null;
  if (age < 0) return { scale: 1, opacity: 0 };
  if (age < PRESS_MS && motion === 'full') {
    const pressed = age / PRESS_MS;
    return { scale: 1.7 - 0.7 * pressed, opacity: pressed * PEAK };
  }
  return {
    scale: 1,
    opacity: age > HOLD_MS ? Math.max(0, PEAK - (age - HOLD_MS) * LIFT_PER_MS) : PEAK,
  };
}

const stamped = (word: string, at: number): StampWords => ({ word, hour: asClockTime(at) });

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
): ReadonlyArray<InkBurst> {
  const fresh = journal.filter((dispatch) => dispatch.at > seenAt);
  const combats = fresh.flatMap((dispatch): InkBurst[] => {
    if (dispatch.combat === null) return [];
    const at: LonLat = [dispatch.combat.point.lon, dispatch.combat.point.lat];
    const { firedFrom, cause } = dispatch.combat;
    const engaged: InkBurst = {
      kind: 'combat',
      at,
      ...(firedFrom === undefined ? {} : { from: [firedFrom.lon, firedFrom.lat] as const }),
      words: stamped(cause === 'bombardment' ? fr.stamps.shelled : fr.stamps.engaged, dispatch.at),
    };
    /** Un bombardement ne tient aucun terrain : personne n'y est allé. */
    return dispatch.combat.won && cause !== 'bombardment'
      ? [
          engaged,
          {
            kind: 'held',
            at,
            words: stamped(fr.replay.held, dispatch.at),
            delayMs: STAMP_MS,
            combatId: dispatch.combat.id,
          },
        ]
      : [engaged];
  });
  // A dispatch does not name its movement: the ends only pair with the dispatches when every
  // vanished thread has one. Otherwise an attack resolved alongside would steal the stamp. Nor
  // does an end say which dispatch is its own: the batch wears the hour of the latest.
  const columns = fresh.filter((dispatch) => dispatch.kind === 'column');
  const paired = vanishedEnds.length === columns.length;
  const words = stamped(fr.stamps.arrived, Math.max(0, ...columns.map((column) => column.at)));
  const arrivals = paired
    ? vanishedEnds.map((at): InkBurst => ({ kind: 'arrival', at, words }))
    : [];
  /** **Un site a changé de main** (14/10) : le même tampon chez qui l'a pris et chez qui l'a
   *  perdu, à la place que sa dépêche porte. */
  const captures = fresh.flatMap((dispatch): InkBurst[] =>
    (dispatch.kind === 'captured' || dispatch.kind === 'siteLost') && dispatch.place !== null
      ? [
          {
            kind: 'captured',
            at: [dispatch.place.lon, dispatch.place.lat],
            words: stamped(fr.stamps.captured, dispatch.at),
          },
        ]
      : [],
  );
  /** **Un paquet est descendu** (ADR 0028 §4) : le parachute et le tampon, à la place que la
   *  dépêche du largage porte. */
  const airdrops = fresh.flatMap((dispatch): InkBurst[] =>
    dispatch.kind === 'airdrop' && dispatch.place !== null
      ? [
          {
            kind: 'airdropped',
            at: [dispatch.place.lon, dispatch.place.lat],
            words: stamped(fr.stamps.airdropped, dispatch.at),
          },
        ]
      : [],
  );
  return [...combats, ...arrivals, ...captures, ...airdrops];
}
