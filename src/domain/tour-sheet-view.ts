import type { LonLat } from './geo';
import { RESOURCES } from './ids';
import { emptyLoad } from './logistics';
import { loadingPlaceOf } from './compass-logistics';
import { currentStock, type PlayerView, type TroopView } from './player-view';
import { suppliesOf } from './supplies';
import { outpostNameIn } from './patrol';
import type { Loop, SheetDepot, SheetSite, SheetStop, SheetWorld, TourSheet } from './tour-sheet';
import type { SupplyLoad } from './logistics';
import { fr } from '@/i18n/fr';
import { emptyStocks } from './economy';

/**
 * **Ce que le serveur lit pour la feuille** (`tours.pickups`, #551) : par exploitation à soi, le
 * point où ce transport irait ramasser, le quai de sa région, et si une route l'y mène.
 */
export type PickupRead = {
  readonly buildingId: string;
  readonly routed: boolean;
  readonly hasQuay: boolean;
  readonly stopPoint: { readonly lon: number; readonly lat: number } | null;
};

/** La feuille d'un transport lue dans la vue : le transport, ses candidats, leurs noms. */
export type SheetReading = {
  readonly carrier: TroopView;
  readonly sheet: TourSheet;
  readonly candidates: ReadonlyArray<SheetStop>;
  /** Où et comment le point de chargement se nomme. */
  readonly baseName: string;
  readonly nameOf: (stop: { readonly kind: 'depot' | 'site'; readonly id: string }) => string;
  readonly pointOf: (stop: { readonly kind: 'depot' | 'site'; readonly id: string }) => LonLat;
};

const HOUR = 3_600_000;

/**
 * **Lire la feuille d'un transport** : tout ce que `tour-sheet.ts` demande, tiré de la vue du
 * joueur (le tas à sa mesure du jour, `working` = en service et reliée, les heures d'arrêt d'un tas
 * plein) et de ce que le serveur sait seul (`pickups`). `null` : la Blitz n'a pas de tournée, et un
 * transport qui n'est plus à soi n'a pas de feuille. Sans `pickups` encore, les exploitations
 * manquent : la feuille se montre quand même, elles arrivent à la lecture suivante.
 */
export function readSheet(
  view: PlayerView,
  carrierId: string,
  pickups: ReadonlyArray<PickupRead> | undefined,
  world: SheetWorld,
  now: number,
): SheetReading | null {
  const carrier = view.me.troops.find((troop) => troop.id === carrierId);
  if (view.mode === 'blitz' || carrier === undefined) return null;
  const { me } = view;
  const at = carrier.stationedAt;
  const baseBuilding =
    at.kind === 'building' ? me.buildings.find((b) => b.id === at.buildingId) : undefined;
  const baseOutpost =
    at.kind === 'outpost' ? me.outposts.find((o) => o.id === at.outpostId) : undefined;
  const base: LonLat =
    baseBuilding?.point ?? baseOutpost?.lonLat ?? (at.kind === 'point' ? at.lonLat : [0, 0]);
  const baseName =
    baseBuilding?.name ?? (baseOutpost === undefined ? '' : outpostNameIn(me, baseOutpost.id));

  const stockRoom = emptyStocks();
  for (const key of RESOURCES)
    stockRoom[key] = Math.max(
      0,
      me.resources[key].cap - currentStock(me.resources[key], view.loadedAt, now),
    );

  const depots: SheetDepot[] = me.outposts
    .filter((outpost) => outpost.isMine && outpost.id !== baseOutpost?.id)
    .map((outpost) => ({
      kind: 'depot' as const,
      id: outpost.id,
      stopPoint: outpost.lonLat,
      depot: outpost.depot,
      capacity: outpost.depotCapacity,
      level: outpost.level,
      standing: outpost.standsAt === null,
    }));

  const sites: SheetSite[] = (pickups ?? []).flatMap((read) => {
    const building = me.buildings.find((one) => one.id === read.buildingId);
    const extraction = me.extraction.find((one) => one.buildingId === read.buildingId);
    if (building?.heap === undefined) return [];
    const { heap } = building;
    const heapPerHour = extraction?.heapPerHour ?? 0;
    const grown = (heapPerHour * Math.max(0, now - view.loadedAt)) / HOUR;
    return [
      {
        kind: 'site' as const,
        id: building.id,
        stopPoint:
          read.stopPoint === null ? building.point : [read.stopPoint.lon, read.stopPoint.lat],
        resource: heap.resource,
        heap: Math.floor(
          Math.min(heap.cap, heap.amount + (heap.fullSince === undefined ? grown : 0)),
        ),
        cap: heap.cap,
        heapPerHour,
        working: building.disabled !== true && extraction?.linked === true,
        stoppedForHours:
          heap.fullSince === undefined ? null : Math.max(0, now - heap.fullSince) / HOUR,
        facts: { ours: true, exploitation: true, hasQuay: read.hasQuay, routed: read.routed },
      },
    ];
  });

  const names = new Map<string, string>([
    ...depots.map((depot) => [`depot:${depot.id}`, outpostNameIn(me, depot.id)] as const),
    ...sites.map((site) => {
      const building = me.buildings.find((one) => one.id === site.id)!;
      const region = me.regions.find((one) => one.id === building.regionId)?.name;
      return [
        `site:${site.id}`,
        region === undefined ? building.name : `${building.name} · ${region}`,
      ] as const;
    }),
  ]);
  const candidates: ReadonlyArray<SheetStop> = [...depots, ...sites];
  const points = new Map(candidates.map((stop) => [`${stop.kind}:${stop.id}`, stop.stopPoint]));
  return {
    carrier,
    candidates,
    baseName,
    nameOf: (stop) => names.get(`${stop.kind}:${stop.id}`) ?? '',
    pointOf: (stop) => points.get(`${stop.kind}:${stop.id}`) ?? base,
    sheet: {
      world,
      role: carrier.role,
      base,
      consigne: carrier.load ?? emptyLoad(),
      stockRoom,
      fuelHeld: suppliesOf(carrier).fuel,
      rules: {
        place: loadingPlaceOf(view, carrier),
        busy: carrier.tour === undefined ? null : 'touring',
        baseOutpostId: at.kind === 'outpost' ? at.outpostId : null,
      },
    },
  };
}

