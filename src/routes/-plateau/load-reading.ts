import {
  emptyLoad,
  loadCapacityOf,
  loadRefusalOf,
  loadTotal,
  type LoadingPlace,
  type SupplyLoad,
} from '@/domain/logistics';
import { currentStock, type PlayerView } from '@/domain/player-view';
import { chosenLoadOf, fullLoadOf, loadWordOf } from '@/domain/load-gauge';
import type { TokenHint } from '@/map/TokenDrag';
import { fr, roleLabel } from '@/i18n/fr';

/** D'où viennent les jetons : le plateau personnel, ou le dépôt d'un de mes avant-postes. */
export type TokenSource = 'board' | { readonly outpostId: string };

export type LoadReading = TokenHint;

const refusedReading = (text: string): LoadReading => ({
  text,
  refused: true,
  amount: 0,
  held: 0,
  capacity: 0,
  max: 0,
  bound: 'room',
  load: emptyLoad(),
  title: '',
  word: null,
});

/** Ce que la source tient de cette ressource : un bac du plateau (au présent) ou un dépôt. */
export function sourceStockOf(
  view: PlayerView,
  source: TokenSource,
  resource: keyof SupplyLoad,
  now: number,
): number {
  if (source !== 'board')
    return Math.floor(
      view.me.outposts.find((one) => one.id === source.outpostId)?.depot[resource] ?? 0,
    );
  return Math.floor(currentStock(view.me.resources[resource], view.loadedAt, now));
}

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
  /** La charge que la main a réglée dans la jauge ; `null` : le plein. */
  picked: number | null,
  now: number,
): LoadReading {
  const troop =
    carrierId === null ? undefined : view.me.troops.find((candidate) => candidate.id === carrierId);
  if (troop === undefined) return refusedReading(fr.logistics.dropOnTransport);
  const at = troop.stationedAt;
  const outpost =
    at.kind === 'outpost' ? view.me.outposts.find((one) => one.id === at.outpostId) : undefined;
  if (source === 'board' && outpost !== undefined) return refusedReading(fr.logistics.fromDepot);
  if (source !== 'board' && outpost?.id !== source.outpostId)
    return refusedReading(fr.logistics.atThisDepot);
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
  const store = sourceStockOf(view, source, resource, now);
  const marching = view.arcs.some((arc) => arc.state === 'mine' && arc.troopIds.includes(troop.id));
  const { max, bound } = fullLoadOf(store, capacity - loadTotal(held));
  const amount = chosenLoadOf(max, picked);
  // 0 n'est pas un refus : les jetons rentrent. La règle se lit sur le plein, pas sur la valeur.
  const refusal = loadRefusalOf({
    role: troop.role,
    place,
    busy: troop.tour !== undefined ? 'touring' : marching ? 'underway' : null,
    held,
    resource,
    amount: Math.max(max, 1),
    store,
  });
  if (refusal !== null) {
    const { code, ...details } = refusal;
    return refusedReading(fr.errors[code](details));
  }
  const aboard = loadTotal(held);
  return {
    // The gauge says the load; the pastille only says refusals.
    text: '',
    refused: false,
    amount,
    held: aboard,
    capacity,
    max,
    bound,
    load: held,
    title: `${roleLabel(troop.role, 1)} — ${fr.resources[resource]}`,
    word: fr.logistics.gaugeWord(
      loadWordOf({ held: aboard, amount, capacity, max, bound }),
      source === 'board',
    ),
  };
}
