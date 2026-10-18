import type { ReactNode } from 'react';
import type { ResourceKey } from '@/domain/ids';

export type { ResourceKey };

/**
 * The five silhouettes of the plate « Icônes ressources v2 » (ADR 0015, ADR 0028), lifted path for
 * path. Filled shapes, no outline and no inner detail — that is what survives at 12 px, and
 * each one is meant to be told apart by its cut alone, colour off.
 *
 * **The ink is never baked in.** `fill="currentColor"` takes it from the container, the way
 * the flags take their filter and the unit sprites their tint: a depleted stock, a line on
 * paper or a hovered row has nothing more to do than set a colour. `resourceColor` below is
 * what a caller sets it from.
 */
const SILHOUETTE: Readonly<Record<ResourceKey, ReactNode>> = {
  // Grain sack, tied at the neck — the roundest shape of the plate, for what keeps an army alive.
  food: (
    <path d="M12 3c1.4 0 2.4.8 2.4 1.8 0 .5-.2.9-.6 1.3 3.1 1.2 5.2 4 5.2 7.6V21H5v-7.3c0-3.6 2.1-6.4 5.2-7.6-.4-.4-.6-.8-.6-1.3C9.6 3.8 10.6 3 12 3z" />
  ),
  // Angular heap on its ground — the only jagged silhouette: it burns, it produces.
  coal: (
    <>
      <path d="M4.4 18.6 7 12.4l3.6 2.4L12.2 8l4.9 3.2 2.5 7.4z" />
      <path d="M2.6 19.6h18.8v2H2.6z" opacity=".45" />
    </>
  ),
  // The drop. A shape of its own, like its role: the target that nails armour to the ground.
  oil: (
    <path d="M12 2.6c3.4 4.5 6.1 8 6.1 11.3A6.1 6.1 0 0 1 12 20a6.1 6.1 0 0 1-6.1-6.1C5.9 10.6 8.6 7.1 12 2.6z" />
  ),
  // The stacked ingots: steel, what the iron gives straight away.
  steel: <path d="M9.4 5.6h5.2l2.4 6.4H7zM4.4 12h5.2l2.4 6.4H2zM14.4 12h5.2l2.4 6.4H12z" />,
  // Three standing shells, in brass — v1 supply's bronze goes to what is spent under fire.
  ammunition: (
    <path d="M4.3 21v-8.8c0-2.3.9-4.2 1.7-5.4.8 1.2 1.7 3.1 1.7 5.4V21zM10.3 21v-8.8c0-2.3.9-4.2 1.7-5.4.8 1.2 1.7 3.1 1.7 5.4V21zM16.3 21v-8.8c0-2.3.9-4.2 1.7-5.4.8 1.2 1.7 3.1 1.7 5.4V21z" />
  ),
};

/** One ink per resource, from the same plate. On paper they are darkened to hold contrast. */
export function resourceColor(resource: ResourceKey, onPaper = false): string {
  return `var(--res-${resource}${onPaper ? '-paper' : ''})`;
}

/**
 * The icon never replaces the number. It replaces the *word* when space runs out.
 *
 * The silhouettes are drawn to fill their 24-unit box, so the size asked for is the size
 * obtained — no per-drawing correction factor, unlike the borrowed pictograms they replace.
 */
export function ResourceIcon({ resource, size = 12 }: { resource: ResourceKey; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      {SILHOUETTE[resource]}
    </svg>
  );
}
