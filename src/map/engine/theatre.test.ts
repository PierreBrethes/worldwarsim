import { describe, expect, it } from 'vitest';
import { THEATRES } from '@/domain/theatres';
import { TRAME_SCALE } from './regions';
import { frameMaterial, STROKE_MAX_PX } from './theatre';

describe('the Blitz theatre frame', () => {
  // The stroke is cut in degrees of the sheet; closer than the whole theatre it would swell to
  // forty kilometres of ink and bury a headquarters standing by the edge (the 0.85 band over the
  // French QG in the Mediterranean). A pixel cap, read from the screen-space slope of the margin,
  // is what keeps it a printed line at every distance.
  // Only the wiring is held here: the cap itself needs a GPU to be seen.
  it('caps its stroke at a few CSS pixels, by the margin derivative and the pixel ratio', () => {
    const { fragmentShader, uniforms } = frameMaterial(THEATRES[0]!);
    expect(fragmentShader).toMatch(/slope = length\(vec2\(dFdx\(margin\), dFdy\(margin\)\)\)/);
    expect(fragmentShader).toMatch(/stroke = min\(.*trameScale \* slope\)/);
    expect(uniforms.trameScale).toBe(TRAME_SCALE);
    expect(STROKE_MAX_PX).toBeGreaterThan(0);
    expect(STROKE_MAX_PX).toBeLessThan(12);
  });
});
