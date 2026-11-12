import { TOUR_MAX_STOPS } from '../../convex/constants';
import { emptyStocks, type Stocks } from './economy';
import type { LonLat } from './geo';
import type { ResourceKey, UnitRole } from './ids';
import {
  deliverRefusalOf,
  deliveryOf,
  loadCapacityOf,
  loadTotal,
  roomAboard,
  takeFromHeap,
  tourRefusalOf,
  visitPlan,
  type Busy,
  type DeliverRefusal,
  type HarvestLoad,
  type LoadingPlace,
  type PickupFacts,
  type SupplyLoad,
  type TourRefusal,
} from './logistics';
import { costMinutes, crawledMinutes, paceCostOf } from './pace';
import { KM_PER_UNIT, projectedDistance, type RouteGrid } from './routing';
import { fullSupplies, refuelAtHeap } from './supplies';
import { DOMAIN_BY_ROLE } from './troops';

/**
 * **La feuille de route qui raisonne** (ADR 0041, décisions du 12/11 sur #548) : tout ce que la
 * feuille affiche d'une tournée, en fonctions pures, sans écran ni serveur. Rien ici n'est une
 * règle : le serveur ne refuse rien sur une durée ni sur un classement. Les refus restent ceux de
 * `tourRefusalOf` et `deliverRefusalOf`, et la boucle se joue avec `visitPlan` et ses primitives.
 *
 * **Le tas est lu tel qu'il est** à l'établissement de la feuille : il montera pendant la
 * boucle, ce que la boucle ne compte pas. Les liaisons (ADR 0037 §8) ne sont pas lues non plus :
 * la durée est un ordre de grandeur, à un dixième de `pacedMinutes` sur une route sans détour.
 */

export type SheetWorld = Pick<RouteGrid, 'outline' | 'sphere'>;

/** Un dépôt d'avant-poste candidat : ce qu'il tient, sa place, son niveau et s'il est debout. */
export type SheetDepot = {
  readonly kind: 'depot';
  readonly id: string;
  readonly stopPoint: LonLat;
  readonly depot: SupplyLoad;
  readonly capacity: number;
  readonly level: number;
  readonly standing: boolean;
};

/** Une exploitation candidate : son tas, son plafond, son débit au tas, et depuis combien
 *  d'heures elle est arrêtée par un tas plein (`null` : elle tourne). */
export type SheetSite = {
  readonly kind: 'site';
  readonly id: string;
  /** Où la tournée va : le tas pour un camion ou un avion, le quai de la région pour un cargo
   *  (`pickupPointOf`), non la place de l'exploitation. */
  readonly stopPoint: LonLat;
  readonly resource: ResourceKey;
  readonly heap: number;
  readonly cap: number;
  /** Le `heapPerHour` de l'extraction du site dans la vue, non son `perHour` : ce qui entre au tas. */
  readonly heapPerHour: number;
  /** Encore à soi, en service et reliée : une exploitation hors service ou coupée ne donne rien, et
   *  la tournée la saute (`isPickable`). */
  readonly working: boolean;
  readonly stoppedForHours: number | null;
  readonly facts: PickupFacts;
};

export type SheetStop = SheetDepot | SheetSite;

/** Le transport et son lieu de chargement, tels que la feuille les lit. */
export type TourSheet = {
  readonly world: SheetWorld;
  readonly role: UnitRole;
  readonly base: LonLat;
  /** Ce que la tournée charge au départ de chaque boucle. */
  readonly consigne: SupplyLoad;
  /** La place libre de chaque bac du plateau personnel, où la récolte se verse au retour. */
  readonly stockRoom: Stocks;
  /** Les crans de moteur à bord au départ (défaut : le plein). Le premier tas de la ressource du
   *  moteur rend le plein d'abord (ADR 0041 §4), avant la récolte. */
  readonly fuelHeld?: number;
  /** Une tournée à sec roule au pas (`crawledMinutes`). */
  readonly slow?: boolean;
  readonly rules: {
    readonly place: LoadingPlace;
    readonly busy: Busy;
    readonly baseOutpostId: string | null;
  };
};

