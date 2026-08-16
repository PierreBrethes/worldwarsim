import { RESOURCES, type ResourceKey } from '@/domain/ids';
import type { ChainView } from '@/domain/player-view';

/**
 * One rank of the banner: the resources printed side by side, and the chain that eats them
 * into the next rank — `null` on the rank that closes a run.
 */
export type Rank = {
  readonly resources: ReadonlyArray<ResourceKey>;
  readonly through: ChainView | null;
};

/** A run reads left to right: `ore · coal → alloy → ammunition`. */
export type Run = ReadonlyArray<Rank>;

/**
 * The banner's reading order, **derived from the chains and never written down**: adding a
 * conversion has to reorder the banner by itself, or the order becomes a second copy of
 * `CHAINS` that drifts from it. The served chains *are* `CHAINS` — same order, plus the state
 * the settlement decided — so this reads them rather than the constants: one source, and the
 * arrow's diagnosis arrives already attached to the link it belongs to.
 *
 * **The order is the banner's only teaching.** A player who reads `minerais · charbon →
 * alliage → munitions` has learnt the metallurgical chain without a line of text; the same
 * eight figures set flat would be a spreadsheet.
 *
 * Whatever no chain touches closes the march, in `RESOURCES` order.
 */
export function resourceStrip(chains: ReadonlyArray<ChainView>): ReadonlyArray<Run> {
  const makerOf = new Map<ResourceKey, ChainView>();
  for (const chain of chains) makerOf.set(chain.output, chain);

  const predecessor = new Map<ChainView, ChainView>();
  for (const chain of chains) {
    for (const input of chain.inputs) {
      const maker = makerOf.get(input.resource);
      if (maker !== undefined && maker !== chain) {
        predecessor.set(chain, maker);
        break;
      }
    }
  }

  const walked = new Set<ChainView>();
  const runs: Run[] = [];

  for (const head of chains) {
    if (predecessor.has(head) || walked.has(head)) continue;

    const ranks: Rank[] = [];
    let step: ChainView | undefined = head;
    // What the previous link handed down. It opens the next rank, so a chain that also takes
    // a raw input reads `alloy · coal → …` rather than losing it.
    let carried: ReadonlyArray<ResourceKey> = [];

    while (step !== undefined) {
      walked.add(step);
      const fresh = step.inputs
        .map((input) => input.resource)
        .filter((resource) => !carried.includes(resource));
      ranks.push({ resources: [...carried, ...fresh], through: step });
      carried = [step.output];

      // The **first** taker, never all of them: a fork would need two lines, and the banner
      // has one. The others open their own run instead of being dropped.
      const current: ChainView = step;
      step = chains.find((next) => !walked.has(next) && predecessor.get(next) === current);
    }

    ranks.push({ resources: carried, through: null });
    runs.push(ranks);
  }

  const placed = new Set(runs.flatMap((run) => run.flatMap((rank) => rank.resources)));
  const idle = RESOURCES.filter((resource) => !placed.has(resource));
  return idle.length === 0 ? runs : [...runs, [{ resources: idle, through: null }]];
}

/** A run that alerts keeps everything when the banner narrows; a calm one gives way first. */
export const isStarved = (run: Run): boolean =>
  run.some((rank) => rank.through?.state === 'starved');
