import { fr } from '@/i18n/fr';
import { asClockTime } from './duration';
import type { LonLat } from './geo';
import type { MapMotion } from './map-motion';
import { LOSS_INK, nationInk } from './nations';
import type { JournalDispatch } from './player-view';
import type { RaceLead } from './race-rings';
import { RACE_TO_WIN } from './strategic-points';

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
    | 'dispatch'
    /** **Le cachet des Sept** (#442) : rond, le nom du point en arc, l'heure, sept pastilles. */
    | 'seal'
    /** **Compte rompu** (#442) : le point repris au meneur de la course, en noir. */
    | 'raceBroken';
  readonly at: LonLat;
  readonly words?: StampWords;
  readonly delayMs?: number;
  /** How long it is held before it lifts, 3 s unless said (`stampAt`). */
  readonly holdMs?: number;
  /** Its ink, the stamp's red unless said: a seal wears its taker's, a loss is black (#442). */
  readonly ink?: string;
  /** **Le cachet** : combien de pastilles sont pleines, et « IV » au quatrième seul. */
  readonly held?: number;
  readonly roman?: string;
  /** **Sa taille**, part de celle d'un cachet seul : la victoire en pose quatre côte à côte. */
  readonly scale?: number;
  /** Pressed just above its point rather than beside it: the absence tour has no piece there to
   *  keep readable, and a stamp aside reads as the neighbouring country's (#439). The seals of the
   *  Seven, « compte rompu » and the fall of a headquarters, as the storyboard has them (#442) —
   *  but a seal where the count runs, whose mast's cartouche stands there. */
  readonly over?: true;
  /** **Le combat dont « terrain tenu » dit l'issue** (#327) : si la carte l'a joué, son tampon de
   *  compte-rendu le remplace, et celui-ci ne se pose pas. Sur le coup de ma batterie, le trait
   *  droit attend de même : une scène jouée le trace en arc (#325). */
  readonly combatId?: string;
  /** **D'où ma batterie a tiré** (B20) : le trait d'encre du coup, jusqu'au tampon. */
  readonly from?: LonLat;
  /** **Un largage** (#508) : si quelque chose est descendu, et si une escouade l'a reçu. Rien de
   *  livré, la carte ne pose pas de paquet : l'avion passe soute fermée. */
  readonly delivered?: boolean;
  readonly squad?: boolean;
};

/** The prototype's `stampAnim`: pressed from 1.7 to 1 in 0.14 s, held to 3 s, lifted at 1.5/s. */
const PRESS_MS = 140;
const HOLD_MS = 3000;
const PEAK = 0.88;
const LIFT_PER_MS = 0.0015;
export const STAMP_MS = HOLD_MS + PEAK / LIFT_PER_MS;

/** @a-mesurer : `storyboard-moments/commun/scenes.js`, un des Sept — le drapeau descend puis
 *  l'autre monte (0,8 s + 0,8 s), le cachet se pose ensuite et tient 3,4 s. */
export const FLAG_SWAP_MS = 1600;
const SEAL_HOLD_MS = 3400;
/** @a-mesurer : la capture que la prise d'un point ou la chute d'un QG dit déjà, au même instant
 *  et à ce près : le point de la capture est celui où l'infanterie s'est arrêtée. */
const TWIN_DEGREES = 0.5;

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
  /** **Le meneur dont le compte vient de tomber** en cours de partie, et les points qu'il tenait
   *  (#442) ; `null` sinon. */
  brokenRace: RaceLead | null = null,
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
  // The seal waits for the flag to change on its mast (`FLAG_SWAP_MS`). Where another took one of
  // the leader's points as his count fell, it is « compte rompu » that the point wears.
  const placed = fresh.flatMap((dispatch) =>
    placedBursts(dispatch, fresh).map((burst): InkBurst => {
      if (burst.kind !== 'seal') return burst;
      const point = dispatch.point;
      if (
        brokenRace === null ||
        point === undefined ||
        point.nation === brokenRace.leaderNation ||
        !brokenRace.keys.includes(point.key)
      )
        return { ...burst, delayMs: FLAG_SWAP_MS };
      return {
        kind: 'raceBroken',
        at: burst.at,
        words: stamped(fr.stamps.raceBroken, dispatch.at),
        ink: LOSS_INK,
        over: true,
        delayMs: FLAG_SWAP_MS,
      };
    }),
  );
  return [...combats, ...arrivals, ...placed];
}