/**
 * **Le détour d'une route sur la droite** de la projection, par milieu.
 *
 * **Mesure du 12/11** (grille `public/grid.json`, `computeRoute` côté client, Node 24) : une route
 * de terre coûte 2,8 à 5 ms à chaud (1 à 5 ms selon la distance), un cargo 9 à 30 ms ; cinq
 * points et leurs vingt paires ordonnées prennent 57 ms à terre et 103 ms en `combined`, et
 * il faut en plus décoder la grille côté client. Classer dix candidats à chaque place d'une
 * feuille en demande plusieurs centaines : plus d'une demi-seconde à terre, des secondes en mer.
 * Trop pour un lâcher, donc la droite × un détour. Mesuré sur 132 routes de terre d'Europe : médiane
 * 1,00, 90 % sous 1,02, pire 1,18 ; sur 35 routes de mer : médiane 1,42, 10 % sous 1,08 et 10 %
 * au-dessus de 4,3 (un cap à doubler).
 *
 * @a-mesurer un cargo qui double un cap dépasse largement la médiane
 */
const DETOUR = { land: 1.02, sea: 1.4, air: 1 } as const;

/** **Une étape en minutes** : la droite projetée, le détour de son milieu, le prix de la route de
 *  cette pile, puis la seule route vers une durée (`costMinutes`, Mondiale). */
export function legMinutes(world: SheetWorld, role: UnitRole, from: LonLat, to: LonLat): number {
  const units = projectedDistance(world, from, to) * DETOUR[DOMAIN_BY_ROLE[role]];
  return costMinutes(units * paceCostOf([role]), null);
}

const legKm = (world: SheetWorld, role: UnitRole, from: LonLat, to: LonLat) =>
  projectedDistance(world, from, to) * DETOUR[DOMAIN_BY_ROLE[role]] * KM_PER_UNIT;

type LoopRow = {
  readonly id: string;
  readonly kind: 'depot' | 'site';
  /** Ce que l'arrêt déplace : donné pour un dépôt, pris pour une exploitation. */
  readonly moved: number;
  /** À bord, une fois l'arrêt fait. */
  readonly aboard: number;
};

/** Un arrêt que la boucle saute, et ce qu'il déplacerait placé en tête. */
type SkippedStop = {
  readonly id: string;
  readonly kind: 'depot' | 'site';
  readonly heap?: number;
  readonly earlier: number;
};

export type Loop = {
  readonly rows: ReadonlyArray<LoopRow>;
  readonly skipped: ReadonlyArray<SkippedStop>;
  readonly moved: number;
  readonly km: number;
  readonly minutes: number;
  /** Ce que la boucle déplace par heure de boucle : 0 si elle ne déplace rien. */
  readonly ratePerHour: number;
  /** La charge au plus fort, départ compris. */
  readonly peak: number;
  /** Versé au stock à chaque retour, et ce qui reste à bord faute de place. */
  readonly banked: Stocks;
  readonly kept: Stocks;
};

/** Le tas qu'une tournée peut prendre : celui d'une exploitation qui ne travaille pas ne se prend pas. */
const takableOf = (stop: SheetSite) => (stop.working ? stop.heap : 0);

const plannedOf = (stop: SheetStop) =>
  stop.kind === 'depot'
    ? ({ kind: 'depot', id: stop.id, depot: stop.depot, capacity: stop.capacity } as const)
    : ({ kind: 'site', id: stop.id, heap: takableOf(stop) } as const);

/** **Ce que la boucle donne et prend**, arrêt par arrêt, comme la tournée la jouera : les arrêts
 *  qu'elle saute (`visitPlan`) ne sont pas roulés. */
