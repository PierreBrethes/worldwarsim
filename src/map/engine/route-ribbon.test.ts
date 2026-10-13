import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { dashPitch, facingOf, ribbonAcross, ribbonGeometry, ribbonWidth } from './route-ribbon';

describe('ribbonWidth', () => {
  it('keeps its width on the sheet up close', () => {
    // 0.002 units per pixel: 0.06 units is 30 px, far above a 2.5 px floor.
    expect(ribbonWidth(0.06, 2.5, 0.002)).toBe(0.06);
  });

  it('never thins under its floor in pixels from afar', () => {
    // 0.2 units per pixel: 0.06 units would be a third of a pixel.
    expect(ribbonWidth(0.06, 2.5, 0.2)).toBeCloseTo(0.5, 10);
  });
});

describe('dashPitch', () => {
  it('scales with the ribbon as drawn, so a dash stays a dash at the floor', () => {
    expect(dashPitch(0.1)).toBeCloseTo(0.4, 10);
    expect(dashPitch(0.5) / 0.5).toBeCloseTo(dashPitch(0.1) / 0.1, 10);
  });
});

describe('ribbonAcross', () => {
  const tangent = new Vector3(1, 0, 0);
  const camera = new Vector3(0, 10, 10);
  const point = new Vector3(0, 0, 0);

  it('lies flat on the sheet on the ground', () => {
    const across = ribbonAcross(tangent, point, camera, 0, new Vector3());
    expect(across.y).toBeCloseTo(0, 10);
    expect(across.length()).toBeCloseTo(1, 10);
    expect(across.dot(tangent)).toBeCloseTo(0, 10);
  });

  it('faces the eye in the air: never seen edge-on', () => {
    // A camera low on the side, where a flat ribbon would close into a hairline.
    const low = new Vector3(0, 0.5, 20);
    const across = ribbonAcross(tangent, point, low, 1, new Vector3());
    expect(across.dot(low.clone().sub(point).normalize())).toBeCloseTo(0, 10);
    expect(across.dot(tangent)).toBeCloseTo(0, 10);
  });
});

describe('facingOf', () => {
  it('is flat at take-off and landing, facing at cruise', () => {
    const arc = [0, 0.1, 2, 4, 2, 0.1, 0].map((y) => new Vector3(0, 0.1 + y, 0));
    const facing = facingOf(arc);
    expect(facing[0]).toBe(0);
    expect(facing.at(-1)).toBe(0);
    expect(facing[3]).toBe(1);
    expect(facing[1]).toBeGreaterThan(0);
    expect(facing[1]).toBeLessThan(1);
  });

  it('is flat all along on the ground', () => {
    expect(facingOf([new Vector3(0, 0.1, 0), new Vector3(5, 0.1, 0)])).toEqual([0, 0]);
  });
});

describe('ribbonGeometry', () => {
  it('lays its distance along the strand, from where the thread already is', () => {
    const geometry = ribbonGeometry(
      [new Vector3(0, 0, 0), new Vector3(3, 0, 0), new Vector3(3, 0, 4)],
      10,
    );
    const along = Array.from(geometry.getAttribute('along').array);
    expect(along).toEqual([10, 10, 13, 13, 17, 17]);
  });
});
