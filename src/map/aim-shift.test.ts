import { describe, expect, it } from 'vitest';
import { aimShiftOf } from './aim-shift';

describe('aimShiftOf', () => {
  it('leaves a label that fits where it is', () => {
    expect(aimShiftOf(195, 200, 390)).toBe(0);
  });

  it('pulls a label back from the right edge, 8 px short of it', () => {
    // Centred on 370 it would span 270..470: it must end at 382.
    expect(aimShiftOf(370, 200, 390)).toBe(-88);
  });

  it('pushes a label in from the left edge, 8 px short of it', () => {
    expect(aimShiftOf(20, 200, 390)).toBe(88);
  });

  it('keeps the left edge when the label is wider than the room', () => {
    expect(aimShiftOf(100, 400, 390)).toBe(8 - (100 - 200));
  });
});