export function loopOf(sheet: TourSheet, stops: ReadonlyArray<SheetStop>): Loop {
  const capacity = loadCapacityOf(sheet.role);
  const none = emptyStocks();
  const plan = visitPlan({ load: sheet.consigne, harvest: none, capacity }, stops.map(plannedOf));
  const byKey = new Map(stops.map((stop) => [`${stop.kind}:${stop.id}`, stop]));

  let load = sheet.consigne;
  const harvest: Record<ResourceKey, number> = { ...none };
  let peak = loadTotal(load);
  let fuel = sheet.fuelHeld ?? fullSupplies(sheet.role).fuel;
  let moved = 0;
  const rows: LoopRow[] = [];
  for (const visited of plan.visit) {
    const stop = byKey.get(`${visited.kind}:${visited.id}`)!;
    let n: number;
    if (stop.kind === 'depot') {
      const delivery = deliveryOf(load, stop.depot, stop.capacity);
      n = loadTotal(delivery.moved);
      load = delivery.kept;
    } else {
      const fill = refuelAtHeap(sheet.role, fuel, {
        resource: stop.resource,
        amount: takableOf(stop),
      });
      fuel += fill.steps;
      n = takeFromHeap(takableOf(stop) - fill.cost, roomAboard(capacity, load, harvest)).taken;
      harvest[stop.resource] += n;
    }
    moved += n;
    rows.push({ id: stop.id, kind: stop.kind, moved: n, aboard: loadTotal(load) + total(harvest) });
    peak = Math.max(peak, loadTotal(load) + total(harvest));
  }

  const banked = emptyStocks();
  const kept = emptyStocks();
  for (const key of Object.keys(harvest) as ResourceKey[]) {
    banked[key] = Math.min(harvest[key], Math.max(0, sheet.stockRoom[key]));
    kept[key] = harvest[key] - banked[key];
  }

  const points = [sheet.base, ...rows.map((row) => pointOf(byKey, row)), sheet.base];
  let minutes = 0;
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    minutes += legMinutes(sheet.world, sheet.role, points[i - 1]!, points[i]!);
    km += legKm(sheet.world, sheet.role, points[i - 1]!, points[i]!);
  }
  minutes = rows.length === 0 ? 0 : crawledMinutes(minutes, sheet.slow === true);
  return {
    rows,
    skipped: plan.skipped.map((skipped) =>
      earlierOf(sheet, byKey.get(`${skipped.kind}:${skipped.id}`)!),
    ),
    moved,
    km: Math.round(km),
    minutes,
    ratePerHour: moved === 0 ? 0 : moved / (Math.max(minutes, 1) / 60),
    peak,
    banked,
    kept,
  };
}

const total = (harvest: HarvestLoad) => Object.values(harvest).reduce((sum, n) => sum + n, 0);

const pointOf = (byKey: ReadonlyMap<string, SheetStop>, row: LoopRow) =>
  byKey.get(`${row.kind}:${row.id}`)!.stopPoint;

/** Ce qu'un arrêt sauté déplacerait placé en tête de boucle, à bord comme au départ. */
function earlierOf(sheet: TourSheet, stop: SheetStop): SkippedStop {
  if (stop.kind === 'depot')
    return {
      id: stop.id,
      kind: 'depot',
      earlier: loadTotal(deliveryOf(sheet.consigne, stop.depot, stop.capacity).moved),
    };
  const room = roomAboard(loadCapacityOf(sheet.role), sheet.consigne, undefined);
  const fill = refuelAtHeap(sheet.role, sheet.fuelHeld ?? fullSupplies(sheet.role).fuel, {
    resource: stop.resource,
    amount: takableOf(stop),
  });
  return {
    id: stop.id,
    kind: 'site',
    heap: stop.heap,
    earlier: takeFromHeap(takableOf(stop) - fill.cost, room).taken,
  };
}

export type Slot = {
  /** Où l'arrêt s'insère dans la liste. */
  readonly at: number;
  readonly rate: number;
  readonly rateBefore: number;
  /** La boucle avec l'arrêt, et ce qu'il ajoute à rouler. */
  readonly km: number;
  readonly addedKm: number;
};

/** Sous cet écart (déplacé par heure), deux places se valent et la boucle la plus courte gagne. */
const RATE_TIE = 0.05;

/** **La place suggérée d'un arrêt ajouté** : celle où le rendement monte le plus ; à égalité, la
 *  boucle la plus courte. */
