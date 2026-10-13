import type { RegionType } from '@/domain/ids';

/**
 * Hover wash per type — muted inks, under the highlight material's opacity: the map stays
 * paper, the tint is only a hint.
 */
export const TYPE_TINTS: Record<RegionType, string> = {
  plain: '#a8a352',
  forest: '#48663a',
  jungle: '#2f7a4c',
  mountain: '#8a8072',
  desert: '#c99f56',
  tundra: '#9fbfc4',
};
