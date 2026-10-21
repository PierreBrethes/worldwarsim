import type { RegionType } from '@/domain/ids';
import { TERRAIN_PICTOS } from './manifest';

/** Un masque plutôt qu'un `<img>` : le picto prend l'encre de son conteneur (`currentColor`),
 *  comme `Glyph`. */
export function TerrainIcon({ type, size = 16 }: { type: RegionType; size?: number }) {
  const mask = `url("${TERRAIN_PICTOS[type]}") center / contain no-repeat`;
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 align-[-0.2em]"
      style={{ width: size, height: size, background: 'currentColor', mask, WebkitMask: mask }}
    />
  );
}
