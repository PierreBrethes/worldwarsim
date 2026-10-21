import { describe, expect, it } from 'vitest';
import { REGIONS_GONE_DISTANCE } from './regions';
import { lampIntensity, shadowReach } from './lamp';

/**
 * La carte d'ombres ne couvre que ce que la caméra regarde, et rien au loin : il n'y a plus de
 * pièce à porter au-delà du fondu des régions, et une ombre qu'on ne voit pas ne se paie pas.
 */
describe('how much table the lamp shades', () => {
  it('casts nothing from the world view', () => {
    expect(shadowReach(300)).toBeNull();
    expect(shadowReach(REGIONS_GONE_DISTANCE + 1)).toBeNull();
  });

  it('covers at least the ground under the eye, and not ten times more', () => {
    for (const distance of [4, 7.2, 12, 30, 60]) {
      const reach = shadowReach(distance)!;
      expect(reach).toBeGreaterThanOrEqual(distance * 1.3);
      expect(reach).toBeLessThan(distance * 2);
    }
  });

  /** Recadrée en continu, la carte d'ombres frémirait à chaque cran de molette. */
  it('moves by steps, not with every turn of the wheel', () => {
    expect(shadowReach(10)).toBe(shadowReach(10.3));
  });
});

describe('how strong the lamp shines', () => {
  const sun = (altitude: number) => ({ azimuth: 0, altitude, elevation: Math.max(altitude, 25) });

  it('is the prototype lamp with the sun at its height', () => {
    expect(lampIntensity(sun(52), 0)).toBeCloseTo(2.5);
  });

  /** Un soleil bas éclaire la feuille de biais : la lampe force, et le crépuscule l'éteint un peu. */
  it('strengthens as the sun goes down, then dims at dusk', () => {
    expect(lampIntensity(sun(30), 0)).toBeGreaterThan(lampIntensity(sun(52), 0));
    expect(lampIntensity(sun(5), 0)).toBeLessThan(lampIntensity(sun(25), 0));
  });

  it('keeps the night lamp at night', () => {
    expect(lampIntensity(sun(-30), 1)).toBeCloseTo(0.9);
  });
});
