import { describe, expect, it } from 'vitest';
import { cursorReading } from './cursor-reading';
import type { HoveredRegion } from '@/domain/world';

const bavaria: HoveredRegion = { id: 'DEU-1', country: 'DEU', name: 'Bavière', type: 'plain' };

describe('what the strip says of the ground under the cursor', () => {
  it('says nothing at sea or off the map', () => {
    expect(cursorReading({ region: null, country: null, holding: null, deposits: [] })).toBeNull();
  });

  it('names the country alone when the region layer is not there yet', () => {
    expect(cursorReading({ region: null, country: 'FRA', holding: null, deposits: [] })).toEqual({
      place: 'France',
      country: null,
      held: null,
      deposits: [],
    });
  });

  it('names the region, its country, and the deposits the ground holds', () => {
    const reading = cursorReading({
      region: bavaria,
      country: 'DEU',
      holding: null,
      deposits: ['iron', 'coal'],
    });
    expect(reading).toMatchObject({ place: 'Bavière', deposits: ['fer', 'charbon'] });
    expect(reading?.country).not.toBeNull();
  });

  it('says who holds a region only as the player knows it: current, or surveyed with its date', () => {
    const current = cursorReading({
      region: bavaria,
      country: 'DEU',
      holding: { state: 'current', nation: 'france' },
      deposits: [],
    });
    expect(current?.held).toContain('France');
    const surveyed = cursorReading({
      region: bavaria,
      country: 'DEU',
      holding: { state: 'surveyed', nation: 'france', seenAt: Date.UTC(2026, 9, 21) },
      deposits: [],
    });
    expect(surveyed?.held).toContain('relevé');
    expect(
      cursorReading({ region: bavaria, country: 'DEU', holding: null, deposits: [] })?.held,
    ).toBeNull();
  });

  it('drops a region that is not in the country the map announces', () => {
    expect(
      cursorReading({ region: bavaria, country: 'FRA', holding: null, deposits: [] })?.place,
    ).toBe('France');
  });
});
