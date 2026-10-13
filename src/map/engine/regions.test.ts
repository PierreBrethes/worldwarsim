import { describe, expect, it } from 'vitest';
import type { DisplayedRegion } from '@/domain/world';
import { contains, prepare, wholeSheets } from './regions';

const square = (x: number, y: number, side: number) =>
  [
    [x, y],
    [x + side, y],
    [x + side, y + side],
    [x, y + side],
  ] as const;

const archipelago: DisplayedRegion = {
  id: 'T-1',
  country: 'T',
  name: 'Test',
  type: 'plain',
  rings: [square(0, 0, 10), square(3, 3, 4), square(40, 0, 5), square(0, 40, 5)],
};

const wholeRing = (region: DisplayedRegion, x: number, y: number) => {
  let inside = false;
  for (const ring of region.rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
};

describe('contains', () => {
  it('answers like the scan of every ring, hole and far islands included', () => {
    const prepared = prepare(archipelago);
    for (let x = -3; x <= 50; x += 0.7)
      for (let y = -3; y <= 50; y += 0.7)
        expect(contains(prepared, x, y), `${x},${y}`).toBe(wholeRing(archipelago, x, y));
  });

  it('keeps one box per ring and the box of them all', () => {
    const { ringBoxes, box } = prepare(archipelago);
    expect(ringBoxes).toHaveLength(4);
    expect(box).toEqual([0, 0, 45, 45]);
  });
});

describe('wholeSheets', () => {
  const region = (id: string, country: string): DisplayedRegion => ({
    id,
    country,
    name: id,
    type: 'plain',
    rings: [square(0, 0, 1)],
  });
  const regions = [region('F-1', 'FRA'), region('F-2', 'FRA'), region('D-1', 'DEU')];
  const current = (id: string) => ({ id, wash: 1, state: 'current' as const });

  it('paints a country whose every region one claim holds, current', () => {
    const sheets = wholeSheets(
      [{ ink: '#276893', regions: [current('F-1'), current('F-2'), current('D-1')] }],
      regions,
    );
    expect([...sheets]).toEqual([
      ['FRA', '#276893'],
      ['DEU', '#276893'],
    ]);
  });

  it('leaves to the regions a country held only in part', () => {
    expect(wholeSheets([{ ink: '#276893', regions: [current('F-1')] }], regions).size).toBe(0);
  });

  it('leaves to the regions a country one region of which is only surveyed', () => {
    const sheets = wholeSheets(
      [
        {
          ink: '#276893',
          regions: [current('F-1'), { id: 'F-2', wash: 0.6, state: 'surveyed' }],
        },
      ],
      regions,
    );
    expect(sheets.size).toBe(0);
  });
});