const twins = (a: JournalDispatch, b: JournalDispatch): boolean =>
  a !== b &&
  a.at === b.at &&
  a.place !== null &&
  b.place !== null &&
  Math.abs(a.place.lon - b.place.lon) <= TWIN_DEGREES &&
  Math.abs(a.place.lat - b.place.lat) <= TWIN_DEGREES;

/** **Ce qu'une prise des Sept ou la chute d'un QG dit mieux que « capturé »** (#442). */
const saysMore = (dispatch: JournalDispatch): boolean =>
  (dispatch.kind === 'pointTaken' && dispatch.point !== undefined) ||
  (dispatch.kind === 'elimination' && dispatch.place !== null);

/** **La capture qu'une prise des Sept ou la chute d'un QG remplace** : même instant, même lieu. */
export const twinnedCapture = (
  dispatch: JournalDispatch,
  journal: ReadonlyArray<JournalDispatch>,
): boolean =>
  (dispatch.kind === 'captured' || dispatch.kind === 'siteLost') &&
  journal.some((other) => saysMore(other) && twins(dispatch, other));

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
export function placedBursts(
  dispatch: JournalDispatch,
  /** Ce qui est arrivé avec elle : une capture que la prise d'un point dit déjà se tait. */
  journal: ReadonlyArray<JournalDispatch> = [],
): InkBurst[] {
  if (dispatch.place === null) return [];
  const at: LonLat = [dispatch.place.lon, dispatch.place.lat];
  if (twinnedCapture(dispatch, journal)) return [];
  if (dispatch.kind === 'captured' || dispatch.kind === 'siteLost')
    return [{ kind: 'captured', at, words: stamped(fr.stamps.captured, dispatch.at) }];
  if (dispatch.kind === 'pointTaken' && dispatch.point !== undefined) {
    const { key, nation, held } = dispatch.point;
    return [
      {
        kind: 'seal',
        at,
        words: stamped(fr.points.names[key], dispatch.at),
        ink: nationInk(nation),
        held,
        ...(held === 4 ? { roman: 'IV' } : {}),
        holdMs: SEAL_HOLD_MS,
        // Where the count starts or runs, the mast's cartouche stands above the point.
        ...(held < RACE_TO_WIN ? { over: true as const } : {}),
      },
    ];
  }
  /** **Un QG tombé, servi avec son lieu** à qui le connaît : son preneur (sa capture l'escorte),
   *  et qui l'avait relevé. Chez l'éliminé, que sa perte escorte, la scène de sa chute le dit. */
  if (dispatch.kind === 'elimination') {
    // Not any twin: the camps the fallen's territory sights as it falls share its hour and place.
    const escort = journal.find(
      (other) => (other.kind === 'captured' || other.kind === 'siteLost') && twins(dispatch, other),
    );
    if (escort?.kind === 'siteLost') return [];
    const words = stamped(
      escort === undefined ? fr.stamps.hqFallen : fr.stamps.hqTaken,
      dispatch.at,
    );
    return [
      {
        kind: 'captured',
        at,
        words,
        ...(escort === undefined ? { ink: LOSS_INK } : {}),
        over: true,
      },
    ];
  }
  if (dispatch.kind === 'airdrop') {
    const dropped = dispatch.airdrop;
    return [
      {
        kind: 'airdropped',
        at,
        words: stamped(
          dropped?.delivered === false ? fr.stamps.airdropRefused : fr.stamps.airdropped,
          dispatch.at,
        ),
        ...dropped,
      },
    ];
  }
  return [];
}