export function placeStop(
  sheet: TourSheet,
  stops: ReadonlyArray<SheetStop>,
  stop: SheetStop,
): Slot {
  const before = loopOf(sheet, stops);
  let best: { at: number; loop: Loop } | null = null;
  for (let at = 0; at <= stops.length; at++) {
    const loop = loopOf(sheet, [...stops.slice(0, at), stop, ...stops.slice(at)]);
    const better =
      best === null ||
      loop.ratePerHour > best.loop.ratePerHour + RATE_TIE ||
      (Math.abs(loop.ratePerHour - best.loop.ratePerHour) <= RATE_TIE && loop.km < best.loop.km);
    if (better) best = { at, loop };
  }
  return {
    at: best!.at,
    rate: best!.loop.ratePerHour,
    rateBefore: before.ratePerHour,
    km: best!.loop.km,
    addedKm: best!.loop.km - before.km,
  };
}

/** **Pourquoi cet arrêt**, en une ligne que l'écran met en mots (`fr.ts`). */
type StopReason =
  | {
      readonly code: 'heapFilling';
      readonly heap: number;
      readonly cap: number;
      readonly hoursToFull: number;
    }
  | { readonly code: 'siteDisabled' }
  | { readonly code: 'siteStopped'; readonly hours: number; readonly lostPerHour: number }
  | { readonly code: 'heapEmpty'; readonly perHour: number }
  | { readonly code: 'noHeap' }
  | { readonly code: 'heapStill'; readonly heap: number; readonly cap: number }
  | { readonly code: 'aboardFull'; readonly heap: number }
  | {
      readonly code: 'depotRoom';
      readonly depot: number;
      readonly capacity: number;
      readonly emptiest: boolean;
    }
  | { readonly code: 'depotGivesNothing' };

export type Offered = {
  readonly stop: SheetStop;
  readonly reason: StopReason;
  /** Ce que l'arrêt déplace à sa place suggérée. */
  readonly moved: number;
  readonly slot: Slot;
  /** Ce qu'il fait gagner au rendement, à sa place suggérée. */
  readonly gain: number;
};

export type Refused = {
  readonly stop: SheetStop;
  readonly refusal: TourRefusal | DeliverRefusal;
};

/** **L'arrêt est-il refusé ?** Les deux règles du serveur : la tournée, puis le dépôt. */
function refusalOf(
  sheet: TourSheet,
  stops: ReadonlyArray<SheetStop>,
  stop: SheetStop,
): TourRefusal | DeliverRefusal | null {
  const all = [...stops, stop];
  const refused = tourRefusalOf({
    role: sheet.role,
    place: sheet.rules.place,
    busy: sheet.rules.busy,
    load: sheet.consigne,
    stops: all.map(({ kind, id }) => ({ kind, id })),
    sites: new Map(
      all.flatMap((one) => (one.kind === 'site' ? [[one.id, one.facts] as const] : [])),
    ),
    baseOutpostId: sheet.rules.baseOutpostId,
  });
  if (refused !== null || stop.kind === 'site') return refused;
  return deliverRefusalOf(
    [{ role: sheet.role, load: sheet.consigne }],
    { level: stop.level, standing: stop.standing, depot: stop.depot, capacity: stop.capacity },
    true,
  );
}

function reasonOf(stop: SheetStop, moved: number, emptiest: boolean): StopReason {
  if (stop.kind === 'depot')
    return moved === 0
      ? { code: 'depotGivesNothing' }
      : { code: 'depotRoom', depot: loadTotal(stop.depot), capacity: stop.capacity, emptiest };
  if (stop.cap === 0) return { code: 'noHeap' };
  if (!stop.working) return { code: 'siteDisabled' };
  if (stop.heap > 0 && moved === 0) return { code: 'aboardFull', heap: stop.heap };
  if (stop.stoppedForHours !== null)
    return { code: 'siteStopped', hours: stop.stoppedForHours, lostPerHour: stop.heapPerHour };
  if (stop.heap === 0) return { code: 'heapEmpty', perHour: stop.heapPerHour };
  if (stop.heapPerHour === 0) return { code: 'heapStill', heap: stop.heap, cap: stop.cap };
  return {
    code: 'heapFilling',
    heap: stop.heap,
    cap: stop.cap,
    hoursToFull: Math.max(0, stop.cap - stop.heap) / stop.heapPerHour,
  };
}

