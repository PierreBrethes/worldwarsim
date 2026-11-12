import { RESOURCES, type ResourceKey, type UnitRole } from './ids';
import { YIELD_OF } from './economy';
import { harvestTotal, type HarvestLoad } from './logistics';
import type { PlayerView } from './player-view';

const HOUR = 3_600_000;
/** Jetons d'une pile pleine : la pile se lit d'un coup d'œil, la jauge donne le reste. */
const FULL_STACK = 4;

/**
 * **Le tas au pied d'une exploitation, tel que la vue le sert** (ADR 0041, #548) : au propriétaire
 * seul, jamais lu chez l'adversaire. `amount` est celui de `asOf`, l'instant de la vue ;
 * `heapReadingOf` le prolonge à l'heure de qui lit, comme le serveur l'intègre.
 */
export type HeapMark = {
  readonly resource: ResourceKey;
  readonly amount: number;
  readonly cap: number;
  readonly perHour: number;
  readonly asOf: number;
  readonly fullSince: number | null;
  /** **Exploitation de fondation** : son sceau, et ce qu'elle verse seule au stock chaque heure. */
  readonly foundation: { readonly alonePerHour: number } | null;
};

export type HeapReading = {
  readonly amount: number;
  readonly cap: number;
  readonly share: number;
  readonly full: boolean;
  /** Depuis quand l'exploitation est arrêtée faute de place, `null` tant que le tas n'est pas plein. */
  readonly stoppedSince: number | null;
  /** Les jetons de la pile dessinée au pied. */
  readonly stack: number;
};

export function heapMarkOf(
  building: {
    readonly id: string;
    readonly foundationMark?: true;
    readonly heap?: {
      readonly amount: number;
      readonly cap: number;
      readonly resource: ResourceKey;
      readonly fullSince?: number;
    };
  },
  extraction: ReadonlyArray<{
    readonly buildingId: string;
    readonly nationalPerHour: number;
    readonly heapPerHour: number;
  }>,
  asOf: number,
): HeapMark | null {
  const { heap } = building;
  if (heap === undefined) return null;
  const site = extraction.find((one) => one.buildingId === building.id);
  return {
    resource: heap.resource,
    amount: heap.amount,
    cap: heap.cap,
    perHour: site?.heapPerHour ?? 0,
    asOf,
    fullSince: heap.fullSince ?? null,
    foundation:
      building.foundationMark === true ? { alonePerHour: site?.nationalPerHour ?? 0 } : null,
  };
}

export function heapReadingOf(mark: HeapMark, now: number): HeapReading {
  const grown = mark.fullSince === null ? (mark.perHour * Math.max(0, now - mark.asOf)) / HOUR : 0;
  const amount = Math.floor(Math.max(mark.amount, Math.min(mark.cap, mark.amount + grown)));
  const full = mark.cap > 0 && amount >= mark.cap;
  const share = mark.cap > 0 ? amount / mark.cap : 0;
  return {
    amount,
    cap: mark.cap,
    share,
    full,
    stoppedSince: !full
      ? null
      : (mark.fullSince ?? mark.asOf + ((mark.cap - mark.amount) / mark.perHour) * HOUR),
    stack: amount <= 0 ? 0 : Math.min(FULL_STACK, Math.max(1, Math.ceil(share * FULL_STACK))),
  };
}

/** **Ce qui attend au pied, par ressource** : la somme des tas, leur nombre, et ceux qui sont pleins.
 *  Une fondation au niveau 1 n'a pas de tas : elle ne compte pas. */
export function heapsAtFoot(
  marks: ReadonlyArray<HeapMark>,
  now: number,
): Record<ResourceKey, { amount: number; sites: number; full: number }> {
  const foot = Object.fromEntries(
    RESOURCES.map((key) => [key, { amount: 0, sites: 0, full: 0 }]),
  ) as Record<ResourceKey, { amount: number; sites: number; full: number }>;
  for (const mark of marks) {
    if (mark.cap === 0) continue;
    const reading = heapReadingOf(mark, now);
    const row = foot[mark.resource];
    row.amount += reading.amount;
    row.sites += 1;
    if (reading.full) row.full += 1;
  }
  return foot;
}

