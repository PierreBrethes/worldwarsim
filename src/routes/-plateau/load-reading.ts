import {
  emptyLoad,
  loadCapacityOf,
  loadRefusalOf,
  loadTotal,
  type LoadingPlace,
  type SupplyLoad,
} from '@/domain/logistics';
import { currentStock, type PlayerView } from '@/domain/player-view';
import { fr } from '@/i18n/fr';

/** D'où viennent les jetons : le plateau personnel, ou le dépôt d'un de mes avant-postes. */
export type TokenSource = 'board' | { readonly outpostId: string };

export type LoadReading = {
  readonly text: string;
  readonly refused: boolean;
  /** Ce que le lâcher chargerait : la prise, bornée par la réserve et la place à bord. */
  readonly amount: number;
};

/**
 * **Ce que la main lit au-dessus d'un transport** (ADR 0028 §4) : la règle de `logistics.load`
 * (`loadRefusalOf`), et le geste — sur le sol national on charge depuis le plateau personnel, à un
 * avant-poste depuis son dépôt.
 */
export function loadReadingOf(
  view: PlayerView,
  carrierId: string | null,
  source: TokenSource,
  resource: keyof SupplyLoad,
  grabbed: number,
  now: number,
): LoadReading {
  const troop =
    carrierId === null ? undefined : view.me.troops.find((candidate) => candidate.id === carrierId);
  if (troop === undefined) return { text: fr.logistics.dropOnTransport, refused: true, amount: 0 };
  const at = troop.stationedAt;
  const outpost =
    at.kind === 'outpost' ? view.me.outposts.find((one) => one.id === at.outpostId) : undefined;
  if (source === 'board' && outpost !== undefined)
    return { text: fr.logistics.fromDepot, refused: true, amount: 0 };
  if (source !== 'board' && outpost?.id !== source.outpostId)
    return { text: fr.logistics.atThisDepot, refused: true, amount: 0 };
  const building =
    at.kind === 'building' ? view.me.buildings.find((one) => one.id === at.buildingId) : undefined;
  const place: LoadingPlace =
    outpost !== undefined && outpost.standsAt === null
      ? { kind: 'outpost', level: outpost.level }
      : building !== undefined
        ? { kind: 'building', key: building.key }
        : { kind: 'elsewhere' };
  const held = troop.load ?? emptyLoad();
  const capacity = loadCapacityOf(troop.role);
  const store = Math.floor(
    outpost !== undefined
      ? outpost.depot[resource]
      : currentStock(view.me.resources[resource], view.loadedAt, now),
  );
  const marching = view.arcs.some((arc) => arc.state === 'mine' && arc.troopIds.includes(troop.id));
  const amount = Math.max(0, Math.min(grabbed, store, capacity - loadTotal(held)));
  const refusal = loadRefusalOf({
    role: troop.role,
    place,
    busy: marching ? 'underway' : null,
    held,
    resource,
    amount: Math.max(amount, 1),
    store,
  });
  if (refusal !== null) {
    const { code, ...details } = refusal;
    return { text: fr.errors[code](details), refused: true, amount: 0 };
  }
  return {
    text: fr.logistics.loadHint(amount, fr.resources[resource], loadTotal(held) + amount, capacity),
    refused: false,
    amount,
  };
}