/** **Une carte d'arrêt de la feuille**, avec ce que la boucle y fait et ce qu'elle en dit. */
export type StopCard = {
  readonly key: string;
  readonly kind: 'depot' | 'site';
  readonly id: string;
  readonly name: string;
  /** Donné pour un dépôt, pris pour une exploitation ; 0 : la tournée saute l'arrêt. */
  readonly moved: number;
  readonly effect: string;
  readonly note: string;
  /** Un arrêt que l'ordre rend inutile : sa note est rouge. */
  readonly warn: boolean;
  /** L'arrêt qu'on vient de poser : sa carte s'entoure. */
  readonly fresh: boolean;
  readonly aboard: number;
};

/**
 * **Les cartes de la feuille**, dans l'ordre des arrêts : ce que chacun donne ou prend, la note
 * qui le dit, et l'arrêt qu'une boucle saute (`skipped`) signalé avec ce qu'il ferait placé plus
 * tôt. `fresh` : l'arrêt qu'on vient de poser, et pourquoi là.
 */
export function cardsOf(
  stops: ReadonlyArray<SheetStop>,
  loop: Loop,
  nameOf: SheetReading['nameOf'],
  fresh: {
    readonly key: string;
    readonly at: number;
    readonly from: number;
    readonly to: number;
  } | null,
): ReadonlyArray<StopCard> {
  const text = fr.tourSheet;
  return stops.map((stop) => {
    const key = `${stop.kind}:${stop.id}`;
    const row = loop.rows.find((one) => one.kind === stop.kind && one.id === stop.id);
    const skipped = loop.skipped.find((one) => one.kind === stop.kind && one.id === stop.id);
    const moved = row?.moved ?? 0;
    const effect =
      stop.kind === 'depot' ? text.gives(moved) : text.takes(moved, fr.resources[stop.resource]);
    let note: string;
    if (skipped !== undefined) note = text.skipped(skipped.earlier, stop.kind);
    else if (stop.kind === 'depot')
      note = text.depotAfter(loadSum(stop.depot), loadSum(stop.depot) + moved, stop.capacity);
    else
      note = text.heapAfter(
        stop.heap,
        stop.heap - moved,
        stop.stoppedForHours !== null && moved > 0,
      );
    if (fresh !== null && fresh.key === key)
      note += ` · ${text.placed(fresh.at + 1, fresh.from, fresh.to)}`;
    return {
      key,
      kind: stop.kind,
      id: stop.id,
      name: nameOf(stop),
      moved,
      effect,
      note,
      warn: skipped !== undefined,
      fresh: fresh?.key === key,
      aboard: row?.aboard ?? 0,
    };
  });
}

const loadSum = (load: SupplyLoad) => load.ammunition + load.oil + load.coal;
