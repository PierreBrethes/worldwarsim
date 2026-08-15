import type { ReactNode } from 'react';
import type { ResourceKey } from '@/domain/ids';

export type { ResourceKey };

/**
 * The eight silhouettes of the plate « Icônes ressources v2 » (ADR 0015), lifted path for
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
  // Bolt of cloth and its fall: the cylinder with an oblique drape looks like nothing else.
  textile: (
    <>
      <path d="M6 4h11a3.5 3.5 0 0 1 0 7H6a3.5 3.5 0 0 1 0-7z" />
      <path d="M4 11h13.6l3 8.4H7z" opacity=".8" />
    </>
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
  // Three uneven crystal peaks: the raw rock, whose downstream is the ingots just below.
  ore: <path d="M4.6 20 7.1 10l3 10zM9.6 20l2.8-14.6L15.3 20zM14.9 20l2.7-8.4 2.2 8.4z" />,
  // The stacked ingots of v1 steel, inherited as they were: the pyramid stays, the name changes.
  alloy: <path d="M9.4 5.6h5.2l2.4 6.4H7zM4.4 12h5.2l2.4 6.4H2zM14.4 12h5.2l2.4 6.4H12z" />,
  // Three standing shells, in brass — v1 supply's bronze goes to what is spent under fire.
  ammunition: (
    <path d="M4.3 21v-8.8c0-2.3.9-4.2 1.7-5.4.8 1.2 1.7 3.1 1.7 5.4V21zM10.3 21v-8.8c0-2.3.9-4.2 1.7-5.4.8 1.2 1.7 3.1 1.7 5.4V21zM16.3 21v-8.8c0-2.3.9-4.2 1.7-5.4.8 1.2 1.7 3.1 1.7 5.4V21z" />
  ),
  // The solid cross, in linen. No possible ambiguity: one recovers.
  bandages: <path d="M9.4 3h5.2v6.4H21v5.2h-6.4V21H9.4v-6.4H3V9.4h6.4z" />,
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
export function ResourceIcon({
  resource,
  size = 12,
}: {
  resource: ResourceKey;
  size?: number;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      {SILHOUETTE[resource]}
    </svg>
  );
}
