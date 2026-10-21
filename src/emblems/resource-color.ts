import type { ResourceKey } from '@/domain/ids';

/**
 * One ink per resource, from the plate « Icônes ressources v2 » (ADR 0015, ADR 0028): the gauge
 * fill, the flight pastille. On paper they are darkened to hold contrast. The picto itself is
 * never tinted — it is `ResourcePlate`, the one drawing every surface shares.
 */
export function resourceColor(resource: ResourceKey, onPaper = false): string {
  return `var(--res-${resource}${onPaper ? '-paper' : ''})`;
}
