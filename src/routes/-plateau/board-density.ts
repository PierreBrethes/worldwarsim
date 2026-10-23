import { useEffect, useState, type RefObject } from 'react';

/** How tight the five gauges sit: `index.css` reads it as `data-density` on the band. */
export type Density = 'ample' | 'moyen' | 'serre';

/** The band's width, in CSS pixels under the HUD zoom, from which each density holds (#251): on
 *  1280, 1440 and 1920 screens that leaves 4, 4 and 7 whole cards. */
const AMPLE_FROM = 1300;
const MOYEN_FROM = 1000;

/** `0` is a band not yet measured (first paint, a test): the gauges of today. */
export const densityOf = (bandWidth: number): Density =>
  bandWidth <= 0 || bandWidth >= AMPLE_FROM ? 'ample' : bandWidth >= MOYEN_FROM ? 'moyen' : 'serre';

/**
 * **La densité des bacs, lue sur la bande**, pas sur l'écran : un observateur de taille sur sa
 * largeur (`offsetWidth`, déjà en pixels CSS sous le zoom — `cqi` n'y est pas fiable, voir
 * `index.css`).
 */
export function useBandDensity(band: RefObject<HTMLElement | null>): Density {
  const [density, setDensity] = useState<Density>('ample');
  useEffect(() => {
    const node = band.current;
    if (node === null) return;
    const read = () => setDensity(densityOf(node.offsetWidth));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [band]);
  return density;
}
