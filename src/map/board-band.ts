import { EDGE_MARGIN, HALF_BADGE } from '@/domain/indicators';
import type { BoardInsets } from '@/shell/viewport';

/** The board's insets widened by the band where the edge tokens stand. */
export const bandOf = ({ top, right, bottom, left }: BoardInsets): BoardInsets => {
  const band = EDGE_MARGIN + HALF_BADGE;
  return { top: top + band, right: right + band, bottom: bottom + band, left: left + band };
};

/** What the personal board's band covers of the layer's bottom. */
export function matBand(layer: HTMLElement | null): number {
  const pixelsOf = (name: string) =>
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
  const bottom = layer?.getBoundingClientRect().bottom ?? window.innerHeight;
  return Math.max(
    0,
    Math.max(pixelsOf('--mat-rise'), pixelsOf('--board-bottom')) - (window.innerHeight - bottom),
  );
}
