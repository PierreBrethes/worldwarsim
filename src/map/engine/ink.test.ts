import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { inkedStrands, penEase } from './ink';

const strand = [new Vector3(0, 0, 0), new Vector3(10, 0, 0), new Vector3(10, 0, 10)];

describe('penEase', () => {
  it('starts slow, ends slow, and passes through the middle', () => {
    expect(penEase(0)).toBe(0);
    expect(penEase(1)).toBe(1);
    expect(penEase(0.5)).toBe(0.5);
    expect(penEase(0.2)).toBeLessThan(0.2);
    expect(penEase(0.8)).toBeGreaterThan(0.8);
  });
});

describe('inkedStrands', () => {
  it('cuts the last segment mid-way', () => {
    const [line] = inkedStrands([strand], 0.75);
    expect(line).toHaveLength(3);
    expect(line![2]!.toArray()).toEqual([10, 0, 5]);
  });

  it('draws nothing at zero and everything at one', () => {
    expect(inkedStrands([strand], 0)).toEqual([]);
    expect(inkedStrands([strand], 1)[0]).toHaveLength(3);
  });

  it('fills strands in order across a wrap', () => {
    const other = [new Vector3(0, 0, 20), new Vector3(10, 0, 20)];
    const inked = inkedStrands([strand, other], 0.5);
    expect(inked).toHaveLength(1);
    expect(inked[0]!.at(-1)!.toArray()).toEqual([10, 0, 5]);
    expect(inkedStrands([strand, other], 0.9)).toHaveLength(2);
  });
});
