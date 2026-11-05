import { fr } from '@/i18n/fr';
import type { LonLat } from './geo';
import { combatBursts, placedBursts, stamped, type InkBurst } from './ink-bursts';
import type { MapMotion } from './map-motion';
import type { JournalDispatch } from './player-view';
import type { SeasonMode } from './season-mode';

/**
 * **Le rejeu d'absence** (#439, la maquette « la tournée ») : en revenant, la carte va de lieu en
 * lieu et tamponne ce qui s'est passé depuis la dernière lecture. Rien de plus que le journal :
 * chaque lieu est la `place` d'une dépêche servie, et la carte reste au présent — seuls les
 * tampons racontent.
 */

/** Au plus les douze dernières dépêches qui ont un lieu (décision du 04/11). */
export const TOUR_CAP = 12;
/** @a-mesurer : le minutage de la maquette (`scenes.js`, la tournée) — l'intro, un arrêt, un vol. */
const INTRO_MS = 1400;
const STOP_MS = 1600;
export const FLY_MS = 700;
/** @a-mesurer : réduites, pas de vol ; le tampon se pose un quart de seconde après l'arrêt. */
const REDUCED_LAND_MS = 250;
/** @a-mesurer : du dernier tampon au retour, sous `SETTLE_MS` pour que le moteur ne s'endorme pas. */
const LAST_HOLD_MS = 1400;
/** @a-mesurer : le vol du retour, et la bande de fin qui le suit. */
export const RETURN_MS = 1400;
const END_BAND_MS = 1600;
/** @a-mesurer : le maintien d'un tampon du rejeu, et l'écart du second (« terrain tenu »). */
export const TOUR_HOLD_MS = 2200;
const SECOND_STAMP_MS = 800;

type TourStop = {
  readonly at: LonLat;
  /** L'heure de la dépêche, comme le journal l'écrit (`dispatch.t`). */
  readonly hour: string;
  readonly text: string;
  readonly stamps: ReadonlyArray<InkBurst>;
};

export type AbsenceTour = {
  /** De la plus ancienne à la plus récente, comme la maquette ; le journal va dans l'autre sens. */
  readonly stops: ReadonlyArray<TourStop>;
  /** Les dépêches non lues, comptées comme l'en-tête. */
  readonly fresh: number;
  /** Celles que la carte ne rejoue pas : sans lieu, plus anciennes, ou déjà rejouées. */
  readonly leftOut: number;
  /** La dernière fermeture du journal, `null` s'il ne s'est jamais fermé. */
  readonly since: number | null;
};

export type TourGates = {
  readonly mode: SeasonMode;
  readonly concluded: boolean;
  /** Une arrivée par `?report=` : la carte va déjà au combat. */
  readonly arrivedOnReport: boolean;
  readonly firstStepsShown: boolean;
  /** `markToured` passe par `requirePlayable` : le rejeu d'un vaincu reviendrait à chaque visite. */
  readonly defeated: boolean;
  readonly motion: MapMotion;
};

/** La file du rejeu, figée à l'ouverture, ou `null` quand il n'y a rien à rejouer. */
export function absenceTourOf(
  journal: ReadonlyArray<JournalDispatch>,
  marks: { readonly journalReadAt: number | null; readonly absenceTourAt: number | null },
  gates: TourGates,
  landAt: (at: LonLat) => boolean = () => true,
): AbsenceTour | null {
  if (
    gates.mode === 'blitz' ||
    gates.concluded ||
    gates.arrivedOnReport ||
    gates.firstStepsShown ||
    gates.defeated ||
    gates.motion === 'off'
  )
    return null;
  const seen = Math.max(marks.journalReadAt ?? -Infinity, marks.absenceTourAt ?? -Infinity);
  const stops = journal
    .filter((dispatch) => dispatch.at > seen && dispatch.place !== null)
    .slice(0, TOUR_CAP)
    .reverse()
    .map((dispatch): TourStop => ({
      at: [dispatch.place!.lon, dispatch.place!.lat],
      hour: dispatch.t,
      text: dispatch.text,
      stamps: tourStampsOf(dispatch, landAt),
    }));
  if (stops.length === 0) return null;
  const fresh = journal.filter((dispatch) => dispatch.unread).length;
  return { stops, fresh, leftOut: fresh - stops.length, since: marks.journalReadAt };
}

/**
 * **Le lieu et les mots du tampon d'une dépêche.** Ce qu'`inkBursts` sait tamponner garde ses
 * mots (et « terrain tenu » après « engagé ») ; tout le reste porte le mot de la marge du journal.
 * Le second tampon tombe 800 ms après le premier, qui se lève alors.
 */
export function tourStampsOf(
  dispatch: JournalDispatch,
  landAt: (at: LonLat) => boolean,
): ReadonlyArray<InkBurst> {
  const known = [...combatBursts(dispatch, false, landAt), ...placedBursts(dispatch)];
  const place = dispatch.place ?? { lon: 0, lat: 0 };
  const at: LonLat = [place.lon, place.lat];
  const own: ReadonlyArray<InkBurst> =
    known.length > 0
      ? known
      : dispatch.kind === 'column'
        ? [{ kind: 'arrival', at, words: stamped(fr.stamps.arrived, dispatch.at) }]
        : [
            {
              kind: 'dispatch',
              at,
              words: stamped(fr.stamps.dispatches[dispatch.kind], dispatch.at),
            },
          ];
  return own.map((burst, i) => {
    const { delayMs: _, ...rest } = burst;
    return {
      ...rest,
      ...(i > 0 ? { delayMs: SECOND_STAMP_MS * i } : {}),
      holdMs: i < own.length - 1 ? SECOND_STAMP_MS : TOUR_HOLD_MS,
    };
  });
}

export type TourBeat = {
  readonly at: number;
  /** `overview` (réduites, au départ), `fly` (vers l'arrêt), `stamp`, `return` (au départ), `done`
   *  (la bande de fin s'efface). */
  readonly does: 'overview' | 'fly' | 'stamp' | 'return' | 'done';
  readonly stop: number;
};

/** **Le minutage du rejeu**, en ms depuis son départ : à pas égal, un arrêt toutes les 1,6 s. */
export function tourBeatsOf(count: number, motion: MapMotion): ReadonlyArray<TourBeat> {
  const land = motion === 'full' ? FLY_MS : REDUCED_LAND_MS;
  const stops = Array.from({ length: count }, (_, stop): TourBeat[] => {
    const at = INTRO_MS + stop * STOP_MS;
    return [
      { at, does: 'fly', stop },
      { at: at + land, does: 'stamp', stop },
    ];
  }).flat();
  const last = count - 1;
  const back = INTRO_MS + last * STOP_MS + land + LAST_HOLD_MS;
  return [
    ...(motion === 'full' ? [] : [{ at: 0, does: 'overview', stop: 0 } as const]),
    ...stops,
    { at: back, does: 'return', stop: last },
    { at: back + END_BAND_MS, does: 'done', stop: last },
  ];
}
