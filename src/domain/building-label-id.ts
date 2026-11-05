import type { LonLat } from './geo';

/** Le mât d'un bâtiment, et la maquette qui le remplace au rapproché — par son point (ADR 0029) :
 *  deux mines d'une même région sont deux mâts. */
export const buildingLabelId = ({ key, point }: { key: string; point: LonLat | null }): string =>
  point === null ? `building-${key}` : `building-${key}@${point[0]},${point[1]}`;
