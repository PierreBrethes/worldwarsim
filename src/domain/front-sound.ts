import { contactKm, detectionRangeOf } from '../../convex/constants';
import { bearingDegrees, distanceKm, type LonLat } from './geo';
import type { DispatchKind, PlayerView } from './player-view';
import { playedTheatre, type Theatre } from './theatres';

/**
 * **Le front s'entend** (#405) : un changement de la vue servie fait une phrase sonore, et rien
 * d'autre ne sonne. Ce module dit lesquels, de quoi ils parlent et d'où ils viennent ; la voix
 * est ailleurs (`src/map/front-sound.ts`). Il ne lit que deux `PlayerView` : ce qui n'y est pas
 * ne sonne jamais.
 */
export type FrontNature =
  'column' | 'fleet' | 'aviation' | 'combat' | 'capture' | 'construction' | 'edition';

export type DistanceStep = 'near' | 'mid' | 'far';

export type FrontChange = {
  /** Une source, une entrée : ce qui change deux fois onglet masqué ne se dit qu'une. */
  readonly key: string;
  readonly nature: FrontNature;
  readonly step: DistanceStep;
  /** Le relèvement depuis le QG, en degrés ; `null` = au centre. */
  readonly bearing: number | null;
  /** « Vers vous » : `headingAtMe` tel que servi. */
  readonly inbound: boolean;
  readonly hqAttacked: boolean;
};

/** Ce que la règle lit de la vue, et rien de plus. */
export type FrontView = Pick<PlayerView, 'mode' | 'theatre' | 'arcs' | 'journal'> & {
  readonly press: { readonly at: number } | null;
  readonly me: {
    readonly buildings: ReadonlyArray<{ readonly key: string; readonly point: LonLat }>;
    readonly capitalPoint: LonLat | null;
    readonly openingPoint: LonLat | null;
  };
};

/**
 * **Les crans de la distance**, en Mondiale.
 * @a-mesurer 250 et 550 km, maquette D du 02/11, jamais jouée
 */
const NEAR_KM = 250;
const MID_KM = 550;

/** En Blitz, les crans suivent la portée de relevé du théâtre (invariant « Deux modes ») : à
 *  l'Europe ils retombent sur les kilomètres de la Mondiale. */
export function distanceStepOf(km: number, theatre: Theatre | null): DistanceStep {
  const scale = detectionRangeOf(['infantry'], theatre) / detectionRangeOf(['infantry'], null);
  return km <= NEAR_KM * scale ? 'near' : km <= MID_KM * scale ? 'mid' : 'far';
}

/** D'où l'on écoute : le QG — un QG qui vient de tomber, d'où il était —, puis la capitale,
 *  puis le point d'ouverture. */
const hqOf = (view: FrontView): LonLat | null =>
  view.me.buildings.find((building) => building.key === 'hq')?.point ?? null;

const CAPTURE_RINGS: ReadonlyArray<DispatchKind> = ['captured', 'siteLost', 'captureThreat'];
const MEDIUM_NATURE = { land: 'column', sea: 'fleet', air: 'aviation' } as const;