export type OverflowingHeap = {
  readonly buildingId: string;
  readonly name: string;
  readonly region: string;
  readonly resource: ResourceKey;
  readonly amount: number;
  readonly stoppedSince: number;
};

/** **Les tas pleins** (ADR 0041) : l'exploitation y est arrêtée, et le plateau personnel les dit
 *  « débordent ». Le plus ancien d'abord. */
export function overflowingHeaps(view: PlayerView, now: number): ReadonlyArray<OverflowingHeap> {
  const { me } = view;
  return me.buildings
    .flatMap((building) => {
      const mark = heapMarkOf(building, me.extraction, view.loadedAt);
      if (mark === null || mark.cap === 0) return [];
      const reading = heapReadingOf(mark, now);
      if (!reading.full || reading.stoppedSince === null) return [];
      return [
        {
          buildingId: building.id,
          name: building.name,
          region: me.regions.find((region) => region.id === building.regionId)?.name ?? '',
          resource: mark.resource,
          amount: reading.amount,
          stoppedSince: reading.stoppedSince,
        },
      ];
    })
    .sort((first, second) => first.stoppedSince - second.stoppedSince);
}

export type InboundHarvest = {
  readonly troopId: string;
  readonly role: UnitRole;
  readonly harvest: HarvestLoad;
  /** La fin de l'étape en cours, `null` d'un transport à l'arrêt : la vue ne sert pas l'heure du
   *  retour d'une tournée, seulement celle de sa marche. */
  readonly arrivesAt: number | null;
};

/** **Ce qui arrive** : la récolte à bord des transports, qu'ils roulent ou attendent. */
export function inboundHarvests(view: PlayerView): ReadonlyArray<InboundHarvest> {
  const legs = new Map(
    view.arcs.flatMap((arc) =>
      arc.state === 'mine' ? arc.troopIds.map((id) => [id, arc.schedule.arrivesAt] as const) : [],
    ),
  );
  return view.me.troops.flatMap((troop) =>
    harvestTotal(troop.harvest) > 0 && troop.harvest !== undefined
      ? [
          {
            troopId: troop.id,
            role: troop.role,
            harvest: troop.harvest,
            arrivesAt: legs.get(troop.id) ?? null,
          },
        ]
      : [],
  );
}

/** **Ce que dit un bac du plateau personnel de ce qui l'attend au pied** (ADR 0041, #548). */
export type HeapBin =
  | { readonly kind: 'arsenal' }
  | { readonly kind: 'foundationOnly' }
  | {
      readonly kind: 'foot';
      readonly amount: number;
      readonly full: number;
      readonly come: { readonly amount: number; readonly arrivesAt: number | null } | null;
    };

export function heapBinOf(view: PlayerView, resource: ResourceKey, now: number): HeapBin | null {
  if (view.mode === 'blitz') return null;
  if (resource === 'ammunition') return { kind: 'arsenal' };
  const { me } = view;
  const marks = me.buildings.flatMap((building) => {
    const mark = heapMarkOf(building, me.extraction, view.loadedAt);
    return mark === null ? [] : [mark];
  });
  const foot = heapsAtFoot(marks, now)[resource];
  const yielding = me.extraction.some(
    (site) => site.deposit !== null && YIELD_OF[site.deposit] === resource,
  );
  if (foot.sites === 0) return yielding ? { kind: 'foundationOnly' } : null;
  const aboard = inboundHarvests(view).filter((one) => one.harvest[resource] > 0);
  const dates = aboard.flatMap((one) => (one.arrivesAt === null ? [] : [one.arrivesAt]));
  return {
    kind: 'foot',
    amount: foot.amount,
    full: foot.full,
    come:
      aboard.length === 0
        ? null
        : {
            amount: aboard.reduce((sum, one) => sum + one.harvest[resource], 0),
            arrivesAt: dates.length === 0 ? null : Math.min(...dates),
          },
  };
}
