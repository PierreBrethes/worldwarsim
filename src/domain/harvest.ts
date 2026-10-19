import { RESOURCES, type ResourceKey } from './ids';

/** The last opening of the personal board, and the stocks the server held at that hour. */
export type BoardRead = {
  readonly at: number;
  readonly stocks: Readonly<Partial<Record<ResourceKey, number>>>;
};

export type Harvest = {
  readonly hours: number;
  /** `lost` is what a full store could not take: what its rate would have brought past the ceiling. */
  readonly deltas: ReadonlyArray<{
    readonly resource: ResourceKey;
    readonly amount: number;
    readonly lost: number;
  }>;
};

/** A store as the board reads it: its ceiling and its net rate. */
type Store = { readonly cap: number; readonly ratePerHour: number };

/**
 * **La récolte** (ADR 0028 §7) : ce qui est entré dans chaque bac depuis que le plateau
 * personnel a été quitté, moins ce qui en est sorti. Un écart et non un journal des flux ; un bac
 * plein dit en plus ce que son débit aurait apporté au-delà du plafond, perdu.
 */
export function harvestOf(
  read: BoardRead | null,
  stocks: Readonly<Record<ResourceKey, number>>,
  now: number,
  stores: Readonly<Record<ResourceKey, Store>>,
): Harvest | null {
  if (read === null) return null;
  const hours = (now - read.at) / 3_600_000;
  const deltas = RESOURCES.map((resource) => {
    const before = read.stocks[resource] ?? 0;
    const { cap, ratePerHour } = stores[resource];
    const full = cap > 0 && stocks[resource] >= cap && ratePerHour > 0;
    return {
      resource,
      amount: stocks[resource] - before,
      lost: full ? Math.max(0, Math.round(before + ratePerHour * hours - stocks[resource])) : 0,
    };
  }).filter((delta) => delta.amount !== 0 || delta.lost > 0);
  if (deltas.length === 0) return null;
  return { hours: Math.floor(hours), deltas };
}

/** Never more pastilles than this per store: they show that it flows, not how much. */
const MOST_PASTILLES = 5;

/** **Quelques pastilles qui volent**, dont les parts font le montant : le bac monte par elles. */
export function pastilleShares(amount: number): ReadonlyArray<number> {
  const whole = Math.abs(Math.round(amount));
  const count = Math.min(MOST_PASTILLES, whole);
  return Array.from(
    { length: count },
    (_, rank) => Math.floor(whole / count) + (rank < whole % count ? 1 : 0),
  );
}
