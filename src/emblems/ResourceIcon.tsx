import type { ResourceKey } from '@/domain/ids';
import { Pictogram } from '@/shell/IndicatorGlyph';

export type { ResourceKey };

/** On paper, the three tints are darkened to hold contrast. */
export function resourceColor(resource: ResourceKey, onPaper = false): string {
  return `var(--${resource}${onPaper ? '-paper' : ''})`;
}

/**
 * What each drawing needs to weigh as much as the other two. Steel and manpower occupy less
 * of their square than the supply crate and got lost next to it: the factor makes up for the
 * drawing, it does not correct a layout. Hence its place here — a caller asking for twelve
 * pixels asks for a readable icon, not a twelve-pixel box.
 */
const FACTOR: Readonly<Record<ResourceKey, number>> = {
  supply: 2,
  steel: 2.5,
  manpower: 2.5,
};

/**
 * The icon never replaces the number. It replaces the *word* when space runs out.
 *
 * The mask takes its ink from `currentColor`, hence from the tint the caller sets on the
 * container — a depleted resource or a line on paper has nothing more to do.
 */
export function ResourceIcon({
  resource,
  size = 12,
}: {
  resource: ResourceKey;
  size?: number;
}) {
  return <Pictogram pictogram={resource} weight={40} size={Math.round(size * FACTOR[resource])} />;
}