export function frontChangesOf(previous: FrontView, next: FrontView): ReadonlyArray<FrontChange> {
  const theatre = playedTheatre(next);
  const hq = hqOf(next) ?? hqOf(previous);
  const ear = hq ?? next.me.capitalPoint ?? next.me.openingPoint;
  const at = (point: LonLat | null, nearAnyway = false) => {
    if (point === null || ear === null)
      return { step: nearAnyway ? ('near' as const) : ('mid' as const), bearing: null };
    return {
      step: nearAnyway ? ('near' as const) : distanceStepOf(distanceKm(ear, point), theatre),
      bearing: bearingDegrees(ear, point),
    };
  };
  const changes: FrontChange[] = [];

  const watched = new Set(previous.arcs.filter(isSeen).map((arc) => arc.id));
  const routes = new Set<string>();
  for (const arc of next.arcs) {
    if (!isSeen(arc) || watched.has(arc.id)) continue;
    const route = JSON.stringify(arc.route.points);
    if (routes.has(route)) continue;
    routes.add(route);
    changes.push({
      key: `arc:${arc.id}`,
      nature: MEDIUM_NATURE[arc.route.legs[0]?.medium ?? 'land'],
      ...at(arc.from),
      inbound: arc.headingAtMe,
      hqAttacked: false,
    });
  }

  const fought = new Set(previous.journal.flatMap((d) => (d.combat ? [d.combat.id] : [])));
  const latest = Math.max(0, ...previous.journal.map((d) => d.at));
  for (const dispatch of next.journal) {
    const place: LonLat | null =
      dispatch.place === null ? null : [dispatch.place.lon, dispatch.place.lat];
    const atHq = hq !== null && place !== null && distanceKm(hq, place) <= contactKm(theatre);
    const defending =
      dispatch.kind === 'attacked' ||
      dispatch.kind === 'siteLost' ||
      dispatch.kind === 'captureThreat';
    const said = (key: string, nature: FrontNature) =>
      changes.push({
        key,
        nature,
        ...at(place, nature === 'construction'),
        inbound: false,
        hqAttacked: defending && atHq,
      });
    if (dispatch.combat !== null) {
      if (!fought.has(dispatch.combat.id)) said(`combat:${dispatch.combat.id}`, 'combat');
    } else if (dispatch.at > latest) {
      if (CAPTURE_RINGS.includes(dispatch.kind)) said(`capture:${dispatch.at}`, 'capture');
      else if (dispatch.built === true) said(`built:${dispatch.at}`, 'construction');
    }
  }

  if (next.press !== null && next.press.at !== previous.press?.at)
    changes.push({
      key: 'edition',
      nature: 'edition',
      step: 'near',
      bearing: null,
      inbound: false,
      hqAttacked: false,
    });
  return changes;
}

const isSeen = (arc: FrontView['arcs'][number]) => arc.state === 'enemyDetected';

/** Ce qui sonne d'abord au retour, et ce que la file garde quand elle déborde. */
const heatOf = (change: FrontChange): number =>
  change.hqAttacked
    ? 6
    : change.nature === 'combat' || change.nature === 'capture'
      ? 5
      : change.inbound
        ? change.step === 'near'
          ? 4
          : 3
        : 2;

const STEP_ORDER: Record<DistanceStep, number> = { near: 0, mid: 1, far: 2 };
const hottestFirst = (a: FrontChange, b: FrontChange) =>
  heatOf(b) - heatOf(a) || STEP_ORDER[a.step] - STEP_ORDER[b.step];

/** @a-mesurer six en file, trois au retour, six secondes entre deux phrases (maquette D) */
const QUEUE_MAX = 6;
const HEARD_ON_RETURN = 3;
export const PHRASE_GAP_MS = 6_000;

/** La file : une phrase de plus ; au-delà de six, la plus froide sort, la plus ancienne d'abord. */
export function queued(
  queue: ReadonlyArray<FrontChange>,
  change: FrontChange,
): ReadonlyArray<FrontChange> {
  const next = [...queue, change];
  if (next.length <= QUEUE_MAX) return next;
  const coldest = next.findIndex((item) => heatOf(item) < 5);
  next.splice(Math.max(0, coldest), 1);
  return next;
}

/** **Au retour d'onglet** : les trois plus chaudes à l'oreille, le reste imprimé sans son. */
export function onReturn(missed: ReadonlyArray<FrontChange>): {
  readonly heard: ReadonlyArray<FrontChange>;
  readonly printed: ReadonlyArray<FrontChange>;
} {
  const once = [...new Map(missed.map((change) => [change.key, change])).values()];
  const sorted = once.sort(hottestFirst);
  return { heard: sorted.slice(0, HEARD_ON_RETURN), printed: sorted.slice(HEARD_ON_RETURN) };
}
