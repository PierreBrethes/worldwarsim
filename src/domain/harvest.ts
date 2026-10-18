import { RESOURCES, type ResourceKey } from './ids';

/** The last opening of the personal board, and the stocks the server held at that hour. */
export type BoardRead = {
  readonly at: number;
  readonly stocks: Readonly<Partial<Record<ResourceKey, number>>>;
};

export type Harvest = {
  readonly hours: number;
  readonly deltas: ReadonlyArray<{ readonly resource: ResourceKey; readonly amount: number }>;
};

/**
 * **La récolte** (ADR 0028 §7) : ce qui est entré dans chaque bac depuis la dernière ouverture,
 * moins ce qui en est sorti. Un écart et non un journal des flux : un bac plein qui a perdu sa
 * production n'a rien gagné, et c'est ce que le joueur doit lire.
 */
export function harvestOf(
  read: BoardRead | null,
  stocks: Readonly<Record<ResourceKey, number>>,
  now: number,
): Harvest | null {
  if (read === null) return null;
  const deltas = RESOURCES.map((resource) => ({
    resource,
    amount: stocks[resource] - (read.stocks[resource] ?? 0),
  })).filter((delta) => delta.amount !== 0);
  if (deltas.length === 0) return null;
  return { hours: Math.floor((now - read.at) / 3_600_000), deltas };
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
