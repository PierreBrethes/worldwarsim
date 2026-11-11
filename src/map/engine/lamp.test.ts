import { describe, expect, it } from 'vitest';
import { REGIONS_GONE_DISTANCE } from './regions';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { DRAWN_SHARE, troopSpan } from '@/domain/piece-size';
import { castShadows, lampIntensity, shadowBias, shadowReach } from './lamp';

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

describe('how far a shadow is read off its surface', () => {
  it('keeps the bias it had from the former closest zoom outwards', () => {
    for (const distance of [3, 10, 30, 60]) expect(shadowBias(shadowReach(distance)!)).toBe(0.02);
  });

  it('stays under the height of a man as he is drawn, at the closest zoom: he keeps his shadow', () => {
    const closest = 3 * DRAWN_SHARE;
    expect(shadowBias(shadowReach(closest)!)).toBeLessThan(
      (troopSpan('infantry') * DRAWN_SHARE) / 2,
    );
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

describe('castShadows', () => {
  it('arms every lit opaque piece, but never a part a loop moves (#273)', () => {
    const wall = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const beam = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    beam.userData.shadowless = true;
    castShadows(new Group().add(wall, beam));
    expect([wall.castShadow, beam.castShadow]).toEqual([true, false]);
  });

  it('leaves a pile gone to its pin to the frame that draws it again', () => {
    const pile = new Group();
    const man = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const board = new Group().add(pile.add(man));
    pile.visible = false;
    castShadows(board);
    expect(man.castShadow).toBe(false);
    pile.visible = true;
    castShadows(board);
    expect(man.castShadow).toBe(true);
  });
});
