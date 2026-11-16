import { describe, expect, it } from 'vitest';
import { THEATRES } from '@/domain/theatres';
import { frameMaterial, STROKE_MAX_PX } from './theatre';

describe('the Blitz theatre frame', () => {
  // The stroke is cut in degrees of the sheet; closer than the whole theatre it would swell to
  // forty kilometres of ink and bury a headquarters standing by the edge (the 0.85 band over the
  // French QG in the Mediterranean). A pixel cap, read from the screen-space slope of the margin,
  // is what keeps it a printed line at every distance.
  it('caps its stroke at a few screen pixels, by the margin derivative', () => {
    const { fragmentShader } = frameMaterial(THEATRES[0]!);
    expect(fragmentShader).toContain('fwidth(margin)');
    expect(fragmentShader).toMatch(/stroke = min\(.*fwidth\(margin\)/);
    expect(STROKE_MAX_PX).toBeGreaterThan(0);
    expect(STROKE_MAX_PX).toBeLessThan(12);
  });
});