/**
 * **Les arrêts proposés**, classés par ce qu'ils font gagner au rendement (décision du 12/11 :
 * seul critère ; une exploitation arrêtée le dit dans sa raison sans passer devant). Un arrêt
 * refusé n'est jamais proposé : ses raisons sont servies à part. Les arrêts déjà sur la feuille
 * n'y figurent pas.
 */
export function rankStops(
  sheet: TourSheet,
  stops: ReadonlyArray<SheetStop>,
  candidates: ReadonlyArray<SheetStop>,
): { readonly offered: ReadonlyArray<Offered>; readonly refused: ReadonlyArray<Refused> } {
  const onSheet = new Set(stops.map((stop) => `${stop.kind}:${stop.id}`));
  const pool = candidates.filter((stop) => !onSheet.has(`${stop.kind}:${stop.id}`));
  const fill = (stop: SheetDepot) => loadTotal(stop.depot) / stop.capacity;
  const depots = pool.filter((stop): stop is SheetDepot => stop.kind === 'depot');
  const emptiestFill = Math.min(...depots.map(fill));

  const offered: Offered[] = [];
  const refused: Refused[] = [];
  for (const stop of pool) {
    const refusal = refusalOf(sheet, stops, stop);
    if (refusal !== null) {
      refused.push({ stop, refusal });
      continue;
    }
    const slot = placeStop(sheet, stops, stop);
    const loop = loopOf(sheet, [...stops.slice(0, slot.at), stop, ...stops.slice(slot.at)]);
    const moved = loop.rows.find((row) => row.id === stop.id && row.kind === stop.kind)?.moved ?? 0;
    const emptiest = depots.length > 1 && stop.kind === 'depot' && fill(stop) === emptiestFill;
    offered.push({
      stop,
      reason: reasonOf(stop, moved, emptiest),
      moved,
      slot,
      gain: slot.rate - slot.rateBefore,
    });
  }
  return { offered: offered.sort((a, b) => b.gain - a.gain), refused };
}

const permutations = <T>(items: ReadonlyArray<T>): T[][] =>
  items.length < 2
    ? [[...items]]
    : items.flatMap((item, i) =>
        permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
      );

/**
 * **Ordonner au mieux** : l'ordre qui déplace le plus puis roule le moins, parmi toutes les
 * permutations (quatre arrêts au plus). Un autre ordre ne gagne que s'il fait strictement mieux.
 */
export function orderBest(sheet: TourSheet, stops: ReadonlyArray<SheetStop>) {
  const current = loopOf(sheet, stops);
  let order = stops;
  let loop = current;
  if (stops.length <= TOUR_MAX_STOPS)
    for (const candidate of permutations(stops)) {
      const tried = loopOf(sheet, candidate);
      if (tried.moved > loop.moved || (tried.moved === loop.moved && tried.km < loop.km)) {
        order = candidate;
        loop = tried;
      }
    }
  return {
    order,
    loop,
    same: order === stops,
    gain: { moved: loop.moved - current.moved, km: current.km - loop.km },
  };
}

/**
 * **Proposer une tournée** sur une feuille vide : on ajoute l'arrêt qui fait le plus monter le
 * rendement, à sa place, tant qu'il monte, puis on ordonne au mieux. Jamais un arrêt refusé.
 */
export function proposeTour(
  sheet: TourSheet,
  candidates: ReadonlyArray<SheetStop>,
): ReadonlyArray<SheetStop> {
  let stops: ReadonlyArray<SheetStop> = [];
  while (stops.length < TOUR_MAX_STOPS) {
    const best = rankStops(sheet, stops, candidates).offered.find(
      (offer) => offer.moved > 0 && offer.gain > 0,
    );
    if (best === undefined) break;
    stops = [...stops.slice(0, best.slot.at), best.stop, ...stops.slice(best.slot.at)];
  }
  return orderBest(sheet, stops).order;
}
